import type { SupabaseClient } from '@supabase/supabase-js'

// Aplica un reajuste de arriendo (rent_adjustments → contrato y cobros). Lo usan
// la acción "Confirmar reajuste" de la app y el cron, que lo aplica solo el
// primer día del mes del reajuste (el contrato lo manda automáticamente: la
// confirmación manual es opcional, no un requisito).
//   · la renta del contrato pasa a la nueva y last_adjustment_date al mes del reajuste
//     (así el próximo cae 6 meses después);
//   · los arriendos AÚN NO PAGADOS desde ese mes se actualizan; los ya pagados no se tocan.

export async function applyRentAdjustmentCore(
  supabase: SupabaseClient,
  userId: string,
  adjustmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: adj } = await supabase
    .from('rent_adjustments')
    .select('id, lease_id, adjustment_month, new_rent, applied_at')
    .eq('id', adjustmentId).eq('user_id', userId).single()
  if (!adj) return { ok: false, error: 'No se encontró el reajuste' }
  if (adj.applied_at) return { ok: false, error: 'Este reajuste ya estaba confirmado' }

  const { data: lease } = await supabase
    .from('lease_contracts').select('id, property_id')
    .eq('id', adj.lease_id).eq('user_id', userId).single()
  if (!lease) return { ok: false, error: 'No se encontró el contrato' }

  const { error: leaseErr } = await supabase.from('lease_contracts')
    .update({ rent_amount: adj.new_rent, last_adjustment_date: adj.adjustment_month, updated_at: new Date().toISOString() })
    .eq('id', lease.id).eq('user_id', userId)
  if (leaseErr) return { ok: false, error: leaseErr.message }

  const [ay, am] = String(adj.adjustment_month).split('-').map(Number)
  const { data: unpaid } = await supabase
    .from('property_charges').select('id, period_year, period_month')
    .eq('user_id', userId).eq('property_id', lease.property_id)
    .eq('kind', 'rent').is('paid_date', null)
  const ids = (unpaid ?? [])
    .filter(c => c.period_year * 12 + c.period_month >= ay * 12 + am)
    .map(c => c.id)
  if (ids.length > 0) {
    const { error: chErr } = await supabase.from('property_charges')
      .update({ amount: adj.new_rent }).in('id', ids).eq('user_id', userId)
    if (chErr) return { ok: false, error: chErr.message }
  }

  await supabase.from('rent_adjustments')
    .update({ applied_at: new Date().toISOString() }).eq('id', adj.id).eq('user_id', userId)
  return { ok: true }
}
