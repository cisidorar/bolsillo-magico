import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() valida el JWT contra el servidor de Supabase Auth (~1 llamada de red).
  // Necesario para detectar tokens expirados o revocados antes de servir rutas protegidas.
  // La seguridad de datos la provee RLS en Supabase; este middleware solo enruta.
  const { data: { user } } = await supabase.auth.getUser()

  // A2/A3 (roadmap uso personal, jul 2026): sin landing pública ni /demo —
  // la app es de uso personal, "/" va directo al login (o al dashboard si ya
  // hay sesión), no hay nada público que mostrarle a un visitante anónimo.
  if (request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL(user ? '/inicio' : '/login', request.url))
  }

  // Rutas protegidas: redirigir a login si no está autenticado. Cada página
  // del dashboard además se protege sola vía getServerSession() (defensa en
  // profundidad) — esta lista solo evita el flash de contenido antes de esa
  // redirección server-side. Completa con /cuenta, /ingresos e /inversiones,
  // que faltaban (A2, roadmap uso personal, jul 2026).
  const protectedPaths = [
    '/inicio', '/historial', '/analisis', '/ajustes', '/recurrentes',
    '/presupuesto', '/categorias', '/metodos', '/cuenta', '/ingresos', '/inversiones',
  ]
  const isProtected = protectedPaths.some(p =>
    request.nextUrl.pathname === p || request.nextUrl.pathname.startsWith(p + '/')
  )

  if (!user && isProtected) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Si ya está autenticado y va al login, redirigir al dashboard
  if (user && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/inicio', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
