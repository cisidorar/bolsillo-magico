/**
 * notify-fomc-reminder — Edge Function
 *
 * A pedido de Cas (jul 2026, tras el FOMC del 29 jul): un aviso una semana
 * antes de que la Fed decida tasas, con el día de la reunión y hacia dónde
 * el mercado tiene precio para que se mueva.
 *
 * OJO — no es una probabilidad tipo CME FedWatch. No hay API gratuita y
 * confiable para eso, y un número mal scrapeado es peor que ninguno (ver
 * ROADMAP-macro-tasas.md, sección "Fuera de alcance, a propósito"). En vez de
 * eso se muestra el proxy honesto que ya usa /inversiones: el spread entre el
 * bono del Tesoro a 2 años y la tasa de fondos federales, traducido a "el
 * mercado tiene precio para ~N movimientos de 25pb" — mismo texto que ya ve
 * el usuario en la card "Tu semana".
 *
 * Corre diariamente (pg_cron), después de /api/cron/sync-prices (Vercel) —
 * ese cron ya calculó nextFomcMeeting() + el spread y dejó la frase lista en
 * fomc_alerts.sentence. Esta función SOLO lee esa fila y arma el correo — no
 * recalcula nada (mismo patrón que notify-watchlist-digest/daily_signals y
 * notify-weekly-report/weekly_reports: Deno no puede importar
 * lib/market-week.ts ni lib/rate-path.ts).
 *
 * Idempotente por (usuario, meeting_date): aunque el cron corra todos los
 * días dentro de la ventana de 7 días, cada usuario recibe UN solo correo por
 * reunión — "un aviso", como pidió Cas, no un recordatorio diario que agobie.
 *
 * Solo se manda a usuarios con notify_fomc = true Y actividad de inversión
 * (watchlist o posiciones) — un aviso sobre tasas de la Fed no aporta nada a
 * quien no invierte en acciones.
 *
 * Requiere: RESEND_API_KEY, SITE_URL, DB_SERVICE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SITE_URL       = Deno.env.get('SITE_URL') ?? 'https://bolsillomagico.com'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('DB_SERVICE_KEY')!

function todayInCL(): string {
  const utc = new Date()
  const cl  = new Date(utc.toLocaleString('en-US', { timeZone: 'America/Santiago' }))
  const y = cl.getFullYear(), m = String(cl.getMonth() + 1).padStart(2, '0'), d = String(cl.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function brandWordmark(siteUrl: string) {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto">
    <tr>
      <td style="vertical-align:middle;padding-right:8px">
        <img src="${siteUrl}/bolsillo-magico-icono-invertido.png" width="32" height="32" alt="Bolsillo Mágico" style="width:32px;height:32px;border-radius:8px;display:block">
      </td>
      <td style="vertical-align:middle">
        <span style="font-family:Fredoka,system-ui,sans-serif;font-size:18px;font-weight:600;letter-spacing:0.3px;line-height:1">
          <span style="color:rgba(255,255,255,0.95)">Bolsillo </span><span style="color:#F8C945">Mágico</span>
        </span>
      </td>
    </tr>
  </table>`
}

function fomcEmailHtml({
  displayName, meetingLabel, sentence, direction, siteUrl,
}: {
  displayName: string
  meetingLabel: string
  sentence: string
  direction: 'alzas' | 'estable' | 'bajas'
  siteUrl: string
}) {
  // UX5: esto es un aviso informativo con anticipación, no una alerta de
  // "acción hoy" — gold como máximo cuando hay dirección esperada, nunca
  // coral (no es una situación que requiera actuar).
  const accent  = direction === 'estable' ? '#1B6DD4' : '#F59E0B'
  const cardBg  = direction === 'estable' ? '#EFF4FF' : '#FFF8E8'
  const cardBdr = direction === 'estable' ? '#D5E6FF' : '#FBE6B5'

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>La Fed decide tasas el ${meetingLabel} · Bolsillo Mágico</title>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>:root { color-scheme: light; supported-color-schemes: light; }</style>
</head>
<body style="margin:0;padding:0;background:#E8EFF8;font-family:'Plus Jakarta Sans','Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">

<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#E8EFF8;padding:40px 16px">
  <tr><td align="center">

    <table width="600" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#ffffff;border-radius:24px;overflow:hidden;max-width:100%;box-shadow:0 8px 30px rgba(14,42,82,0.10)">

      <!-- ENCABEZADO -->
      <tr><td style="background:${accent};padding:36px 40px 32px;text-align:center">
        <div style="margin-bottom:24px">${brandWordmark(siteUrl)}</div>
        <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 16px">
          <tr><td style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,0.2);text-align:center;vertical-align:middle;font-size:26px;line-height:52px">
            🏛️
          </td></tr>
        </table>
        <p style="margin:0;font-family:Fredoka,system-ui,sans-serif;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:0.2px">
          La Fed decide tasas el ${meetingLabel}
        </p>
        <p style="margin:8px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:500;color:rgba(255,255,255,0.8)">
          En una semana — un aviso, no una alarma.
        </p>
      </td></tr>

      <!-- CUERPO -->
      <tr><td style="padding:32px 40px 28px">

        <p style="margin:0 0 8px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:20px;font-weight:700;color:#0E2A52">
          Hola, ${displayName}
        </p>
        <p style="margin:0 0 24px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:500;color:#5B6B82;line-height:1.6">
          El comité de la Reserva Federal se reúne el <strong>${meetingLabel}</strong> para decidir la tasa de interés en EEUU.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="background:${cardBg};border:1.5px solid ${cardBdr};border-radius:16px;margin-bottom:24px">
          <tr><td style="padding:18px 20px">
            <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:600;color:#0E2A52;line-height:1.6">
              ${sentence}
            </p>
          </td></tr>
        </table>

        <p style="margin:0 0 24px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;color:#94A3B8;line-height:1.6">
          Esto es lo que el mercado ya tiene incorporado en el precio de los bonos, no una predicción exacta de lo que la Fed va a hacer. No cambia tu plan de largo plazo — es solo contexto para no sorprenderte si ves más movimiento de lo normal esa semana.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="text-align:center">
            <a href="${siteUrl}/inversiones"
              style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:700;padding:14px 32px;border-radius:12px;letter-spacing:0.1px">
              Ver mi cartera
            </a>
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
              Recibes este aviso porque tienes activo el contexto de tasas de la Fed.<br>
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

Deno.serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const today = todayInCL()

  // 1. ¿Hay una reunión dentro de los próximos 7 días? (el cron de Vercel solo
  // escribe/actualiza esta fila cuando nextFomcMeeting(today, 7) encuentra una)
  const { data: alert, error: alertErr } = await supabase
    .from('fomc_alerts')
    .select('meeting_date, sentence, direction')
    .gte('meeting_date', today)
    .order('meeting_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (alertErr) return new Response(JSON.stringify({ error: alertErr.message }), { status: 500 })
  if (!alert) return new Response(JSON.stringify({ sent: 0, reason: 'sin reunión de la Fed en los próximos 7 días' }), { headers: { 'Content-Type': 'application/json' } })

  const meetingDate = alert.meeting_date as string
  const daysUntil = Math.round((new Date(meetingDate + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86_400_000)
  if (daysUntil > 7) {
    return new Response(JSON.stringify({ sent: 0, reason: 'la próxima reunión aún está a más de 7 días' }), { headers: { 'Content-Type': 'application/json' } })
  }

  // 2. Usuarios con notify_fomc = true...
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, notify_fomc')
    .eq('notify_fomc', true)
  if (!profiles || profiles.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: 'sin usuarios con notify_fomc activo' }), { headers: { 'Content-Type': 'application/json' } })
  }
  const candidateIds = profiles.map(p => p.id as string)

  // ...Y con actividad de inversión (watchlist o posiciones) — un aviso sobre
  // tasas de la Fed no aporta nada a quien no invierte en acciones.
  const [{ data: wl }, { data: pos }] = await Promise.all([
    supabase.from('watchlist').select('user_id').in('user_id', candidateIds),
    supabase.from('stock_positions').select('user_id').in('user_id', candidateIds),
  ])
  const investorIds = new Set([...(wl ?? []).map(r => r.user_id as string), ...(pos ?? []).map(r => r.user_id as string)])
  const profileMap = new Map(profiles.map(p => [p.id as string, p as { display_name: string | null }]))
  const userIds = candidateIds.filter(id => investorIds.has(id))

  if (userIds.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: 'ningún usuario con notify_fomc invierte en acciones' }), { headers: { 'Content-Type': 'application/json' } })
  }

  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const emailMap = new Map((authUsers?.users ?? []).map(u => [u.id, u.email]))

  const meetingLabel = new Date(meetingDate + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })

  let sent = 0, skipped = 0
  for (const userId of userIds) {
    const email = emailMap.get(userId)
    if (!email) { skipped++; continue }

    // Idempotente por (usuario, reunión): un solo correo por reunión, sin
    // importar cuántos días dentro de la ventana de 7 corra el cron.
    const refKey = `${meetingDate}:fomc-reminder:${userId}`
    const { error: logErr } = await supabase
      .from('notification_log')
      .insert({ user_id: userId, type: 'fomc_reminder', ref_key: refKey })
      .select().single()
    if (logErr) { skipped++; continue }   // ya se envió para esta reunión

    const profile = profileMap.get(userId)
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: email,
        subject: `La Fed decide tasas el ${meetingLabel} · Bolsillo Mágico`,
        html: fomcEmailHtml({
          displayName: profile?.display_name ?? 'Usuario',
          meetingLabel,
          sentence: alert.sentence as string,
          direction: alert.direction as 'alzas' | 'estable' | 'bajas',
          siteUrl: SITE_URL,
        }),
      }),
    })

    if (res.ok) sent++
    else {
      // Ver notify-budget: si el envío falla hay que borrar el log recién
      // insertado, si no ref_key queda "quemado" y bloquea reintentos.
      console.error(`Resend error for ${email}:`, await res.text())
      await supabase.from('notification_log').delete().eq('ref_key', refKey)
    }
  }

  return new Response(JSON.stringify({ sent, candidates: userIds.length, skipped, meetingDate }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
