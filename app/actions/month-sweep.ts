'use server'

import { createClient } from '@/lib/supabase/server'

export type SweepDecision = 'saved' | 'wallet_usd' | 'kept_liquid' | 'dismissed'

/**
 * P2 — registra qué hizo el usuario con el sobrante de un mes ya cerrado.
 * No mueve plata por sí sola (el usuario sigue actualizando sus saldos
 * manualmente en /inversiones); esto solo cierra el loop de seguimiento para
 * que la tasa de ahorro deje de ser un número que se pierde en el aire.
 */
export async function recordMonthSweep(
  month: number,
  year: number,
  surplusAmount: number,
  decision: SweepDecision,
): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const { error } = await supabase.from('month_sweeps').upsert(
    { user_id: user.id, month, year, surplus_amount: surplusAmount, decision },
    { onConflict: 'user_id,month,year' },
  )

  return { ok: !error }
}
