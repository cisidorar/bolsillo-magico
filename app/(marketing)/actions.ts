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
  // Avisa a los admins por correo (edge function notify-waitlist). No bloquea ni rompe el
  // formulario si falla: la solicitud ya quedó guardada y se ve igual en /admin.
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (url && anon) {
      await fetch(`${url}/functions/v1/notify-waitlist`, {
        method: 'POST', headers: { Authorization: `Bearer ${anon}` }, signal: AbortSignal.timeout(8000),
      })
    }
  } catch (e) {
    console.error('[waitlist] aviso a admins falló:', e)
  }
  return { ok: true }
}
