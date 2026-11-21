/**
 * notify-waitlist — Edge Function
 *
 * Avisa por correo a los admins (profiles.is_admin) cuando hay solicitudes nuevas en
 * la lista de espera (waitlist.notified_at null). La dispara el formulario de la landing
 * justo después de guardar la solicitud. No recibe datos: solo mira la tabla, manda un
 * correo con las pendientes sin avisar y las marca. Llamarla de más no repite correos.
 *
 * Requiere: RESEND_API_KEY, SITE_URL, DB_SERVICE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SITE_URL       = Deno.env.get('SITE_URL') ?? 'https://bolsillomagico.com'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('DB_SERVICE_KEY')!

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data: rows, error } = await supabase
    .from('waitlist')
    .select('id, email, source, created_at')
    .is('notified_at', null)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(20)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  if (!rows || rows.length === 0) return new Response(JSON.stringify({ sent: 0 }))

  const { data: admins } = await supabase.from('profiles').select('id').eq('is_admin', true)
  const emails: string[] = []
  for (const a of admins ?? []) {
    const { data } = await supabase.auth.admin.getUserById(a.id as string)
    if (data?.user?.email) emails.push(data.user.email)
  }
  if (emails.length === 0) return new Response(JSON.stringify({ sent: 0, reason: 'sin admins' }))

  const list = rows.map(r => `<li style="margin:0 0 6px">${esc(r.email as string)}${r.source ? ` <span style="color:#8A98AD">· ${esc(r.source as string)}</span>` : ''}</li>`).join('')
  const n = rows.length
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F4F7FB;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#F4F7FB;padding:32px 16px"><tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:20px;max-width:100%">
  <tr><td style="padding:32px 36px">
    <p style="margin:0 0 4px;font-size:12px;color:#8A98AD">Lista de espera · Bolsillo Mágico</p>
    <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0E2A52">${n === 1 ? 'Nueva solicitud de acceso' : `${n} solicitudes nuevas de acceso`}</p>
    <ul style="margin:0 0 20px;padding-left:18px;font-size:14px;color:#0E2A52">${list}</ul>
    <a href="${SITE_URL}/admin" style="display:inline-block;background:#1B6DD4;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 28px;border-radius:12px">Revisar en el panel</a>
    <p style="margin:16px 0 0;font-size:12px;color:#8A98AD">Entra con tu cuenta admin para invitar o rechazar.</p>
  </td></tr>
</table></td></tr></table></body></html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
      to: emails,
      subject: n === 1 ? 'Nueva solicitud de acceso · Bolsillo Mágico' : `${n} solicitudes nuevas · Bolsillo Mágico`,
      html,
    }),
  })
  if (!res.ok) {
    console.error('Resend error', await res.text())
    return new Response(JSON.stringify({ sent: 0, error: 'resend' }), { status: 502 })
  }
  await supabase.from('waitlist').update({ notified_at: new Date().toISOString() }).in('id', rows.map(r => r.id as string))
  return new Response(JSON.stringify({ sent: n }), { headers: { 'Content-Type': 'application/json' } })
})
