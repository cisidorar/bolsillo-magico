import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plane, ChevronRight } from 'lucide-react'
import { formatCLP, getNowChile, type DateFormat } from '@/lib/utils'
import { groupBalance, suggestedTransfers, tripStage } from '@/lib/shared-split'
import type { SharedGroup, SharedMemberRow, SharedExpenseRow, SharedShareRow, SettlementRow, SharedMemberInfo } from '@/lib/shared-types'
import type { Category, PaymentMethod } from '@/types'
import SharedTripView from '@/components/SharedTripView'
import { monthlyCapacity } from '@/lib/trip-plan'
import type { TripGoal } from '@/components/TripPlanCard'
import SharedInviteCard from '@/components/SharedInviteCard'
import NewTripButton from '@/components/NewTripButton'
import MyHandle from '@/components/MyHandle'

export const dynamic = 'force-dynamic'

// ── Gastos compartidos (docs/PLAN_GASTOS_COMPARTIDOS.md) ────────────────────
// Un viaje compartido entre una o más personas de la app (se invita después). Esta página solo lee lo
// que la RLS deja ver (viajes de los que eres miembro o invitado); todo lo que
// escribe pasa por funciones de la base (app/actions/shared.ts).

const STAGE_LABEL = {
  planning: 'Planificando', traveling: 'En viaje',
  settling: 'Por saldar', closed: 'Cerrado',
} as const

function fmtRange(start: string | null, end: string | null): string {
  const f = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
  if (start && end) return `${f(start)} al ${f(end)}`
  if (start) return `Desde el ${f(start)}`
  return 'Sin fechas'
}

export default async function CompartidosPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string }>
}) {
  const [user, supabase, params] = await Promise.all([getServerSession(), createClient(), searchParams])
  if (!user) redirect('/login')
  const today = getNowChile().dateStr

  const [{ data: groupsRaw }, { data: membersRaw }] = await Promise.all([
    supabase.from('shared_groups').select('*').order('created_at', { ascending: false }),
    supabase.from('shared_group_members').select('group_id, user_id, status, income_consent, personal_category_id, savings_goal_id'),
  ])
  const groups  = (groupsRaw ?? []) as SharedGroup[]
  const members = (membersRaw ?? []) as SharedMemberRow[]

  // Invitaciones: grupos en que mi fila está pendiente
  const pendingIds = new Set(members.filter(m => m.status === 'pending' && m.user_id === user.id).map(m => m.group_id))
  const invites = groups.filter(g => pendingIds.has(g.id))
  const mine = groups.filter(g => !pendingIds.has(g.id))

  // ── Detalle de un viaje ───────────────────────────────────────────────────
  const selected = params.g ? mine.find(g => g.id === params.g) : undefined
  if (selected) {
    const [{ data: expRaw }, { data: shareRaw }, { data: setRaw }, { data: namesRaw }, { data: wRaw }, { data: cats }, { data: pms }, { data: prefRow }] = await Promise.all([
      supabase.from('shared_expenses').select('*').eq('group_id', selected.id),
      supabase.from('shared_expense_shares').select('*').eq('group_id', selected.id),
      supabase.from('shared_settlements').select('*').eq('group_id', selected.id).order('date', { ascending: false }),
      supabase.rpc('shared_member_names', { p_group: selected.id }),
      supabase.rpc('shared_group_weights', { p_group: selected.id }),
      supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order'),
      supabase.from('payment_methods').select('*').eq('user_id', user.id).order('sort_order'),
      supabase.from('profiles').select('date_format').eq('id', user.id).maybeSingle(),
    ])
    // ¿Cuánto ahorras al mes? Promedio de los últimos 3 meses cerrados
    // (ingreso registrado − gastos que cuentan para análisis). Es solo tuyo.
    const now = new Date(today + 'T12:00:00')
    const months = [1, 2, 3].map(k => {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1)
      return { month: d.getMonth() + 1, year: d.getFullYear() }
    })
    const from = `${months[2].year}-${String(months[2].month).padStart(2, '0')}-01`
    const to   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const myMember = members.find(m => m.group_id === selected.id && m.user_id === user.id)
    const [{ data: incRaw }, { data: spRaw }, { data: goalRow }] = await Promise.all([
      supabase.from('incomes').select('amount, month, year').eq('user_id', user.id).gte('year', months[2].year),
      supabase.from('expenses').select('amount, date').eq('user_id', user.id)
        .gte('date', from).lt('date', to).or('excluded_from_analysis.is.null,excluded_from_analysis.eq.false'),
      myMember?.savings_goal_id
        ? supabase.from('savings_goals').select('id, target_amount, current_amount, target_date').eq('id', myMember.savings_goal_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    const capacity = monthlyCapacity(months.map(m => {
      const key = `${m.year}-${String(m.month).padStart(2, '0')}`
      return {
        income: (incRaw ?? []).filter(i => i.month === m.month && i.year === m.year).reduce((s, i) => s + (i.amount as number), 0),
        spent:  (spRaw ?? []).filter(e => (e.date as string).startsWith(key)).reduce((s, e) => s + (e.amount as number), 0),
      }
    }))

    const weights: Record<string, number> = {}
    for (const w of (wRaw ?? []) as { user_id: string; w: number | string }[]) weights[w.user_id] = Number(w.w)

    return (
      <SharedTripView
        group={selected}
        meId={user.id}
        members={(namesRaw ?? []) as SharedMemberInfo[]}
        expenses={(expRaw ?? []) as SharedExpenseRow[]}
        shares={(shareRaw ?? []) as SharedShareRow[]}
        settlements={(setRaw ?? []) as SettlementRow[]}
        categories={(cats ?? []) as Category[]}
        paymentMethods={(pms ?? []) as PaymentMethod[]}
        myCategoryId={myMember?.personal_category_id ?? null}
        weights={weights}
        capacity={capacity}
        goal={(goalRow ?? null) as TripGoal | null}
        today={today}
        dateFormat={(prefRow?.date_format ?? 'DD/MM/AAAA') as DateFormat}
      />
    )
  }

  // ── Lista ─────────────────────────────────────────────────────────────────
  // Todos tienen un @usuario (migración 20261019 lo asigna a los existentes);
  // las cuentas nuevas lo reciben acá la primera vez.
  const { data: myUsername } = await supabase.rpc('ensure_my_username')
  const ids = mine.map(g => g.id)
  const [{ data: allExp }, { data: allShares }, { data: allSet }] = ids.length
    ? await Promise.all([
        supabase.from('shared_expenses').select('id, group_id, amount, paid_by').in('group_id', ids),
        supabase.from('shared_expense_shares').select('expense_id, group_id, user_id, share').in('group_id', ids),
        supabase.from('shared_settlements').select('group_id, from_user, to_user, amount').in('group_id', ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const inviterNames = await Promise.all(invites.map(async g => {
    const { data } = await supabase.rpc('shared_inviter_name', { p_group: g.id })
    return [g.id, (data as string | null) ?? 'Alguien'] as const
  }))
  const inviterById = Object.fromEntries(inviterNames)

  const rows = mine.map(g => {
    const exp = (allExp ?? []).filter(e => e.group_id === g.id)
    const set = (allSet ?? []).filter(s => s.group_id === g.id)
    const memberIds = members.filter(m => m.group_id === g.id && m.status === 'accepted').map(m => m.user_id)
    const bal = groupBalance(
      exp.map(e => ({
        amount: e.amount, paid_by: e.paid_by,
        shares: Object.fromEntries((allShares ?? []).filter(x => x.expense_id === e.id).map(x => [x.user_id, x.share])),
      })),
      set, memberIds,
    )
    const net = bal.net[user.id] ?? 0
    return { g, bal, net, people: memberIds.length, stage: tripStage(g, today, suggestedTransfers(bal.net).length > 0) }
  })

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-bold" style={{ color: 'var(--ink)' }}>Compartidos</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>
            Viajes y gastos que dividen con otras personas. Crea el viaje, carga gastos e invita cuando quieras.
          </p>
          {myUsername && <div className="mt-2.5"><MyHandle username={myUsername as string} /></div>}
        </div>
        <NewTripButton />
      </div>

      {invites.map(g => (
        <SharedInviteCard key={g.id} groupId={g.id} groupName={g.name}
          inviter={inviterById[g.id]} mode={g.split_mode} />
      ))}

      {rows.length === 0 && invites.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--primary-soft)' }}>
            <Plane className="w-6 h-6" style={{ color: 'var(--primary)' }} />
          </div>
          <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>Todavía no tienes viajes compartidos</p>
          <p className="text-sm mt-1 max-w-sm mx-auto" style={{ color: 'var(--ink-3)' }}>
            Crea uno aunque aún no sepas fechas ni quiénes van. Carga los gastos y, cuando quieras, invita a los demás: todo se reparte solo y en tus gastos queda únicamente tu parte.
          </p>
          <div className="mt-4 flex justify-center"><NewTripButton label="Crear el primer viaje" /></div>
        </div>
      ) : (
        <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          {rows.map(({ g, bal, net, people, stage }) => (
            <Link key={g.id} href={`/compartidos?g=${g.id}`} className="card p-4 flex items-center gap-3 transition-colors hover:brightness-[.99]">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-soft)' }}>
                <Plane className="w-5 h-5" style={{ color: 'var(--primary)' }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{g.name}</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>{STAGE_LABEL[stage]}</span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{fmtRange(g.start_date, g.end_date)} · {people === 1 ? 'solo tú' : `${people} personas`}</p>
                {people > 1 && bal.total > 0 && (
                  <p className="text-xs mt-1 font-semibold tabular-nums"
                    style={{ color: net > 0 ? 'var(--mint)' : net < 0 ? 'var(--gold)' : 'var(--ink-2)' }}>
                    {net > 0 ? `Te deben ${formatCLP(net)}` : net < 0 ? `Debes ${formatCLP(-net)}` : 'A mano'}
                    <span style={{ color: 'var(--ink-3)' }} className="font-normal"> · {formatCLP(bal.total)} en total</span>
                  </p>
                )}
              </div>
              <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
