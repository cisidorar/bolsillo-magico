/**
 * notify-recurring-reminder — Edge Function
 *
 * Recibe ?type=due   → Envía recordatorio de gastos recurrentes que vencen HOY y no están registrados.
 * Recibe ?type=overdue → Envía aviso de gastos que vencieron AYER y siguen sin registrarse.
 *
 * Corre diariamente vía pg_cron (dos schedules, uno por tipo).
 * Requiere: RESEND_API_KEY, SITE_URL, DB_SERVICE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SITE_URL       = Deno.env.get('SITE_URL') ?? 'https://bolsillomagico.com'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('DB_SERVICE_KEY')!

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCLP(n: number) {
  return '$' + Math.abs(n).toLocaleString('es-CL', { maximumFractionDigits: 0 })
}

function todayInCL(): Date {
  // Hora actual en Santiago (UTC-3 / UTC-4 en verano; usamos UTC-4 como aproximación segura)
  const utc = new Date()
  return new Date(utc.toLocaleString('en-US', { timeZone: 'America/Santiago' }))
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const url    = new URL(req.url)
  const type   = url.searchParams.get('type') ?? 'due'   // 'due' | 'overdue'

  if (type !== 'due' && type !== 'overdue') {
    return new Response('Invalid type. Use ?type=due or ?type=overdue', { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  const cl       = todayInCL()
  const year     = cl.getFullYear()
  const month    = cl.getMonth() + 1                     // 1-12
  const today    = cl.getDate()
  const monthStr = `${year}-${String(month).padStart(2, '0')}`
  const monthStart = `${monthStr}-01`

  // Para 'due': día de hoy. Para 'overdue': día de ayer.
  const targetDay = type === 'due' ? today : today - 1
  const targetDate = type === 'due'
    ? `${monthStr}-${String(today).padStart(2, '0')}`
    : `${monthStr}-${String(today - 1).padStart(2, '0')}`

  // Para 'overdue': si ayer fue el día 0 (inicio de mes), no hay overdue del mes anterior
  if (type === 'overdue' && today === 1) {
    return new Response('First day of month — no overdue from previous day', { status: 200 })
  }

  // 1. Usuarios con notify_recurring = true
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, notify_recurring')
    .eq('notify_recurring', true)

  if (!profiles || profiles.length === 0) {
    return new Response('No users with recurring notifications', { status: 200 })
  }

  const userIds = profiles.map((p: { id: string }) => p.id)

  // 2. Emails
  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const emailMap = new Map((authUsers?.users ?? []).map((u: { id: string; email?: string }) => [u.id, u.email]))
  const profileMap = new Map(profiles.map((p: { id: string; display_name: string | null }) => [p.id, p]))

  // 3. Gastos recurrentes manuales que vencen el día target
  const { data: allRecurring, error: rErr } = await supabase
    .from('recurring_expenses')
    .select(`
      id, user_id, name, amount, billing_day, billing_month,
      category:categories(name, color, bg_color, icon)
    `)
    .in('user_id', userIds)
    .eq('billing_day', targetDay)
    .eq('auto_register', false)
    .eq('is_active', true)

  if (rErr) return new Response(JSON.stringify({ error: rErr.message }), { status: 500 })
  if (!allRecurring || allRecurring.length === 0) {
    return new Response(`No recurring expenses on day ${targetDay}`, { status: 200 })
  }

  // Filtrar anuales: solo los que corresponden a este mes (billing_month = month o null para mensuales)
  const recurring = allRecurring.filter((r: { billing_month: number | null }) =>
    r.billing_month === null || r.billing_month === month
  )

  if (!recurring.length) {
    return new Response('No matching recurring expenses after month filter', { status: 200 })
  }

  // 4. Gastos ya registrados este mes para cada recurrente
  const recurringIds = recurring.map((r: { id: string }) => r.id)

  const { data: registered } = await supabase
    .from('expenses')
    .select('recurring_expense_id')
    .in('recurring_expense_id', recurringIds)
    .gte('date', monthStart)
    .lte('date', `${monthStr}-${String(today).padStart(2, '0')}`)  // hasta hoy inclusive

  const registeredSet = new Set(
    (registered ?? []).map((e: { recurring_expense_id: string }) => e.recurring_expense_id)
  )

  // 5. Agrupar pendientes por usuario
  const pendingByUser = new Map<string, typeof recurring>()
  for (const r of recurring) {
    if (registeredSet.has(r.id)) continue   // ya registrado — skip
    const list = pendingByUser.get(r.user_id) ?? []
    list.push(r)
    pendingByUser.set(r.user_id, list)
  }

  if (pendingByUser.size === 0) {
    return new Response('All recurring expenses already registered', { status: 200 })
  }

  // 6. Enviar un email por usuario
  let sent = 0; let skipped = 0

  for (const [userId, items] of pendingByUser) {
    const email   = emailMap.get(userId)
    const profile = profileMap.get(userId)
    if (!email || !profile) { skipped++; continue }

    // Idempotencia: una notificación por usuario por tipo por día
    const refKey = `${targetDate}:recurring-${type}:${userId}`
    const { error: logErr } = await supabase
      .from('notification_log')
      .insert({ user_id: userId, type: `recurring_${type}`, ref_key: refKey })
      .select().single()
    if (logErr) { skipped++; continue }  // ya enviado

    const totalAmount = items.reduce((s: number, i: { amount: number }) => s + i.amount, 0)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to:   email,
        subject: type === 'due'
          ? `📅 ${items.length === 1 ? `Recordatorio: ${items[0].name} vence hoy` : `Tienes ${items.length} gastos que vencen hoy`}`
          : `⚠️ ${items.length === 1 ? `${items[0].name} no ha sido registrado` : `${items.length} gastos atrasados sin registrar`}`,
        html: reminderEmailHtml({
          type,
          displayName: profile.display_name ?? 'Usuario',
          items,
          totalAmount,
          targetDate,
          siteUrl: SITE_URL,
        }),
      }),
    })

    if (res.ok) sent++
    else console.error(`Resend error for ${email}:`, await res.text())
  }

  return new Response(JSON.stringify({ type, sent, skipped }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// ── Email HTML ────────────────────────────────────────────────────────────────

interface ReminderItem {
  name: string
  amount: number
  category: { name: string; color: string; bg_color: string; icon: string | null } | null
}

function reminderEmailHtml({
  type,
  displayName,
  items,
  totalAmount,
  targetDate,
  siteUrl,
}: {
  type: 'due' | 'overdue'
  displayName: string
  items: ReminderItem[]
  totalAmount: number
  targetDate: string
  siteUrl: string
}) {
  const isDue       = type === 'due'
  const accentColor = isDue ? '#1B6DD4' : '#FF6F61'
  const accentLight = isDue ? '#EEF4FF' : '#FFF2F0'
  const headerBg    = isDue ? 'linear-gradient(135deg, #1B6DD4 0%, #1557b0 100%)' : 'linear-gradient(135deg, #FF6F61 0%, #e05a4e 100%)'

  const [y, m, d] = targetDate.split('-').map(Number)
  const dateLabel = new Date(y, m - 1, d).toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  const dateLabelCap = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)

  const title    = isDue
    ? (items.length === 1 ? `Recordatorio de pago` : `${items.length} gastos vencen hoy`)
    : (items.length === 1 ? `Pago atrasado` : `${items.length} pagos atrasados`)
  const subtitle = isDue
    ? `${items.length === 1 ? 'Este gasto vence' : 'Estos gastos vencen'} hoy · ${dateLabelCap}`
    : `${items.length === 1 ? 'Este gasto debía registrarse' : 'Estos gastos debían registrarse'} el ${dateLabelCap} y aún no aparecen en tu historial.`

  const itemRows = items.map(item => {
    const cat      = item.category
    const catColor = cat?.color ?? '#94A3B8'
    const catBg    = cat?.bg_color ?? '#F1F5F9'
    const catName  = cat?.name ?? 'Sin categoría'
    const icon     = cat?.icon ?? null
    const isEmoji  = icon && !/^[A-Z]/.test(icon)

    const iconHtml = isEmoji
      ? `<span style="font-size:18px;line-height:1">${icon}</span>`
      : `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${catColor};vertical-align:middle"></span>`

    return `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #F0F4F8">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:44px;vertical-align:middle">
                <div style="width:40px;height:40px;border-radius:12px;background:${catBg};text-align:center;line-height:40px">
                  ${iconHtml}
                </div>
              </td>
              <td style="vertical-align:middle;padding-left:12px">
                <div style="font-size:15px;font-weight:700;color:#0A1F44">${item.name}</div>
                <div style="font-size:12px;color:#94A3B8;margin-top:2px">${catName}</div>
              </td>
              <td style="text-align:right;vertical-align:middle;white-space:nowrap">
                <span style="font-size:16px;font-weight:800;color:${accentColor}">${fmtCLP(item.amount)}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
  }).join('')

  const ctaLabel = isDue ? 'Registrar pagos' : 'Revisar en la app'
  const greeting = isDue
    ? `Hola ${displayName}, tienes ${items.length === 1 ? 'un gasto recurrente que vence' : 'gastos recurrentes que vencen'} hoy y aún no ${items.length === 1 ? 'ha sido registrado' : 'han sido registrados'}.`
    : `Hola ${displayName}, ${items.length === 1 ? 'un gasto recurrente que debía pagarse ayer no ha sido registrado' : 'algunos gastos recurrentes de ayer no han sido registrados aún'}.`

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F4F7FB;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FB;padding:32px 16px">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:24px">
              <span style="font-size:22px;font-weight:800;color:#0A1F44;letter-spacing:-0.5px">
                ✦ Bolsillo Mágico
              </span>
            </td>
          </tr>

          <!-- Hero card -->
          <tr>
            <td style="border-radius:20px;overflow:hidden;background:${headerBg};padding:28px 28px 24px">
              <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.65)">${isDue ? '📅 Vence hoy' : '⚠️ Pago atrasado'}</p>
              <p style="margin:0 0 4px;font-size:26px;font-weight:800;color:#fff;line-height:1.2">${title}</p>
              <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.7)">${subtitle}</p>

              <!-- Total badge -->
              <div style="margin-top:20px;display:inline-block;background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 18px">
                <span style="font-size:12px;color:rgba(255,255,255,0.7);font-weight:600;letter-spacing:0.5px">TOTAL PENDIENTE</span>
                <div style="font-size:22px;font-weight:800;color:#fff;margin-top:2px">${fmtCLP(totalAmount)}</div>
              </div>
            </td>
          </tr>

          <!-- Body card -->
          <tr>
            <td style="background:#fff;border-radius:20px;padding:24px 28px;margin-top:12px">
              <p style="margin:0 0 20px;font-size:14px;color:#4A5568;line-height:1.6">${greeting}</p>

              <!-- Items -->
              <table width="100%" cellpadding="0" cellspacing="0">
                ${itemRows}
              </table>

              <!-- CTA -->
              <div style="margin-top:24px;text-align:center">
                <a href="${siteUrl}/recurrentes"
                   style="display:inline-block;background:${accentColor};color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:14px;letter-spacing:0.2px">
                  ${ctaLabel} →
                </a>
              </div>

              ${!isDue ? `
              <div style="margin-top:16px;background:${accentLight};border-radius:12px;padding:12px 16px;text-align:center">
                <p style="margin:0;font-size:12px;color:#FF6F61;font-weight:600">
                  Si ya lo pagaste, recuerda registrarlo en la app para mantener tu historial al día.
                </p>
              </div>` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 0 4px;text-align:center">
              <p style="margin:0;font-size:11px;color:#94A3B8">
                Bolsillo Mágico · Notificaciones de gastos recurrentes<br>
                <a href="${siteUrl}/ajustes" style="color:#94A3B8;text-decoration:underline">Gestionar notificaciones</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
