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
