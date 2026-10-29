import type { SupabaseClient } from '@supabase/supabase-js'
import { groupBalance } from '@/lib/shared-split'

export interface SharedPosition {
  owed: number   // lo que te deben (grupos abiertos)
  owe: number    // lo que debes
  groups: { id: string; name: string; net: number }[]  // solo con saldo pendiente
}

/** Saldo neto del usuario en sus viajes compartidos abiertos (mismo cálculo que /compartidos). */
export async function fetchSharedPosition(supabase: SupabaseClient, userId: string): Promise<SharedPosition> {
  const empty: SharedPosition = { owed: 0, owe: 0, groups: [] }
  const [{ data: groupsRaw }, { data: membersRaw }] = await Promise.all([
    supabase.from('shared_groups').select('id, name, closed_at'),
    supabase.from('shared_group_members').select('group_id, user_id, status'),
  ])
  const members = (membersRaw ?? []) as { group_id: string; user_id: string; status: string }[]
  const mineIds = new Set(members.filter(m => m.user_id === userId && m.status === 'accepted').map(m => m.group_id))
  const groups = ((groupsRaw ?? []) as { id: string; name: string; closed_at: string | null }[])
    .filter(g => mineIds.has(g.id) && !g.closed_at)
  if (groups.length === 0) return empty

  const ids = groups.map(g => g.id)
  const [{ data: exp }, { data: shares }, { data: sets }] = await Promise.all([
    supabase.from('shared_expenses').select('id, group_id, amount, paid_by').in('group_id', ids),
    supabase.from('shared_expense_shares').select('expense_id, user_id, share').in('group_id', ids),
    supabase.from('shared_settlements').select('group_id, from_user, to_user, amount').in('group_id', ids),
  ])

  const out: SharedPosition = { owed: 0, owe: 0, groups: [] }
  for (const g of groups) {
    const gExp = ((exp ?? []) as { id: string; group_id: string; amount: number; paid_by: string }[]).filter(e => e.group_id === g.id)
    const gSet = ((sets ?? []) as { group_id: string; from_user: string; to_user: string; amount: number }[]).filter(s => s.group_id === g.id)
    const memberIds = members.filter(m => m.group_id === g.id && m.status === 'accepted').map(m => m.user_id)
    const bal = groupBalance(
      gExp.map(e => ({
        amount: e.amount, paid_by: e.paid_by,
        shares: Object.fromEntries(((shares ?? []) as { expense_id: string; user_id: string; share: number }[])
          .filter(x => x.expense_id === e.id).map(x => [x.user_id, x.share])),
      })),
      gSet, memberIds,
    )
    const net = bal.net[userId] ?? 0
    if (net === 0) continue
    out.groups.push({ id: g.id, name: g.name, net })
    if (net > 0) out.owed += net; else out.owe += -net
  }
  return out
}
