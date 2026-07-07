/**
 * notify-watchlist-target — Edge Function
 *
 * Corre diariamente (pg_cron), después del sync de precios. Revisa los
 * favoritos con precio objetivo definido y sin avisar todavía; si el último
 * cierre ya cruzó el objetivo (según target_direction: 'above' o 'below'),
 * envía un correo y marca target_notified=true para no repetir el aviso.
 * Editar el objetivo desde la app resetea target_notified a false.
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

interface WatchlistRow {
  id:               string
  user_id:          string
  ticker:           string
  target_price:     number
  target_direction: 'above' | 'below' | null
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
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: testEmail,
        subject: 'NVDA llegó a tu precio objetivo · Bolsillo Mágico',
        html: targetEmailHtml({
          displayName: 'Cas', ticker: 'NVDA', price: 198.32, targetPrice: 198,
          direction: 'above', siteUrl: SITE_URL,
        }),
      }),
    })
    return new Response(JSON.stringify({ test: true, ok: res.ok }), { headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  // 1. Favoritos con objetivo activo y sin avisar todavía (de todos los usuarios)
  const { data: items, error: wErr } = await supabase
    .from('watchlist')
    .select('id, user_id, ticker, target_price, target_direction')
    .not('target_price', 'is', null)
    .eq('target_notified', false)

  if (wErr) return new Response(JSON.stringify({ error: wErr.message }), { status: 500 })
  if (!items || items.length === 0) {
    return new Response(JSON.stringify({ sent: 0, checked: 0, skipped: 0 }), { headers: { 'Content-Type': 'application/json' } })
  }
  const rows = items as WatchlistRow[]

  // 2. Preferencia de aviso (opt-out) + email de cada usuario
  const userIds = [...new Set(rows.map(i => i.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, notify_watchlist_target')
    .in('id', userIds)
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p as { display_name: string | null; notify_watchlist_target: boolean }]))

  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const emailMap = new Map((authUsers?.users ?? []).map(u => [u.id, u.email]))

  // 3. Último cierre por ticker — una sola lectura por símbolo único (price_history, BD-first)
  const tickers = [...new Set(rows.map(i => i.ticker))]
  const priceMap = new Map<string, number>()
  for (const ticker of tickers) {
    const { data: candle } = await supabase
      .from('price_history')
      .select('close')
      .eq('ticker', ticker)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (candle) priceMap.set(ticker, Number(candle.close))
  }

  let sent = 0, checked = 0, skipped = 0

  for (const item of rows) {
    checked++
    const profile = profileMap.get(item.user_id)
    if (!profile || profile.notify_watchlist_target === false) { skipped++; continue }

    const email = emailMap.get(item.user_id)
    if (!email) { skipped++; continue }

    const price = priceMap.get(item.ticker)
    if (price === undefined) { skipped++; continue }

    // Legacy sin dirección explícita (filas de antes de este fix): cae a 'below'
    const direction = item.target_direction ?? 'below'
    const reached = direction === 'above' ? price >= item.target_price : price <= item.target_price
    if (!reached) continue

    const displayName = profile.display_name ?? 'Usuario'
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: email,
        subject: `${item.ticker} llegó a tu precio objetivo · Bolsillo Mágico`,
        html: targetEmailHtml({
          displayName, ticker: item.ticker, price, targetPrice: item.target_price,
          direction, siteUrl: SITE_URL,
        }),
      }),
    })

    if (res.ok) {
      sent++
      await supabase.from('watchlist').update({ target_notified: true }).eq('id', item.id)
    } else {
      console.error(`Resend error for ${email} (${item.ticker}):`, await res.text())
    }
  }

  return new Response(JSON.stringify({ sent, checked, skipped }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// ── Logo / Wordmark (mismo bloque que notify-billing) ─────────────────────────

function brandWordmark(siteUrl: string) {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto">
    <tr>
      <td style="vertical-align:middle;padding-right:8px">
        <img src="${siteUrl}/bolsillo-magico-icono-invertido.svg" width="32" height="32" alt="Bolsillo Mágico" style="width:32px;height:32px;border-radius:8px;display:block">
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

function targetEmailHtml({
  displayName,
  ticker,
  price,
  targetPrice,
  direction,
  siteUrl,
}: {
  displayName: string
  ticker:      string
  price:       number
  targetPrice: number
  direction:   'above' | 'below'
  siteUrl:     string
}) {
  const verb   = direction === 'above' ? 'subió a' : 'bajó a'
  const accent = direction === 'above' ? '#1FBE8D' : '#FF6F61'   // mint (ruptura) / coral (caída)
  const accentBg     = direction === 'above' ? '#EAFBF5' : '#FFF1EF'
  const accentBorder = direction === 'above' ? '#BFEEDF' : '#FFD8D2'

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Precio objetivo · Bolsillo Mágico</title>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#E8EFF8;font-family:'Plus Jakarta Sans','Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">

<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#E8EFF8;padding:40px 16px">
  <tr><td align="center">

    <table width="600" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#ffffff;border-radius:24px;overflow:hidden;max-width:100%;box-shadow:0 8px 30px rgba(14,42,82,0.10)">

      <!-- ENCABEZADO -->
      <tr><td style="background:${accent};padding:36px 40px 32px;text-align:center">
        <div style="margin-bottom:24px">${brandWordmark(siteUrl)}</div>
        <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 16px">
          <tr><td style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,0.2);text-align:center;vertical-align:middle;font-size:26px;line-height:52px">
            🎯
          </td></tr>
        </table>
        <p style="margin:0;font-family:Fredoka,system-ui,sans-serif;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:0.2px">
          ${ticker} ${verb} tu precio objetivo
        </p>
      </td></tr>

      <!-- CUERPO -->
      <tr><td style="padding:32px 40px 28px">

        <p style="margin:0 0 8px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:20px;font-weight:700;color:#0E2A52">
          Hola, ${displayName}
        </p>
        <p style="margin:0 0 28px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:500;color:#5B6B82;line-height:1.6">
          Definiste un aviso para <strong style="color:#0E2A52">${ticker}</strong> cuando el precio
          ${direction === 'above' ? 'subiera' : 'bajara'} a <strong style="color:#0E2A52">${fmtUSD(targetPrice)}</strong>.
          Al cierre de hoy, ya llegó.
        </p>

        <!-- BLOQUE DESTACADO -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="background:#2B7CF6;border-radius:20px;margin-bottom:24px">
          <tr><td style="padding:28px 32px;text-align:center">
            <p style="margin:0 0 6px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:700;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1.5px">
              Cierre de hoy
            </p>
            <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:38px;font-weight:800;color:#ffffff;letter-spacing:-1px;line-height:1;font-variant-numeric:tabular-nums">
              ${fmtUSD(price)}
            </p>
            <p style="margin:8px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:600;color:rgba(255,255,255,0.75)">
              objetivo: ${fmtUSD(targetPrice)}
            </p>
          </td></tr>
        </table>

        <!-- TARJETA aviso -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="background:${accentBg};border:1.5px solid ${accentBorder};border-radius:16px;margin-bottom:28px">
          <tr><td style="padding:18px 20px">
            <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:500;color:#5B6B82;line-height:1.6">
              Este aviso es informativo — no es recomendación de compra o venta. Revisa la lectura técnica
              completa en la app antes de decidir; la señal puede fallar o tardar en confirmarse.
            </p>
          </td></tr>
        </table>

        <!-- CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="text-align:center">
            <a href="${siteUrl}/inversiones"
              style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:700;padding:14px 32px;border-radius:12px;letter-spacing:0.1px">
              Ver ${ticker} en la app
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
              Recibes este correo porque definiste un precio objetivo en Favoritos.<br>
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
