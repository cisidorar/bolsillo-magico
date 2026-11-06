'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getServerSession } from '@/lib/supabase/server'
import { validateSplit } from '@/lib/receivables'

// ── Por cobrar (supabase/migrations/20261106_expense_receivables.sql) ────────
// Lo que cambia amount/card_extra del gasto pasa por funciones SQL atómicas
// (receivables_*) para que la invariante amount + card_extra = cobro de la
// tarjeta nunca quede a medias. Marcar "recibido" es un update simple (RLS).
// Los mensajes de error de esas funciones ya vienen en español.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

function revalidateAll() {
  for (const p of ['/inicio', '/historial', '/compartidos', '/analisis', '/presupuesto', '/metodos']) revalidatePath(p)
}

function clean(message: string | undefined): string {
  if (!message) return 'No se pudo completar. Intenta de nuevo.'
  // Errores propios (RAISE EXCEPTION) llegan tal cual; los técnicos, genéricos.
  return /^[A-ZÁÉÍÓÚ¿]/.test(message) && !/violates|permission|syntax|column|relation/i.test(message)
    ? message
    : 'No se pudo completar. Intenta de nuevo.'
}

async function call(fn: string, args: Record<string, unknown>): Promise<Result> {
  const user = await getServerSession()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Vuelve a entrar.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, error: clean(error.message) }
  revalidateAll()
  return { ok: true }
}

export interface SplitPersonInput { id: string | null; name: string; amount: number }

/** Guarda el reparto de un gasto: quiénes te deben y cuánto. `total` = lo que cobró la tarjeta. */
export async function saveSplit(expenseId: string, total: number, people: SplitPersonInput[]): Promise<Result> {
  const v = validateSplit(total, people)
  if (!v.ok) return { ok: false, error: v.error! }
  return call('receivables_save_split', {
    p_expense_id: expenseId,
    p_people: people.map(p => ({ id: p.id, name: p.name.trim(), amount: p.amount })),
  })
}

export async function removeSplit(expenseId: string): Promise<Result> {
  return call('receivables_remove_split', { p_expense_id: expenseId })
}

/** "No me lo va a pagar": esa parte pasa a ser gasto tuyo. */
export async function forgiveReceivable(id: string): Promise<Result> {
  return call('receivables_forgive', { p_id: id })
}

export async function unforgiveReceivable(id: string): Promise<Result> {
  return call('receivables_unforgive', { p_id: id })
}

/** Te transfirió: cierra la deuda. No es ingreso ni toca el gasto. */
export async function markReceived(ids: string[], date: string, paymentMethodId: string | null): Promise<Result> {
  const user = await getServerSession()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Vuelve a entrar.' }
  if (ids.length === 0) return { ok: true }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Fecha inválida' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('expense_receivables')
    .update({ received_at: date, received_payment_method_id: paymentMethodId })
    .in('id', ids)
    .is('received_at', null)
    .eq('forgiven', false)
  if (error) return { ok: false, error: clean(error.message) }
  revalidateAll()
  return { ok: true }
}

export async function undoReceived(id: string): Promise<Result> {
  const user = await getServerSession()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Vuelve a entrar.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('expense_receivables')
    .update({ received_at: null, received_payment_method_id: null })
    .eq('id', id)
  if (error) return { ok: false, error: clean(error.message) }
  revalidateAll()
  return { ok: true }
}
