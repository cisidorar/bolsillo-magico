'use server'

import { createClient, getServerSession } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ── "Marcar como único" ────────────────────────────────────────────────────
// El usuario confirma que un gasto (viaje, evento puntual) es excepcional y
// no debe volver a distorsionar el análisis mensual. NO toca ningún monto
// visible (historial, presupuesto vs categoría siguen mostrando la plata
// real gastada) — solo apaga la señal para /api/analyze-month, que deja de
// usar ese gasto como evidencia de "categoría sobre presupuesto" o de un
// patrón de comportamiento (ver CLAUDE.md y migración 20260725).
export async function markExpensesAsExceptional(
  expenseIds: string[],
  insightId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getServerSession()
  if (!user) return { ok: false, error: 'unauthorized' }

  if (!Array.isArray(expenseIds) || expenseIds.length === 0 || expenseIds.some(id => typeof id !== 'string')) {
    return { ok: false, error: 'invalid_expense_ids' }
  }

  const supabase = await createClient()

  // RLS + filtro explícito por user_id: solo marca gastos que de verdad son
  // del usuario autenticado, sin confiar únicamente en la policy.
  const { error: updateError } = await supabase
    .from('expenses')
    .update({ excluded_from_analysis: true })
    .eq('user_id', user.id)
    .in('id', expenseIds)

  if (updateError) return { ok: false, error: 'update_failed' }

  // La oportunidad ya cumplió su propósito — se descarta para que no siga
  // ocupando uno de los 5 espacios del mes (mismo patrón que el feedback de
  // "no me sirve": status='dismissed').
  if (insightId) {
    await supabase
      .from('monthly_insights')
      .update({ status: 'dismissed' })
      .eq('user_id', user.id)
      .eq('id', insightId)
  }

  revalidatePath('/analisis')
  return { ok: true }
}
