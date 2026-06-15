import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // En Server Components, setAll puede fallar — está bien
          }
        },
      },
    }
  )
}

/**
 * Lee el usuario desde la cookie JWT sin hacer una llamada de red.
 * Deduplicado con React cache() — si layout y página lo llaman, solo ejecuta 1 vez.
 * Seguro porque el middleware ya validó el token con getUser() antes de llegar aquí.
 */
export const getServerSession = cache(async () => {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
})
