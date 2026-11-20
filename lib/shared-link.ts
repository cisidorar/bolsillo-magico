import { groupBalance, suggestedTransfers } from '@/lib/shared-split'

// Vista pública de un viaje (enlace de solo lectura, fase 2). Los datos vienen de
// la función SQL shared_link_view: no incluye sueldos, solo el peso de cada uno.

export interface LinkView {
  group:       { name: string; start_date: string | null; end_date: string | null; closed_at: string | null; split_mode: 'equal' | 'income' }
  expires_at:  string
  weights:     Record<string, number>
  members:     { id: string; name: string; is_guest: boolean }[]
  expenses:    { id: string; description: string; date: string; amount: number; paid_by: string; trip_category: string; shares: Record<string, number> }[]
  settlements: { from_user: string; to_user: string; amount: number; date: string }[]
}

export interface LinkSummary {
  total:     number
  /** % de cada persona (suma 100), solo si el reparto es según sueldo */
  pct:       { id: string; name: string; pct: number }[] | null
  balances:  { id: string; name: string; paid: number; share: number; net: number }[]
  transfers: { from: string; to: string; amount: number }[]
}

export function summarizeLink(v: LinkView): LinkSummary {
  const ids = v.members.map(m => m.id)
  const name = (id: string) => v.members.find(m => m.id === id)?.name ?? 'Alguien'
  const bal = groupBalance(
    v.expenses.map(e => ({ amount: e.amount, paid_by: e.paid_by, shares: e.shares })),
    v.settlements, ids,
  )
  const totalW = ids.reduce((s, id) => s + (v.weights[id] ?? 0), 0)
  const pct = v.group.split_mode === 'income' && totalW > 0
    ? v.members.map(m => ({ id: m.id, name: m.name, pct: Math.round(((v.weights[m.id] ?? 0) / totalW) * 1000) / 10 }))
    : null
  return {
    total: bal.total,
    pct,
    balances: v.members.map(m => ({ id: m.id, name: m.name, paid: bal.paid[m.id] ?? 0, share: bal.share[m.id] ?? 0, net: bal.net[m.id] ?? 0 })),
    transfers: suggestedTransfers(bal.net).map(t => ({ from: name(t.from), to: name(t.to), amount: t.amount })),
  }
}
