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

const fmtCLP = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const fmtPct = (n: number, d = 2) => n.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'
const monthLong  = (d: string) => { const [y, m] = d.split('-').map(Number); return `${MESES[m - 1]} de ${y}` }

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(bin)
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
    const when = monthLong(r.adjustment_month)
    const name = profile?.display_name ?? 'Usuario'
    const propLabel = prop?.alias ?? prop?.address ?? 'tu propiedad'
    const tenantLabel = lease.tenant_name

    const pctTxt = fmtPct(Number(r.cumulative_pct), 2)
    const body = r.floored
      ? `El IPC de los últimos ${months.length} meses fue negativo (${pctTxt}), así que según el contrato la renta se mantiene.`
      : `La renta de <strong style="color:#0E2A52">${tenantLabel}</strong> se reajusta a partir de <strong style="color:#0E2A52">${when}</strong>, según la variación del IPC de los últimos ${months.length} meses (${pctTxt}).`

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F7FB;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#F4F7FB;padding:32px 16px"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:20px;max-width:100%">
  <tr><td style="padding:32px 36px 8px">
    <p style="margin:0 0 4px;font-size:12px;color:#8A98AD">Reajuste de arriendo · ${propLabel}</p>
    <p style="margin:0 0 18px;font-size:20px;font-weight:700;color:#0E2A52">Información sobre el reajuste del contrato</p>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#5B6B82">Hola, ${name}.</p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#5B6B82">${body}</p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 20px">
      <tr><td style="padding:8px 0;font-size:13px;color:#8A98AD;border-top:1px solid #EEF2F8">Renta actual</td>
          <td style="padding:8px 0;font-size:14px;color:#0E2A52;text-align:right;border-top:1px solid #EEF2F8">${fmtCLP(r.previous_rent)}</td></tr>
      <tr><td style="padding:8px 0;font-size:13px;font-weight:700;color:#0E2A52;border-top:1px solid #EEF2F8;border-bottom:1px solid #EEF2F8">Renta reajustada</td>
          <td style="padding:8px 0;font-size:18px;font-weight:800;color:#1B6DD4;text-align:right;border-top:1px solid #EEF2F8;border-bottom:1px solid #EEF2F8">${fmtCLP(r.new_rent)}</td></tr>
    </table>
    <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#5B6B82">Todo el detalle va en la carta de reajuste adjunta, lista para reenviar a ${lease.tenant_name} y a la corredora. El ${when} se aplica solo en la app.</p>
  </td></tr>
  <tr><td style="padding:12px 36px 32px;text-align:center">
    <a href="${SITE_URL}/propiedad" style="display:inline-block;background:#1B6DD4;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 28px;border-radius:12px">Ver en la app</a>
  </td></tr>
</table>
<p style="margin:16px 0 0;font-size:11px;color:#8A98AD">Bolsillo Mágico · <a href="${SITE_URL}/ajustes" style="color:#8A98AD">Preferencias</a></p>
</td></tr></table></body></html>`

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
