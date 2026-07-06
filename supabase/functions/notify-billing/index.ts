/**
 * notify-billing — Edge Function
 *
 * Corre diariamente (pg_cron). Detecta usuarios con tarjeta de crédito
 * cuyo billing_day cierra mañana o pasado mañana.
 *
 * Requiere: RESEND_API_KEY, SITE_URL, DB_SERVICE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SITE_URL       = Deno.env.get('SITE_URL') ?? 'https://bolsillomagico.com'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('DB_SERVICE_KEY')!

Deno.serve(async (req: Request) => {
  const url  = new URL(req.url)
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* no body */ }
  const force = url.searchParams.get('force') === 'true' || body?.force === true

  const now = new Date()

  // MODO TEST: enviar correo de muestra sin DB
  if (force) {
    const testEmail = (body?.email as string) ?? null
    if (!testEmail) return new Response('Pasa tu email: {"force":true,"email":"tu@email.com"}', { status: 400 })
    const fmtCLP = (n: number) => '$' + n.toLocaleString('es-CL', { maximumFractionDigits: 0 })
    const billingDay = 5
    const closeDate = new Date(now.getFullYear(), now.getMonth(), billingDay)
    const closeDateLabel = closeDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: testEmail,
        subject: 'Tu tarjeta Visa BCI cierra mañana · Bolsillo Mágico',
        html: billingEmailHtml({ displayName: 'Cas', cardName: 'Visa BCI', daysUntil: 1, closeDateLabel, total: 842_500, fmtCLP, siteUrl: SITE_URL }),
      }),
    })
    return new Response(JSON.stringify({ test: true, ok: res.ok }), { headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  // Todas las tarjetas de crédito con día de corte: el filtro por días de
  // anticipación es POR USUARIO (profiles.billing_alert_days, default 2).
  const { data: methods, error: mErr } = await supabase
    .from('payment_methods')
    .select('id, name, billing_day, user_id')
    .eq('card_type', 'credit')
    .not('billing_day', 'is', null)

  if (mErr) return new Response(JSON.stringify({ error: mErr.message }), { status: 500 })
  if (!methods || methods.length === 0) return new Response('No credit cards', { status: 200 })

  const userIds = [...new Set(methods.map(m => m.user_id))]

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, notify_billing, billing_alert_days')
    .in('id', userIds)
    .eq('notify_billing', true)

  // Días hasta el próximo cierre, con clamp a fin de mes (billing_day 30 en feb)
  function daysUntilClose(billingDay: number): number {
    const y = now.getFullYear(), m0 = now.getMonth(), today = now.getDate()
    const lastThis  = new Date(y, m0 + 1, 0).getDate()
    const closeThis = Math.min(billingDay, lastThis)
    if (closeThis >= today) return closeThis - today
    const lastNext = new Date(y, m0 + 2, 0).getDate()
    return (lastThis - today) + Math.min(billingDay, lastNext)
  }

  const { data: authUsers } = await supabase.auth.admin.listUsers()

  const emailMap   = new Map((authUsers?.users ?? []).map(u => [u.id, u.email]))
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))

  let sent = 0; let skipped = 0

  for (const method of methods) {
    const profile = profileMap.get(method.user_id)
    if (!profile) { skipped++; continue }

    const email = emailMap.get(method.user_id)
    if (!email) { skipped++; continue }

    // Enviar solo cuando faltan exactamente los días configurados por el usuario
    const alertDays = (profile as { billing_alert_days?: number }).billing_alert_days ?? 2
    const daysUntil = daysUntilClose(method.billing_day)
    if (daysUntil !== alertDays) { skipped++; continue }
    const refKey    = `${now.toISOString().slice(0, 10)}:billing:${method.id}`

    const { error: logErr } = await supabase
      .from('notification_log')
      .insert({ user_id: method.user_id, type: 'billing', ref_key: refKey })
      .select().single()
    if (logErr) { skipped++; continue }

    const billingDay = method.billing_day
    const year  = now.getFullYear()
    const month = now.getMonth() + 1

    let periodStart: string
    if (now.getDate() > billingDay) {
      periodStart = `${year}-${String(month).padStart(2,'0')}-${String(billingDay + 1).padStart(2,'0')}`
    } else {
      const prevMonth = month === 1 ? 12 : month - 1
      const prevYear  = month === 1 ? year - 1 : year
      const lastDay   = new Date(year, prevMonth, 0).getDate()
      const startDay  = Math.min(billingDay + 1, lastDay)
      periodStart = `${prevYear}-${String(prevMonth).padStart(2,'0')}-${String(startDay).padStart(2,'0')}`
    }

    const { data: expenses } = await supabase
      .from('expenses')
      .select('amount')
      .eq('user_id', method.user_id)
      .eq('payment_method_id', method.id)
      .gte('date', periodStart)
      .lte('date', now.toISOString().slice(0, 10))

    const total = (expenses ?? []).reduce((s, e) => s + e.amount, 0)
    const fmtCLP = (n: number) => '$' + n.toLocaleString('es-CL', { maximumFractionDigits: 0 })

    const closeDate      = new Date(year, month - 1, billingDay)
    const closeDateLabel = closeDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })
    const displayName    = profile.display_name ?? 'Usuario'

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: email,
        subject: daysUntil === 0
          ? `Tu tarjeta ${method.name} cierra hoy · Bolsillo Mágico`
          : daysUntil === 1
          ? `Tu tarjeta ${method.name} cierra mañana · Bolsillo Mágico`
          : `Tu tarjeta ${method.name} cierra en ${daysUntil} días · Bolsillo Mágico`,
        html: billingEmailHtml({
          displayName,
          cardName:    method.name,
          daysUntil,
          closeDateLabel,
          total,
          fmtCLP,
          siteUrl: SITE_URL,
        }),
      }),
    })

    if (res.ok) sent++
    else console.error(`Resend error for ${email}:`, await res.text())
  }

  return new Response(JSON.stringify({ sent, skipped }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// ── Logo / Wordmark ──────────────────────────────────────────────────────────

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

function billingEmailHtml({
  displayName,
  cardName,
  daysUntil,
  closeDateLabel,
  total,
  fmtCLP,
  siteUrl,
}: {
  displayName: string
  cardName: string
  daysUntil: number
  closeDateLabel: string
  total: number
  fmtCLP: (n: number) => string
  siteUrl: string
}) {
  const urgencyText = daysUntil === 0 ? 'cierra hoy' : daysUntil === 1 ? 'cierra mañana' : `cierra en ${daysUntil} días`
  // Recordatorio = ámbar
  const accent = '#F59E0B'
  const accentBg = '#FFF8E8'
  const accentBorder = '#FBE6B5'

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Cierre de tarjeta · Bolsillo Mágico</title>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#E8EFF8;font-family:'Plus Jakarta Sans','Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">

<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#E8EFF8;padding:40px 16px">
  <tr><td align="center">

    <table width="600" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#ffffff;border-radius:24px;overflow:hidden;max-width:100%;box-shadow:0 8px 30px rgba(14,42,82,0.10)">

      <!-- ENCABEZADO ámbar -->
      <tr><td style="background:#F59E0B;padding:36px 40px 32px;text-align:center">
        <div style="margin-bottom:24px">${brandWordmark(siteUrl)}</div>
        <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 16px">
          <tr><td style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,0.2);text-align:center;vertical-align:middle;font-size:26px;line-height:52px">
            🔔
          </td></tr>
        </table>
        <p style="margin:0;font-family:Fredoka,system-ui,sans-serif;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:0.2px">
          Tu tarjeta ${cardName} ${urgencyText}
        </p>
      </td></tr>

      <!-- CUERPO -->
      <tr><td style="padding:32px 40px 28px">

        <!-- Saludo -->
        <p style="margin:0 0 8px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:20px;font-weight:700;color:#0E2A52">
          Hola, ${displayName}
        </p>
        <p style="margin:0 0 28px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:500;color:#5B6B82;line-height:1.6">
          Tu tarjeta <strong style="color:#0E2A52">${cardName}</strong> cierra el
          <strong style="color:#0E2A52">${closeDateLabel}</strong>.
          Aquí tienes el total del período actual para que no te tome por sorpresa.
        </p>

        <!-- BLOQUE DESTACADO azul -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="background:#2B7CF6;border-radius:20px;margin-bottom:24px">
          <tr><td style="padding:28px 32px;text-align:center">
            <p style="margin:0 0 6px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:700;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1.5px">
              Gastado en este período
            </p>
            <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:38px;font-weight:800;color:#ffffff;letter-spacing:-1px;line-height:1;font-variant-numeric:tabular-nums">
              ${fmtCLP(total)}
            </p>
          </td></tr>
        </table>

        <!-- TARJETA recordatorio (tinte ámbar) -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="background:#FFF8E8;border:1.5px solid #FBE6B5;border-radius:16px;margin-bottom:28px">
          <tr><td style="padding:18px 20px">
            <table cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="width:32px;vertical-align:top;padding-top:2px">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#F59E0B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 8a5 5 0 0 1 10 0c0 5 2 6 2 6H3s2-1 2-6"/>
                    <path d="M8.5 17a1.5 1.5 0 0 0 3 0"/>
                  </svg>
                </td>
                <td style="padding-left:12px;vertical-align:top">
                  <p style="margin:0 0 4px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:700;color:#0E2A52">
                    Recordatorio de cierre
                  </p>
                  <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:500;color:#5B6B82;line-height:1.6">
                    Revisa tus gastos antes del cierre para evitar sorpresas en tu estado de cuenta.
                  </p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>

        <!-- CTA ámbar -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="text-align:center">
            <a href="${siteUrl}/historial?view=billing"
              style="display:inline-block;background:#F59E0B;color:#ffffff;text-decoration:none;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:700;padding:14px 32px;border-radius:12px;letter-spacing:0.1px">
              Ver estado de cuenta
            </a>
            <p style="margin:12px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;color:#94A3B8">
              O abre la app para revisar el detalle.
            </p>
          </td></tr>
        </table>

      </td></tr>

      <!-- PIE navy -->
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
              Recibes este correo porque tienes activos los recordatorios de cierre.<br>
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
