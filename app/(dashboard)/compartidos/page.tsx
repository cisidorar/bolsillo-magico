import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plane, ChevronRight, HandCoins } from 'lucide-react'
import { formatCLP, getNowChile, type DateFormat } from '@/lib/utils'
import { groupBalance, suggestedTransfers, tripPhase, TRIP_PHASE_LABEL, daysToStart, tripDay, type TripPhase } from '@/lib/shared-split'
import type { SharedGroup, SharedMemberRow, SharedExpenseRow, SharedShareRow, SettlementRow, SharedMemberInfo, SharedPlanItemRow } from '@/lib/shared-types'
import type { Category, PaymentMethod } from '@/types'
import SharedTripView from '@/components/SharedTripView'
import { monthlyCapacity, budgetTotal } from '@/lib/trip-plan'
import TripList, { type TripListRow } from '@/components/TripList'
import type { TripGoal } from '@/components/TripPlanCard'
import SharedInviteCard from '@/components/SharedInviteCard'
import NewTripButton from '@/components/NewTripButton'
import PorCobrarView from '@/components/PorCobrarView'
import ReceivablesCard from '@/components/ReceivablesCard'
import type { ReceivableWithExpense } from '@/lib/receivables'
import { SHOW_TRIPS } from '@/lib/features'
import { getUserAccess } from '@/lib/supabase/server'
import CompartidosToggle, { type CompartidosTab } from '@/components/CompartidosToggle'

export const dynamic = 'force-dynamic'

// ── Gastos compartidos (docs/PLAN_GASTOS_COMPARTIDOS.md) ────────────────────
// Un viaje compartido entre una o más personas de la app (se invita después). Esta página solo lee lo
// que la RLS deja ver (viajes de los que eres miembro o invitado); todo lo que
// escribe pasa por funciones de la base (app/actions/shared.ts).


function fmtRange(start: string | null, end: string | null): string {
  const f = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
  if (start && end) return `${f(start)} al ${f(end)}`
  if (start) return `Desde el ${f(start)}`
  return 'Sin fechas'
}

export default async function CompartidosPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; tab?: string }>
}) {
  const [user, supabase, params] = await Promise.all([getServerSession(), createClient(), searchParams])
  if (!user) redirect('/login')
  const today = getNowChile().dateStr

  // Viajes ocultos (lib/features.ts): solo "Por cobrar".
  const access = await getUserAccess()
  const tripsOn = SHOW_TRIPS || access?.features.viajes === true
  if (!tripsOn) {
    const [{ data: recRaw }, { data: myPms }] = await Promise.all([
      supabase.from('expense_receivables')
        .select('*, expense:expenses(description, date, payment_method_id)')
        .eq('user_id', user.id).is('received_at', null).eq('forgiven', false)
        .order('created_at', { ascending: true }),
      supabase.from('payment_methods').select('*').eq('user_id', user.id).order('sort_order'),
    ])
    const rows = (recRaw ?? []) as unknown as ReceivableWithExpense[]
    return (
      <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 space-y-6">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-bold" style={{ color: 'var(--ink)' }}>Por cobrar</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>Lo que pagaste con tu tarjeta y tus amigos te van a devolver.</p>
        </div>
        <PorCobrarView rows={rows} paymentMethods={(myPms ?? []) as PaymentMethod[]} today={today} />
      </div>
    )
  }

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
    const [{ data: planRaw }, { data: expRaw }, { data: shareRaw }, { data: setRaw }, { data: namesRaw }, { data: wRaw }, { data: cats }, { data: pms }, { data: prefRow }] = await Promise.all([
      supabase.from('shared_plan_items').select('*').eq('group_id', selected.id).order('due_date', { ascending: true, nullsFirst: false }),
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

    // Gastos tuyos de las fechas del viaje que aún no están en él (para cargar un viaje ya hecho).
    let candidates: { id: string; description: string | null; amount: number; date: string }[] = []
    if (selected.start_date && !selected.closed_at) {
      const shift = (d: string, n: number) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }
      const { data: cand } = await supabase.from('expenses')
        .select('id, description, amount, date, card_extra')
        .eq('user_id', user.id).is('shared_expense_id', null).is('recurring_expense_id', null)
        .gte('date', shift(selected.start_date, -1)).lte('date', shift(selected.end_date ?? selected.start_date, 1))
        .gt('amount', 0).order('date', { ascending: true }).limit(60)
      candidates = (cand ?? []).filter(c => !(c.card_extra as number | null)).map(c => ({
        id: c.id as string, description: c.description as string | null, amount: c.amount as number, date: c.date as string,
      }))
    }

    const { data: linkRow } = selected.created_by === user.id
      ? await supabase.from('shared_group_share_links').select('expires_at')
          .eq('group_id', selected.id).eq('kind', 'view').is('revoked_at', null).gt('expires_at', new Date().toISOString()).limit(1).maybeSingle()
      : { data: null }

    const { data: joinRow } = selected.created_by === user.id
      ? await supabase.from('shared_group_share_links').select('expires_at')
          .eq('group_id', selected.id).eq('kind', 'join').is('revoked_at', null).gt('expires_at', new Date().toISOString()).limit(1).maybeSingle()
      : { data: null }

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
        planItems={(planRaw ?? []) as SharedPlanItemRow[]}
        candidates={candidates}
        shareLinkExpires={(linkRow?.expires_at as string | undefined) ?? null}
        joinLinkExpires={(joinRow?.expires_at as string | undefined) ?? null}
        today={today}
        dateFormat={(prefRow?.date_format ?? 'DD/MM/AAAA') as DateFormat}
      />
    )
  }

  // ── Lista ─────────────────────────────────────────────────────────────────
  // Todos tienen un @usuario (migración 20261019 lo asigna a los existentes);
  // las cuentas nuevas lo reciben acá la primera vez.
  await supabase.rpc('ensure_my_username')
  // Por cobrar fuera de viajes: amigos sin la app que te transfieren su parte.
  const [{ data: recRaw }, { data: myPms }] = await Promise.all([
    supabase.from('expense_receivables')
      .select('*, expense:expenses(description, date, payment_method_id)')
      .eq('user_id', user.id).is('received_at', null).eq('forgiven', false)
      .order('created_at', { ascending: true }),
    supabase.from('payment_methods').select('*').eq('user_id', user.id).order('sort_order'),
  ])
  const receivables = (recRaw ?? []) as unknown as ReceivableWithExpense[]
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
    const transferCount = suggestedTransfers(bal.net).length
    return { g, bal, net, people: memberIds.length, transferCount, phase: tripPhase(g, today, transferCount > 0) }
  })

  // Lo que necesita atención primero; lo terminado/cerrado va a "Anteriores".
  const ORDER: Record<TripPhase, number> = { settling: 0, traveling: 1, planning: 2, done: 3, closed: 4 }
  const sorted = [...rows].sort((a, b) => ORDER[a.phase] - ORDER[b.phase]
    || (a.g.start_date ?? '9999').localeCompare(b.g.start_date ?? '9999'))
  const active = sorted.filter(r => r.phase !== 'done' && r.phase !== 'closed')
  const past   = sorted.filter(r => r.phase === 'done' || r.phase === 'closed')

  const listRows: TripListRow[] = sorted.map(r => ({
    id: r.g.id, name: r.g.name, start: r.g.start_date, end: r.g.end_date, phase: r.phase,
    people: r.people, net: r.net, total: r.bal.total, budget: budgetTotal(r.g.budget ?? {}), transferCount: r.transferCount,
  }))

  // Dos vistas separadas: Viajes y Por cobrar. Sin viajes pero con cobros pendientes,
  // abre directo en Por cobrar.
  const tab: CompartidosTab = params.tab === 'cobrar' || (!params.tab && rows.length === 0 && invites.length === 0 && receivables.length > 0)
    ? 'cobrar' : 'viajes'

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-bold" style={{ color: 'var(--ink)' }}>Compartidos</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>
            {tab === 'cobrar'
              ? 'Lo que pagaste con tu tarjeta y tus amigos te van a devolver.'
              : 'Viajes que dividen con otras personas. Crea el viaje, carga gastos e invita cuando quieras.'}
          </p>
        </div>
        {/* Mismo criterio que el toggle de /inversiones: a la izquierda en mobile,
            al borde derecho en sm+, con la acción principal al otro extremo. */}
        <div className="flex items-center justify-between gap-2 sm:justify-end min-w-0">
          <CompartidosToggle active={tab} viajes={active.length + invites.length} cobrar={receivables.length} />
          {tab === 'viajes' && <NewTripButton />}
        </div>
      </div>

      {tab === 'cobrar' ? (
        receivables.length > 0 ? (
          <div className="lg:max-w-xl">
            <ReceivablesCard rows={receivables} paymentMethods={(myPms ?? []) as PaymentMethod[]} today={today} flat={false} />
          </div>
        ) : (
          <div className="card p-8 text-center">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--primary-soft)' }}>
              <HandCoins className="w-6 h-6" style={{ color: 'var(--primary)' }} />
            </div>
            <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>Nadie te debe nada</p>
            <p className="text-sm mt-1 max-w-sm mx-auto" style={{ color: 'var(--ink-3)' }}>
              Si pagas algo con tu tarjeta por otras personas, ábrelo en Historial y toca «Cobrar a alguien».
            </p>
          </div>
        )
      ) : (
        <>
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
        <TripList rows={listRows} today={today} />
      )}
        </>
      )}
    </div>
  )
}
