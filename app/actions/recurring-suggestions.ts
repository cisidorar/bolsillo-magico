'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: true; id: string } | { ok: false; error: string }

/**
 * Crea el recurrente que propuso la detección (lib/recurring-detect.ts) y
 * enlaza los gastos del historial a él. El enlace importa: sin él, el
 * recurrente nacería "sin pagos" y la app marcaría como atrasados cobros que
 * en realidad ya se registraron a mano.
 *
 * No se registra solo (auto_register = false): estos cobros suelen variar con
 * el dólar o el consumo, y registrar un monto fijo equivocado es peor que
 * pedir que se confirme el real.
 */
export async function createRecurringFromSuggestion(input: {
  name: string
  amount: number
  billingDay: number
  intervalMonths: number
  categoryId: string | null
  paymentMethodId: string | null
  expenseIds: string[]
}): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Vuelve a entrar.' }

  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Falta el nombre.' }
  if (!Number.isInteger(input.amount) || input.amount <= 0) return { ok: false, error: 'El monto no es válido.' }
  if (!Number.isInteger(input.billingDay) || input.billingDay < 1 || input.billingDay > 28) return { ok: false, error: 'El día no es válido.' }
  if (![1, 2, 3, 6].includes(input.intervalMonths)) return { ok: false, error: 'La frecuencia no es válida.' }

  // Evita duplicar si se toca dos veces o ya lo creó desde otro dispositivo.
  const { data: dup } = await supabase
    .from('recurring_expenses').select('id').eq('user_id', user.id).ilike('name', name).maybeSingle()
  if (dup) return { ok: false, error: 'Ya existe un recurrente con ese nombre.' }

  const { data: created, error } = await supabase
    .from('recurring_expenses')
    .insert({
      user_id: user.id, name, amount: input.amount, billing_day: input.billingDay,
      interval_months: input.intervalMonths, category_id: input.categoryId,
      payment_method_id: input.paymentMethodId, auto_register: false, is_active: true,
    })
    .select('id').single()
  if (error || !created) return { ok: false, error: 'No se pudo crear el recurrente. Intenta de nuevo.' }

  if (input.expenseIds.length > 0) {
    await supabase
      .from('expenses').update({ recurring_expense_id: created.id })
      .eq('user_id', user.id).is('recurring_expense_id', null).in('id', input.expenseIds)
  }

  revalidatePath('/recurrentes')
  revalidatePath('/inicio')
  return { ok: true, id: created.id as string }
}
