/**
 * notify-market-drop — Edge Function
 *
 * La invoca /api/cron/market-drop (Vercel) solo en días de caída fuerte, con
 * los reportes ya calculados: { reports: [{ userId, date, report, impact,
 * explanation, headlines }] }. Acá solo se filtra por preferencia
 * (profiles.notify_market_drop), se deduplica por notification_log y se manda
 * el correo — no se recalcula nada.
 *
 * Prueba sin DB: { "force": true, "email": "tu@email.com" } manda un correo de muestra.
 *
 * Requiere: RESEND_API_KEY, SITE_URL, DB_SERVICE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SITE_URL       = Deno.env.get('SITE_URL') ?? 'https://bolsillomagico.com'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('DB_SERVICE_KEY')!

interface Mover { ticker: string; pct: number; changeUsd: number; leverage: number | null }
interface Report {
  changeUsd: number; changePct: number; changeClp: number | null; spyPct: number | null
  valueUsd: number; losers: Mover[]; gainers: Mover[]
}
interface Headline { title: string; source: string; url: string; ticker?: string }
interface Payload {
  userId: string; date: string; report: Report; impact: string[]
  explanation: string | null; headlines: Headline[]
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function fmtUsd(n: number): string {
  return (n < 0 ? '−' : '') + 'US$' + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtClp(n: number): string {
  return (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-CL')
}
function fmtPct(n: number): string {
  return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
}
function fmtDateLong(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
}

Deno.serve(async (req: Request) => {
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* sin body */ }

  if (body.force === true) {
    const email = body.email as string | undefined
    if (!email) return new Response('Pasa tu email: {"force":true,"email":"tu@email.com"}', { status: 400 })
    const sample: Payload = {
      userId: 'test', date: '2026-10-30',
      report: {
        changeUsd: -590, changePct: -8.4, changeClp: -560_500, spyPct: -1.8, valueUsd: 6536,
        losers: [
          { ticker: 'INTC', pct: -28.6, changeUsd: -315, leverage: null },
          { ticker: 'SOXL', pct: -24.7, changeUsd: -140, leverage: 3 },
        ],
        gainers: [{ ticker: 'KO', pct: 1.4, changeUsd: 16, leverage: null }],
      },
      impact: ['Línea de impacto de ejemplo.', 'Otra línea de impacto.'],
      explanation: 'Explicación de ejemplo de por qué cayó el mercado.',
      headlines: [{ title: 'Titular de ejemplo', source: 'Fuente', url: SITE_URL }],
    }
    const ok = await send(email, 'Cas', sample)
    return json({ test: true, ok })
  }

  const reports = (Array.isArray(body.reports) ? body.reports : []) as Payload[]
  if (reports.length === 0) return json({ sent: 0, skipped: 0 })

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const userIds  = [...new Set(reports.map(r => r.userId))]
  const { data: profiles } = await supabase
    .from('profiles').select('id, display_name, notify_market_drop').in('id', userIds)
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))
  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const emailMap = new Map((authUsers?.users ?? []).map(u => [u.id, u.email]))

  let sent = 0, skipped = 0
  for (const r of reports) {
    const profile = profileMap.get(r.userId)
    const email   = emailMap.get(r.userId)
    if (!profile || profile.notify_market_drop === false || !email) { skipped++; continue }

    const refKey = `${r.date}:market-drop:${r.userId}`
    const { error: logErr } = await supabase
      .from('notification_log').insert({ user_id: r.userId, type: 'market_drop', ref_key: refKey }).select().single()
    if (logErr) { skipped++; continue }  // ya enviado para ese día

    if (await send(email, profile.display_name ?? '', r)) sent++
    else await supabase.from('notification_log').delete().eq('ref_key', refKey)
  }
  return json({ sent, skipped })
})

function json(o: unknown) {
  return new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } })
}

async function send(to: string, name: string, p: Payload): Promise<boolean> {
  const worst = p.report.losers[0]
  const subject = worst
    ? `Tu cartera bajó ${fmtPct(p.report.changePct)} hoy (${worst.ticker} ${fmtPct(worst.pct)}) · qué pasó y cómo te afecta`
    : `Tu cartera bajó ${fmtPct(p.report.changePct)} hoy · qué pasó y cómo te afecta`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Bolsillo Mágico <noreply@bolsillomagico.com>', to, subject, html: html(name, p) }),
  })
  if (!res.ok) console.error('[notify-market-drop] Resend:', await res.text())
  return res.ok
}

function html(name: string, p: Payload): string {
  const r = p.report
  const navy = '#0E2A52', ink2 = '#5B6B82', coral = '#E5484D', mint = '#1FBE8D', line = '#EEF2F8'

  const moverRow = (m: Mover, color: string) => `
    <tr><td style="padding:10px 0;border-bottom:1px solid ${line}">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="font-size:14px;font-weight:800;color:${navy}">${esc(m.ticker)}${m.leverage ? ` <span style="font-size:10px;font-weight:700;color:#B45309;background:#FEF3C7;border-radius:999px;padding:2px 6px">${m.leverage}×</span>` : ''}</td>
        <td style="text-align:right;font-size:13px;font-weight:700;color:${color};font-variant-numeric:tabular-nums">${fmtPct(m.pct)} · ${fmtUsd(m.changeUsd)}</td>
      </tr></table>
    </td></tr>`

  const explanation = p.explanation
    ? `<p style="margin:0;font-size:14px;line-height:1.65;color:${navy}">${esc(p.explanation)}</p>`
    : `<p style="margin:0;font-size:14px;line-height:1.65;color:${ink2}">No encontramos titulares que expliquen la caída de hoy. Revisa las noticias de tus acciones en la app.</p>`

  const headlines = p.headlines.length > 0 ? `
    <p style="margin:24px 0 8px;font-size:12px;font-weight:700;color:${ink2};text-transform:uppercase;letter-spacing:1.2px">Para leer más</p>
    ${p.headlines.map(h => `<p style="margin:0 0 8px;font-size:13px;line-height:1.5"><a href="${esc(h.url)}" style="color:#1B6DD4;text-decoration:none;font-weight:600">${esc(h.title)}</a> <span style="color:${ink2}">· ${esc(h.source)}${h.ticker ? ` · ${esc(h.ticker)}` : ''}</span></p>`).join('')}` : ''

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>Caída fuerte · Bolsillo Mágico</title></head>
<body style="margin:0;padding:0;background:#E8EFF8;font-family:'Plus Jakarta Sans','Helvetica Neue',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#E8EFF8" style="background:#E8EFF8;padding:32px 12px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#ffffff" style="background:#ffffff;border-radius:24px;overflow:hidden;max-width:100%">

  <tr><td bgcolor="${navy}" style="background:${navy};padding:32px 36px;text-align:center">
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:1.5px">${esc(fmtDateLong(p.date))}</p>
    <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff">Día de caída fuerte en la bolsa</p>
  </td></tr>

  <tr><td style="padding:28px 36px 8px">
    <p style="margin:0 0 6px;font-size:18px;font-weight:700;color:${navy}">Hola${name ? `, ${esc(name)}` : ''}</p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${ink2}">Hoy fue un día malo para tus acciones. Acá va qué pasó y qué significa para tu plata.</p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#FFF1F1;border-radius:18px"><tr><td style="padding:22px 24px">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td><p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${ink2};text-transform:uppercase;letter-spacing:1.2px">Tu cartera hoy</p>
          <p style="margin:0;font-size:30px;font-weight:800;color:${coral};font-variant-numeric:tabular-nums">${fmtUsd(r.changeUsd)}</p>
          <p style="margin:4px 0 0;font-size:13px;font-weight:600;color:${ink2}">${fmtPct(r.changePct)}${r.changeClp != null ? ` · ≈ ${fmtClp(r.changeClp)}` : ''}</p></td>
        <td style="text-align:right;vertical-align:top">${r.spyPct != null ? `<p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${ink2};text-transform:uppercase;letter-spacing:1.2px">S&amp;P 500</p>
          <p style="margin:0;font-size:18px;font-weight:800;color:${navy};font-variant-numeric:tabular-nums">${fmtPct(r.spyPct)}</p>` : ''}</td>
      </tr></table>
    </td></tr></table>

    <p style="margin:26px 0 8px;font-size:15px;font-weight:800;color:${navy}">¿Qué pasó?</p>
    ${explanation}

    <p style="margin:26px 0 8px;font-size:15px;font-weight:800;color:${navy}">Cómo te afecta</p>
    ${p.impact.map(l => `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:${navy}">• ${esc(l)}</p>`).join('')}

    <p style="margin:22px 0 4px;font-size:15px;font-weight:800;color:${navy}">Lo que más bajó</p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      ${r.losers.map(m => moverRow(m, coral)).join('')}
      ${r.gainers.map(m => moverRow(m, mint)).join('')}
    </table>

    ${headlines}

    <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:${ink2}">Este correo es informativo, no una recomendación de compra o venta. Las señales de cada acción siguen en tu análisis diario.</p>
  </td></tr>

  <tr><td style="padding:20px 36px 32px;text-align:center">
    <a href="${SITE_URL}/inversiones" style="display:inline-block;background:#1B6DD4;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 32px;border-radius:12px">Ver mis inversiones</a>
  </td></tr>

  <tr><td bgcolor="${navy}" style="background:${navy};padding:20px 36px;text-align:center">
    <p style="margin:0;font-size:11px;line-height:1.6;color:#9FB5D4">Recibes este correo porque tienes activo el aviso de caídas fuertes.
    <a href="${SITE_URL}/ajustes" style="color:#9FB5D4">Cambiar preferencias</a></p>
  </td></tr>

</table></td></tr></table>
</body></html>`
}
