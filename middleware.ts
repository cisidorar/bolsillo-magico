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

  // Nov 2026: "/" vuelve a ser la landing pública para quien no tiene sesión
  // (el registro sigue cerrado: la landing lleva a la demo y a la lista de
  // espera). Con sesión, directo al dashboard.
  // `?landing=1` deja ver la landing aun con sesión (para mostrarla o revisarla).
  if (request.nextUrl.pathname === '/' && user && !request.nextUrl.searchParams.has('landing')) {
    return NextResponse.redirect(new URL('/inicio', request.url))
  }

  // Rutas protegidas: redirigir a login si no está autenticado. Cada página
  // del dashboard además se protege sola vía getServerSession() (defensa en
  // profundidad) — esta lista solo evita el flash de contenido antes de esa
  // redirección server-side. Completa con /cuenta, /ingresos e /inversiones,
  // que faltaban (A2, roadmap uso personal, jul 2026).
  const protectedPaths = [
    '/inicio', '/historial', '/analisis', '/ajustes', '/recurrentes',
    '/presupuesto', '/categorias', '/metodos', '/cuenta', '/ingresos', '/inversiones',
    '/propiedad', '/compartidos', '/admin', '/bienvenida',
  ]
  const isProtected = protectedPaths.some(p =>
    request.nextUrl.pathname === p || request.nextUrl.pathname.startsWith(p + '/')
  )

  if (!user && isProtected) {
    // Se recuerda a dónde iba (un enlace a un viaje, un gasto...) para volver
    // ahí después de iniciar sesión, en vez de caer siempre en /inicio.
    const loginUrl = new URL('/login', request.url)
    const dest = request.nextUrl.pathname + request.nextUrl.search
    if (dest !== '/inicio') loginUrl.searchParams.set('next', dest)
    return NextResponse.redirect(loginUrl)
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
