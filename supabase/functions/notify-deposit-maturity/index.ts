/**
 * notify-deposit-maturity — Edge Function
 *
 * Corre diariamente (pg_cron). Detecta depósitos a plazo que vencen HOY
 * y envía un correo al usuario para que renueve o retire.
 *
 * Requiere: RESEND_API_KEY, SITE_URL, DB_SERVICE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SITE_URL       = Deno.env.get('SITE_URL') ?? 'https://bolsillomagico.com'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('DB_SERVICE_KEY')!

function todayCL(): string {
  const cl = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }))
  return `${cl.getFullYear()}-${String(cl.getMonth() + 1).padStart(2, '0')}-${String(cl.getDate()).padStart(2, '0')}`
}

function fmtCLP(n: number): string {
  return '$' + n.toLocaleString('es-CL', { maximumFractionDigits: 0 })
}

function fmtDateLong(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// '28 jul' — para la fila "Plazo" (mismo formato corto que usa TermDepositManager en la app)
function fmtDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const MONTH_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000)
}

Deno.serve(async (req: Request) => {
  const url  = new URL(req.url)
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* no body */ }
  const force = url.searchParams.get('force') === 'true' || body?.force === true

  // MODO TEST: enviar correo de muestra sin DB
  if (force) {
    const testEmail = (body?.email as string) ?? null
    if (!testEmail) return new Response('Pasa tu email: {"force":true,"email":"tu@email.com"}', { status: 400 })
    const today = todayCL()
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: testEmail,
        subject: 'Tu depósito a plazo en Banco de Chile vence hoy · Bolsillo Mágico',
        html: depositMaturityHtml({
          displayName: 'Cas',
          bank: 'Banco de Chile',
          amount: 335_000,
          interest: 1_139,
          rate: 0.34,
          startDate: '2026-07-28',
          maturityDate: today,
          renewable: true,
          siteUrl: SITE_URL,
        }),
      }),
    })
    return new Response(JSON.stringify({ test: true, ok: res.ok }), { headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const today    = todayCL()

  // Depósitos que vencen hoy
  const { data: deposits, error: dErr } = await supabase
    .from('term_deposits')
    .select('id, user_id, bank, amount, interest_rate, start_date, maturity_date, renewable')
    .eq('maturity_date', today)

  if (dErr) return new Response(JSON.stringify({ error: dErr.message }), { status: 500 })
  if (!deposits || deposits.length === 0) return new Response(JSON.stringify({ sent: 0, skipped: 0 }), { status: 200 })

  const userIds = [...new Set(deposits.map(d => d.user_id))]

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, notify_deposit_maturity')
    .in('id', userIds)
    .eq('notify_deposit_maturity', true)

  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const emailMap   = new Map((authUsers?.users ?? []).map(u => [u.id, u.email]))
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))

  let sent = 0; let skipped = 0

  for (const deposit of deposits) {
    const profile = profileMap.get(deposit.user_id)
    if (!profile) { skipped++; continue }

    const email = emailMap.get(deposit.user_id)
    if (!email) { skipped++; continue }

    const refKey = `${today}:deposit-maturity:${deposit.id}`
    const { error: logErr } = await supabase
      .from('notification_log')
      .insert({ user_id: deposit.user_id, type: 'deposit_maturity', ref_key: refKey })
      .select().single()
    if (logErr) { skipped++; continue }  // ya enviado hoy

    const interest = Math.round(deposit.amount * (deposit.interest_rate / 100))

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: email,
        subject: `Tu depósito a plazo en ${deposit.bank} vence hoy · Bolsillo Mágico`,
        html: depositMaturityHtml({
          displayName: profile.display_name ?? 'Usuario',
          bank: deposit.bank,
          amount: deposit.amount,
          interest,
          rate: deposit.interest_rate,
          startDate: deposit.start_date,
          maturityDate: deposit.maturity_date,
          renewable: deposit.renewable ?? false,
          siteUrl: SITE_URL,
        }),
      }),
    })

    if (res.ok) {
      sent++
    } else {
      console.error(`Resend error for ${email}:`, await res.text())
      await supabase.from('notification_log').delete().eq('ref_key', refKey)
    }
  }

  return new Response(JSON.stringify({ sent, skipped }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// ── Logo / Wordmark ──────────────────────────────────────────────────────────

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

// ── Email HTML ────────────────────────────────────────────────────────────────

function depositMaturityHtml({
  displayName,
  bank,
  amount,
  interest,
  rate,
  startDate,
  maturityDate,
  renewable,
  siteUrl,
}: {
  displayName: string
  bank: string
  amount: number
  interest: number
  rate: number
  startDate: string
  maturityDate: string
  renewable: boolean
  siteUrl: string
}) {
  const total        = amount + interest
  const dateLabel     = fmtDateLong(maturityDate)
  const termDays      = daysBetween(startDate, maturityDate)
  // Azul — mismo tono que el bloque destacado del correo de presupuesto
  // (pedido de Cas, ago 2026: "quiero ese display en el celeste de bolsillo
  // mágico como el de 80% de presupuesto"). El mint queda solo para el signo
  // "+" del interés ganado (positivo dentro del bloque azul), igual que
  // "Retorno total" en el hero de Mis acciones (Radar.tsx).
  const accent        = '#2B7CF6'
  const renewBg       = '#EDFAF5'
  const renewBorder   = '#A8EDD8'

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Depósito vencido · Bolsillo Mágico</title>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>
    :root { color-scheme: light; supported-color-schemes: light; }
    @media (prefers-color-scheme: dark) {
      .bm-page    { background:#E8EFF8 !important; }
      .bm-card    { background:#ffffff !important; }
      .bm-header  { background:${accent} !important; }
      .bm-amount  { background:${accent} !important; }
      .bm-detail  { background:#ffffff !important; border-color:#E4EAF3 !important; }
      .bm-renew   { background:${renewBg} !important; border-color:${renewBorder} !important; }
      .bm-cta     { background:#1B6DD4 !important; color:#ffffff !important; }
      .bm-footer  { background:#0E2A52 !important; }
      .bm-footer-link  { color:#9FB5D4 !important; }
      .bm-footer-muted, .bm-footer-muted a { color:#5E7396 !important; }
      .bm-footer-divider { border-color:rgba(255,255,255,0.08) !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#E8EFF8;font-family:'Plus Jakarta Sans','Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">

<table width="100%" cellpadding="0" cellspacing="0" role="presentation" class="bm-page" bgcolor="#E8EFF8" style="background:#E8EFF8;padding:40px 16px">
  <tr><td align="center">

    <table width="600" cellpadding="0" cellspacing="0" role="presentation" class="bm-card" bgcolor="#ffffff"
      style="background:#ffffff;border-radius:24px;overflow:hidden;max-width:100%;box-shadow:0 8px 30px rgba(14,42,82,0.10)">

      <!-- ENCABEZADO azul -->
      <tr><td class="bm-header" bgcolor="${accent}" style="background:${accent};padding:36px 40px 32px;text-align:center">
        <div style="margin-bottom:24px">${brandWordmark(siteUrl)}</div>
        <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 16px">
          <tr><td style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,0.2);text-align:center;vertical-align:middle;font-size:26px;line-height:52px">
            🏦
          </td></tr>
        </table>
        <p style="margin:0;font-family:Fredoka,system-ui,sans-serif;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:0.2px">
          Tu depósito en ${bank} vence hoy
        </p>
      </td></tr>

      <!-- CUERPO -->
      <tr><td style="padding:32px 40px 28px">

        <!-- Saludo -->
        <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0E2A52">
          Hola, ${displayName}
        </p>
        <p style="margin:0 0 28px;font-size:14px;font-weight:500;color:#5B6B82;line-height:1.6">
          Tu depósito a plazo en <strong style="color:#0E2A52">${bank}</strong> llegó a su fecha de vencimiento hoy,
          <strong style="color:#0E2A52">${dateLabel}</strong>. Ya puedes renovarlo o retirar el capital más los intereses.
        </p>

        <!-- BLOQUE resumen de plata -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" class="bm-amount" bgcolor="${accent}"
          style="background:${accent};border-radius:20px;margin-bottom:20px">
          <tr><td style="padding:28px 32px">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="text-align:left">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1.5px">Capital invertido</p>
                  <p style="margin:0;font-size:24px;font-weight:800;color:#ffffff;font-variant-numeric:tabular-nums">${fmtCLP(amount)}</p>
                </td>
                <td style="text-align:right">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1.5px">Interés ganado</p>
                  <p style="margin:0;font-size:24px;font-weight:800;color:#7EEBC7;font-variant-numeric:tabular-nums">+${fmtCLP(interest)}</p>
                </td>
              </tr>
            </table>
            <div style="border-top:1px solid rgba(255,255,255,0.18);margin:20px 0"></div>
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td>
                  <p style="margin:0;font-size:12px;font-weight:700;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1.5px">Total disponible</p>
                </td>
                <td style="text-align:right">
                  <p style="margin:0;font-size:32px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;font-variant-numeric:tabular-nums">${fmtCLP(total)}</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>

        <!-- DETALLE: institución / tasa / plazo -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" class="bm-detail" bgcolor="#ffffff"
          style="background:#ffffff;border:1.5px solid #E4EAF3;border-radius:16px;margin-bottom:20px">
          <tr><td style="padding:6px 20px">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr><td style="padding:14px 0;border-bottom:1px solid #EEF2F8">
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
                  <td style="font-size:13px;font-weight:600;color:#5B6B82">Institución</td>
                  <td style="text-align:right;font-size:14px;font-weight:800;color:#0E2A52">${bank}</td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:14px 0;border-bottom:1px solid #EEF2F8">
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
                  <td style="font-size:13px;font-weight:600;color:#5B6B82">Tasa del período</td>
                  <td style="text-align:right;font-size:14px;font-weight:800;color:#0E2A52;font-variant-numeric:tabular-nums">${rate.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:14px 0">
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
                  <td style="font-size:13px;font-weight:600;color:#5B6B82">Plazo</td>
                  <td style="text-align:right;font-size:14px;font-weight:800;color:#0E2A52;font-variant-numeric:tabular-nums">${termDays} días · ${fmtDateShort(startDate)} → ${fmtDateShort(maturityDate)}</td>
                </tr></table>
              </td></tr>
            </table>
          </td></tr>
        </table>

        <!-- ¿QUÉ QUIERES HACER? — Renovar / Retirar -->
        <p style="margin:0 0 10px;font-size:15px;font-weight:800;color:#0E2A52">¿Qué quieres hacer?</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px">
          <tr>
            ${renewable ? `
            <td width="50%" valign="top" class="bm-renew" bgcolor="${renewBg}"
              style="background:${renewBg};border:1.5px solid ${renewBorder};border-radius:16px;padding:16px" >
              <p style="margin:0 0 6px;font-size:14px;font-weight:800;color:#0E2A52">↻ Renovar</p>
              <p style="margin:0;font-size:12px;font-weight:500;color:#5B6B82;line-height:1.5">Reinvierte el total con la nueva tasa que te ofrezca el banco.</p>
            </td>
            <td width="12"></td>
            <td width="50%" valign="top" style="border:1.5px solid #E4EAF3;border-radius:16px;padding:16px">
              <p style="margin:0 0 6px;font-size:14px;font-weight:800;color:#0E2A52">↓ Retirar</p>
              <p style="margin:0;font-size:12px;font-weight:500;color:#5B6B82;line-height:1.5">Mueve los ${fmtCLP(total)} a tu cuenta de ahorro o gasto.</p>
            </td>` : `
            <td width="100%" valign="top" style="border:1.5px solid #E4EAF3;border-radius:16px;padding:16px">
              <p style="margin:0 0 6px;font-size:14px;font-weight:800;color:#0E2A52">↓ Retirar</p>
              <p style="margin:0;font-size:12px;font-weight:500;color:#5B6B82;line-height:1.5">Este depósito no está marcado como renovable. Mueve los ${fmtCLP(total)} a tu cuenta de ahorro o gasto, o crea un depósito nuevo con la tasa que te ofrezca el banco.</p>
            </td>`}
          </tr>
        </table>

        <!-- CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="text-align:center">
            <a href="${siteUrl}/inversiones?view=ahorro#depositos" class="bm-cta"
              style="display:inline-block;background:#1B6DD4;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 32px;border-radius:12px;letter-spacing:0.1px">
              Ir a mis depósitos
            </a>
          </td></tr>
        </table>

      </td></tr>

      <!-- PIE navy -->
      <tr><td class="bm-footer" bgcolor="#0E2A52" style="background:#0E2A52;padding:28px 40px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="text-align:center;padding-bottom:16px">
            ${brandWordmark(siteUrl)}
          </td></tr>
          <tr><td style="text-align:center;padding-bottom:16px">
            <a href="${siteUrl}" class="bm-footer-link" style="color:#9FB5D4;text-decoration:none;font-size:12px;font-weight:500;margin:0 10px">Abrir app</a>
            <span style="color:#3D5476;font-size:12px">·</span>
            <a href="${siteUrl}/ajustes" class="bm-footer-link" style="color:#9FB5D4;text-decoration:none;font-size:12px;font-weight:500;margin:0 10px">Preferencias</a>
          </td></tr>
          <tr><td class="bm-footer-divider" style="text-align:center;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px">
            <p class="bm-footer-muted" style="margin:0;font-size:11px;font-weight:500;color:#5E7396;line-height:1.6">
              Recibes este correo porque tienes activos los avisos de vencimiento de depósitos.<br>
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
