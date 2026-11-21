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

  const { count: pendingTotal } = await supabase.from('waitlist').select('id', { count: 'exact', head: true }).eq('status', 'pending')

  const n = rows.length
  const when = (iso: string) => new Date(iso).toLocaleString('es-CL', {
    timeZone: 'America/Santiago', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace('.', '')
  const sourceLabel = (s: string | null) => (!s || s === 'landing') ? 'desde la landing' : `desde ${s}`

  const cards = rows.map(r => {
    const email = r.email as string
    return `<tr><td style="padding:0 0 10px">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#EAF2FE" style="background:#EAF2FE;border:1px solid #D6E4FB;border-radius:16px">
        <tr>
          <td width="44" style="padding:14px 0 14px 16px;vertical-align:middle">
            <div style="width:40px;height:40px;border-radius:50%;background:#2B7CF6;color:#ffffff;text-align:center;line-height:40px;font-family:Fredoka,system-ui,sans-serif;font-size:17px;font-weight:600">${esc(email[0]?.toUpperCase() ?? '?')}</div>
          </td>
          <td style="padding:14px 16px 14px 12px;vertical-align:middle">
            <p style="margin:0;font-size:15px;font-weight:700;color:#0E2A52;word-break:break-all">${esc(email)}</p>
            <p style="margin:3px 0 0;font-size:12px;font-weight:600;color:#5B6B82">${esc(sourceLabel(r.source as string | null))} · ${esc(when(r.created_at as string))}</p>
          </td>
        </tr>
      </table>
    </td></tr>`
  }).join('')

  const title = n === 1 ? 'Nueva solicitud de acceso' : `${n} solicitudes nuevas de acceso`
  const pendingLine = (pendingTotal ?? n) > n
    ? `Con ${n === 1 ? 'esta' : 'estas'}, hay ${pendingTotal} solicitudes esperando respuesta.`
    : n === 1 ? 'Alguien quiere entrar a Bolsillo Mágico.' : 'Estas personas quieren entrar a Bolsillo Mágico.'

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)} · Bolsillo Mágico</title>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>
    :root { color-scheme: light; supported-color-schemes: light; }
    @media (prefers-color-scheme: dark) {
      .bm-page   { background:#E8EFF8 !important; }
      .bm-card   { background:#ffffff !important; }
      .bm-header { background:#2B7CF6 !important; }
      .bm-cta    { background:#2B7CF6 !important; color:#ffffff !important; }
      .bm-footer { background:#0E2A52 !important; }
      .bm-footer-muted, .bm-footer-muted a { color:#5E7396 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#E8EFF8;font-family:'Plus Jakarta Sans','Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(title)}: ${esc((rows[0].email as string))}${n > 1 ? ` y ${n - 1} más` : ''}. Revisa y envía la invitación desde el panel.</div>

<table width="100%" cellpadding="0" cellspacing="0" role="presentation" class="bm-page" bgcolor="#E8EFF8" style="background:#E8EFF8;padding:40px 16px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" role="presentation" class="bm-card" bgcolor="#ffffff"
      style="background:#ffffff;border-radius:24px;overflow:hidden;max-width:100%;box-shadow:0 8px 30px rgba(14,42,82,0.10)">

      <!-- ENCABEZADO azul (informativo) -->
      <tr><td class="bm-header" bgcolor="#2B7CF6" style="background:#2B7CF6;padding:32px 40px 30px;text-align:center">
        <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 20px">
          <tr>
            <td style="vertical-align:middle;padding-right:8px">
              <img src="${SITE_URL}/bolsillo-magico-icono-invertido.png" width="32" height="32" alt="Bolsillo Mágico" style="width:32px;height:32px;border-radius:8px;display:block">
            </td>
            <td style="vertical-align:middle">
              <span style="font-family:Fredoka,system-ui,sans-serif;font-size:18px;font-weight:600;letter-spacing:0.3px;line-height:1">
                <span style="color:rgba(255,255,255,0.95)">Bolsillo </span><span style="color:#F8C945">Mágico</span>
              </span>
            </td>
          </tr>
        </table>
        <p style="margin:0;font-family:Fredoka,system-ui,sans-serif;font-size:24px;font-weight:600;color:#ffffff;letter-spacing:0.2px">${esc(title)}</p>
      </td></tr>

      <!-- CONTENIDO -->
      <tr><td style="padding:30px 40px 8px">
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;font-weight:500;color:#5B6B82">${esc(pendingLine)}</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${cards}</table>
      </td></tr>

      <!-- CTA -->
      <tr><td style="padding:14px 40px 34px;text-align:center">
        <a href="${SITE_URL}/admin" class="bm-cta" style="display:inline-block;background:#2B7CF6;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 32px;border-radius:12px">Revisar en el panel</a>
        <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#8A98AD">Desde ahí puedes invitar a la persona o rechazar la solicitud.</p>
      </td></tr>

      <!-- PIE -->
      <tr><td class="bm-footer" bgcolor="#0E2A52" style="background:#0E2A52;padding:22px 40px;text-align:center">
        <p class="bm-footer-muted" style="margin:0;font-size:11px;line-height:1.6;color:#5E7396">Aviso interno para administradores de Bolsillo Mágico.<br>Lo recibes porque tu cuenta es admin.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`

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
