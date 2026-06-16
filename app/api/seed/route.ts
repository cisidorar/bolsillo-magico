import { NextResponse } from 'next/server'
import { createClient, getServerSession } from '@/lib/supabase/server'

/**
 * POST /api/seed
 * Llama a seed_user_defaults para el usuario autenticado.
 * Idempotente: la función SQL no crea categorías si ya existen.
 * Se llama desde el cliente después de login exitoso como fallback
 * para usuarios que no pasaron por el flujo de confirmación de email.
 */
export async function POST() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase.rpc('seed_user_defaults', { p_user_id: user.id })
  return NextResponse.json({ ok: true })
}
