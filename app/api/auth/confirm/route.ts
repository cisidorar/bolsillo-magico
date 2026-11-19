import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Destino del enlace de los correos de invitación y de recuperación. Verifica
// el token del correo (token_hash) y deja a la persona con sesión en `next`.
// Requiere que las plantillas de Supabase apunten acá:
//   {{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/update-password
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  // Solo rutas internas, para no abrir un redirect hacia afuera.
  const rawNext = searchParams.get('next') ?? '/inicio'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/inicio'

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host')
      const base = process.env.NODE_ENV !== 'development' && forwardedHost ? `https://${forwardedHost}` : origin
      return NextResponse.redirect(`${base}${next}`)
    }
  }
  return NextResponse.redirect(`${origin}/login?error=1`)
}
