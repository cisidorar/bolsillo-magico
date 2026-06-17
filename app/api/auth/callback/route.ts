import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Validar next para evitar open redirect: solo rutas internas
  const rawNext = searchParams.get('next') ?? '/inicio'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/inicio'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Crear categorías y métodos de pago por defecto en el primer login
      await supabase.rpc('seed_user_defaults', { p_user_id: data.user.id })

      // Si el usuario ingresó su nombre al registrarse, guardarlo en profiles
      const displayName = data.user.user_metadata?.display_name as string | undefined
      if (displayName?.trim()) {
        await supabase
          .from('profiles')
          .update({ display_name: displayName.trim() })
          .eq('id', data.user.id)
      }

      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
