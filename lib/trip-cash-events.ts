import type { SupabaseClient } from '@supabase/supabase-js'
import type { CashFlowEvent } from './cash-flow'

/**
 * Pagos programados de viajes compartidos (aún sin pagar, con fecha) como
 * eventos del flujo de caja. El monto es TU parte estimada: el estimado se
 * reparte parejo entre max(miembros, personas planeadas); el reparto real se
 * calcula al pagar.
 */
export async function getTripCashEvents(supabase: SupabaseClient, userId: string): Promise<CashFlowEvent[]> {
  const { data: mem } = await supabase
    .from('shared_group_members').select('group_id').eq('user_id', userId).eq('status', 'accepted')
  const ids = (mem ?? []).map(m => m.group_id as string)
  if (!ids.length) return []
  const [{ data: items }, { data: groups }, { data: members }] = await Promise.all([
    supabase.from('shared_plan_items').select('group_id, description, est_amount, due_date')
      .in('group_id', ids).is('paid_at', null).not('due_date', 'is', null),
    supabase.from('shared_groups').select('id, name, planned_people, closed_at').in('id', ids),
    supabase.from('shared_group_members').select('group_id').in('group_id', ids).eq('status', 'accepted'),
  ])
  const gm = new Map((groups ?? []).map(g => [g.id as string, g]))
  const count = new Map<string, number>()
  for (const m of members ?? []) count.set(m.group_id as string, (count.get(m.group_id as string) ?? 0) + 1)
  const out: CashFlowEvent[] = []
  for (const it of items ?? []) {
    const g = gm.get(it.group_id as string)
    if (!g || g.closed_at) continue
    const people = Math.max(count.get(g.id as string) ?? 1, (g.planned_people as number | null) ?? 1, 1)
    out.push({
      date: it.due_date as string, type: 'trip', label: it.description as string,
      sublabel: `viaje ${g.name}`, amount: -Math.ceil((it.est_amount as number) / people),
    })
  }
  return out
}
