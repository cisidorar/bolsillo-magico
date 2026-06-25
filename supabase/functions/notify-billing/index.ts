/**
 * notify-billing — Edge Function
 *
 * Corre diariamente (pg_cron). Detecta usuarios que tienen un método de pago
 * de crédito con billing_day = mañana o pasado mañana, y les envía un email
 * recordándoles el próximo cierre de tarjeta.
 *
 * Requiere variables de entorno en Supabase:
 *   RESEND_API_KEY   — API key de Resend (resend.com)
 *   SITE_URL         — URL pública de la app, ej. https://gstos.app
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

  // Obtener todos los métodos de crédito cuyo billing_day cierra en 1 o 2 días
  const { data: methods, error: mErr } = await supabase
    .from('payment_methods')
    .select('id, name, billing_day, user_id')
    .eq('card_type', 'credit')
    .in('billing_day', targetDays)

  if (mErr) return new Response(JSON.stringify({ error: mErr.message }), { status: 500 })
  if (!methods || methods.length === 0) return new Response('No billing reminders today', { status: 200 })

  // Para cada método, buscar perfil + email del usuario (con notify_billing = true)
  const userIds = [...new Set(methods.map(m => m.user_id))]

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, notify_billing')
    .in('id', userIds)
    .eq('notify_billing', true)

  const { data: authUsers } = await supabase.auth.admin.listUsers()

  const emailMap = new Map(
    (authUsers?.users ?? []).map(u => [u.id, u.email])
  )
  const profileMap = new Map(
    (profiles ?? []).map(p => [p.id, p])
  )

  let sent = 0
  let skipped = 0

  for (const method of methods) {
    const profile = profileMap.get(method.user_id)
    if (!profile) { skipped++; continue }   // notify_billing = false

    const email = emailMap.get(method.user_id)
    if (!email) { skipped++; continue }

    const daysUntil = method.billing_day === tomorrow.getDate() ? 1 : 2
    const refKey    = `${now.toISOString().slice(0, 10)}:billing:${method.id}`

    // Idempotencia: no enviar si ya se envió hoy
    const { error: logErr } = await supabase
      .from('notification_log')
      .insert({ user_id: method.user_id, type: 'billing', ref_key: refKey })
      .select()
      .single()

    if (logErr) { skipped++; continue }   // ya existe (duplicate key)

    // Obtener el total del período actual para este método
    const billingDay = method.billing_day
    const year  = now.getFullYear()
    const month = now.getMonth() + 1

    // Calcular inicio del período
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
    const fmtCLP = (n: number) =>
      '$' + n.toLocaleString('es-CL', { maximumFractionDigits: 0 })

    const closeDate = new Date(year, month - 1, billingDay)
    const closeDateLabel = closeDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })
    const displayName = profile.display_name ?? 'Usuario'

    // Enviar email con Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: email,
        subject: `Tu tarjeta ${method.name} cierra ${daysUntil === 1 ? 'mañana' : 'en 2 días'}`,
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
    else {
      const body = await res.text()
      console.error(`Resend error for ${email}:`, body)
    }
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
  const urgency = daysUntil === 1
    ? '⚠️ Tu tarjeta cierra <strong>mañana</strong>'
    : 'Tu tarjeta cierra en <strong>2 días</strong>'

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#EEF4FF;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EEF4FF;padding:32px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:24px;border:1.5px solid #D5E6FF;box-shadow:0 4px 20px rgba(27,109,212,0.09);overflow:hidden;max-width:100%">

        <!-- Header azul -->
        <tr><td style="background:#1B6DD4;padding:28px 32px">
          <p style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.3px">Gstos</p>
          <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.7)">Recordatorio de cierre</p>
        </td></tr>

        <!-- Cuerpo -->
        <tr><td style="padding:28px 32px">
          <p style="margin:0 0 4px;font-size:15px;color:#6b7280">Hola, <strong style="color:#0A1F44">${displayName}</strong></p>
          <p style="margin:16px 0;font-size:15px;color:#374151;line-height:1.6">
            ${urgency} — <strong style="color:#0A1F44">${cardName}</strong> cierra el ${closeDateLabel}.
          </p>

          <!-- Card de total -->
          <div style="background:#EEF4FF;border:1.5px solid #D5E6FF;border-radius:16px;padding:20px 24px;margin:20px 0;text-align:center">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Gastado en este período</p>
            <p style="margin:0;font-size:32px;font-weight:800;color:#1B6DD4;letter-spacing:-1px">${fmtCLP(total)}</p>
          </div>

          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6">
            Recuerda verificar tus gastos para evitar sorpresas en tu estado de cuenta.
          </p>

          <a href="${siteUrl}/historial?view=billing" style="display:inline-block;background:#1B6DD4;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:12px">
            Ver estado de cuenta →
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px 24px;border-top:1.5px solid #EEF4FF">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6">
            Recibiste este email porque tienes activados los recordatorios de cierre en Gstos.<br>
            <a href="${siteUrl}/ajustes" style="color:#1B6DD4;text-decoration:none">Cambiar preferencias de notificaciones</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
