/**
 * notify-monthly-summary — Edge Function
 *
 * Corre diariamente (pg_cron). Solo actúa si hoy es el último día del mes.
 * Envía un resumen completo del mes: total, vs anterior, top categorías,
 * recurrentes y promedio diario.
 *
 * Requiere: RESEND_API_KEY, SITE_URL, DB_SERVICE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SITE_URL       = Deno.env.get('SITE_URL') ?? 'https://bolsillomagico.com'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('DB_SERVICE_KEY')!

Deno.serve(async () => {
  const now      = new Date()
  const year     = now.getFullYear()
  const month    = now.getMonth() + 1
  const lastDay  = new Date(year, month, 0).getDate()
  const isLastDay = now.getDate() === lastDay

  // Solo actuar si es el último día del mes
  // (para pruebas manuales se puede pasar ?force=1 en la URL)
  const url    = new URL(Deno.env.get('SUPABASE_FUNCTION_URL') ?? 'http://localhost')
  const force  = false // cambiar a true solo para probar
  if (!isLastDay && !force) {
    return new Response(`Not the last day of the month (day ${now.getDate()}/${lastDay})`, { status: 200 })
  }

  const supabase   = createClient(SUPABASE_URL, SERVICE_KEY)
  const monthStr   = `${year}-${String(month).padStart(2, '0')}`
  const monthStart = `${monthStr}-01`
  const monthEnd   = `${monthStr}-${String(lastDay).padStart(2, '0')}`

  // Mes anterior
  const prevMonth  = month === 1 ? 12 : month - 1
  const prevYear   = month === 1 ? year - 1 : year
  const prevStr    = `${prevYear}-${String(prevMonth).padStart(2, '0')}`
  const prevLastDay = new Date(prevYear, prevMonth, 0).getDate()
  const prevStart  = `${prevStr}-01`
  const prevEnd    = `${prevStr}-${String(prevLastDay).padStart(2, '0')}`

  // Usuarios con notify_monthly = true
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, notify_monthly')
    .eq('notify_monthly', true)

  if (!profiles || profiles.length === 0) {
    return new Response('No users with monthly notifications', { status: 200 })
  }

  const userIds = profiles.map(p => p.id)
  const profileMap = new Map(profiles.map(p => [p.id, p]))

  // Emails
  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const emailMap = new Map((authUsers?.users ?? []).map(u => [u.id, u.email]))

  // Gastos del mes actual por usuario
  const { data: currentExpenses } = await supabase
    .from('expenses')
    .select('user_id, amount, category_id, recurring_expense_id')
    .in('user_id', userIds)
    .gte('date', monthStart)
    .lte('date', monthEnd)

  // Gastos del mes anterior por usuario
  const { data: prevExpenses } = await supabase
    .from('expenses')
    .select('user_id, amount')
    .in('user_id', userIds)
    .gte('date', prevStart)
    .lte('date', prevEnd)

  // Categorías
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, color, bg_color')
    .in('user_id', userIds)

  const catMap = new Map((categories ?? []).map(c => [c.id, c]))

  let sent = 0; let skipped = 0

  for (const profile of profiles) {
    const email = emailMap.get(profile.id)
    if (!email) { skipped++; continue }

    // Idempotencia: una por mes
    const refKey = `${monthStr}:monthly:${profile.id}`
    const { error: logErr } = await supabase
      .from('notification_log')
      .insert({ user_id: profile.id, type: 'monthly', ref_key: refKey })
      .select().single()
    if (logErr) { skipped++; continue }

    // Calcular datos del usuario
    const userCurrent = (currentExpenses ?? []).filter(e => e.user_id === profile.id)
    const userPrev    = (prevExpenses ?? []).filter(e => e.user_id === profile.id)

    const totalCurrent   = userCurrent.reduce((s, e) => s + e.amount, 0)
    const totalPrev      = userPrev.reduce((s, e) => s + e.amount, 0)
    const totalRecurring = userCurrent
      .filter(e => e.recurring_expense_id)
      .reduce((s, e) => s + e.amount, 0)
    const txCount        = userCurrent.length
    const dailyAvg       = txCount > 0 ? Math.round(totalCurrent / lastDay) : 0

    // Delta vs mes anterior
    const delta    = totalPrev > 0 ? Math.round(((totalCurrent - totalPrev) / totalPrev) * 100) : null
    const deltaAbs = totalCurrent - totalPrev

    // Top 5 categorías
    const catTotals = new Map<string, number>()
    for (const e of userCurrent) {
      if (e.category_id) {
        catTotals.set(e.category_id, (catTotals.get(e.category_id) ?? 0) + e.amount)
      }
    }
    const topCats = [...catTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, total]) => ({ cat: catMap.get(id), total }))
      .filter(x => x.cat)

    const fmtCLP = (n: number) => '$' + Math.abs(n).toLocaleString('es-CL', { maximumFractionDigits: 0 })
    const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: email,
        subject: `Tu resumen de ${monthLabel}`,
        html: monthlyEmailHtml({
          displayName: profile.display_name ?? 'Usuario',
          monthLabel,
          totalCurrent,
          totalPrev,
          delta,
          deltaAbs,
          totalRecurring,
          txCount,
          dailyAvg,
          topCats,
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

function monthlyEmailHtml({
  displayName,
  monthLabel,
  totalCurrent,
  totalPrev,
  delta,
  deltaAbs,
  totalRecurring,
  txCount,
  dailyAvg,
  topCats,
  fmtCLP,
  siteUrl,
}: {
  displayName: string
  monthLabel: string
  totalCurrent: number
  totalPrev: number
  delta: number | null
  deltaAbs: number
  totalRecurring: number
  txCount: number
  dailyAvg: number
  topCats: { cat: { name: string; color: string; bg_color: string } | undefined; total: number }[]
  fmtCLP: (n: number) => string
  siteUrl: string
}) {
  const maxCat    = topCats[0]?.total ?? 1
  const isUp      = delta !== null && deltaAbs > 0
  const deltaClr  = isUp ? '#EF4444' : '#10B981'
  const deltaSign = isUp ? '↑' : '↓'
  const recurringPct = totalCurrent > 0 ? Math.round((totalRecurring / totalCurrent) * 100) : 0

  const catRows = topCats.map(({ cat, total }) => {
    const barPct = Math.round((total / maxCat) * 100)
    return `
      <tr>
        <td style="padding:8px 0;vertical-align:middle">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:10px;height:10px;border-radius:50%;background:${cat!.color};flex-shrink:0"></div>
            <span style="font-size:13px;color:#374151;flex:1">${cat!.name}</span>
            <span style="font-size:13px;font-weight:700;color:#0A1F44;white-space:nowrap">${fmtCLP(total)}</span>
          </div>
          <div style="margin-top:5px;background:#EEF4FF;border-radius:6px;height:6px;overflow:hidden">
            <div style="background:${cat!.color};width:${barPct}%;height:100%;border-radius:6px"></div>
          </div>
        </td>
      </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#EEF4FF;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EEF4FF;padding:32px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:24px;border:1.5px solid #D5E6FF;box-shadow:0 4px 20px rgba(27,109,212,0.09);overflow:hidden;max-width:100%">

        <!-- Header azul -->
        <tr><td style="background:#1B6DD4;padding:28px 32px 32px">
          <p style="margin:0;font-size:22px;font-weight:800;color:#fff">Bolsillo Mágico</p>
          <p style="margin:6px 0 20px;font-size:14px;color:rgba(255,255,255,0.65)">Resumen de ${monthLabel}</p>

          <!-- Total grande -->
          <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:1px">Total gastado</p>
          <p style="margin:0;font-size:40px;font-weight:800;color:#fff;letter-spacing:-1px;line-height:1">${fmtCLP(totalCurrent)}</p>

          <!-- Delta vs anterior -->
          ${delta !== null ? `
          <div style="margin-top:12px;display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.15);border-radius:12px;padding:6px 12px">
            <span style="font-size:12px;font-weight:700;color:${isUp ? '#fca5a5' : '#6ee7b7'}">${deltaSign} ${Math.abs(delta)}% ${isUp ? 'más' : 'menos'} que el mes anterior</span>
            <span style="font-size:11px;color:rgba(255,255,255,0.45)">(${isUp ? '+' : '–'}${fmtCLP(deltaAbs)})</span>
          </div>` : ''}
        </td></tr>

        <!-- KPIs -->
        <tr><td style="padding:0">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1.5px solid #EEF4FF">
            <tr>
              <td style="padding:18px 24px;border-right:1.5px solid #EEF4FF;text-align:center">
                <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Transacciones</p>
                <p style="margin:0;font-size:22px;font-weight:800;color:#0A1F44">${txCount}</p>
              </td>
              <td style="padding:18px 24px;border-right:1.5px solid #EEF4FF;text-align:center">
                <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Promedio diario</p>
                <p style="margin:0;font-size:22px;font-weight:800;color:#0A1F44">${fmtCLP(dailyAvg)}</p>
              </td>
              <td style="padding:18px 24px;text-align:center">
                <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Recurrentes</p>
                <p style="margin:0;font-size:22px;font-weight:800;color:#0A1F44">${recurringPct}%</p>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Top categorías -->
        ${topCats.length > 0 ? `
        <tr><td style="padding:24px 32px">
          <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Top categorías</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${catRows}
          </table>
        </td></tr>` : ''}

        <!-- CTA -->
        <tr><td style="padding:0 32px 28px">
          <a href="${siteUrl}/analisis" style="display:inline-block;background:#1B6DD4;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 28px;border-radius:12px">
            Ver análisis completo →
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px 24px;border-top:1.5px solid #EEF4FF">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6">
            Recibiste este resumen porque tienes activado el resumen mensual en Bolsillo Mágico.<br>
            <a href="${siteUrl}/ajustes" style="color:#1B6DD4;text-decoration:none">Cambiar preferencias de notificaciones</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
