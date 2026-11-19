/**
 * notify-rent-adjustment — Edge Function
 *
 * La dispara el cron de Next /api/cron/rent-adjustment cuando ya calculó un
 * reajuste del arriendo (tabla rent_adjustments, con el PDF del aviso en
 * Storage). Acá solo se manda el correo a la arrendadora (Cas) con el detalle
 * y el PDF adjunto para que lo revise y lo reenvíe al arrendatario.
 * Idempotente: marca notified_at y solo toma filas con notified_at null.
 *
 * Requiere: RESEND_API_KEY, SITE_URL, DB_SERVICE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SITE_URL       = Deno.env.get('SITE_URL') ?? 'https://bolsillomagico.com'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('DB_SERVICE_KEY')!

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const fmtCLP = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const fmtPct = (n: number, d = 2) => n.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'
const monthLong  = (d: string) => { const [y, m] = d.split('-').map(Number); return `${MESES[m - 1]} de ${y}` }
const monthShort = (d: string) => { const [y, m] = d.split('-').map(Number); return `${MES_CORTO[m - 1]}-${String(y).slice(2)}` }

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(bin)
}

// Mismo wordmark que el resto de los correos de Bolsillo Mágico.
function brandWordmark(siteUrl: string) {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto"><tr>
    <td style="vertical-align:middle;padding-right:8px"><img src="${siteUrl}/bolsillo-magico-icono-invertido.png" width="32" height="32" alt="Bolsillo Mágico" style="width:32px;height:32px;border-radius:8px;display:block"></td>
    <td style="vertical-align:middle"><span style="font-family:Fredoka,system-ui,sans-serif;font-size:18px;font-weight:600;letter-spacing:0.3px;line-height:1"><span style="color:rgba(255,255,255,0.95)">Bolsillo </span><span style="color:#F8C945">Mágico</span></span></td>
  </tr></table>`
}

interface WindowMonth { date: string; pct: number | null }

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data: rows, error } = await supabase
    .from('rent_adjustments')
    .select('id, user_id, lease_id, adjustment_month, previous_rent, new_rent, cumulative_pct, floored, window_months, pdf_path')
    .is('notified_at', null)
    .not('pdf_path', 'is', null)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  if (!rows || rows.length === 0) return new Response(JSON.stringify({ sent: 0 }))

  let sent = 0
  for (const r of rows) {
    const [{ data: lease }, { data: userRes }, { data: profile }] = await Promise.all([
      supabase.from('lease_contracts').select('tenant_name, tenant_email, property_id').eq('id', r.lease_id).single(),
      supabase.auth.admin.getUserById(r.user_id),
      supabase.from('profiles').select('display_name').eq('id', r.user_id).maybeSingle(),
    ])
    const email = userRes?.user?.email
    if (!lease || !email) continue

    const { data: prop } = await supabase.from('properties').select('alias, address').eq('id', lease.property_id).single()
    const { data: file, error: dlErr } = await supabase.storage.from('property-docs').download(r.pdf_path)
    if (dlErr || !file) { console.error('PDF no disponible', r.pdf_path, dlErr?.message); continue }
    const pdfB64 = toBase64(new Uint8Array(await file.arrayBuffer()))

    const months = (r.window_months as WindowMonth[])
    const delta = r.new_rent - r.previous_rent
    const when = monthLong(r.adjustment_month)
    const name = profile?.display_name ?? 'Usuario'
    const propLabel = prop?.alias ?? prop?.address ?? 'tu propiedad'
    const headline = r.floored
      ? `El IPC fue negativo: la renta se mantiene en ${fmtCLP(r.new_rent)}`
      : `La renta sube a ${fmtCLP(r.new_rent)} desde ${when}`

    const monthRows = months.map(m => `
      <tr><td style="padding:8px 0;border-bottom:1px solid #EEF2F8;font-size:13px;color:#5B6B82">${monthShort(m.date)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #EEF2F8;font-size:13px;font-weight:700;color:#0E2A52;text-align:right">${m.pct === null ? 'sin dato' : fmtPct(m.pct)}</td></tr>`).join('')

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#E8EFF8;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#E8EFF8;padding:32px 16px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:24px;overflow:hidden;max-width:100%">
  <tr><td style="background:#2B7CF6;padding:32px 40px;text-align:center">
    <div style="margin-bottom:22px">${brandWordmark(SITE_URL)}</div>
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1.5px">Reajuste de arriendo · ${propLabel}</p>
    <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff">${headline}</p>
  </td></tr>
  <tr><td style="padding:28px 40px">
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#5B6B82">Hola, ${name}. Ya está publicado el IPC de los 6 meses que corresponden al reajuste de <strong style="color:#0E2A52">${when}</strong> según tu contrato (cláusula quinta). Este es el cálculo:</p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${monthRows}
      <tr><td style="padding:10px 0;font-size:13px;font-weight:700;color:#0E2A52">IPC acumulado (compuesto)</td>
      <td style="padding:10px 0;font-size:14px;font-weight:800;color:#0E2A52;text-align:right">${fmtPct(Number(r.cumulative_pct), 4)}</td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#2B7CF6;border-radius:16px;margin:20px 0">
      <tr><td style="padding:20px 24px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="font-size:12px;color:rgba(255,255,255,0.8)">Renta vigente</td><td style="text-align:right;font-size:14px;color:#ffffff;font-weight:700">${fmtCLP(r.previous_rent)}</td></tr>
          <tr><td style="font-size:12px;color:rgba(255,255,255,0.8);padding-top:6px">${r.floored ? 'Ajuste (IPC negativo)' : 'Aumento'}</td><td style="text-align:right;font-size:14px;color:#7EEBC7;font-weight:700;padding-top:6px">${r.floored ? fmtCLP(0) : '+' + fmtCLP(delta)}</td></tr>
          <tr><td style="font-size:13px;font-weight:700;color:#ffffff;padding-top:12px">Renta desde ${when}</td><td style="text-align:right;font-size:24px;font-weight:800;color:#ffffff;padding-top:12px">${fmtCLP(r.new_rent)}</td></tr>
        </table>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:14px;font-weight:800;color:#0E2A52">Qué hacer</p>
    <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#5B6B82">1. Revisa los valores mensuales contra el INE (se muestran con 2 decimales; el cálculo puede diferir en pocos pesos).</p>
    <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#5B6B82">2. Reenvía el PDF adjunto a ${lease.tenant_name}${lease.tenant_email ? ` (${lease.tenant_email})` : ''} y a la corredora.</p>
    <p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#5B6B82">3. En la app, confirma el reajuste para actualizar la renta de los arriendos que aún no se pagan.</p>
    <p style="text-align:center;margin:0"><a href="${SITE_URL}/propiedad" style="display:inline-block;background:#1B6DD4;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 32px;border-radius:12px">Abrir Propiedad</a></p>
  </td></tr>
  <tr><td style="background:#0E2A52;padding:22px 40px;text-align:center">
    ${brandWordmark(SITE_URL)}
    <p style="margin:14px 0 0;font-size:11px;color:#5E7396;line-height:1.6">Recibes este correo porque tienes un contrato de arriendo con reajuste por IPC en Bolsillo Mágico.</p>
  </td></tr>
</table></td></tr></table></body></html>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: email,
        subject: `Reajuste de arriendo ${when}: ${fmtCLP(r.new_rent)} · Bolsillo Mágico`,
        html,
        attachments: [{ filename: `aviso-reajuste-${r.adjustment_month.slice(0, 7)}.pdf`, content: pdfB64 }],
      }),
    })
    if (res.ok) {
      await supabase.from('rent_adjustments').update({ notified_at: new Date().toISOString() }).eq('id', r.id)
      sent++
    } else {
      console.error('Resend error', email, await res.text())
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } })
})
