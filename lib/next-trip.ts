import type { SupabaseClient } from '@supabase/supabase-js'
import { budgetTotal, myBudgetShare, type TripBudget } from './trip-plan'
import { requiredMonthlyContribution } from './savings-goals'

// "Próximo viaje" de /inicio: el viaje compartido abierto más cercano en que
// participas (en curso o por salir; si no hay con fecha, el sin fecha más nuevo).

export interface NextTrip {
  id:          string
  name:        string
  startDate:   string | null
  endDate:     string | null
  daysToStart: number | null     // < 0 = ya salió
  inProgress:  boolean
  people:      number
  budgetTotal: number
  myShare:     number            // parte estimada (parejo)
  myPaid:      number            // lo que ya te tocó pagar en el viaje
  goal:        { current: number; target: number } | null
  perMonth:    number | null     // aporte mensual para llegar a la meta a tiempo
}

export function pickNextTrip<T extends { start_date: string | null; end_date: string | null; created_at: string }>(
  groups: T[], today: string,
): T | null {
  const dated = groups
    .filter(g => g.start_date && (g.end_date ?? g.start_date)! >= today)
    .sort((a, b) => a.start_date!.localeCompare(b.start_date!))
  if (dated.length) return dated[0]
  const undated = groups.filter(g => !g.start_date).sort((a, b) => b.created_at.localeCompare(a.created_at))
  return undated[0] ?? null
}

function dayDiff(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)
}

export async function getNextTrip(supabase: SupabaseClient, userId: string, today: string): Promise<NextTrip | null> {
  const { data: mem } = await supabase
    .from('shared_group_members').select('group_id, savings_goal_id')
    .eq('user_id', userId).eq('status', 'accepted')
  if (!mem?.length) return null
  const ids = mem.map(m => m.group_id as string)
  const { data: groups } = await supabase
    .from('shared_groups').select('id, name, start_date, end_date, created_at, budget, planned_people')
    .in('id', ids).is('closed_at', null)
  const g = pickNextTrip(groups ?? [], today)
  if (!g) return null

  const goalId = mem.find(m => m.group_id === g.id)?.savings_goal_id as string | null | undefined
  const [{ count }, { data: myShares }, { data: goalRow }] = await Promise.all([
    supabase.from('shared_group_members').select('user_id', { count: 'exact', head: true }).eq('group_id', g.id).eq('status', 'accepted'),
    supabase.from('shared_expense_shares').select('share').eq('group_id', g.id).eq('user_id', userId),
    goalId
      ? supabase.from('savings_goals').select('target_amount, current_amount, target_date').eq('id', goalId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const people = Math.max(count ?? 1, (g.planned_people as number | null) ?? 1, 1)
  const total = budgetTotal((g.budget ?? {}) as TripBudget)
  const goal = goalRow ? { current: goalRow.current_amount as number, target: goalRow.target_amount as number } : null
  return {
    id: g.id as string, name: g.name as string,
    startDate: g.start_date, endDate: g.end_date,
    daysToStart: g.start_date ? dayDiff(today, g.start_date) : null,
    inProgress: !!g.start_date && g.start_date <= today,
    people, budgetTotal: total,
    myShare: myBudgetShare(total, people, null),
    myPaid: (myShares ?? []).reduce((s, r) => s + (r.share as number), 0),
    goal,
    perMonth: goalRow
      ? requiredMonthlyContribution(
          { targetAmount: goalRow.target_amount as number, currentAmount: goalRow.current_amount as number, targetDate: g.start_date },
          today)
      : null,
  }
}
