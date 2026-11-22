import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * ¿Esta cuenta tiene de dónde sacar su ingreso para repartir un viaje según sueldo?
 * Ingresos registrados, ingreso declarado para viajes o una liquidación de sueldo.
 */
export async function hasTripIncome(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const [inc, decl, pay] = await Promise.all([
    supabase.from('incomes').select('id', { count: 'exact', head: true }).eq('user_id', userId).gt('amount', 0),
    supabase.from('shared_declared_income').select('user_id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('payslips').select('id', { count: 'exact', head: true }).eq('user_id', userId).gt('liquido', 0),
  ])
  return (inc.count ?? 0) > 0 || (decl.count ?? 0) > 0 || (pay.count ?? 0) > 0
}

export type TripIncomeSource =
  | { kind: 'incomes'; months: number }   // promedio de tus últimos meses cerrados registrados en Ingresos
  | { kind: 'latest' }                    // solo hay un ingreso registrado (o solo del mes en curso)
  | { kind: 'payslip' }                   // tu última liquidación de sueldo
  | { kind: 'declared' }                  // el monto que declaraste al unirte a un viaje

/** Misma prioridad que usa la base para calcular el reparto: Ingresos, liquidación, ingreso declarado. */
export async function tripIncomeSource(supabase: SupabaseClient, userId: string, today: string): Promise<TripIncomeSource | null> {
  const ym = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7))
  const { data: inc } = await supabase.from('incomes').select('year, month, amount').eq('user_id', userId).gt('amount', 0)
    .order('year', { ascending: false }).order('month', { ascending: false }).limit(12)
  const rows = (inc ?? []) as { year: number; month: number; amount: number }[]
  const closed = rows.filter(r => r.year * 12 + r.month < ym).length
  if (closed > 0) return { kind: 'incomes', months: Math.min(closed, 6) }
  if (rows.length > 0) return { kind: 'latest' }
  const { count: pay } = await supabase.from('payslips').select('id', { count: 'exact', head: true }).eq('user_id', userId).gt('liquido', 0)
  if ((pay ?? 0) > 0) return { kind: 'payslip' }
  const { count: decl } = await supabase.from('shared_declared_income').select('user_id', { count: 'exact', head: true }).eq('user_id', userId)
  return (decl ?? 0) > 0 ? { kind: 'declared' } : null
}
