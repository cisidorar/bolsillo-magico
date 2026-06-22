'use server'

import { getServerSession, createClient } from '@/lib/supabase/server'

export async function saveThemeAction(theme: 'light' | 'dark') {
  try {
    const [user, supabase] = await Promise.all([getServerSession(), createClient()])
    if (!user) return
    await supabase
      .from('profiles')
      .upsert({ id: user.id, theme }, { onConflict: 'id' })
  } catch {
    // Non-critical — localStorage still works as fallback
  }
}
