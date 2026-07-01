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
  const url  = new URL(req.url)
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* no body */ }
  const type  = (url.searchParams.get('type') ?? body?.type ?? 'due') as string
  const force = url.searchParams.get('force') === 'true' || body?.force === true

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

  const targetDate = `${monthStr}-${String(today).padStart(2, '0')}`

  // Para 'overdue' el día 1 no hay nada atrasado en el mes actual
  if (!force && type === 'overdue' && today === 1) {
    return new Response('First day of month — nothing overdue yet', { status: 200 })
  }

  // MODO TEST: enviar correo de muestra sin DB
  if (force) {
    const testEmail = (body?.email as string) ?? null
    if (!testEmail) return new Response('Pasa tu email: {"type":"due","force":true,"email":"tu@email.com"}', { status: 400 })
    const testItems = [
      { name: 'Netflix', amount: 9_490, domain: 'netflix.com', category: { name: 'Entretenimiento', color: '#8B5CF6', bg_color: '#F5F3FF', icon: '🎬' } },
      { name: 'Spotify', amount: 5_990, domain: 'spotify.com', category: { name: 'Entretenimiento', color: '#8B5CF6', bg_color: '#F5F3FF', icon: '🎵' } },
    ]
    const totalAmount = testItems.reduce((s, i) => s + i.amount, 0)
    const targetDate = `${monthStr}-${String(today).padStart(2, '0')}`
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: testEmail,
        subject: type === 'due' ? 'Recordatorio: Netflix y Spotify vencen hoy · Bolsillo Mágico' : 'Netflix y Spotify no han sido registrados · Bolsillo Mágico',
        html: reminderEmailHtml({ type: type as 'due' | 'overdue', displayName: 'Cas', items: testItems, totalAmount, targetDate, siteUrl: SITE_URL }),
      }),
    })
    return new Response(JSON.stringify({ test: true, ok: res.ok }), { headers: { 'Content-Type': 'application/json' } })
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

  // 3. Gastos recurrentes manuales que vencen el día target (o todos si force=true)
  const recurringQuery = supabase
    .from('recurring_expenses')
    .select(`
      id, user_id, name, amount, billing_day, billing_month, domain,
      category:categories(name, color, bg_color, icon)
    `)
    .in('user_id', userIds)
    .eq('auto_register', false)
    .eq('is_active', true)

  if (!force) {
    if (type === 'due') {
      recurringQuery.eq('billing_day', today)
    } else {
      // overdue: todos los días que ya pasaron este mes (no solo ayer)
      recurringQuery.lt('billing_day', today)
    }
  }

  const { data: allRecurring, error: rErr } = await recurringQuery

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

    // Idempotencia:
    // - due: una vez por día por usuario
    // - overdue: una vez por MES por usuario (así captura pagos atrasados aunque el cron
    //   haya fallado días anteriores — la clave cambia en cuanto empieza el nuevo mes)
    if (!force) {
      const refKey = type === 'due'
        ? `${targetDate}:recurring-due:${userId}`
        : `${monthStr}:recurring-overdue:${userId}`
      const { error: logErr } = await supabase
        .from('notification_log')
        .insert({ user_id: userId, type: `recurring_${type}`, ref_key: refKey })
        .select().single()
      if (logErr) { skipped++; continue }  // ya enviado
    }

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
          ? `${items.length === 1 ? `Recordatorio: ${items[0].name} vence hoy` : `Tienes ${items.length} gastos que vencen hoy`} · Bolsillo Mágico`
          : `${items.length === 1 ? `${items[0].name} no ha sido registrado` : `${items.length} gastos atrasados sin registrar`} · Bolsillo Mágico`,
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
  domain?: string | null
  category: { name: string; color: string; bg_color: string; icon: string | null } | null
}

function brandWordmark(siteUrl: string, light = true) {
  const main  = light ? 'rgba(255,255,255,0.95)' : '#0E2A52'
  const magic = light ? '#F8C945' : '#1B6DD4'
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto">
    <tr>
      <td style="vertical-align:middle;padding-right:8px">
        <img src="${siteUrl}/logo-icon.png" width="32" height="32" alt="Bolsillo Mágico" style="width:32px;height:32px;border-radius:8px;display:block">
      </td>
      <td style="vertical-align:middle">
        <span style="font-family:Fredoka,system-ui,sans-serif;font-size:18px;font-weight:600;letter-spacing:0.3px;line-height:1">
          <span style="color:${main}">Bolsillo </span><span style="color:${magic}">Mágico</span>
        </span>
      </td>
    </tr>
  </table>`
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
  const fmt = (n: number) => '$' + Math.abs(n).toLocaleString('es-CL', { maximumFractionDigits: 0 })
  const isDue    = type === 'due'
  const accent   = isDue ? '#F59E0B' : '#EF5B52'
  const cardBg   = isDue ? '#FFF8E8' : '#FFF4F3'
  const cardBdr  = isDue ? '#FBE6B5' : '#FAD3CF'
  const title    = isDue
    ? (items.length === 1 ? 'Recordatorio de cobro' : `${items.length} cobros se acercan`)
    : (items.length === 1 ? 'Tienes un pago atrasado' : `${items.length} pagos atrasados`)

  const [y, m, d] = targetDate.split('-').map(Number)
  const dateLabel = new Date(y, m - 1, d).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })
  const subtitle  = isDue
    ? `Se cobra${items.length > 1 ? 'n' : ''} hoy, ${dateLabel}. Ten el saldo listo.`
    : `Venc${items.length === 1 ? 'ió' : 'ieron'} el ${dateLabel} y aún no aparece${items.length === 1 ? '' : 'n'} en tu historial.`

  const ctaLabel = isDue ? 'Ver mis recurrentes' : 'Registrar pago ahora'

  const itemRows = items.map((item, i) => {
    const cat      = item.category
    const catColor = cat?.color ?? '#94A3B8'
    const catBg    = cat?.bg_color ?? '#F1F5F9'
    const catName  = cat?.name ?? 'Sin categoría'
    const domain   = item.domain

    // Avatar del servicio: logo de marca si hay domain, sino emoji/punto de categoría
    const avatarHtml = domain
      ? `<img src="https://logo.clearbit.com/${domain}" width="40" height="40" alt="${item.name}" style="width:40px;height:40px;border-radius:10px;display:block;object-fit:contain;background:${catBg}">`
      : (() => {
          const icon    = cat?.icon ?? null
          const isEmoji = icon && !/^[A-Z]/.test(icon)
          return `<div style="width:36px;height:36px;border-radius:10px;background:${catBg};text-align:center;line-height:36px;font-size:18px">
            ${isEmoji ? icon : `<div style="width:14px;height:14px;border-radius:50%;background:${catColor};display:inline-block;vertical-align:middle"></div>`}
          </div>`
        })()

    return `
      <tr>
        <td style="padding:12px 20px;${i < items.length - 1 ? 'border-bottom:1px solid #EDF2F8' : ''}">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:40px;vertical-align:middle">${avatarHtml}</td>
              <td style="padding-left:12px;vertical-align:middle">
                <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:700;color:#0E2A52">${item.name}</p>
                <p style="margin:2px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;color:#94A3B8">${catName}</p>
              </td>
              <td style="text-align:right;vertical-align:middle;white-space:nowrap">
                <span style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:16px;font-weight:800;color:${accent};font-variant-numeric:tabular-nums">${fmt(item.amount)}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} · Bolsillo Mágico</title>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#E8EFF8;font-family:'Plus Jakarta Sans','Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">

<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#E8EFF8;padding:40px 16px">
  <tr><td align="center">

    <table width="600" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#ffffff;border-radius:24px;overflow:hidden;max-width:100%;box-shadow:0 8px 30px rgba(14,42,82,0.10)">

      <!-- ENCABEZADO -->
      <tr><td style="background:${accent};padding:36px 40px 32px;text-align:center">
        <!-- Wordmark con logo -->
        <div style="margin-bottom:24px">${brandWordmark(siteUrl)}</div>
        <!-- Ícono de contexto en círculo -->
        <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 16px">
          <tr><td style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,0.2);text-align:center;vertical-align:middle;font-size:26px;line-height:52px">
            ${isDue ? '🔔' : '⏰'}
          </td></tr>
        </table>
        <p style="margin:0;font-family:Fredoka,system-ui,sans-serif;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:0.2px">
          ${title}
        </p>
        <p style="margin:8px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:500;color:rgba(255,255,255,0.8)">
          ${subtitle}
        </p>
      </td></tr>

      <!-- CUERPO -->
      <tr><td style="padding:32px 40px 28px">

        <!-- Saludo -->
        <p style="margin:0 0 8px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:20px;font-weight:700;color:#0E2A52">
          Hola, ${displayName}
        </p>
        <p style="margin:0 0 24px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:500;color:#5B6B82;line-height:1.6">
          ${isDue
            ? `${items.length === 1 ? 'Este cobro' : 'Estos cobros'} aparece${items.length === 1 ? '' : 'n'} en tus recurrentes activos.`
            : 'Regístralos para mantener tu historial al día.'}
        </p>

        <!-- Lista de ítems -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="background:${cardBg};border:1.5px solid ${cardBdr};border-radius:16px;margin-bottom:20px">
          ${itemRows}
        </table>

        <!-- Total -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="background:#2B7CF6;border-radius:16px;margin-bottom:28px">
          <tr><td style="padding:18px 24px;text-align:center">
            <p style="margin:0 0 4px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:700;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1.5px">
              Total ${isDue ? 'de cobros' : 'pendiente'}
            </p>
            <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:30px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;font-variant-numeric:tabular-nums">
              ${fmt(totalAmount)}
            </p>
          </td></tr>
        </table>

        <!-- CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="text-align:center">
            <a href="${siteUrl}/recurrentes"
              style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:700;padding:14px 32px;border-radius:12px;letter-spacing:0.1px">
              ${ctaLabel}
            </a>
            ${!isDue ? `
            <p style="margin:12px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;color:#94A3B8">
              Si ya lo pagaste, recuerda registrarlo para mantener tu historial al día.
            </p>` : ''}
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
              Recibes este recordatorio porque tienes activos los avisos de recurrentes.<br>
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
