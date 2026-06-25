/**
 * notify-monthly-summary — Edge Function
 *
 * Corre diariamente (pg_cron). Solo actúa si hoy es el último día del mes.
 * Envía un resumen completo del mes: total, vs anterior, top categorías y top gastos.
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

  // Emails
  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const emailMap = new Map((authUsers?.users ?? []).map(u => [u.id, u.email]))

  // Gastos del mes actual (con descripción y fecha para el top 3)
  const { data: currentExpenses } = await supabase
    .from('expenses')
    .select('user_id, amount, category_id, recurring_expense_id, description, date')
    .in('user_id', userIds)
    .gte('date', monthStart)
    .lte('date', monthEnd)

  // Gastos del mes anterior
  const { data: prevExpenses } = await supabase
    .from('expenses')
    .select('user_id, amount')
    .in('user_id', userIds)
    .gte('date', prevStart)
    .lte('date', prevEnd)

  // Categorías
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, color, bg_color, icon')

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

    const userCurrent = (currentExpenses ?? []).filter(e => e.user_id === profile.id)
    const userPrev    = (prevExpenses ?? []).filter(e => e.user_id === profile.id)

    const totalCurrent   = userCurrent.reduce((s, e) => s + e.amount, 0)
    const totalPrev      = userPrev.reduce((s, e) => s + e.amount, 0)
    const totalRecurring = userCurrent
      .filter(e => e.recurring_expense_id)
      .reduce((s, e) => s + e.amount, 0)
    const txCount        = userCurrent.length
    const dailyAvg       = txCount > 0 ? Math.round(totalCurrent / lastDay) : 0

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

    // Top 3 gastos por monto
    const top3 = [...userCurrent]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3)
      .map(e => ({
        description: e.description ?? 'Gasto',
        date: e.date,
        amount: e.amount,
        catName: e.category_id ? (catMap.get(e.category_id)?.name ?? '') : '',
        catColor: e.category_id ? (catMap.get(e.category_id)?.color ?? '#94A3B8') : '#94A3B8',
        catBg: e.category_id ? (catMap.get(e.category_id)?.bg_color ?? '#F1F5F9') : '#F1F5F9',
      }))

    const recurringPct = totalCurrent > 0 ? Math.round((totalRecurring / totalCurrent) * 100) : 0
    const fmtCLP = (n: number) => '$' + Math.abs(n).toLocaleString('es-CL', { maximumFractionDigits: 0 })
    const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
    // Capitalizar primera letra
    const monthLabelCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: email,
        subject: `✦ Tu resumen de ${monthLabelCap} está listo`,
        html: monthlyEmailHtml({
          displayName: profile.display_name ?? 'Usuario',
          monthLabel: monthLabelCap,
          totalCurrent,
          totalPrev,
          delta,
          deltaAbs,
          txCount,
          dailyAvg,
          recurringPct,
          topCats,
          top3,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

// ── Email HTML ────────────────────────────────────────────────────────────────

function monthlyEmailHtml({
  displayName,
  monthLabel,
  totalCurrent,
  delta,
  deltaAbs,
  txCount,
  dailyAvg,
  recurringPct,
  topCats,
  top3,
  fmtCLP,
  siteUrl,
}: {
  displayName: string
  monthLabel: string
  totalCurrent: number
  totalPrev: number
  delta: number | null
  deltaAbs: number
  txCount: number
  dailyAvg: number
  recurringPct: number
  topCats: { cat: { name: string; color: string; bg_color: string; icon?: string } | undefined; total: number }[]
  top3: { description: string; date: string; amount: number; catName: string; catColor: string; catBg: string }[]
  fmtCLP: (n: number) => string
  siteUrl: string
}) {
  const maxCat    = topCats[0]?.total ?? 1
  const isDown    = delta !== null && deltaAbs < 0   // gastó menos = bueno
  const deltaClr  = isDown ? '#1FBE8D' : '#FF6F61'
  const deltaSign = isDown ? '↓' : '↑'
  const deltaMsg  = delta !== null
    ? `${deltaSign} ${Math.abs(delta)}% vs. mes anterior${isDown ? ' · ¡tu mejor mes! ✦' : ''}`
    : ''

  const catRows = topCats.map(({ cat, total }) => {
    const barPct = Math.round((total / maxCat) * 100)
    const pct    = Math.round((total / totalCurrent) * 100)
    // Detectar emoji (no empieza con letra mayúscula ASCII)
    const isEmoji = cat!.icon && !/^[A-Z]/.test(cat!.icon)
    const iconHtml = isEmoji
      ? `<span style="font-size:16px;line-height:1">${cat!.icon}</span>`
      : `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${cat!.color};flex-shrink:0;vertical-align:middle"></span>`
    return `
      <tr>
        <td style="padding:10px 0 4px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:24px;vertical-align:middle">${iconHtml}</td>
              <td style="vertical-align:middle;font-size:14px;color:#0E2A52;font-weight:500">${cat!.name}</td>
              <td style="text-align:right;vertical-align:middle;white-space:nowrap">
                <span style="font-size:13px;font-weight:700;color:#0E2A52">${fmtCLP(total)}</span>
                <span style="font-size:12px;color:#94A3B8;margin-left:4px">· ${pct}%</span>
              </td>
            </tr>
          </table>
          <div style="margin-top:6px;background:#E4EAF1;border-radius:6px;height:6px;overflow:hidden">
            <div style="background:${cat!.color};width:${barPct}%;height:100%;border-radius:6px"></div>
          </div>
        </td>
      </tr>`
  }).join('')

  const expenseRows = top3.map(e => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #F0F4F8">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:40px;vertical-align:middle">
              <div style="width:36px;height:36px;border-radius:10px;background:${e.catBg};display:flex;align-items:center;justify-content:center;text-align:center;line-height:36px">
                <span style="font-size:16px">🛒</span>
              </div>
            </td>
            <td style="padding-left:10px;vertical-align:middle">
              <p style="margin:0;font-size:14px;font-weight:600;color:#0E2A52">${e.description}</p>
              <p style="margin:2px 0 0;font-size:12px;color:#94A3B8">${fmtDate(e.date)} · ${e.catName}</p>
            </td>
            <td style="text-align:right;vertical-align:middle;white-space:nowrap">
              <span style="font-size:14px;font-weight:700;color:#FF6F61">− ${fmtCLP(e.amount)}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join('')

  const insightHtml = delta !== null ? `
    <tr><td style="padding:0 0 20px">
      <div style="background:#FFF8EC;border:1.5px solid #FFE4A0;border-radius:16px;padding:16px 20px">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:32px;font-size:22px;vertical-align:top">🎉</td>
            <td style="padding-left:10px;vertical-align:top">
              <p style="margin:0;font-size:14px;font-weight:700;color:#0E2A52">
                ${isDown ? `Gastaste ${Math.abs(delta)}% menos que el mes anterior` : `Gastaste ${Math.abs(delta)}% más que el mes anterior`}
              </p>
              <p style="margin:4px 0 0;font-size:13px;color:#5B6B82;line-height:1.5">
                ${isDown
                  ? `Sobre todo gracias a tus hábitos. Si mantienes el ritmo, seguirás mejorando. ✦`
                  : `Revisa tus categorías para identificar dónde ajustar el mes que viene.`}
              </p>
            </td>
          </tr>
        </table>
      </div>
    </td></tr>` : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Resumen mensual · Bolsillo Mágico</title>
</head>
<body style="margin:0;padding:0;background:#E8EFF8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">

<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#E8EFF8;padding:40px 16px">
  <tr><td align="center">

    <!-- Outer card -->
    <table width="560" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#ffffff;border-radius:24px;overflow:hidden;max-width:100%;box-shadow:0 8px 30px rgba(14,42,82,0.10)">

      <!-- ── Header section (light bg with title) ── -->
      <tr><td style="background:#F4F7FB;padding:32px 40px 28px;text-align:center;position:relative">
        <!-- Sparkles -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="text-align:left;font-size:14px;color:#2B7CF6;vertical-align:top">✦</td>
            <td style="text-align:center">
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#2B7CF6;text-transform:uppercase;letter-spacing:2px">Resumen mensual</p>
              <p style="margin:0;font-size:28px;font-weight:800;color:#0E2A52;letter-spacing:-0.5px">${monthLabel}</p>
            </td>
            <td style="text-align:right;font-size:14px;color:#FFC23C;vertical-align:top">✦</td>
          </tr>
        </table>
      </td></tr>

      <!-- ── Body ── -->
      <tr><td style="padding:28px 40px 0">

        <!-- Greeting -->
        <p style="margin:0 0 6px;font-size:20px;font-weight:700;color:#0E2A52">Hola, ${displayName} 👋</p>
        <p style="margin:0 0 24px;font-size:14px;color:#5B6B82;line-height:1.6">
          Aquí tienes la magia del mes: a dónde fue tu dinero y un par de cosas que notamos por ti.
        </p>

        <!-- Hero blue card -->
        <div style="background:#2B7CF6;border-radius:20px;padding:24px 28px;margin-bottom:20px;position:relative;overflow:hidden">
          <!-- Sparkle decoration -->
          <div style="position:absolute;top:16px;right:20px;font-size:22px;color:#FFC23C;opacity:0.9">✦</div>
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px">Este mes gastaste</p>
          <p style="margin:0;font-size:36px;font-weight:800;color:#ffffff;letter-spacing:-1px;line-height:1.1">
            ${fmtCLP(totalCurrent).replace('$', '$<span style="font-size:22px">').replace(/(\.\d+)?$/, '</span>')}
          </p>
          ${deltaMsg ? `
          <div style="margin-top:14px;display:inline-block;background:rgba(255,255,255,0.18);border-radius:20px;padding:5px 14px">
            <span style="font-size:12px;font-weight:700;color:#ffffff">${deltaMsg}</span>
          </div>` : ''}
        </div>

        <!-- KPI row -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="border:1.5px solid #E4EAF1;border-radius:16px;overflow:hidden;margin-bottom:28px">
          <tr>
            <td style="padding:16px 20px;text-align:center;border-right:1.5px solid #E4EAF1">
              <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px">Transacciones</p>
              <p style="margin:0;font-size:22px;font-weight:800;color:#0E2A52">${txCount}</p>
            </td>
            <td style="padding:16px 20px;text-align:center;border-right:1.5px solid #E4EAF1">
              <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px">Promedio diario</p>
              <p style="margin:0;font-size:22px;font-weight:800;color:#0E2A52">${fmtCLP(dailyAvg)}</p>
            </td>
            <td style="padding:16px 20px;text-align:center;background:#F0FBF7">
              <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#1FBE8D;text-transform:uppercase;letter-spacing:0.5px">Recurrentes</p>
              <p style="margin:0;font-size:22px;font-weight:800;color:#1FBE8D">${recurringPct}%</p>
            </td>
          </tr>
        </table>

        <!-- Categories -->
        ${topCats.length > 0 ? `
        <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#0E2A52">En qué se fue tu dinero</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px">
          ${catRows}
        </table>` : ''}

        <!-- Insight -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          ${insightHtml}
        </table>

        <!-- Top 3 expenses -->
        ${top3.length > 0 ? `
        <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#0E2A52">Tus ${top3.length} gastos más grandes</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px">
          ${expenseRows}
        </table>` : ''}

      </td></tr>

      <!-- CTA -->
      <tr><td style="padding:0 40px 12px;text-align:center">
        <a href="${siteUrl}/analisis"
          style="display:inline-block;background:#2B7CF6;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:14px;letter-spacing:-0.2px">
          Ver reporte completo →
        </a>
        <p style="margin:12px 0 0;font-size:13px;color:#94A3B8">O abre la app y revisa tus metas para el próximo mes.</p>
      </td></tr>

      <!-- ── Footer navy ── -->
      <tr><td style="background:#0E2A52;padding:24px 40px;margin-top:8px">
        <!-- Logo -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="text-align:center;padding-bottom:16px">
              <p style="margin:0;font-size:16px;font-weight:800;color:#ffffff;letter-spacing:-0.3px">
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
                Recibes este correo porque tienes activo el resumen mensual.<br>
                Bolsillo Mágico · <a href="${siteUrl}" style="color:rgba(255,255,255,0.35);text-decoration:none">www.bolsillomagico.com</a>
                · <a href="${siteUrl}/ajustes" style="color:rgba(255,255,255,0.35);text-decoration:underline">Cancelar suscripción</a>
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
