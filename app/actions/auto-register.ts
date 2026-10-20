'use server'

import { createClient } from '@/lib/supabase/server'
import { getNowChile } from '@/lib/utils'
import { registerRecurringForUser } from '@/lib/auto-register-core'
import { cookies } from 'next/headers'

export async function runAutoRegister(): Promise<{ registered: string[] }> {
  // sep 2026 (Cas: "tampoco registro claude ningun gasto recurrente" — el
  // Netflix del 11/9 y varios más llevaban semanas sin registrarse, en
  // MÚLTIPLES dispositivos y después de recargar la app): esta función no
  // logueaba absolutamente nada — ni el motivo de un early-return (sin
  // sesión, bloqueado por la cookie del día), ni los errores de los inserts
  // (`if (!error) insertedNames.push(...)` descartaba el error en silencio).
  // Server Action llamada desde un useEffect sin .catch() en el cliente
  // (AutoRegister.tsx): cualquier excepción acá se perdía como promise
  // rejection silenciosa, sin rastro en ningún lado. Try/catch + logs acá
  // para que la próxima falla, si la hay, quede en get_runtime_logs de
  // Vercel en vez de ser un misterio total otra vez.
  try {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user) {
    console.error('[auto-register] sin sesión de usuario', authError?.message)
    return { registered: [] }
  }

  // Hora de Chile (no UTC): evita registrar con la fecha de "mañana" entre
  // ~20:00-00:00 hora Santiago, que desalinea dedup y período de facturación.
  const { now: today, dateStr: todayStr } = getNowChile()
  const cookieKey   = `auto_reg_${user.id.slice(0, 8)}_${todayStr}`
  const cookieStore = await cookies()

  if (cookieStore.has(cookieKey)) {
    console.log(`[auto-register] ${cookieKey} ya corrió hoy, se salta`)
    return { registered: [] }
  }

  const insertedNames = await registerRecurringForUser(supabase, user.id)

  const midnight = new Date(today)
  midnight.setHours(24, 0, 0, 0)
  cookieStore.set(cookieKey, '1', {
    expires:  midnight,
    httpOnly: true,
    sameSite: 'lax',
    path:     '/',
  })

  if (insertedNames.length > 0) console.log('[auto-register] registrados:', insertedNames)
  return { registered: insertedNames }

  } catch (err) {
    console.error('[auto-register] excepción no capturada:', err instanceof Error ? err.message : err)
    return { registered: [] }
  }
}
