import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { normalizeFeatures } from '@/lib/features'

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
 * Obtiene el usuario validando el JWT contra Supabase Auth.
 * Deduplicado con React cache() — si layout y página lo llaman, solo ejecuta 1 vez.
 * Usa getUser() (no getSession()) para detectar tokens expirados o revocados.
 */
export const getServerSession = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
})

/**
 * Módulos que ve la persona con sesión (profiles.features) y si es admin.
 * Deduplicado por request, igual que getServerSession().
 */
export const getUserAccess = cache(async () => {
  const user = await getServerSession()
  if (!user) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('features, is_admin')
    .eq('id', user.id)
    .maybeSingle()
  // Si las columnas todavía no existen (código desplegado antes de la migración
  // 20261120), no se le esconde nada a nadie: todo encendido, sin admin.
  if (error) {
    return { userId: user.id, features: { inversiones: true, propiedad: true, liquidaciones: true }, isAdmin: false }
  }
  return {
    userId:   user.id,
    features: normalizeFeatures((data as { features?: unknown } | null)?.features),
    isAdmin:  (data as { is_admin?: boolean } | null)?.is_admin === true,
  }
})
