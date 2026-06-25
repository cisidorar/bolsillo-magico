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

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  const now      = new Date()
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const dayAfter = new Date(now); dayAfter.setDate(now.getDate() + 2)

  const targetDays = [tomorrow.getDate(), dayAfter.getDate()]

  const { data: methods, error: mErr } = await supabase
    .from('payment_methods')
    .select('id, name, billing_day, user_id')
    .eq('card_type', 'credit')
    .in('billing_day', targetDays)

  if (mErr) return new Response(JSON.stringify({ error: mErr.message }), { status: 500 })
  if (!methods || methods.length === 0) return new Response('No billing reminders today', { status: 200 })

  const userIds = [...new Set(methods.map(m => m.user_id))]

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, notify_billing')
    .in('id', userIds)
    .eq('notify_billing', true)

  const { data: authUsers } = await supabase.auth.admin.listUsers()

  const emailMap   = new Map((authUsers?.users ?? []).map(u => [u.id, u.email]))
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))

  let sent = 0; let skipped = 0

  for (const method of methods) {
    const profile = profileMap.get(method.user_id)
    if (!profile) { skipped++; continue }

    const email = emailMap.get(method.user_id)
    if (!email) { skipped++; continue }

    const daysUntil = method.billing_day === tomorrow.getDate() ? 1 : 2
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
        subject: daysUntil === 1
          ? `⏰ Tu tarjeta ${method.name} cierra mañana`
          : `📅 Tu tarjeta ${method.name} cierra en 2 días`,
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
  const isUrgent    = daysUntil === 1
  const urgencyIcon = isUrgent ? '⏰' : '📅'
  const urgencyText = isUrgent ? 'cierra <strong>mañana</strong>' : 'cierra en <strong>2 días</strong>'

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Cierre de tarjeta · Bolsillo Mágico</title>
</head>
<body style="margin:0;padding:0;background:#E8EFF8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">

<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#E8EFF8;padding:40px 16px">
  <tr><td align="center">

    <table width="560" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#ffffff;border-radius:24px;overflow:hidden;max-width:100%;box-shadow:0 8px 30px rgba(14,42,82,0.10)">

      <!-- Header -->
      <tr><td style="background:#F4F7FB;padding:28px 40px 24px;text-align:center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="text-align:left;font-size:14px;color:#2B7CF6;vertical-align:top">✦</td>
            <td style="text-align:center">
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#2B7CF6;text-transform:uppercase;letter-spacing:2px">Recordatorio de cierre</p>
              <p style="margin:0;font-size:24px;font-weight:800;color:#0E2A52;letter-spacing:-0.3px">${cardName}</p>
            </td>
            <td style="text-align:right;font-size:14px;color:#FFC23C;vertical-align:top">✦</td>
          </tr>
        </table>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:28px 40px">
        <p style="margin:0 0 20px;font-size:20px;font-weight:700;color:#0E2A52">Hola, ${displayName} 👋</p>
        <p style="margin:0 0 24px;font-size:15px;color:#5B6B82;line-height:1.6">
          Tu tarjeta <strong style="color:#0E2A52">${cardName}</strong> ${urgencyText} el <strong style="color:#0E2A52">${closeDateLabel}</strong>.
          Aquí va tu resumen del período actual.
        </p>

        <!-- Hero card: total -->
        <div style="background:#2B7CF6;border-radius:20px;padding:24px 28px;margin-bottom:24px;text-align:center">
          <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px">Gastado en este período</p>
          <p style="margin:0;font-size:38px;font-weight:800;color:#ffffff;letter-spacing:-1px;line-height:1">${fmtCLP(total)}</p>
        </div>

        <!-- Info box -->
        <div style="background:${isUrgent ? '#FFF5F5' : '#FFF8EC'};border:1.5px solid ${isUrgent ? '#FECACA' : '#FFE4A0'};border-radius:16px;padding:16px 20px;margin-bottom:24px">
          <table cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="width:32px;font-size:22px;vertical-align:middle">${urgencyIcon}</td>
              <td style="padding-left:10px;vertical-align:middle;font-size:14px;color:#5B6B82;line-height:1.5">
                Recuerda revisar tus gastos antes del cierre para evitar sorpresas en tu estado de cuenta.
              </td>
            </tr>
          </table>
        </div>

        <!-- CTA -->
        <div style="text-align:center">
          <a href="${siteUrl}/historial?view=billing"
            style="display:inline-block;background:#2B7CF6;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:14px;letter-spacing:-0.2px">
            Ver estado de cuenta →
          </a>
          <p style="margin:12px 0 0;font-size:13px;color:#94A3B8">O abre la app para revisar el detalle.</p>
        </div>
      </td></tr>

      <!-- Footer navy -->
      <tr><td style="background:#0E2A52;padding:24px 40px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="text-align:center;padding-bottom:16px">
              <p style="margin:0;font-size:16px;font-weight:800;color:#ffffff">
                <span style="color:#FFC23C">✦</span> Bolsillo Mágico
              </p>
            </td>
          </tr>
          <tr>
            <td style="text-align:center;padding-bottom:14px">
              <a href="${siteUrl}" style="color:rgba(255,255,255,0.6);text-decoration:none;font-size:13px;margin:0 10px">Abrir app</a>
              <span style="color:rgba(255,255,255,0.2)">·</span>
              <a href="${siteUrl}/ajustes" style="color:rgba(255,255,255,0.6);text-decoration:none;font-size:13px;margin:0 10px">Ajustes de correo</a>
            </td>
          </tr>
          <tr>
            <td style="text-align:center;border-top:1px solid rgba(255,255,255,0.1);padding-top:14px">
              <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.35);line-height:1.7">
                Recibes este correo porque tienes activos los recordatorios de cierre.<br>
                <a href="${siteUrl}/ajustes" style="color:rgba(255,255,255,0.35);text-decoration:underline">Cancelar suscripción</a>
              </p>
            </td>
          </tr>
        </table>
      </td></tr>

    </table>
  </td></tr>
</table>

</body>
</html>`
}
