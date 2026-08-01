/**
 * notify-watchlist-digest — Edge Function
 *
 * Corre diariamente (pg_cron), después de /api/cron/sync-prices (Vercel) —
 * ese cron ya calculó analyze() para CADA ticker de la watchlist (accionable
 * o no) y dejó el estado del día en daily_signals: una fila "primaria" por
 * usuario+ticker (buy/sell/caution/hold, mutuamente excluyentes) + una fila
 * 'target' aparte si además llegó a su precio objetivo ese día.
 * Esta función SOLO lee esa tabla, agrupa por usuario y manda UN correo por
 * usuario con el resumen completo del día — no recalcula nada técnico.
 *
 * Si un usuario no tiene ninguna fila hoy (nada en su watchlist con historia
 * suficiente), no recibe correo.
 *
 * Requiere: RESEND_API_KEY, SITE_URL, DB_SERVICE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SITE_URL       = Deno.env.get('SITE_URL') ?? 'https://bolsillomagico.com'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('DB_SERVICE_KEY')!

function fmtUSD(n: number): string {
  return 'US$' + n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(n: number): string {
  return (n >= 0 ? '+' : '') + n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
}

function fmtShares(n: number): string {
  return n.toLocaleString('es-CL', { minimumFractionDigits: n % 1 === 0 ? 0 : 1, maximumFractionDigits: 2 })
}

function todayInCL(): string {
  // Fecha de hoy en Santiago — mismo criterio que el DEFAULT de daily_signals.signal_date
  const utc = new Date()
  const cl  = new Date(utc.toLocaleString('en-US', { timeZone: 'America/Santiago' }))
  const y = cl.getFullYear(), m = String(cl.getMonth() + 1).padStart(2, '0'), d = String(cl.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const DIAS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// ── Días hábiles NYSE — segunda barrera además de la de sync-prices: si por
// lo que sea daily_signals tuviera filas de un fin de semana/feriado (cron
// manual, reintento, etc.), este correo NO debe salir igual.
// Feriados NYSE 2026 (actualizar cada año): https://www.nyse.com/markets/hours-calendars
const NYSE_HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
])

function isTradingDay(): boolean {
  const et  = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = et.getDay()
  if (day === 0 || day === 6) return false
  const y = et.getFullYear(), m = String(et.getMonth() + 1).padStart(2, '0'), d = String(et.getDate()).padStart(2, '0')
  return !NYSE_HOLIDAYS_2026.has(`${y}-${m}-${d}`)
}

function closeLabelET(): string {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const dia = DIAS_ES[et.getDay()], mes = MESES_ES[et.getMonth()]
  return `${dia} ${et.getDate()} ${mes} · 16:00 ET`
}

type ConvictionTier = 'compra_fuerte' | 'compra' | 'neutral' | 'evitar' | 'venta'
type PriceZone      = 'conveniente' | 'justo' | 'caro'

interface Signal {
  user_id:    string
  ticker:     string
  kind:       'buy' | 'sell' | 'caution' | 'target' | 'hold'
  message:    string
  price:      number
  change_pct: number
  strong:     boolean
  watch:      boolean
  // jul 2026 (bug reportado por Cas con capturas): el digest mostraba "SEÑAL
  // DE COMPRA" con el mismo peso para cualquier ticker con gatillo técnico,
  // mientras la app decía que la mejor compra del día era otra y marcaba esos
  // mismos tickers con convicción baja / precio "Caro" — dos verdades sin
  // conectar ("a quién le creo"). Estos dos campos son el MISMO número y la
  // MISMA etiqueta que ConvictionChip/PriceZoneChip en la app, calculados una
  // vez por ticker en sync-prices y guardados en daily_signals.
  conviction_score: number | null
  conviction_tier:  ConvictionTier | null
  price_zone:       PriceZone | null
}

// Fase 5.4 del roadmap: la decisión de portafolio, calculada por el cron de
// Vercel (sync-prices → computeDailyDecisions, mismo ranking de convicción
// que el panel "¿Qué comprar hoy?" de la app) y guardada en daily_decisions.
// ticker=null significa "hoy no compres nada" — un veredicto explícito, no
// la ausencia de una tarjeta de compra.
interface Decision {
  user_id:       string
  ticker:        string | null
  tier:          string | null
  score:         number
  suggested_usd: number | null
  verdict:       string
  reasons:       string[]
}

interface TickerInfo {
  name:   string | null
  domain: string | null
}

// Si sync-prices corrió más de una vez el mismo día (reintento, prueba manual),
// puede quedar más de una fila por ticker con distinto kind (ninguna choca en
// el upsert porque el kind es parte de la clave). Acá nos quedamos con una
// sola por ticker, priorizando la más accionable.
const KIND_PRIORITY: Record<Signal['kind'], number> = { target: 0, sell: 1, buy: 2, caution: 3, hold: 4 }
function dedupeByTicker(signals: Signal[]): Signal[] {
  const best = new Map<string, Signal>()
  for (const s of signals) {
    const cur = best.get(s.ticker)
    if (!cur || KIND_PRIORITY[s.kind] < KIND_PRIORITY[cur.kind]) best.set(s.ticker, s)
  }
  return [...best.values()]
}

/** Accionable = algo que conviene revisar (comprar, vender, objetivo alcanzado)
 *  — independiente de si el gatillo es "fuerte" o no. `strong` solo decide si
 *  la tarjeta lleva la explicación técnica larga o el mensaje corto. */
function isAction(kind: Signal['kind']): boolean {
  return kind === 'buy' || kind === 'sell' || kind === 'target'
}

const KIND_TITLE: Record<Signal['kind'], string> = {
  buy:     'SEÑAL DE COMPRA',
  sell:    'SEÑAL DE VENTA',
  caution: 'TOMA DE GANANCIAS',
  target:  'PRECIO OBJETIVO',
  hold:    'MANTENER',
}
const KIND_COLOR: Record<Signal['kind'], { fg: string; bg: string }> = {
  buy:     { fg: '#1FBE8D', bg: '#EAFBF5' },
  sell:    { fg: '#FF6F61', bg: '#FFF1EF' },
  caution: { fg: '#D98A1F', bg: '#FFF6E8' },
  target:  { fg: '#2B7CF6', bg: '#EAF2FF' },
  hold:    { fg: '#8B9AB0', bg: '#F5F7FA' },
}

// jul 2026 — mismos colores/etiquetas que ConvictionChip/PriceZoneChip en la
// app (components/RiskRail.tsx), para que "70" y "Conveniente" signifiquen
// exactamente lo mismo en el correo que en la app.
const TIER_COLOR: Record<ConvictionTier, { fg: string; bg: string }> = {
  compra_fuerte: { fg: '#1FBE8D', bg: '#EAFBF5' },
  compra:        { fg: '#1FBE8D', bg: '#EAFBF5' },
  neutral:       { fg: '#8B9AB0', bg: '#F5F7FA' },
  evitar:        { fg: '#D98A1F', bg: '#FFF6E8' },
  venta:         { fg: '#FF6F61', bg: '#FFF1EF' },
}
const ZONE_LABEL: Record<PriceZone, string> = { conveniente: 'Conveniente', justo: 'Justo', caro: 'Caro' }
const ZONE_COLOR: Record<PriceZone, string> = { conveniente: '#1FBE8D', justo: '#8B9AB0', caro: '#D98A1F' }

// Tarjeta con gatillo técnico ("SEÑAL DE COMPRA") pero convicción baja o
// precio "Caro" — el mismo ticker que la app marcaría como poco atractivo
// pese al gatillo. Antes el correo no lo distinguía de una compra limpia
// (bug reportado por Cas: AMZN/GOOGL/INTC con "SEÑAL DE COMPRA" mientras la
// app decía que la mejor compra era NVDA). >=55 = tier 'compra'/'compra_fuerte'.
function isWeakDespiteTrigger(s: Signal): boolean {
  if (s.kind !== 'buy') return false
  if (s.conviction_score !== null && s.conviction_score < 55) return true
  if (s.price_zone === 'caro') return true
  return false
}

/** Badge "70 · Conveniente" — mismo número y misma palabra que ve el usuario
 *  en /inversiones para este ticker, para que el correo y la app hablen el
 *  mismo idioma en vez de dos verdades sin conectar. */
function convictionBadgeHtml(s: Signal): string {
  if (s.conviction_score === null && !s.price_zone) return ''
  const parts: string[] = []
  if (s.conviction_score !== null && s.conviction_tier) {
    const c = TIER_COLOR[s.conviction_tier]
    parts.push(`<span style="display:inline-block;padding:2px 7px;border-radius:999px;background:${c.bg};color:${c.fg};font-weight:800">${Math.round(s.conviction_score)}/100</span>`)
  }
  if (s.price_zone) {
    parts.push(`<span style="display:inline-block;padding:2px 7px;border-radius:999px;background:#F5F7FA;color:${ZONE_COLOR[s.price_zone]};font-weight:800">${ZONE_LABEL[s.price_zone]}</span>`)
  }
  if (parts.length === 0) return ''
  return `<span style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;margin-left:6px">${parts.join('&nbsp;')}</span>`
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* no body */ }
  const force = url.searchParams.get('force') === 'true' || body?.force === true

  // MODO TEST: enviar correo de muestra sin DB
  if (force) {
    const testEmail = (body?.email as string) ?? null
    if (!testEmail) return new Response('Pasa tu email: {"force":true,"email":"tu@email.com"}', { status: 400 })
    const testSignals: Signal[] = [
      { user_id: 'x', ticker: 'MELI', kind: 'sell', message: 'Cruzó por debajo de su media de 50 días. Perdió el soporte y el RSI marca sobrecompra — considera tomar ganancias.', price: 1852.22, change_pct: -3.4, strong: true, watch: false, conviction_score: 22, conviction_tier: 'venta', price_zone: 'caro' },
      { user_id: 'x', ticker: 'NVDA', kind: 'buy',  message: 'Rebotó en su media de 20 días con volumen alto y MACD girando al alza. Rompe resistencia — buen punto para promediar.', price: 210.96, change_pct: 2.6, strong: true, watch: false, conviction_score: 78, conviction_tier: 'compra_fuerte', price_zone: 'conveniente' },
      // A propósito con convicción BAJA y "Caro" pese al gatillo técnico —
      // reproduce el caso real reportado por Cas (AMZN con SEÑAL DE COMPRA en
      // el correo, pero 39/100 "Caro" en la app) para verificar visualmente
      // que ahora se ve la misma tensión en el correo, no una compra limpia.
      { user_id: 'x', ticker: 'AMZN', kind: 'buy', message: 'El impulso de mediano plazo mejora. En las últimas ~2 semanas el movimiento del precio giró al alza.', price: 271.58, change_pct: 15.3, strong: false, watch: false, conviction_score: 39, conviction_tier: 'neutral', price_zone: 'caro' },
      { user_id: 'x', ticker: 'META', kind: 'hold', message: 'tendencia estable', price: 669.21, change_pct: 0.4, strong: false, watch: false, conviction_score: 48, conviction_tier: 'neutral', price_zone: 'justo' },
      { user_id: 'x', ticker: 'SPY',  kind: 'hold', message: 'dentro de rango', price: 754.95, change_pct: 0.3, strong: false, watch: false, conviction_score: 55, conviction_tier: 'compra', price_zone: 'justo' },
      { user_id: 'x', ticker: 'MU',   kind: 'caution', message: 'Débil · cerca de soporte', price: 979.30, change_pct: -1.2, strong: false, watch: true, conviction_score: 41, conviction_tier: 'neutral', price_zone: 'caro' },
      { user_id: 'x', ticker: 'GOOGL', kind: 'hold', message: 'consolidando', price: 357.18, change_pct: 0.9, strong: false, watch: false, conviction_score: 56, conviction_tier: 'compra', price_zone: 'conveniente' },
      { user_id: 'x', ticker: 'IBIT', kind: 'hold', message: 'lateral', price: 36.23, change_pct: 0.6, strong: false, watch: false, conviction_score: null, conviction_tier: null, price_zone: null },
    ]
    const infoMap = new Map<string, TickerInfo>([
      ['MELI', { name: 'MercadoLibre', domain: 'mercadolibre.com' }],
      ['NVDA', { name: 'NVIDIA', domain: 'nvidia.com' }],
      ['AMZN', { name: 'Amazon.com Inc', domain: 'amazon.com' }],
      ['META', { name: 'Meta Platforms', domain: 'meta.com' }],
      ['SPY',  { name: 'S&P 500 ETF', domain: null }],
      ['MU',   { name: 'Micron Technology', domain: 'micron.com' }],
      ['GOOGL', { name: 'Alphabet', domain: 'abc.xyz' }],
      ['IBIT', { name: 'iShares Bitcoin Trust', domain: null }],
    ])
    const sharesMap = new Map<string, number>([['MELI', 0.3], ['NVDA', 2.1]])
    const testDecision: Decision = {
      user_id: 'x', ticker: 'NVDA', tier: 'compra', score: 78, suggested_usd: 450,
      verdict: 'Compra: el caso es razonable, sin ser contundente.',
      reasons: [
        'Lectura técnica a favor: compra (2 a favor, 0 en contra).',
        'Riesgo/recompensa a favor: arriesgas 4.2% para un potencial de +11.0% (2.6×).',
      ],
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: testEmail,
        subject: `2 señales fuertes para revisar hoy · Bolsillo Mágico`,
        html: digestEmailHtml({ displayName: 'Cata', signals: testSignals, infoMap, sharesMap, siteUrl: SITE_URL, decision: testDecision }),
      }),
    })
    return new Response(JSON.stringify({ test: true, ok: res.ok }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (!isTradingDay()) {
    return new Response(JSON.stringify({ skipped: 'non-trading day' }), { headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const today = todayInCL()

  const { data: rows, error } = await supabase
    .from('daily_signals')
    .select('user_id, ticker, kind, message, price, change_pct, strong, watch, conviction_score, conviction_tier, price_zone')
    .eq('signal_date', today)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ sent: 0, users: 0 }), { headers: { 'Content-Type': 'application/json' } })
  }
  const signals = rows as Signal[]

  // Decisión de portafolio del día — puede faltar (usuario sin watchlist con
  // historia suficiente todavía); el correo funciona igual sin ella, solo
  // sin el bloque de veredicto al inicio.
  const { data: decisionRows } = await supabase
    .from('daily_decisions')
    .select('user_id, ticker, tier, score, suggested_usd, verdict, reasons')
    .eq('decision_date', today)
  const decisionByUser = new Map<string, Decision>(
    ((decisionRows ?? []) as Decision[]).map(d => [d.user_id, d]),
  )

  // Nombre/dominio (logo) por ticker — cacheado por la app en price_cache.
  const tickers = [...new Set(signals.map(s => s.ticker))]
  const { data: priceCacheRows } = await supabase
    .from('price_cache')
    .select('ticker, name, domain')
    .in('ticker', tickers)
  const infoMap = new Map<string, TickerInfo>(
    (priceCacheRows ?? []).map(r => [r.ticker as string, { name: r.name as string | null, domain: r.domain as string | null }]),
  )

  const byUser = new Map<string, Signal[]>()
  for (const s of signals) {
    const list = byUser.get(s.user_id) ?? []
    list.push(s)
    byUser.set(s.user_id, list)
  }
  // Una fila por ticker — si sync-prices corrió dos veces hoy, no duplicar.
  for (const [uid, list] of byUser) byUser.set(uid, dedupeByTicker(list))

  const userIds = [...byUser.keys()]

  // Acciones que ya tiene cada usuario — para "tienes X acc." en las tarjetas destacadas.
  const { data: posRows } = await supabase
    .from('stock_positions')
    .select('user_id, ticker, shares')
    .in('user_id', userIds)
  const sharesByUser = new Map<string, Map<string, number>>()
  for (const p of posRows ?? []) {
    const uid = p.user_id as string, tk = p.ticker as string, sh = Number(p.shares)
    const m = sharesByUser.get(uid) ?? new Map<string, number>()
    m.set(tk, (m.get(tk) ?? 0) + sh)
    sharesByUser.set(uid, m)
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, notify_watchlist_target')
    .in('id', userIds)
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p as { display_name: string | null; notify_watchlist_target: boolean }]))

  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const emailMap = new Map((authUsers?.users ?? []).map(u => [u.id, u.email]))

  let sent = 0, skipped = 0

  for (const [userId, userSignals] of byUser) {
    const profile = profileMap.get(userId)
    if (!profile || profile.notify_watchlist_target === false) { skipped++; continue }

    const email = emailMap.get(userId)
    if (!email) { skipped++; continue }

    // Idempotencia: un solo digest por usuario por día, aunque el cron corra dos veces
    const refKey = `${today}:watchlist_digest:${userId}`
    const { error: logErr } = await supabase
      .from('notification_log')
      .insert({ user_id: userId, type: 'watchlist_digest', ref_key: refKey })
      .select().single()
    if (logErr) { skipped++; continue }   // ya se envió hoy

    const displayName = profile.display_name ?? 'Usuario'
    const actionCount = userSignals.filter(s => isAction(s.kind)).length

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: email,
        subject: actionCount > 0
          ? `${actionCount} señal${actionCount !== 1 ? 'es' : ''} para revisar hoy · Bolsillo Mágico`
          : `Tu análisis técnico de hoy · Bolsillo Mágico`,
        html: digestEmailHtml({
          displayName, signals: userSignals, infoMap,
          sharesMap: sharesByUser.get(userId) ?? new Map(), siteUrl: SITE_URL,
          decision: decisionByUser.get(userId) ?? null,
        }),
      }),
    })

    if (res.ok) sent++
    else {
      // Ver notify-budget: si el envío falla hay que borrar el log recién
      // insertado, si no ref_key queda "quemado" y bloquea reintentos.
      console.error(`Resend error for ${email}:`, await res.text())
      await supabase.from('notification_log').delete().eq('ref_key', refKey)
    }
  }

  return new Response(JSON.stringify({ sent, users: byUser.size, skipped }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// ── Logo / Wordmark (mismo bloque que las demás notificaciones) ──────────────

function brandWordmark(siteUrl: string) {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto">
    <tr>
      <td style="vertical-align:middle;padding-right:8px">
        <img src="${siteUrl}/bolsillo-magico-icono-invertido.png" width="32" height="32" alt="Bolsillo Mágico" style="width:32px;height:32px;border-radius:8px;display:block">
      </td>
      <td style="vertical-align:middle">
        <span style="font-family:Fredoka,system-ui,sans-serif;font-size:18px;font-weight:600;letter-spacing:0.3px;line-height:1">
          <span style="color:rgba(255,255,255,0.95)">Bolsillo </span><span style="color:#F8C945">Mágico</span>
        </span>
      </td>
    </tr>
  </table>`
}

// ── Ícono del ticker: logo real si hay dominio cacheado (vía Clearbit),
// si no, una insignia con el ticker — mismo patrón que ServiceLogo en la app. ──

// Clearbit devuelve 404 liso y llano si no tiene el logo — en email eso se ve
// como el ícono roto del navegador (no hay onerror que valga en Gmail/Apple
// Mail). El favicon de Google casi nunca falla: si no encuentra el real,
// devuelve un genérico igual, así que nunca queda una imagen rota en el correo.
function tickerIcon(ticker: string, domain: string | null, size: number): string {
  if (domain) {
    return `<table cellpadding="0" cellspacing="0" role="presentation" style="width:${size}px;height:${size}px">
      <tr><td align="center" valign="middle" bgcolor="#0E2A52" style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.28)}px;background:#0E2A52;overflow:hidden">
        <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=128" width="${Math.round(size * 0.62)}" height="${Math.round(size * 0.62)}" alt="${ticker}"
          style="width:${Math.round(size * 0.62)}px;height:${Math.round(size * 0.62)}px;display:block;border-radius:4px">
      </td></tr>
    </table>`
  }
  const fontSize = ticker.length > 4 ? 9 : ticker.length > 3 ? 10 : 11
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="width:${size}px;height:${size}px">
    <tr><td align="center" valign="middle" bgcolor="#0E2A52" style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.28)}px;background:#0E2A52;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:${fontSize}px;font-weight:800;color:#ffffff;letter-spacing:0.2px">
      ${ticker.slice(0, 5)}
    </td></tr>
  </table>`
}

// ── Email HTML ────────────────────────────────────────────────────────────────

function fmtDecisionUsd(n: number): string {
  return 'US$' + n.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// Bloque de veredicto — Fase 5.4: el correo abre con la decisión, no con una
// lista de señales. Compra clara = tarjeta verde con monto; sin caso hoy =
// banda gris pero con la misma contundencia ("No compres nada hoy"), nunca
// un silencio.
function decisionBlockHtml(decision: Decision | null, infoMap: Map<string, TickerInfo>): string {
  if (!decision) return ''
  const isBuy = decision.ticker !== null && (decision.tier === 'compra' || decision.tier === 'compra_fuerte')
  if (!isBuy) {
    return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:20px">
      <tr><td class="bm-hold-card" bgcolor="#F5F7FA" style="background:#F5F7FA;border-radius:16px;padding:16px 18px">
        <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:800;color:#3D4C63">
          Hoy no compres nada de tu lista
        </p>
        <p style="margin:6px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;color:#8B9AB0;line-height:1.5">
          ${decision.verdict}
        </p>
      </td></tr>
    </table>`
  }
  const info = infoMap.get(decision.ticker!) ?? { name: null, domain: null }
  const reasonsHtml = decision.reasons.slice(0, 2).map(r => `
    <p style="margin:4px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;color:#3D4C63;line-height:1.5">· ${r}</p>
  `).join('')
  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:20px">
    <tr><td class="bm-buy-card" bgcolor="#EAFBF5" style="background:#EAFBF5;border:1.5px solid #1FBE8D;border-radius:16px;padding:18px 20px">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="width:36px;vertical-align:top">${tickerIcon(decision.ticker!, info.domain, 36)}</td>
          <td style="padding-left:12px;vertical-align:top">
            <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:15px;font-weight:800;color:#0E2A52">
              La compra de hoy: ${decision.ticker} <span style="color:#1FBE8D">(${decision.score}/100)</span>
            </p>
            ${decision.suggested_usd !== null ? `
            <p style="margin:4px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:700;color:#1FBE8D">
              Compra hasta ${fmtDecisionUsd(decision.suggested_usd)} ahora
            </p>` : ''}
            ${reasonsHtml}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>`
}

// ── Bloque "día tranquilo" (jul 2026, a pedido de Cas) ────────────────────────
// Cuando nada es accionable (strongRows vacío) el correo antes terminaba en
// header + stats + disclaimer, sin ningún dato real del día — se sentía
// vacío. Acá se agrega, solo para ese caso: (1) cómo le fue HOY en plata a lo
// que el usuario realmente tiene (si tiene algo dentro de su watchlist), y
// (2) el mayor movimiento del día entre todo lo que sigue, tenga posición o
// no — un dato, no una señal (por eso sigue en "mantener"). Puramente
// informativo: nunca lleva color de severidad UX5 (ni banner ni chip de
// alerta), el rojo/verde es el mismo indicador numérico que ya se usa en
// cada tarjeta de ticker del correo.
function quietDayBlockHtml(signals: Signal[], sharesMap: Map<string, number>): string {
  const owned = signals
    .map(s => ({ s, shares: sharesMap.get(s.ticker) ?? 0 }))
    .filter(o => o.shares > 0)

  let portfolioRow = ''
  if (owned.length > 0) {
    let valueUsd = 0, deltaUsd = 0
    for (const { s, shares } of owned) {
      const prevPrice = s.price / (1 + s.change_pct / 100)
      valueUsd += shares * s.price
      deltaUsd += shares * (s.price - prevPrice)
    }
    const prevValueUsd = valueUsd - deltaUsd
    const pct   = prevValueUsd > 0 ? (deltaUsd / prevValueUsd) * 100 : 0
    const color = deltaUsd >= 0 ? '#1FBE8D' : '#FF6F61'
    const arrow = deltaUsd >= 0 ? '▲' : '▼'
    portfolioRow = `
      <tr><td style="padding:16px 18px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="vertical-align:top">
              <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.4px;color:#8B9AB0">TU PORTAFOLIO HOY</p>
              <p style="margin:4px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:20px;font-weight:800;color:#0E2A52;font-variant-numeric:tabular-nums">${fmtUSD(valueUsd)}</p>
            </td>
            <td style="text-align:right;vertical-align:top;white-space:nowrap">
              <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:15px;font-weight:800;color:${color}">${arrow} ${fmtPct(pct)}</p>
              <p style="margin:2px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:600;color:${color}">${deltaUsd >= 0 ? '+' : '−'}${fmtUSD(Math.abs(deltaUsd))} hoy</p>
            </td>
          </tr>
        </table>
      </td></tr>`
  }

  // Solo destacar el mayor movimiento si es realmente notorio — bajo 1% en
  // 20 tickers seguro hay alguno, pero no vale la pena resaltarlo como dato.
  const sorted = [...signals].sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct))
  const mover  = sorted.find(s => Math.abs(s.change_pct) >= 1) ?? null
  let moverRow = ''
  if (mover) {
    const color = mover.change_pct >= 0 ? '#1FBE8D' : '#FF6F61'
    const arrow = mover.change_pct >= 0 ? '▲' : '▼'
    moverRow = `
      <tr><td style="padding:16px 18px${portfolioRow ? ';border-top:1px solid #EEF2F8' : ''}">
        <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.4px;color:#8B9AB0">MAYOR MOVIMIENTO DEL DÍA</p>
        <p style="margin:4px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:700;color:#0E2A52">
          ${mover.ticker} <span style="color:${color}">${arrow} ${fmtPct(mover.change_pct)}</span>
        </p>
      </td></tr>`
  }

  if (!portfolioRow && !moverRow) return ''

  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:20px">
    <tr><td style="padding-bottom:12px">
      <span style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:800;color:#0E2A52">📊 Tu día en números</span>
    </td></tr>
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" class="bm-signal-card" style="border:1.5px solid #E4EAF3;border-radius:16px">
        ${portfolioRow}
        ${moverRow}
      </table>
    </td></tr>
  </table>`
}

function digestEmailHtml({
  displayName,
  signals,
  infoMap,
  sharesMap,
  siteUrl,
  decision,
}: {
  displayName: string
  signals:     Signal[]
  infoMap:     Map<string, TickerInfo>
  sharesMap:   Map<string, number>
  siteUrl:     string
  decision:    Decision | null
}) {
  // Tarjeta destacada = cualquier compra/venta/objetivo alcanzado, sea o no
  // "fuerte" — lo que importa acá es que sea accionable, no la intensidad del
  // gatillo. El resto (mantener/toma de ganancias) va en la lista compacta.
  const strongRows = signals.filter(s => isAction(s.kind))

  const buyCount  = signals.filter(s => s.kind === 'buy').length
  const sellCount = signals.filter(s => s.kind === 'sell').length
  const holdCount = signals.filter(s => s.kind === 'hold' || s.kind === 'caution').length

  const strongCardsHtml = strongRows.map(s => {
    const info   = infoMap.get(s.ticker) ?? { name: null, domain: null }
    const shares = sharesMap.get(s.ticker) ?? 0
    const color  = KIND_COLOR[s.kind]
    const chgColor = s.change_pct >= 0 ? '#1FBE8D' : '#FF6F61'
    const chgArrow = s.change_pct >= 0 ? '▲' : '▼'
    return `
      <tr><td style="padding-bottom:14px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" class="bm-signal-card"
          style="border:1.5px solid #E4EAF3;border-radius:16px">
          <tr><td style="padding:16px 18px">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="width:44px;vertical-align:top">${tickerIcon(s.ticker, info.domain, 44)}</td>
                <td style="padding-left:12px;vertical-align:top">
                  <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:15px;font-weight:800;color:#0E2A52">${s.ticker}</p>
                  <p style="margin:2px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;color:#8B9AB0">
                    ${info.name ?? ''}${shares > 0 ? `${info.name ? ' · ' : ''}tienes ${fmtShares(shares)} acc.` : ''}
                  </p>
                </td>
                <td style="text-align:right;vertical-align:top;white-space:nowrap">
                  <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:15px;font-weight:800;color:#0E2A52;font-variant-numeric:tabular-nums">${fmtUSD(s.price)}</p>
                  <p style="margin:2px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:700;color:${chgColor}">${chgArrow} ${fmtPct(s.change_pct)}</p>
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="${color.bg}" style="background:${color.bg};border-radius:12px;margin-top:12px">
              <tr><td style="padding:12px 14px">
                <p style="margin:0 0 4px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.4px;color:${color.fg}">
                  <span style="color:${color.fg}">●</span> ${KIND_TITLE[s.kind]}${convictionBadgeHtml(s)}
                </p>
                <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:500;color:#3D4C63;line-height:1.5">${s.message}</p>
                ${isWeakDespiteTrigger(s) ? `
                <p style="margin:8px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:700;color:#D98A1F;line-height:1.5">
                  ⚠ No es la mejor compra del día — convicción baja o precio ya estirado. Mira el número de arriba antes de entrar.
                </p>` : ''}
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Tu análisis técnico de hoy · Bolsillo Mágico</title>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
  <!-- El diseño ya tiene su propio contraste (header azul, footer navy, tarjetas
       claras) — le decimos a los clientes que respetan esto (Apple Mail, Outlook,
       Gmail app) que NO auto-inviertan colores en modo oscuro, porque esa
       inversión "inteligente" es la que rompe los fondos claros de las tarjetas
       (quedan negros con texto oscuro encima, ilegible) en vez de mantener el
       diseño tal cual se ve en modo claro. -->
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>
    :root { color-scheme: light; supported-color-schemes: light; }
    /* Apple/iOS Mail a veces re-invierte bloques individuales (sobre todo el
       pie navy) aunque el <meta color-scheme> diga "light" — reafirmamos acá
       los mismos colores del modo claro, con !important, para los bloques
       principales, en vez de confiar solo en el meta tag. */
    @media (prefers-color-scheme: dark) {
      .bm-page       { background:#E8EFF8 !important; }
      .bm-card       { background:#ffffff !important; }
      .bm-header     { background:#2B7CF6 !important; }
      .bm-stats-td   { border-color:#EEF2F8 !important; }
      .bm-signal-card{ border-color:#E4EAF3 !important; }
      .bm-disclaimer { background:#F5F7FA !important; }
      .bm-disclaimer p { color:#8B9AB0 !important; }
      .bm-hold-card  { background:#F5F7FA !important; }
      .bm-buy-card   { background:#EAFBF5 !important; border-color:#1FBE8D !important; }
      .bm-cta        { background:#2B7CF6 !important; color:#ffffff !important; }
      .bm-footer     { background:#0E2A52 !important; }
      .bm-footer p, .bm-footer a { color:#9FB5D4 !important; }
      .bm-footer-divider { border-color:rgba(255,255,255,0.08) !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#E8EFF8;font-family:'Plus Jakarta Sans','Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">

<table width="100%" cellpadding="0" cellspacing="0" role="presentation" class="bm-page" bgcolor="#E8EFF8" style="background:#E8EFF8;padding:40px 16px">
  <tr><td align="center">

    <table width="600" cellpadding="0" cellspacing="0" role="presentation" class="bm-card" bgcolor="#ffffff"
      style="background:#ffffff;border-radius:24px;overflow:hidden;max-width:100%;box-shadow:0 8px 30px rgba(14,42,82,0.10)">

      <!-- ENCABEZADO -->
      <tr><td class="bm-header" bgcolor="#2B7CF6" style="background:#2B7CF6;padding:32px 32px 28px;text-align:center">
        <div>${brandWordmark(siteUrl)}</div>
        <p style="margin:10px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.6px;color:rgba(255,255,255,0.7);white-space:nowrap">
          CIERRE WALL ST. · ${closeLabelET().replace(' ET', '&nbsp;ET')}
        </p>
        <p style="margin:20px 0 0;font-family:Fredoka,system-ui,sans-serif;font-size:24px;font-weight:600;color:#ffffff;letter-spacing:0.2px">
          Tu análisis técnico de hoy
        </p>
        <p style="margin:8px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:500;color:rgba(255,255,255,0.85);line-height:1.6">
          Hola ${displayName} — revisé tus ${signals.length} acción${signals.length !== 1 ? 'es' : ''} al cierre.
          ${strongRows.length > 0 ? `<strong style="color:#ffffff">${strongRows.length} señal${strongRows.length !== 1 ? 'es' : ''}</strong> merece${strongRows.length !== 1 ? 'n' : ''} tu atención.` : 'Nada urgente hoy — todo dentro de lo esperado.'}
        </p>
      </td></tr>

      <!-- STATS -->
      <!-- table-layout:fixed (jul 2026, a pedido de Cas): sin esto, Gmail app
           en Android ignora el width="33%" de cada <td> y las columnas se
           auto-ajustan al ancho de su contenido — como "20 MANTENER" es más
           angosto que el resto, las tres columnas quedaban apretadas a la
           izquierda con un hueco muerto a la derecha en vez de repartirse
           parejo en todo el ancho de la tarjeta. -->
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="table-layout:fixed">
          <tr>
            <td width="33%" align="center" class="bm-stats-td" style="padding:22px 8px;border-right:1px solid #EEF2F8;text-align:center">
              <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:22px;font-weight:800;color:#1FBE8D;text-align:center">${buyCount}</p>
              <p style="margin:2px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:10px;font-weight:800;letter-spacing:0.5px;color:#8B9AB0;text-align:center">COMPRAR</p>
            </td>
            <td width="33%" align="center" class="bm-stats-td" style="padding:22px 8px;border-right:1px solid #EEF2F8;text-align:center">
              <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:22px;font-weight:800;color:#FF6F61;text-align:center">${sellCount}</p>
              <p style="margin:2px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:10px;font-weight:800;letter-spacing:0.5px;color:#8B9AB0;text-align:center">VENDER</p>
            </td>
            <td width="33%" align="center" style="padding:22px 8px;text-align:center">
              <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:22px;font-weight:800;color:#5B6B82;text-align:center">${holdCount}</p>
              <p style="margin:2px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:10px;font-weight:800;letter-spacing:0.5px;color:#8B9AB0;text-align:center">MANTENER</p>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- CUERPO -->
      <!-- Padding lateral reducido de 32px a 20px (jul 2026, a pedido de Cas):
           la fila de stats de arriba solo tiene 8px de padding y usa casi todo
           el ancho de la tarjeta — con 32px acá, las tarjetas de WMT/NVDA de
           abajo quedaban visiblemente más angostas que esa fila, en la misma
           pantalla. 20px sigue dejando margen legible sin ese salto. -->
      <tr><td style="padding:8px 20px 28px">

        ${decisionBlockHtml(decision, infoMap)}

        ${strongRows.length === 0 ? quietDayBlockHtml(signals, sharesMap) : ''}

        ${strongRows.length > 0 ? `
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:20px">
          <tr><td style="padding-bottom:12px">
            <span style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:800;color:#0E2A52">⚡ Para revisar hoy</span>
            ${strongRows.some(s => s.conviction_score !== null) ? `
            <p style="margin:4px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:500;color:#8B9AB0;line-height:1.5">
              El número junto a cada acción es su convicción de compra (mismo que ves en la app) — no todo gatillo técnico es una compra igual de buena.
            </p>` : ''}
          </td></tr>
          ${strongCardsHtml}
        </table>` : ''}

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" class="bm-disclaimer" bgcolor="#F5F7FA"
          style="background:#F5F7FA;border-radius:14px;margin-top:20px">
          <tr><td style="padding:14px 18px">
            <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;color:#8B9AB0;line-height:1.6">
              Este análisis es informativo y automático, basado en indicadores técnicos al cierre. No es asesoría
              financiera — las decisiones de inversión son tuyas.
            </p>
          </td></tr>
        </table>

        <!-- CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:20px">
          <tr><td>
            <a href="${siteUrl}/inversiones" class="bm-cta" bgcolor="#2B7CF6"
              style="display:block;text-align:center;background:#2B7CF6;color:#ffffff;text-decoration:none;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:700;padding:15px 32px;border-radius:12px;letter-spacing:0.1px">
              Ver análisis completo en la app →
            </a>
          </td></tr>
        </table>

      </td></tr>

      <!-- PIE -->
      <tr><td class="bm-footer" bgcolor="#0E2A52" style="background:#0E2A52;padding:28px 32px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="text-align:center;padding-bottom:16px">
            ${brandWordmark(siteUrl)}
          </td></tr>
          <tr><td style="text-align:center;padding-bottom:16px">
            <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;color:#9FB5D4">
              Recibes este correo cada día al cierre de Wall Street.
            </p>
          </td></tr>
          <tr><td class="bm-footer-divider" style="text-align:center;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px">
            <a href="${siteUrl}/ajustes" style="color:#9FB5D4;text-decoration:none;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:600">Ajustar frecuencia</a>
            <span style="color:#3D5476;font-size:11px">&nbsp;·&nbsp;</span>
            <a href="${siteUrl}/ajustes" style="color:#9FB5D4;text-decoration:none;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:600">Cancelar envíos</a>
          </td></tr>
        </table>
      </td></tr>

    </table>
  </td></tr>
</table>

</body>
</html>`
}
