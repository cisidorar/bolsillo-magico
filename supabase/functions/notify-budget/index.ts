/**
 * notify-budget — Edge Function
 *
 * Corre diariamente (pg_cron). Detecta usuarios que superaron el 80% o el 100%
 * de su presupuesto mensual y les envía una alerta por email.
 * Usa idempotencia: no envía la misma alerta dos veces en el mismo mes.
 *
 * Requiere variables de entorno:
 *   RESEND_API_KEY
 *   SITE_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SITE_URL       = Deno.env.get('SITE_URL') ?? 'https://gstos.app'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  const now   = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()
  const monthStr = `${year}-${String(month).padStart(2, '0')}`

  // Obtener presupuestos del mes actual
  const { data: budgets, error: bErr } = await supabase
    .from('budgets')
    .select('user_id, amount')
    .eq('month', month)
    .eq('year', year)

  if (bErr) return new Response(JSON.stringify({ error: bErr.message }), { status: 500 })
  if (!budgets || budgets.length === 0) return new Response('No budgets found', { status: 200 })

  const userIds = budgets.map(b => b.user_id)

  // Total gastado este mes por cada usuario
  const { data: expenses } = await supabase
    .from('expenses')
    .select('user_id, amount')
    .in('user_id', userIds)
    .gte('date', `${monthStr}-01`)
    .lte('date', now.toISOString().slice(0, 10))

  const totalByUser = new Map<string, number>()
  for (const e of expenses ?? []) {
    totalByUser.set(e.user_id, (totalByUser.get(e.user_id) ?? 0) + e.amount)
  }

  // Perfiles con notify_budget = true
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, notify_budget')
    .in('id', userIds)
    .eq('notify_budget', true)

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))

  // Emails
  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const emailMap = new Map((authUsers?.users ?? []).map(u => [u.id, u.email]))

  let sent = 0; let skipped = 0

  for (const budget of budgets) {
    const profile = profileMap.get(budget.user_id)
    if (!profile) { skipped++; continue }

    const email = emailMap.get(budget.user_id)
    if (!email) { skipped++; continue }

    const total   = totalByUser.get(budget.user_id) ?? 0
    const pct     = Math.round((total / budget.amount) * 100)
    const fmtCLP  = (n: number) => '$' + n.toLocaleString('es-CL', { maximumFractionDigits: 0 })

    // Determinar el nivel de alerta
    let alertType: 'budget_80' | 'budget_100' | null = null
    if (pct >= 100) alertType = 'budget_100'
    else if (pct >= 80) alertType = 'budget_80'

    if (!alertType) { skipped++; continue }

    // Idempotencia por mes (una alerta de cada tipo por mes)
    const refKey = `${monthStr}:${alertType}:${budget.user_id}`
    const { error: logErr } = await supabase
      .from('notification_log')
      .insert({ user_id: budget.user_id, type: alertType, ref_key: refKey })
      .select()
      .single()

    if (logErr) { skipped++; continue }   // ya enviado este mes

    const displayName = profile.display_name ?? 'Usuario'
    const remaining   = budget.amount - total

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Gstos <noreply@gstos.app>',
        to: email,
        subject: alertType === 'budget_100'
          ? '🚨 Superaste tu presupuesto mensual'
          : '⚠️ Llevas el 80% de tu presupuesto',
        html: budgetEmailHtml({
          displayName,
          alertType,
          total,
          budgetAmount: budget.amount,
          pct,
          remaining,
          fmtCLP,
          siteUrl: SITE_URL,
          month,
          year,
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

function budgetEmailHtml({
  displayName,
  alertType,
  total,
  budgetAmount,
  pct,
  remaining,
  fmtCLP,
  siteUrl,
  month,
  year,
}: {
  displayName: string
  alertType: 'budget_80' | 'budget_100'
  total: number
  budgetAmount: number
  pct: number
  remaining: number
  fmtCLP: (n: number) => string
  siteUrl: string
  month: number
  year: number
}) {
  const isOver    = alertType === 'budget_100'
  const accentClr = isOver ? '#EF4444' : '#F59E0B'
  const barPct    = Math.min(100, pct)
  const monthName = new Date(year, month - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
  const title     = isOver ? '¡Superaste tu presupuesto!' : 'Llevas el 80% de tu presupuesto'
  const subtitle  = isOver
    ? `Ya gastaste <strong style="color:${accentClr}">${fmtCLP(Math.abs(remaining))}</strong> más de lo que planeabas este mes.`
    : `Te quedan <strong style="color:#1B6DD4">${fmtCLP(remaining)}</strong> para lo que resta del mes.`

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#EEF4FF;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EEF4FF;padding:32px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:24px;border:1.5px solid #D5E6FF;box-shadow:0 4px 20px rgba(27,109,212,0.09);overflow:hidden;max-width:100%">

        <!-- Header -->
        <tr><td style="background:#1B6DD4;padding:28px 32px">
          <p style="margin:0;font-size:22px;font-weight:800;color:#fff">Gstos</p>
          <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.7)">Alerta de presupuesto · ${monthName}</p>
        </td></tr>

        <!-- Cuerpo -->
        <tr><td style="padding:28px 32px">
          <p style="margin:0 0 4px;font-size:15px;color:#6b7280">Hola, <strong style="color:#0A1F44">${displayName}</strong></p>

          <div style="background:${isOver ? '#FEF2F2' : '#FFFBEB'};border:1.5px solid ${isOver ? '#FECACA' : '#FDE68A'};border-radius:16px;padding:20px 24px;margin:20px 0">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:${accentClr};text-transform:uppercase;letter-spacing:0.5px">${title}</p>
            <p style="margin:8px 0 0;font-size:14px;color:#374151;line-height:1.6">${subtitle}</p>
          </div>

          <!-- Barra de progreso -->
          <div style="margin:20px 0">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:12px;color:#6b7280">Gastado: <strong style="color:#0A1F44">${fmtCLP(total)}</strong></span>
              <span style="font-size:12px;color:#6b7280">Presupuesto: <strong style="color:#0A1F44">${fmtCLP(budgetAmount)}</strong></span>
            </div>
            <div style="background:#EEF4FF;border-radius:8px;height:10px;overflow:hidden">
              <div style="background:${accentClr};width:${barPct}%;height:100%;border-radius:8px"></div>
            </div>
            <p style="margin:6px 0 0;font-size:12px;color:${accentClr};font-weight:700;text-align:right">${pct}% utilizado</p>
          </div>

          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6">
            ${isOver ? 'Considera revisar tus gastos para entender dónde se fue el dinero.' : 'Todavía estás a tiempo de ajustar tus gastos antes de fin de mes.'}
          </p>

          <a href="${siteUrl}/analisis" style="display:inline-block;background:#1B6DD4;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:12px">
            Ver análisis →
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px 24px;border-top:1.5px solid #EEF4FF">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6">
            Recibiste este email porque tienes activadas las alertas de presupuesto en Gstos.<br>
            <a href="${siteUrl}/ajustes" style="color:#1B6DD4;text-decoration:none">Cambiar preferencias de notificaciones</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
