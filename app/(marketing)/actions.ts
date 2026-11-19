'use server'

import { createClient } from '@/lib/supabase/server'

export type WaitlistResult = { ok: true } | { ok: false; error: string }

// La lista de espera de la landing. Toda la validación real vive en
// join_waitlist() (SECURITY DEFINER, migración 20261119e); acá solo se filtra
// lo obvio para no gastar una llamada, y el campo trampa ("website") que un
// humano nunca ve ni llena.
export async function joinWaitlist(formData: FormData): Promise<WaitlistResult> {
  if (String(formData.get('website') ?? '').trim() !== '') return { ok: true }

  const email = String(formData.get('email') ?? '').trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return { ok: false, error: 'Revisa el correo: parece que le falta algo.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('join_waitlist', {
    p_email: email,
    p_source: String(formData.get('source') ?? 'landing'),
  })
  if (error) {
    console.error('[waitlist] join_waitlist falló:', error.message)
    return { ok: false, error: 'No pudimos guardar tu correo. Inténtalo de nuevo en un rato.' }
  }
  return { ok: true }
}
