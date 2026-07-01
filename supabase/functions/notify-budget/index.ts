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
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req: Request) => {
  const url  = new URL(req.url)
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* no body */ }
  const force = url.searchParams.get('force') === 'true' || body?.force === true

  const now      = new Date()
  const month    = now.getMonth() + 1
  const year     = now.getFullYear()
  const monthStr = `${year}-${String(month).padStart(2, '0')}`

  // MODO TEST: enviar correo de muestra sin DB
  if (force) {
    const testEmail = (body?.email as string) ?? null
    if (!testEmail) return new Response('Pasa tu email: {"force":true,"email":"tu@email.com"}', { status: 400 })
    const fmtCLP = (n: number) => '$' + n.toLocaleString('es-CL', { maximumFractionDigits: 0 })
    const monthName = new Date(year, month - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
    const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1)
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: testEmail,
        subject: `Llevas el 80% de tu presupuesto de ${monthLabel} · Bolsillo Mágico`,
        html: budgetEmailHtml({ displayName: 'Cas', alertType: 'budget_80', total: 850_000, budgetAmount: 1_000_000, pct: 85, remaining: 150_000, fmtCLP, siteUrl: SITE_URL, monthLabel }),
      }),
    })
    return new Response(JSON.stringify({ test: true, ok: res.ok }), { headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data: budgetData, error: bErr } = await supabase
    .from('budgets')
    .select('user_id, amount')
    .eq('month', month)
    .eq('year', year)
  if (bErr) return new Response(JSON.stringify({ error: bErr.message }), { status: 500 })
  if (!budgetData || budgetData.length === 0) return new Response('No budgets found', { status: 200 })
  const budgets = budgetData

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
          ? `Superaste tu presupuesto de ${monthCap} · Bolsillo Mágico`
          : `Llevas el 80% de tu presupuesto de ${monthCap} · Bolsillo Mágico`,
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

// ── Logo / Wordmark ──────────────────────────────────────────────────────────

function brandWordmark(siteUrl: string) {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto">
    <tr>
      <td style="vertical-align:middle;padding-right:8px">
        <img src="${siteUrl}/logo-icon.png" width="32" height="32" alt="Bolsillo Mágico" style="width:32px;height:32px;border-radius:8px;display:block">
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
  const isOver      = alertType === 'budget_100'
  const barPct      = Math.min(100, pct)
  // Urgente = coral, Recordatorio = ámbar
  const accent      = isOver ? '#EF5B52' : '#F59E0B'
  const accentBg    = isOver ? '#FFF4F3' : '#FFF8E8'
  const accentBdr   = isOver ? '#FAD3CF' : '#FBE6B5'
  const barColor    = isOver ? '#EF5B52' : '#F59E0B'
  const title       = isOver ? 'Superaste tu presupuesto' : 'Llevas el 80% de tu presupuesto'
  const subtitle    = isOver
    ? `Ya gastaste <strong style="color:${accent}">${fmtCLP(Math.abs(remaining))}</strong> más de lo que planeabas.`
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
            ${isOver ? '⚠️' : '🔔'}
          </td></tr>
        </table>
        <p style="margin:0;font-family:Fredoka,system-ui,sans-serif;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:0.2px">
          ${title}
        </p>
        <p style="margin:8px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:500;color:rgba(255,255,255,0.8)">
          ${monthLabel}
        </p>
      </td></tr>

      <!-- CUERPO -->
      <tr><td style="padding:32px 40px 28px">

        <p style="margin:0 0 8px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:20px;font-weight:700;color:#0E2A52">
          Hola, ${displayName}
        </p>
        <p style="margin:0 0 28px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:500;color:#5B6B82;line-height:1.6">
          ${subtitle}
          ${advice}
        </p>

        <!-- BLOQUE DESTACADO azul — cifras principales -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="background:#2B7CF6;border-radius:20px;margin-bottom:24px">
          <tr>
            <td width="50%" style="padding:24px 24px 20px;text-align:center;border-right:1px solid rgba(255,255,255,0.18)">
              <p style="margin:0 0 4px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:700;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1.5px">Gastado</p>
              <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;font-variant-numeric:tabular-nums">
                ${fmtCLP(total)}
              </p>
            </td>
            <td width="50%" style="padding:24px 24px 20px;text-align:center">
              <p style="margin:0 0 4px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:700;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1.5px">Presupuesto</p>
              <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;font-variant-numeric:tabular-nums">
                ${fmtCLP(budgetAmount)}
              </p>
            </td>
          </tr>
          <tr><td colspan="2" style="padding:0 24px 20px">
            <div style="background:rgba(255,255,255,0.2);border-radius:6px;height:8px;overflow:hidden">
              <div style="background:${barColor};width:${barPct}%;height:100%;border-radius:6px"></div>
            </div>
            <p style="margin:6px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:700;color:rgba(255,255,255,0.8);text-align:right">
              ${pct}% utilizado
            </p>
          </td></tr>
        </table>

        <!-- Tarjeta de estado (tinte semántico) -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="background:${accentBg};border:1.5px solid ${accentBdr};border-radius:16px;margin-bottom:28px">
          <tr><td style="padding:18px 20px">
            <table cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="width:30px;vertical-align:top;padding-top:2px;font-size:18px;line-height:1">${isOver ? '⚠️' : '💡'}</td>
                <td style="padding-left:12px;vertical-align:top;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:500;color:#5B6B82;line-height:1.6">
                  ${isOver
                    ? 'No te preocupes, aún puedes entender qué pasó y planificar mejor el próximo mes.'
                    : 'Todavía estás a tiempo de ajustar tus gastos antes de fin de mes.'}
                </td>
              </tr>
            </table>
          </td></tr>
        </table>

        <!-- CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="text-align:center">
            <a href="${siteUrl}/analisis"
              style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:700;padding:14px 32px;border-radius:12px;letter-spacing:0.1px">
              Ver análisis de gastos
            </a>
            <p style="margin:12px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;color:#94A3B8">
              O abre la app y revisa tus categorías.
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
              Recibes este correo porque tienes activas las alertas de presupuesto.<br>
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
