/**
 * notify-watchlist-digest — Edge Function
 *
 * Corre diariamente (pg_cron), después de /api/cron/sync-prices (Vercel) —
 * ese cron ya calculó analyze() para cada ticker y dejó las señales del día
 * en daily_signals (una fila por usuario+ticker+tipo: buy/sell/caution/target).
 * Esta función SOLO lee esa tabla, agrupa por usuario y manda UN correo por
 * usuario con todo lo accionable del día — no recalcula nada técnico.
 *
 * Si un usuario no tiene ninguna señal hoy, no recibe correo (nada que avisar).
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

function todayInCL(): string {
  // Fecha de hoy en Santiago — mismo criterio que el DEFAULT de daily_signals.signal_date
  const utc = new Date()
  const cl  = new Date(utc.toLocaleString('en-US', { timeZone: 'America/Santiago' }))
  const y = cl.getFullYear(), m = String(cl.getMonth() + 1).padStart(2, '0'), d = String(cl.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface Signal {
  user_id: string
  ticker:  string
  kind:    'buy' | 'sell' | 'caution' | 'target'
  message: string
  price:   number
}

const KIND_ORDER: Record<Signal['kind'], number> = { target: 0, sell: 1, caution: 2, buy: 3 }
const KIND_LABEL: Record<Signal['kind'], string> = {
  target:  '🎯 Precio objetivo',
  sell:    '🔴 Venta',
  caution: '🟡 Toma de ganancias',
  buy:     '🟢 Compra',
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
      { user_id: 'x', ticker: 'MU',   kind: 'target', message: 'Llegó a tu precio de salida: subió a US$1.089,00', price: 1089.32 },
      { user_id: 'x', ticker: 'AAPL', kind: 'buy',     message: 'Compra fuerte', price: 313.25 },
      { user_id: 'x', ticker: 'TSM',  kind: 'sell',    message: 'Venta', price: 453.95 },
    ]
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: testEmail,
        subject: `3 favoritos para revisar hoy · Bolsillo Mágico`,
        html: digestEmailHtml({ displayName: 'Cas', signals: testSignals, siteUrl: SITE_URL }),
      }),
    })
    return new Response(JSON.stringify({ test: true, ok: res.ok }), { headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const today = todayInCL()

  const { data: rows, error } = await supabase
    .from('daily_signals')
    .select('user_id, ticker, kind, message, price')
    .eq('signal_date', today)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ sent: 0, users: 0 }), { headers: { 'Content-Type': 'application/json' } })
  }
  const signals = rows as Signal[]

  const byUser = new Map<string, Signal[]>()
  for (const s of signals) {
    const list = byUser.get(s.user_id) ?? []
    list.push(s)
    byUser.set(s.user_id, list)
  }

  const userIds = [...byUser.keys()]
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

    const sorted = [...userSignals].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
    const displayName = profile.display_name ?? 'Usuario'
    const tickerWord = sorted.length === 1 ? sorted[0].ticker : `${sorted.length} favoritos`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: email,
        subject: `${tickerWord} para revisar hoy · Bolsillo Mágico`,
        html: digestEmailHtml({ displayName, signals: sorted, siteUrl: SITE_URL }),
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

// ── Email HTML ────────────────────────────────────────────────────────────────

function digestEmailHtml({
  displayName,
  signals,
  siteUrl,
}: {
  displayName: string
  signals:     Signal[]
  siteUrl:     string
}) {
  const rowsHtml = signals.map(s => {
    const color = s.kind === 'sell' ? '#FF6F61' : s.kind === 'caution' ? '#FFC23C' : s.kind === 'target' ? '#2B7CF6' : '#1FBE8D'
    const bg    = s.kind === 'sell' ? '#FFF1EF' : s.kind === 'caution' ? '#FFFAEB' : s.kind === 'target' ? '#EAF2FF' : '#EAFBF5'
    return `
      <tr><td style="padding-bottom:10px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="background:${bg};border-radius:14px">
          <tr><td style="padding:14px 18px">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:15px;font-weight:800;color:#0E2A52">
                  ${s.ticker}
                </td>
                <td style="text-align:right;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:700;color:#5B6B82;font-variant-numeric:tabular-nums">
                  ${fmtUSD(s.price)}
                </td>
              </tr>
              <tr><td colspan="2" style="padding-top:4px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:600;color:${color}">
                ${KIND_LABEL[s.kind]} — ${s.message}
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
  <title>Favoritos para revisar hoy · Bolsillo Mágico</title>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#E8EFF8;font-family:'Plus Jakarta Sans','Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">

<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#E8EFF8;padding:40px 16px">
  <tr><td align="center">

    <table width="600" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#ffffff;border-radius:24px;overflow:hidden;max-width:100%;box-shadow:0 8px 30px rgba(14,42,82,0.10)">

      <!-- ENCABEZADO -->
      <tr><td style="background:#2B7CF6;padding:36px 40px 32px;text-align:center">
        <div style="margin-bottom:24px">${brandWordmark(siteUrl)}</div>
        <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 16px">
          <tr><td style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,0.2);text-align:center;vertical-align:middle;font-size:26px;line-height:52px">
            📋
          </td></tr>
        </table>
        <p style="margin:0;font-family:Fredoka,system-ui,sans-serif;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:0.2px">
          ${signals.length} favorito${signals.length !== 1 ? 's' : ''} para revisar hoy
        </p>
      </td></tr>

      <!-- CUERPO -->
      <tr><td style="padding:32px 40px 28px">

        <p style="margin:0 0 24px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:500;color:#5B6B82;line-height:1.6">
          Hola, ${displayName}. Con el cierre de ayer, esto es lo que cambió en tu lista de favoritos:
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          ${rowsHtml}
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="background:#F5F7FA;border-radius:14px;margin-top:8px">
          <tr><td style="padding:14px 18px">
            <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;color:#8B9AB0;line-height:1.6">
              Esto es informativo — no es recomendación de compra o venta. Revisa la lectura técnica completa
              en la app antes de decidir.
            </p>
          </td></tr>
        </table>

        <!-- CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:24px">
          <tr><td style="text-align:center">
            <a href="${siteUrl}/inversiones"
              style="display:inline-block;background:#2B7CF6;color:#ffffff;text-decoration:none;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:700;padding:14px 32px;border-radius:12px;letter-spacing:0.1px">
              Ver Favoritos en la app
            </a>
          </td></tr>
        </table>

      </td></tr>

      <!-- PIE -->
      <tr><td style="background:#0E2A52;padding:28px 40px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="text-align:center;padding-bottom:16px">
            ${brandWordmark(siteUrl)}
          </td></tr>
          <tr><td style="text-align:center;padding-bottom:16px">
            <a href="${siteUrl}" style="color:#9FB5D4;text-decoration:none;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;margin:0 10px">Abrir app</a>
            <span style="color:#3D5476;font-size:12px">·</span>
            <a href="${siteUrl}/ajustes" style="color:#9FB5D4;text-decoration:none;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;margin:0 10px">Preferencias</a>
          </td></tr>
          <tr><td style="text-align:center;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px">
            <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:500;color:#5E7396;line-height:1.6">
              Recibes este correo porque tienes favoritos en seguimiento en Inversiones.<br>
              <a href="${siteUrl}/ajustes" style="color:#5E7396;text-decoration:underline">Cancelar suscripción</a>
            </p>
          </td></tr>
        </table>
      </td></tr>

    </table>
  </td></tr>
</table>

</body>
</html>`
}
