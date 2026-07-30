'use server'

import { getServerSession, createClient } from '@/lib/supabase/server'

// Antes esto era fire-and-forget y silenciaba cualquier error: si el upsert
// fallaba (red, RLS, lo que sea), el toggle igual mostraba "activado" en el
// dispositivo actual (localStorage + clase en <html>) pero profiles.theme
// nunca se actualizaba en la base — el próximo login desde otro dispositivo
// (celular) leía el valor viejo y el modo oscuro "no estaba guardado" sin
// ningún aviso. Ahora devuelve { ok } para que ThemeToggle pueda avisar.
export async function saveThemeAction(theme: 'light' | 'dark'): Promise<{ ok: boolean }> {
  try {
    const [user, supabase] = await Promise.all([getServerSession(), createClient()])
    if (!user) return { ok: false }
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, theme }, { onConflict: 'id' })
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}
