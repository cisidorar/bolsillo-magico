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

Deno.serve(async (req: Request) => {
  const url  = new URL(req.url)
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* no body */ }
  const force = url.searchParams.get('force') === 'true' || body?.force === true

  const now        = new Date()
  const today      = now.getDate()
  const year       = now.getFullYear()
  const month      = now.getMonth() + 1   // mes actual (ej. julio = 7)
  const isFirstDay = today === 1

  if (!isFirstDay && !force) {
    return new Response(`Not the first day of the month (day ${today})`, { status: 200 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  // Mes a resumir: el mes anterior (ej. si hoy es 1 julio → resumir junio)
  const summaryMonth   = month === 1 ? 12 : month - 1
  const summaryYear    = month === 1 ? year - 1 : year
  const summaryLastDay = new Date(summaryYear, summaryMonth, 0).getDate()
  const monthStr       = `${summaryYear}-${String(summaryMonth).padStart(2, '0')}`
  const monthStart     = `${monthStr}-01`
  const monthEnd       = `${monthStr}-${String(summaryLastDay).padStart(2, '0')}`

  // Mes anterior al resumido (para comparar delta)
  const prevMonth   = summaryMonth === 1 ? 12 : summaryMonth - 1
  const prevYear    = summaryMonth === 1 ? summaryYear - 1 : summaryYear
  const prevStr     = `${prevYear}-${String(prevMonth).padStart(2, '0')}`
  const prevLastDay = new Date(prevYear, prevMonth, 0).getDate()
  const prevStart   = `${prevStr}-01`
  const prevEnd     = `${prevStr}-${String(prevLastDay).padStart(2, '0')}`

  // MODO TEST: enviar correo de muestra sin tocar la DB
  if (force) {
    const testEmail = (body?.email as string) ?? null
    if (!testEmail) {
      return new Response('Pasa tu email: {"force":true,"email":"tu@email.com"}', { status: 400 })
    }
    const fmtCLP = (n: number) => '$' + Math.abs(n).toLocaleString('es-CL', { maximumFractionDigits: 0 })
    const monthLabel = new Date(summaryYear, summaryMonth - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
    const monthLabelCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: testEmail,
        subject: `📊 Tu resumen de ${monthLabelCap} · Prueba`,
        html: monthlyEmailHtml({
          displayName: 'Cas',
          monthLabel: monthLabelCap,
          totalCurrent: 1_280_000,
          totalPrev: 1_150_000,
          delta: 11,
          deltaAbs: 130_000,
          txCount: 34,
          dailyAvg: 42_667,
          totalRecurring: 380_000,
          recurringPct: 30,
          topCats: [
            { cat: { name: 'Alimentación', color: '#10B981', bg_color: '#ECFDF5', icon: '🍔' }, total: 420_000 },
            { cat: { name: 'Transporte',   color: '#3B82F6', bg_color: '#EFF6FF', icon: '🚗' }, total: 280_000 },
            { cat: { name: 'Entretenimiento', color: '#8B5CF6', bg_color: '#F5F3FF', icon: '🎬' }, total: 210_000 },
            { cat: { name: 'Salud',        color: '#EF4444', bg_color: '#FEF2F2', icon: '💊' }, total: 180_000 },
            { cat: { name: 'Hogar',        color: '#F59E0B', bg_color: '#FFFBEB', icon: '🏠' }, total: 190_000 },
          ],
          top3: [
            { description: 'Apple iCloud+',     date: `${monthStr}-05`, amount: 350_000, catName: 'Tecnología',    catColor: '#6366F1', catBg: '#EEF2FF' },
            { description: 'Supermercado Lider', date: `${monthStr}-12`, amount: 198_000, catName: 'Alimentación', catColor: '#10B981', catBg: '#ECFDF5' },
            { description: 'Bencina',            date: `${monthStr}-18`, amount: 95_000,  catName: 'Transporte',   catColor: '#3B82F6', catBg: '#EFF6FF' },
          ],
          fmtCLP,
          siteUrl: SITE_URL,
        }),
      }),
    })
    const resText = await res.text()
    return new Response(JSON.stringify({ test: true, ok: res.ok, resend: resText }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Usuarios con notify_monthly = true
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
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

    // Idempotencia: una por mes (omitir en modo force/test)
    if (!force) {
      const refKey = `${monthStr}:monthly:${profile.id}`
      const { error: logErr } = await supabase
        .from('notification_log')
        .insert({ user_id: profile.id, type: 'monthly', ref_key: refKey })
        .select().single()
      if (logErr) { skipped++; continue }
    }

    const userCurrent = (currentExpenses ?? []).filter(e => e.user_id === profile.id)
    const userPrev    = (prevExpenses ?? []).filter(e => e.user_id === profile.id)

    const totalCurrent   = userCurrent.reduce((s, e) => s + e.amount, 0)
    const totalPrev      = userPrev.reduce((s, e) => s + e.amount, 0)
    const totalRecurring = userCurrent
      .filter(e => e.recurring_expense_id)
      .reduce((s, e) => s + e.amount, 0)
    const txCount        = userCurrent.length
    const dailyAvg       = txCount > 0 ? Math.round(totalCurrent / summaryLastDay) : 0

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
        subject: `Tu resumen de ${monthLabelCap} está listo · Bolsillo Mágico`,
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
  totalRecurring?: number
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
  const isDown    = delta !== null && deltaAbs < 0
  const deltaSign = isDown ? '↓' : '↑'
  const deltaMsg  = delta !== null ? `${deltaSign} ${Math.abs(delta)}% vs. mes anterior` : ''
  const deltaBadgeBg = isDown ? 'rgba(31,190,141,0.25)' : 'rgba(239,91,82,0.25)'

  const catRows = topCats.map(({ cat, total }) => {
    const barPct  = Math.round((total / maxCat) * 100)
    const pct     = Math.round((total / totalCurrent) * 100)
    const icon    = cat!.icon ?? null
    const isEmoji = icon && !/^[A-Z]/.test(icon)
    const dotHtml = isEmoji
      ? `<span style="font-size:14px;line-height:1">${icon}</span>`
      : `<div style="width:10px;height:10px;border-radius:50%;background:${cat!.color};display:inline-block;vertical-align:middle"></div>`
    return `
      <tr>
        <td style="padding:10px 0 4px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:20px;vertical-align:middle">${dotHtml}</td>
              <td style="vertical-align:middle;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:500;color:#0E2A52">${cat!.name}</td>
              <td style="text-align:right;vertical-align:middle;white-space:nowrap">
                <span style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:700;color:#0E2A52;font-variant-numeric:tabular-nums">${fmtCLP(total)}</span>
                <span style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;color:#94A3B8;margin-left:4px">· ${pct}%</span>
              </td>
            </tr>
          </table>
          <div style="margin-top:6px;background:#EDF2F8;border-radius:6px;height:8px;overflow:hidden">
            <div style="background:${cat!.color};width:${barPct}%;height:100%;border-radius:6px"></div>
          </div>
        </td>
      </tr>`
  }).join('')

  const expenseRows = top3.map((e, i) => `
    <tr>
      <td style="padding:12px 0;${i < top3.length - 1 ? 'border-bottom:1px solid #EDF2F8' : ''}">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:40px;vertical-align:middle">
              <div style="width:36px;height:36px;border-radius:10px;background:${e.catBg};text-align:center;line-height:36px">
                <div style="width:16px;height:16px;border-radius:50%;background:${e.catColor};display:inline-block;vertical-align:middle;margin-top:-2px"></div>
              </div>
            </td>
            <td style="padding-left:12px;vertical-align:middle">
              <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:700;color:#0E2A52">${e.description}</p>
              <p style="margin:2px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;color:#94A3B8">${fmtDate(e.date)} · ${e.catName}</p>
            </td>
            <td style="text-align:right;vertical-align:middle;white-space:nowrap">
              <span style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:800;color:#EF5B52;font-variant-numeric:tabular-nums">− ${fmtCLP(e.amount)}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join('')

  const insightHtml = delta !== null ? `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
      style="background:${isDown ? '#E7F7F0' : '#FFF4F3'};border:1.5px solid ${isDown ? '#C9EEDF' : '#FAD3CF'};border-radius:16px;margin-bottom:24px">
      <tr><td style="padding:18px 20px">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:30px;vertical-align:top;padding-top:2px">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="${isDown ? '#1FBE8D' : '#EF5B52'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                ${isDown
                  ? '<circle cx="10" cy="10" r="7"/><path d="M7 10l2 2 4-4"/>'
                  : '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/>'}
              </svg>
            </td>
            <td style="padding-left:12px;vertical-align:top">
              <p style="margin:0 0 3px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:700;color:#0E2A52">
                ${isDown ? `Gastaste ${Math.abs(delta)}% menos que el mes anterior` : `Gastaste ${Math.abs(delta)}% más que el mes anterior`}
              </p>
              <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:500;color:#5B6B82;line-height:1.6">
                ${isDown
                  ? 'Buen trabajo. Si mantienes el ritmo, seguirás mejorando.'
                  : 'Revisa tus categorías para identificar dónde ajustar el mes que viene.'}
              </p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>` : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Resumen mensual · Bolsillo Mágico</title>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#E8EFF8;font-family:'Plus Jakarta Sans','Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">

<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#E8EFF8;padding:40px 16px">
  <tr><td align="center">

    <table width="600" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#ffffff;border-radius:24px;overflow:hidden;max-width:100%;box-shadow:0 8px 30px rgba(14,42,82,0.10)">

      <!-- ENCABEZADO azul — Informativo -->
      <tr><td style="background:#2B7CF6;padding:36px 40px 32px;text-align:center">
        <div style="margin-bottom:24px">${brandWordmark(siteUrl)}</div>
        <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 16px">
          <tr><td style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,0.2);text-align:center;vertical-align:middle;font-size:26px;line-height:52px">
            📊
          </td></tr>
        </table>
        <p style="margin:0;font-family:Fredoka,system-ui,sans-serif;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:0.2px">
          Resumen mensual · ${monthLabel}
        </p>
      </td></tr>

      <!-- CUERPO -->
      <tr><td style="padding:32px 40px 28px">

        <!-- Saludo -->
        <p style="margin:0 0 8px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:20px;font-weight:700;color:#0E2A52">
          Hola, ${displayName}
        </p>
        <p style="margin:0 0 28px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:500;color:#5B6B82;line-height:1.6">
          Aquí tienes a dónde fue tu dinero este mes.
        </p>

        <!-- BLOQUE DESTACADO — total del mes -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="background:#2B7CF6;border-radius:20px;margin-bottom:24px">
          <tr><td style="padding:28px 32px;text-align:center">
            <p style="margin:0 0 6px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:700;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1.5px">
              Este mes gastaste
            </p>
            <p style="margin:0 0 14px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:38px;font-weight:800;color:#ffffff;letter-spacing:-1px;line-height:1;font-variant-numeric:tabular-nums">
              ${fmtCLP(totalCurrent)}
            </p>
            ${deltaMsg ? `
            <div style="display:inline-block;background:${deltaBadgeBg};border-radius:20px;padding:5px 14px">
              <span style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:700;color:#ffffff">${deltaMsg}</span>
            </div>` : ''}
          </td></tr>
        </table>

        <!-- KPI fila de 3 -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="border:1.5px solid #E4EAF1;border-radius:16px;overflow:hidden;margin-bottom:28px">
          <tr>
            <td width="33%" style="padding:16px 12px;text-align:center;border-right:1.5px solid #E4EAF1">
              <p style="margin:0 0 3px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px">Transacciones</p>
              <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:22px;font-weight:800;color:#0E2A52;font-variant-numeric:tabular-nums">${txCount}</p>
            </td>
            <td width="34%" style="padding:16px 12px;text-align:center;border-right:1.5px solid #E4EAF1">
              <p style="margin:0 0 3px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px">Promedio diario</p>
              <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:17px;font-weight:800;color:#0E2A52;font-variant-numeric:tabular-nums">${fmtCLP(dailyAvg)}</p>
            </td>
            <td width="33%" style="padding:16px 12px;text-align:center;background:#E7F7F0">
              <p style="margin:0 0 3px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:10px;font-weight:700;color:#1FBE8D;text-transform:uppercase;letter-spacing:0.5px">Recurrentes</p>
              <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:22px;font-weight:800;color:#1FBE8D;font-variant-numeric:tabular-nums">${recurringPct}%</p>
            </td>
          </tr>
        </table>

        <!-- Categorías -->
        ${topCats.length > 0 ? `
        <p style="margin:0 0 8px;font-family:Fredoka,system-ui,sans-serif;font-size:16px;font-weight:600;color:#0E2A52">En qué se fue tu dinero</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px">
          ${catRows}
        </table>` : ''}

        <!-- Insight delta -->
        ${insightHtml}

        <!-- Top 3 gastos -->
        ${top3.length > 0 ? `
        <p style="margin:0 0 8px;font-family:Fredoka,system-ui,sans-serif;font-size:16px;font-weight:600;color:#0E2A52">Los gastos más grandes</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="background:#F4F7FB;border-radius:16px;margin-bottom:28px">
          <tr><td style="padding:4px 20px">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${expenseRows}
            </table>
          </td></tr>
        </table>` : ''}

        <!-- CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="text-align:center">
            <a href="${siteUrl}/analisis"
              style="display:inline-block;background:#2B7CF6;color:#ffffff;text-decoration:none;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:700;padding:14px 32px;border-radius:12px;letter-spacing:0.1px">
              Ver reporte completo
            </a>
            <p style="margin:12px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;color:#94A3B8">
              O abre la app y revisa tus metas para el próximo mes.
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
              Recibes este correo porque tienes activo el resumen mensual.<br>
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
