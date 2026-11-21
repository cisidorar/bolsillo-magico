import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Destino del enlace de los correos de invitación y de recuperación.
// Requiere que las plantillas de Supabase apunten acá:
//   https://bolsillomagico.com/api/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=%2Fupdate-password%3Fwelcome%3D1
//
// Dos pasos a propósito (GET muestra un botón, POST verifica el token):
// Hotmail/Outlook, Gmail y los antivirus de correo "abren" los enlaces antes que la
// persona para revisarlos. Si el GET verificara el token, ese robot lo gastaría y la
// persona vería «este enlace ya se usó» sin haber hecho nada. Un robot hace GET, pero no
// aprieta botones.

// Solo los dos tipos de enlace que la app manda: cualquier otro no tiene razón de pasar por acá.
const ALLOWED: EmailOtpType[] = ['invite', 'recovery']

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/** Solo rutas internas, para no abrir un redirect hacia afuera. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/inicio'
}

function parse(source: URLSearchParams | FormData) {
  const tokenHash = (source.get('token_hash') as string | null) ?? ''
  const type = (source.get('type') as string | null) ?? ''
  const next = safeNext(source.get('next') as string | null)
  const valid = tokenHash.length > 0 && tokenHash.length < 200 && (ALLOWED as string[]).includes(type)
  return { tokenHash, type: type as EmailOtpType, next, valid }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const { tokenHash, type, next, valid } = parse(searchParams)
  if (!valid) return NextResponse.redirect(`${origin}/login?error=1`)

  const invite = type === 'invite'
  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${invite ? 'Crea tu cuenta' : 'Cambia tu clave'} · Bolsillo Mágico</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;
       font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#EEF4FF;color:#0E2A52}
  .card{width:100%;max-width:380px;background:#fff;border-radius:24px;padding:32px 28px;text-align:center;box-shadow:0 8px 30px rgba(14,42,82,.10)}
  img{width:48px;height:48px;border-radius:12px}
  h1{font-size:22px;margin:18px 0 8px}
  p{font-size:14px;line-height:1.6;color:#5B6B82;margin:0 0 24px}
  button{width:100%;min-height:52px;border:0;border-radius:14px;background:#2B7CF6;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
  button:active{transform:scale(.98)}
  @media (prefers-color-scheme:dark){body{background:#0A1326;color:#E8EEF8}.card{background:#111D36;box-shadow:none}p{color:#9FB0CB}}
</style></head>
<body><main class="card">
  <img src="/bolsillo-magico-icono.svg" alt="">
  <h1>${invite ? 'Te damos la bienvenida' : 'Cambia tu clave'}</h1>
  <p>${invite ? 'Un paso más: toca el botón para crear tu cuenta y elegir tu clave.' : 'Toca el botón para elegir una clave nueva.'}</p>
  <form method="POST" action="/api/auth/confirm">
    <input type="hidden" name="token_hash" value="${esc(tokenHash)}">
    <input type="hidden" name="type" value="${esc(type)}">
    <input type="hidden" name="next" value="${esc(next)}">
    <button type="submit">Continuar</button>
  </form>
</main></body></html>`

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  })
}

export async function POST(request: Request) {
  const { origin } = new URL(request.url)
  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.redirect(`${origin}/login?error=1`, 303) }
  const { tokenHash, type, next, valid } = parse(form)

  if (valid) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host')
      const base = process.env.NODE_ENV !== 'development' && forwardedHost ? `https://${forwardedHost}` : origin
      return NextResponse.redirect(`${base}${next}`, 303)
    }
  }
  return NextResponse.redirect(`${origin}/login?error=1`, 303)
}
