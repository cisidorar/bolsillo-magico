/**
 * notify-budget — Edge Function
 *
 * Corre diariamente (pg_cron). Detecta usuarios que superaron el 80% o el 100%
 * de su presupuesto mensual y les envía una alerta por email.
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
  const month    = now.getMonth() + 1
  const year     = now.getFullYear()
  const monthStr = `${year}-${String(month).padStart(2, '0')}`

  const { data: budgets, error: bErr } = await supabase
    .from('budgets')
    .select('user_id, amount')
    .eq('month', month)
    .eq('year', year)

  if (bErr) return new Response(JSON.stringify({ error: bErr.message }), { status: 500 })
  if (!budgets || budgets.length === 0) return new Response('No budgets found', { status: 200 })

  const userIds = budgets.map(b => b.user_id)

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

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, notify_budget')
    .in('id', userIds)
    .eq('notify_budget', true)

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))

  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const emailMap = new Map((authUsers?.users ?? []).map(u => [u.id, u.email]))

  let sent = 0; let skipped = 0

  for (const budget of budgets) {
    const profile = profileMap.get(budget.user_id)
    if (!profile) { skipped++; continue }

    const email = emailMap.get(budget.user_id)
    if (!email) { skipped++; continue }

    const total  = totalByUser.get(budget.user_id) ?? 0
    const pct    = Math.round((total / budget.amount) * 100)
    const fmtCLP = (n: number) => '$' + n.toLocaleString('es-CL', { maximumFractionDigits: 0 })

    let alertType: 'budget_80' | 'budget_100' | null = null
    if (pct >= 100)     alertType = 'budget_100'
    else if (pct >= 80) alertType = 'budget_80'

    if (!alertType) { skipped++; continue }

    const refKey = `${monthStr}:${alertType}:${budget.user_id}`
    const { error: logErr } = await supabase
      .from('notification_log')
      .insert({ user_id: budget.user_id, type: alertType, ref_key: refKey })
      .select().single()

    if (logErr) { skipped++; continue }

    const displayName = profile.display_name ?? 'Usuario'
    const remaining   = budget.amount - total
    const monthName   = new Date(year, month - 1, 1)
      .toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
    const monthCap    = monthName.charAt(0).toUpperCase() + monthName.slice(1)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: email,
        subject: alertType === 'budget_100'
          ? `🚨 Superaste tu presupuesto de ${monthCap}`
          : `⚠️ Llevas el 80% de tu presupuesto de ${monthCap}`,
        html: budgetEmailHtml({
          displayName,
          alertType,
          total,
          budgetAmount: budget.amount,
          pct,
          remaining,
          fmtCLP,
          siteUrl: SITE_URL,
          monthLabel: monthCap,
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
  monthLabel,
}: {
  displayName: string
  alertType: 'budget_80' | 'budget_100'
  total: number
  budgetAmount: number
  pct: number
  remaining: number
  fmtCLP: (n: number) => string
  siteUrl: string
  monthLabel: string
}) {
  const isOver     = alertType === 'budget_100'
  const barPct     = Math.min(100, pct)
  const accentClr  = isOver ? '#FF6F61' : '#FFC23C'
  const accentBg   = isOver ? '#FFF5F5' : '#FFF8EC'
  const accentBdr  = isOver ? '#FECACA' : '#FFE4A0'
  const icon       = isOver ? '🚨' : '⚠️'
  const title      = isOver ? '¡Superaste tu presupuesto!' : 'Llevas el 80% de tu presupuesto'
  const subtitle   = isOver
    ? `Ya gastaste <strong style="color:#FF6F61">${fmtCLP(Math.abs(remaining))}</strong> más de lo que planeabas.`
    : `Te quedan <strong style="color:#2B7CF6">${fmtCLP(remaining)}</strong> para lo que resta del mes.`
  const advice = isOver
    ? 'Revisa tus categorías para entender dónde se fue el dinero y ajustar el próximo mes.'
    : 'Todavía estás a tiempo de ajustar tus gastos antes de fin de mes.'

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Alerta de presupuesto · Bolsillo Mágico</title>
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
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#2B7CF6;text-transform:uppercase;letter-spacing:2px">Alerta de presupuesto</p>
              <p style="margin:0;font-size:24px;font-weight:800;color:#0E2A52;letter-spacing:-0.3px">${monthLabel}</p>
            </td>
            <td style="text-align:right;font-size:14px;color:#FFC23C;vertical-align:top">✦</td>
          </tr>
        </table>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:28px 40px">
        <p style="margin:0 0 20px;font-size:20px;font-weight:700;color:#0E2A52">Hola, ${displayName} 👋</p>

        <!-- Alert box -->
        <div style="background:${accentBg};border:1.5px solid ${accentBdr};border-radius:16px;padding:20px 24px;margin-bottom:24px">
          <table cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="width:36px;font-size:24px;vertical-align:top">${icon}</td>
              <td style="padding-left:12px;vertical-align:top">
                <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#0E2A52">${title}</p>
                <p style="margin:0;font-size:14px;color:#5B6B82;line-height:1.6">${subtitle}</p>
              </td>
            </tr>
          </table>
        </div>

        <!-- Hero card: gastado vs presupuesto -->
        <div style="background:#2B7CF6;border-radius:20px;padding:24px 28px;margin-bottom:24px">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="text-align:center;border-right:1px solid rgba(255,255,255,0.2);padding-right:20px">
                <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px">Gastado</p>
                <p style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">${fmtCLP(total)}</p>
              </td>
              <td style="text-align:center;padding-left:20px">
                <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px">Presupuesto</p>
                <p style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">${fmtCLP(budgetAmount)}</p>
              </td>
            </tr>
          </table>
          <!-- Barra de progreso -->
          <div style="margin-top:18px">
            <div style="background:rgba(255,255,255,0.2);border-radius:8px;height:10px;overflow:hidden">
              <div style="background:${isOver ? '#FF6F61' : '#FFC23C'};width:${barPct}%;height:100%;border-radius:8px"></div>
            </div>
            <p style="margin:8px 0 0;font-size:12px;font-weight:700;color:rgba(255,255,255,0.85);text-align:right">${pct}% utilizado</p>
          </div>
        </div>

        <!-- Advice -->
        <p style="margin:0 0 28px;font-size:14px;color:#5B6B82;line-height:1.6">${advice}</p>

        <!-- CTA -->
        <div style="text-align:center">
          <a href="${siteUrl}/analisis"
            style="display:inline-block;background:#2B7CF6;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:14px;letter-spacing:-0.2px">
            Ver análisis →
          </a>
          <p style="margin:12px 0 0;font-size:13px;color:#94A3B8">O abre la app y revisa tus categorías.</p>
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
                Recibes este correo porque tienes activas las alertas de presupuesto.<br>
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
