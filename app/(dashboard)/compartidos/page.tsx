import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plane, ChevronRight } from 'lucide-react'
import { formatCLP, getNowChile, type DateFormat } from '@/lib/utils'
import { groupBalance, balanceFor, tripStage, ratioToPct } from '@/lib/shared-split'
import type { SharedGroup, SharedMemberRow, SharedExpenseRow, SettlementRow } from '@/lib/shared-types'
import type { Category, PaymentMethod } from '@/types'
import SharedTripView from '@/components/SharedTripView'
import SharedInviteCard from '@/components/SharedInviteCard'
import NewTripButton from '@/components/NewTripButton'

export const dynamic = 'force-dynamic'

// ── Gastos compartidos, fase 1 (docs/PLAN_GASTOS_COMPARTIDOS.md) ────────────
// Un viaje compartido entre dos personas de la app. Esta página solo lee lo
// que la RLS deja ver (viajes de los que eres miembro o invitado); todo lo que
// escribe pasa por funciones de la base (app/actions/shared.ts).

const STAGE_LABEL = {
  invited: 'Esperando invitación', planning: 'Planificando', traveling: 'En viaje',
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
    supabase.from('shared_group_members').select('group_id, invited_email, user_id, status, income_consent, personal_category_id'),
  ])
  const groups  = (groupsRaw ?? []) as SharedGroup[]
  const members = (membersRaw ?? []) as SharedMemberRow[]

  // Invitaciones: grupos en que mi fila está pendiente
  const pendingIds = new Set(members.filter(m => m.status === 'pending' && m.user_id == null && groups.some(g => g.id === m.group_id && g.member_a !== user.id)).map(m => m.group_id))
  const invites = groups.filter(g => pendingIds.has(g.id))
  const mine = groups.filter(g => !pendingIds.has(g.id))

  // ── Detalle de un viaje ───────────────────────────────────────────────────
  const selected = params.g ? mine.find(g => g.id === params.g) : undefined
  if (selected) {
    const [{ data: expRaw }, { data: setRaw }, { data: namesRaw }, { data: cats }, { data: pms }, { data: prefRow }] = await Promise.all([
      supabase.from('shared_expenses').select('*').eq('group_id', selected.id),
      supabase.from('shared_settlements').select('*').eq('group_id', selected.id).order('date', { ascending: false }),
      supabase.rpc('shared_member_names', { p_group: selected.id }),
      supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order'),
      supabase.from('payment_methods').select('*').eq('user_id', user.id).order('sort_order'),
      supabase.from('profiles').select('date_format').eq('id', user.id).maybeSingle(),
    ])
    const names: Record<string, string> = {}
    for (const n of (namesRaw ?? []) as { user_id: string; display_name: string }[]) names[n.user_id] = n.display_name
    const pendingMember = members.find(m => m.group_id === selected.id && m.status === 'pending')
    const myMember = members.find(m => m.group_id === selected.id && m.user_id === user.id)

    return (
      <SharedTripView
        group={selected}
        meId={user.id}
        names={names}
        inviteEmail={pendingMember?.invited_email ?? null}
        expenses={(expRaw ?? []) as SharedExpenseRow[]}
        settlements={(setRaw ?? []) as SettlementRow[]}
        categories={(cats ?? []) as Category[]}
        paymentMethods={(pms ?? []) as PaymentMethod[]}
        myCategoryId={myMember?.personal_category_id ?? null}
        today={today}
        dateFormat={(prefRow?.date_format ?? 'DD/MM/AAAA') as DateFormat}
      />
    )
  }

  // ── Lista ─────────────────────────────────────────────────────────────────
  const ids = mine.map(g => g.id)
  const [{ data: allExp }, { data: allSet }] = ids.length
    ? await Promise.all([
        supabase.from('shared_expenses').select('group_id, amount, paid_by, share_a, share_b').in('group_id', ids),
        supabase.from('shared_settlements').select('group_id, from_user, to_user, amount').in('group_id', ids),
      ])
    : [{ data: [] }, { data: [] }]

  const inviterNames = await Promise.all(invites.map(async g => {
    const { data } = await supabase.rpc('shared_inviter_name', { p_group: g.id })
    return [g.id, (data as string | null) ?? 'Alguien'] as const
  }))
  const inviterById = Object.fromEntries(inviterNames)

  const rows = mine.map(g => {
    const exp = (allExp ?? []).filter(e => e.group_id === g.id)
    const set = (allSet ?? []).filter(s => s.group_id === g.id)
    const bal = groupBalance(exp, set, g.member_a, g.member_b ?? '')
    const net = balanceFor(bal, g.member_a === user.id)
    return { g, bal, net, stage: tripStage(g, today, bal.netA) }
  })

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-bold" style={{ color: 'var(--ink)' }}>Compartidos</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>
            Viajes y gastos que dividen con otra persona, en proporción a lo que gana cada uno.
          </p>
        </div>
        <NewTripButton />
      </div>

      {invites.map(g => {
        const pct = g.pending_mode !== 'income' && g.pending_ratio_a != null ? ratioToPct(g.pending_ratio_a) : null
        return (
          <SharedInviteCard key={g.id} groupId={g.id} groupName={g.name}
            inviter={inviterById[g.id]} mode={g.pending_mode}
            pctMine={pct ? pct.b : null} />
        )
      })}

      {rows.length === 0 && invites.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--primary-soft)' }}>
            <Plane className="w-6 h-6" style={{ color: 'var(--primary)' }} />
          </div>
          <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>Todavía no tienes viajes compartidos</p>
          <p className="text-sm mt-1 max-w-sm mx-auto" style={{ color: 'var(--ink-3)' }}>
            Crea uno, invita a la otra persona y cada gasto se reparte solo. En tus gastos queda únicamente tu parte.
          </p>
          <div className="mt-4 flex justify-center"><NewTripButton label="Crear el primer viaje" /></div>
        </div>
      ) : (
        <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          {rows.map(({ g, bal, net, stage }) => (
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
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{fmtRange(g.start_date, g.end_date)}</p>
                {g.member_b && bal.total > 0 && (
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
