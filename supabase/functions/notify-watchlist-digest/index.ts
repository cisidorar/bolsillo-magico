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

interface Signal {
  user_id:    string
  ticker:     string
  kind:       'buy' | 'sell' | 'caution' | 'target' | 'hold'
  message:    string
  price:      number
  change_pct: number
  strong:     boolean
  watch:      boolean
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
      { user_id: 'x', ticker: 'MELI', kind: 'sell', message: 'Cruzó por debajo de su media de 50 días. Perdió el soporte y el RSI marca sobrecompra — considera tomar ganancias.', price: 1852.22, change_pct: -3.4, strong: true, watch: false },
      { user_id: 'x', ticker: 'NVDA', kind: 'buy',  message: 'Rebotó en su media de 20 días con volumen alto y MACD girando al alza. Rompe resistencia — buen punto para promediar.', price: 210.96, change_pct: 2.6, strong: true, watch: false },
      { user_id: 'x', ticker: 'META', kind: 'hold', message: 'tendencia estable', price: 669.21, change_pct: 0.4, strong: false, watch: false },
      { user_id: 'x', ticker: 'SPY',  kind: 'hold', message: 'dentro de rango', price: 754.95, change_pct: 0.3, strong: false, watch: false },
      { user_id: 'x', ticker: 'MU',   kind: 'caution', message: 'Débil · cerca de soporte', price: 979.30, change_pct: -1.2, strong: false, watch: true },
      { user_id: 'x', ticker: 'GOOGL', kind: 'hold', message: 'consolidando', price: 357.18, change_pct: 0.9, strong: false, watch: false },
      { user_id: 'x', ticker: 'IBIT', kind: 'hold', message: 'lateral', price: 36.23, change_pct: 0.6, strong: false, watch: false },
    ]
    const infoMap = new Map<string, TickerInfo>([
      ['MELI', { name: 'MercadoLibre', domain: 'mercadolibre.com' }],
      ['NVDA', { name: 'NVIDIA', domain: 'nvidia.com' }],
      ['META', { name: 'Meta Platforms', domain: 'meta.com' }],
      ['SPY',  { name: 'S&P 500 ETF', domain: null }],
      ['MU',   { name: 'Micron Technology', domain: 'micron.com' }],
      ['GOOGL', { name: 'Alphabet', domain: 'abc.xyz' }],
      ['IBIT', { name: 'iShares Bitcoin Trust', domain: null }],
    ])
    const sharesMap = new Map<string, number>([['MELI', 0.3], ['NVDA', 2.1]])
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: testEmail,
        subject: `2 señales fuertes para revisar hoy · Bolsillo Mágico`,
        html: digestEmailHtml({ displayName: 'Cata', signals: testSignals, infoMap, sharesMap, siteUrl: SITE_URL }),
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
    .select('user_id, ticker, kind, message, price, change_pct, strong, watch')
    .eq('signal_date', today)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ sent: 0, users: 0 }), { headers: { 'Content-Type': 'application/json' } })
  }
  const signals = rows as Signal[]

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
        }),
      }),
    })

    if (res.ok) sent++
    else console.error(`Resend error for ${email}:`, await res.text())
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
      <tr><td align="center" valign="middle" style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.28)}px;background:#0E2A52;overflow:hidden">
        <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=128" width="${Math.round(size * 0.62)}" height="${Math.round(size * 0.62)}" alt="${ticker}"
          style="width:${Math.round(size * 0.62)}px;height:${Math.round(size * 0.62)}px;display:block;border-radius:4px">
      </td></tr>
    </table>`
  }
  const fontSize = ticker.length > 4 ? 9 : ticker.length > 3 ? 10 : 11
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="width:${size}px;height:${size}px">
    <tr><td align="center" valign="middle" style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.28)}px;background:#0E2A52;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:${fontSize}px;font-weight:800;color:#ffffff;letter-spacing:0.2px">
      ${ticker.slice(0, 5)}
    </td></tr>
  </table>`
}

// ── Email HTML ────────────────────────────────────────────────────────────────

function digestEmailHtml({
  displayName,
  signals,
  infoMap,
  sharesMap,
  siteUrl,
}: {
  displayName: string
  signals:     Signal[]
  infoMap:     Map<string, TickerInfo>
  sharesMap:   Map<string, number>
  siteUrl:     string
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
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
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
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${color.bg};border-radius:12px;margin-top:12px">
              <tr><td style="padding:12px 14px">
                <p style="margin:0 0 4px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.4px;color:${color.fg}">
                  <span style="color:${color.fg}">●</span> ${KIND_TITLE[s.kind]}
                </p>
                <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:500;color:#3D4C63;line-height:1.5">${s.message}</p>
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
</head>
<body style="margin:0;padding:0;background:#E8EFF8;font-family:'Plus Jakarta Sans','Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">

<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#E8EFF8;padding:40px 16px">
  <tr><td align="center">

    <table width="600" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#ffffff;border-radius:24px;overflow:hidden;max-width:100%;box-shadow:0 8px 30px rgba(14,42,82,0.10)">

      <!-- ENCABEZADO -->
      <tr><td style="background:#2B7CF6;padding:32px 32px 28px;text-align:center">
        <div>${brandWordmark(siteUrl)}</div>
        <p style="margin:10px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.6px;color:rgba(255,255,255,0.7)">
          CIERRE WALL ST. · ${closeLabelET()}
        </p>
        <p style="margin:20px 0 0;font-family:Fredoka,system-ui,sans-serif;font-size:24px;font-weight:600;color:#ffffff;letter-spacing:0.2px;text-align:left">
          Tu análisis técnico de hoy
        </p>
        <p style="margin:8px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:500;color:rgba(255,255,255,0.85);line-height:1.6;text-align:left">
          Hola ${displayName} — revisé tus ${signals.length} acción${signals.length !== 1 ? 'es' : ''} al cierre.
          ${strongRows.length > 0 ? `<strong style="color:#ffffff">${strongRows.length} señal${strongRows.length !== 1 ? 'es' : ''}</strong> merece${strongRows.length !== 1 ? 'n' : ''} tu atención.` : 'Nada urgente hoy — todo dentro de lo esperado.'}
        </p>
      </td></tr>

      <!-- STATS -->
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td width="33%" align="center" style="padding:22px 8px;border-right:1px solid #EEF2F8">
              <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:22px;font-weight:800;color:#1FBE8D">${buyCount}</p>
              <p style="margin:2px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:10px;font-weight:800;letter-spacing:0.5px;color:#8B9AB0">COMPRAR</p>
            </td>
            <td width="33%" align="center" style="padding:22px 8px;border-right:1px solid #EEF2F8">
              <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:22px;font-weight:800;color:#FF6F61">${sellCount}</p>
              <p style="margin:2px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:10px;font-weight:800;letter-spacing:0.5px;color:#8B9AB0">VENDER</p>
            </td>
            <td width="33%" align="center" style="padding:22px 8px">
              <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:22px;font-weight:800;color:#5B6B82">${holdCount}</p>
              <p style="margin:2px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:10px;font-weight:800;letter-spacing:0.5px;color:#8B9AB0">MANTENER</p>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- CUERPO -->
      <tr><td style="padding:8px 32px 28px">

        ${strongRows.length > 0 ? `
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:20px">
          <tr><td style="padding-bottom:12px">
            <span style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:800;color:#0E2A52">⚡ Para revisar hoy</span>
          </td></tr>
          ${strongCardsHtml}
        </table>` : ''}

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
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
            <a href="${siteUrl}/inversiones"
              style="display:block;text-align:center;background:#2B7CF6;color:#ffffff;text-decoration:none;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:700;padding:15px 32px;border-radius:12px;letter-spacing:0.1px">
              Ver análisis completo en la app →
            </a>
          </td></tr>
        </table>

      </td></tr>

      <!-- PIE -->
      <tr><td style="background:#0E2A52;padding:28px 32px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="text-align:center;padding-bottom:16px">
            ${brandWordmark(siteUrl)}
          </td></tr>
          <tr><td style="text-align:center;padding-bottom:16px">
            <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;color:#9FB5D4">
              Recibes este correo cada día al cierre de Wall Street.
            </p>
          </td></tr>
          <tr><td style="text-align:center;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px">
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
