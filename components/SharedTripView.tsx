'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Handshake, Clock, Users, Check, Settings2, UserPlus, X, ChevronRight, CalendarDays, Wallet, CircleCheck, Lock } from 'lucide-react'
import { formatCLP, relativeDate, type DateFormat } from '@/lib/utils'
import { useToast } from '@/components/ToastProvider'
import {
  groupBalance, suggestedTransfers, tripPhase, TRIP_PHASE_LABEL, daysToStart, tripDay, tripLength, spentByCategory, TRIP_CATEGORIES, type SplitMode,
} from '@/lib/shared-split'
import { TRIP_CATEGORY_ICON } from '@/lib/trip-category-icons'
import {
  settleShared, deleteSettlement, setSharedGroupClosed,
  inviteToSharedGroup, removeSharedMember, setSharedMode, giveSharedConsent,
  type FoundUser,
} from '@/app/actions/shared'
import SharedExpenseSheet from './SharedExpenseSheet'
import TripSettingsSheet from './TripSettingsSheet'
import UserSearch from './UserSearch'
import TripPlanCard, { type TripGoal } from './TripPlanCard'
import TripSpendHero from './TripSpendHero'
import TripPlanItems from './TripPlanItems'
import { planByCategory, planTotals } from '@/lib/trip-plan-items'
import TripClosedSummary from './TripClosedSummary'
import { budgetTotal, type TripBudget } from '@/lib/trip-plan'
import TripBudgetSheet from './TripBudgetSheet'
import type {
  SharedGroup, SharedExpenseRow, SharedShareRow, SettlementRow, SharedMemberInfo, SharedPlanItemRow,
} from '@/lib/shared-types'
import type { Category, PaymentMethod } from '@/types'


function fmtRange(start: string | null, end: string | null): string {
  const f = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
  if (start && end) return `${f(start)} al ${f(end)}`
  if (start) return `Desde el ${f(start)}`
  return 'Fechas por definir'
}

export default function SharedTripView({
  group, meId, members, expenses, shares, settlements, categories, paymentMethods,
  myCategoryId, weights, capacity, goal, planItems, today, dateFormat,
}: {
  group:          SharedGroup
  meId:           string
  members:        SharedMemberInfo[]
  expenses:       SharedExpenseRow[]
  shares:         SharedShareRow[]
  settlements:    SettlementRow[]
  categories:     Category[]
  paymentMethods: PaymentMethod[]
  myCategoryId:   string | null
  /** Pesos del reparto según sueldo (vacío si no se puede calcular) */
  weights:        Record<string, number>
  /** Lo que ahorras al mes en promedio (null sin ingresos) — solo tuyo */
  capacity:       number | null
  goal:           TripGoal | null
  planItems:      SharedPlanItemRow[]
  today:          string
  dateFormat:     DateFormat
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [sheet, setSheet] = useState<{ expense: SharedExpenseRow | null } | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invitee, setInvitee] = useState<FoundUser | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const accepted = members.filter(m => m.status === 'accepted')
  const pending  = members.filter(m => m.status === 'pending')
  const nameOf = (id: string) => id === meId ? 'Tú' : (members.find(m => m.user_id === id)?.display_name ?? 'Alguien')
  const isCreator = group.created_by === meId
  const closed = group.closed_at != null
  const me = members.find(m => m.user_id === meId)
  const income = group.split_mode === 'income'

  const sharesByExp: Record<string, Record<string, number>> = {}
  for (const s of shares) (sharesByExp[s.expense_id] ??= {})[s.user_id] = s.share

  const bal = groupBalance(
    expenses.map(e => ({ amount: e.amount, paid_by: e.paid_by, shares: sharesByExp[e.id] ?? {} })),
    settlements,
    accepted.map(m => m.user_id),
  )
  const mine = bal.net[meId] ?? 0
  const transfers = suggestedTransfers(bal.net)
  const anyPending = transfers.length > 0
  const phase = tripPhase(group, today, anyPending)

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) {
    setBusy(true); setError('')
    const res = await fn()
    setBusy(false)
    if (!res.ok) { setError(res.error ?? 'No se pudo completar.'); return false }
    if (okMsg) showToast(okMsg)
    router.refresh()
    return true
  }

  const byDay = new Map<string, SharedExpenseRow[]>()
  for (const e of [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))) {
    byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
  }
  const catLabel = (k: string) => TRIP_CATEGORIES.find(c => c.key === k)?.label ?? k

  const owed = mine > 0, owes = mine < 0
  const balStyle = owed
    ? { bg: 'rgba(31,190,141,0.12)', border: 'rgba(31,190,141,0.35)', color: 'var(--mint)' }
    : owes
      ? { bg: 'rgba(255,194,60,0.14)', border: 'rgba(255,194,60,0.45)', color: 'var(--gold)' }
      : { bg: 'var(--surface-2)', border: 'var(--border)', color: 'var(--ink-2)' }

  const alone = accepted.length <= 1
  const people = Math.max(accepted.length, group.planned_people ?? accepted.length, 1)
  const wSum = accepted.reduce((s, m) => s + (weights[m.user_id] ?? 0), 0)
  const myFraction = income && !group.split_error && !alone && people === accepted.length && wSum > 0
    ? (weights[meId] ?? 0) / wSum : null

  // Lo más relevante según dónde va el viaje, junto al nombre.
  const dStart = daysToStart(group.start_date, today)
  const dayInfo = tripDay(group.start_date, group.end_date, today)
  // "Día N de M" ya no va acá en viaje — tiene su propio lugar destacado
  // junto al gasto en TripSpendHero; repetirlo aquí sería decir lo mismo dos veces.
  const headerHint =
    phase === 'settling' ? `${transfers.length === 1 ? 'Falta 1 transferencia' : `Faltan ${transfers.length} transferencias`} para cuadrar`
    : phase === 'planning' && dStart != null ? (dStart === 1 ? 'Sale mañana' : `Sale en ${dStart} días`)
    : null

  const spent = spentByCategory(expenses)
  const budgetSum = budgetTotal(group.budget ?? {})
  const todaySpent = expenses.filter(e => e.date === today).reduce((s, e) => s + e.amount, 0)
  const openItems = planItems.filter(i => !i.paid_at)
  const hasOpenItems = openItems.length > 0
  // Sin presupuesto explícito, lo que cuesta el viaje = lo ya pagado + lo que falta pagar.
  const derivedBudget: TripBudget = {}
  const byCat = planByCategory(planItems)
  const openTotal = planTotals(planItems).before
  if (budgetSum === 0) {
    for (const c of TRIP_CATEGORIES) {
      const p = byCat[c.key] ?? { before: 0, during: 0 }
      // El gasto "durante" es un presupuesto: lo ya gastado en la categoría lo va consumiendo.
      const v = spent[c.key] + p.before + (phase === 'planning' ? p.during : Math.max(0, p.during - spent[c.key]))
      if (v > 0) derivedBudget[c.key] = v
    }
  }


  // ── Bloques (el orden depende de la fase) ────────────────────────────────
  const steps = phase === 'planning' && (!group.start_date || (budgetSum === 0 && !hasOpenItems && expenses.length === 0)) ? (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Para planificar:</span>
      {!group.start_date && (
        <button onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-full text-xs font-semibold border"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}>
          <CalendarDays className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} /> Fechas
        </button>
      )}
      {budgetSum === 0 && !hasOpenItems && expenses.length === 0 && (
        <button onClick={() => setBudgetOpen(true)} className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-full text-xs font-semibold border"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}>
          <Wallet className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} /> Cuánto costaría
        </button>
      )}
    </div>
  ) : null

  const saldo = !alone && (expenses.length > 0 || settlements.length > 0) ? (
    <div className="p-5" style={{ background: balStyle.bg, border: `1.5px solid ${balStyle.border}`, borderRadius: 18 }}>
      <p className="text-xs font-semibold" style={{ color: balStyle.color }}>
        {phase === 'settling' ? 'Cuadremos cuentas' : 'Tu saldo del viaje'}
      </p>
      <p className="font-display text-2xl font-bold mt-1 tabular-nums" style={{ color: balStyle.color }}>
        {owed ? `Te deben ${formatCLP(mine)}` : owes ? `Debes ${formatCLP(-mine)}` : 'Estás a mano'}
      </p>
      {phase !== 'settling' && transfers.length > 0 && (
        <p className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>
          Pueden saldar ahora o al final del viaje.
        </p>
      )}

      {transfers.length > 0 && (
        <div className="mt-3 space-y-2">
          {transfers.map(t => {
            const involvesMe = t.from === meId || t.to === meId
            return (
              <div key={`${t.from}-${t.to}`} className="flex items-center gap-2 rounded-xl p-2.5" style={{ background: 'var(--surface)' }}>
                <p className="flex-1 text-xs" style={{ color: 'var(--ink-2)' }}>
                  <span className="font-semibold" style={{ color: 'var(--ink)' }}>{nameOf(t.from)}</span> le {t.from === meId ? 'transfieres' : 'transfiere'} a{' '}
                  <span className="font-semibold" style={{ color: 'var(--ink)' }}>{nameOf(t.to)}</span>{' '}
                  <span className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(t.amount)}</span>
                </p>
                {involvesMe && !closed && (
                  <button disabled={busy} onClick={() => run(() => settleShared(group.id, t.from, t.to, t.amount, today), 'Transferencia registrada')}
                    className="inline-flex items-center gap-1 px-3 min-h-[44px] rounded-lg text-xs font-bold disabled:opacity-50 flex-shrink-0"
                    style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
                    <Handshake className="w-3.5 h-3.5" /> {t.from === meId ? 'Ya transferí' : 'Me llegó'}
                  </button>
                )}
              </div>
            )
          })}
          <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
            Marcarla solo la anota aquí; no crea gastos ni ingresos.
          </p>
        </div>
      )}

      {accepted.length > 2 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {accepted.map(m => {
            const v = bal.net[m.user_id] ?? 0
            return (
              <span key={m.user_id} className="text-[11px] tabular-nums" style={{ color: 'var(--ink-2)' }}>
                {nameOf(m.user_id)}: {v > 0 ? `+${formatCLP(v)}` : v < 0 ? `−${formatCLP(-v)}` : 'a mano'}
              </span>
            )
          })}
        </div>
      )}
    </div>
  ) : null

  // Por saldar: no es otra card de saldo — es una cuadratura de verdad,
  // lo que puso cada uno contra lo que le correspondía, columna por columna.
  // El divisor punteado retoma la perforación de los talonarios del plan.
  const settlementLedger = !alone && (expenses.length > 0 || settlements.length > 0) ? (
    <div className="rounded-xl overflow-hidden" style={{ border: '1.5px solid var(--border)' }}>
      <div className="px-5 py-4" style={{ background: balStyle.bg }}>
        <p className="text-xs font-semibold" style={{ color: balStyle.color }}>Cuadremos cuentas</p>
        <p className="font-display text-2xl font-bold mt-1 tabular-nums" style={{ color: balStyle.color }}>
          {owed ? `Te deben ${formatCLP(mine)}` : owes ? `Debes ${formatCLP(-mine)}` : 'Están a mano'}
        </p>
      </div>
      <div className="grid grid-cols-2">
        <div className="p-4">
          <p className="text-[11px] font-bold mb-2" style={{ color: 'var(--ink-3)' }}>Pusieron</p>
          {accepted.map(m => (
            <div key={m.user_id} className="flex justify-between text-sm py-1 gap-2">
              <span className="truncate" style={{ color: 'var(--ink-2)' }}>{nameOf(m.user_id)}</span>
              <span className="tabular-nums font-semibold flex-shrink-0" style={{ color: 'var(--ink)' }}>{formatCLP(bal.paid[m.user_id] ?? 0)}</span>
            </div>
          ))}
        </div>
        <div className="p-4">
          <p className="text-[11px] font-bold mb-2" style={{ color: 'var(--ink-3)' }}>Les corresponde</p>
          {accepted.map(m => (
            <div key={m.user_id} className="flex justify-between text-sm py-1 gap-2">
              <span className="truncate" style={{ color: 'var(--ink-2)' }}>{nameOf(m.user_id)}</span>
              <span className="tabular-nums font-semibold flex-shrink-0" style={{ color: 'var(--ink)' }}>{formatCLP(bal.share[m.user_id] ?? 0)}</span>
            </div>
          ))}
        </div>
      </div>
      {transfers.length > 0 && (
        <div className="p-4 space-y-2">
          {transfers.map(t => {
            const involvesMe = t.from === meId || t.to === meId
            return (
              <div key={`${t.from}-${t.to}`} className="flex items-center gap-2 rounded-xl p-2.5" style={{ background: 'var(--surface-2)' }}>
                <p className="flex-1 text-xs" style={{ color: 'var(--ink-2)' }}>
                  <span className="font-semibold" style={{ color: 'var(--ink)' }}>{nameOf(t.from)}</span> le {t.from === meId ? 'transfieres' : 'transfiere'} a{' '}
                  <span className="font-semibold" style={{ color: 'var(--ink)' }}>{nameOf(t.to)}</span>{' '}
                  <span className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(t.amount)}</span>
                </p>
                {involvesMe && !closed && (
                  <button disabled={busy} onClick={() => run(() => settleShared(group.id, t.from, t.to, t.amount, today), 'Transferencia registrada')}
                    className="inline-flex items-center gap-1 px-3 min-h-[44px] rounded-lg text-xs font-bold disabled:opacity-50 flex-shrink-0"
                    style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
                    <Handshake className="w-3.5 h-3.5" /> {t.from === meId ? 'Ya transferí' : 'Me llegó'}
                  </button>
                )}
              </div>
            )
          })}
          <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
            Marcarla solo la anota aquí; no crea gastos ni ingresos.
          </p>
        </div>
      )}
    </div>
  ) : null

  const summary = (phase === 'settling' || phase === 'done' || phase === 'closed') && expenses.length > 0 ? (
    <TripClosedSummary
      total={bal.total} myShare={bal.share[meId] ?? 0} myPaid={bal.paid[meId] ?? 0}
      budget={budgetSum} spent={spent}
      people={accepted.length} count={expenses.length}
      startDate={group.start_date} endDate={group.end_date} />
  ) : null

  const doneCard = phase === 'done' ? (
    <div className="card p-4 flex items-center gap-3">
      <CircleCheck className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--mint)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{alone ? 'Viaje terminado' : 'Viaje terminado y cuentas cuadradas'}</p>
        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Ciérralo para archivarlo; puedes reabrirlo si falta algo.</p>
      </div>
      <button disabled={busy} onClick={() => run(() => setSharedGroupClosed(group.id, true), 'Viaje cerrado')}
        className="inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-xl text-xs font-bold border flex-shrink-0 disabled:opacity-50"
        style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: 'var(--surface)' }}>
        <Lock className="w-3.5 h-3.5" /> Cerrar viaje
      </button>
    </div>
  ) : null

  const spendHero = (
    <TripSpendHero
      budget={budgetSum > 0 ? (group.budget ?? {}) : derivedBudget} spent={spent} closed={closed}
      onEditBudget={() => setBudgetOpen(true)}
      label={phase === 'planning' ? 'Ya pagado o reservado' : 'Gastado del viaje'}
      todaySpent={phase === 'traveling' ? todaySpent : null}
      people={accepted.length}
      dayInfo={phase === 'traveling' ? dayInfo : null}
    />
  )

  const planCard = phase === 'planning' ? (
    <TripPlanCard
      groupId={group.id} groupName={group.name} budget={budgetSum > 0 ? (group.budget ?? {}) : derivedBudget}
      derived={budgetSum === 0}
      split={budgetSum === 0 && hasOpenItems ? { before: openTotal, during: planTotals(planItems).during } : undefined}
      people={people} myFraction={myFraction} capacity={capacity}
      myPaid={bal.share[meId] ?? 0} goal={goal}
      startDate={group.start_date} today={today} closed={closed}
      onEditBudget={() => setBudgetOpen(true)} onEditDates={() => setEditOpen(true)}
    />
  ) : null

  const itemsList = (hasOpenItems || phase === 'planning') && !closed ? (
    <TripPlanItems embedded groupId={group.id} items={planItems} paymentMethods={paymentMethods}
      today={today} closed={closed} people={people} tripDays={dayInfo?.total ?? tripLength(group.start_date, group.end_date)} />
  ) : null

  // En planificación cada sección del plan ya tiene su propio "Agregar".
  const addButton = !closed && !(phase === 'planning' && itemsList) ? (
    <button onClick={() => setSheet({ expense: null })}
      className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold"
      style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
      <Plus className="w-3.5 h-3.5" /> {phase === 'planning' ? 'Agregar' : 'Gasto'}
    </button>
  ) : null

  const gastos = (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
            {phase === 'planning' ? 'Costos del viaje' : 'Gastos del viaje'}
          </h2>
          {(bal.total > 0 || (openTotal > 0 && phase !== 'planning')) && (
            <p className="text-xs tabular-nums" style={{ color: 'var(--ink-3)' }}>
              {phase === 'planning' || openTotal > 0
                ? `${formatCLP(bal.total)} pagado${openTotal > 0 ? ` · ${formatCLP(openTotal)} por pagar` : ''}`
                : `${formatCLP(bal.total)} en total`}
              {!alone && bal.total > 0 ? ` · tu parte ${formatCLP(bal.share[meId] ?? 0)}` : ''}
            </p>
          )}
        </div>
        {addButton}
      </div>

      {itemsList && (
        <div className="mb-4">{itemsList}</div>
      )}

      {expenses.length === 0 ? (
        !itemsList && (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--ink-3)' }}>
            {phase === 'planning'
              ? 'Agrega lo que va a costar (alojamiento, pasajes…) aunque todavía no lo pagues. Así sabes si te alcanza.'
              : 'Agrega cada gasto apenas lo pagues; la app calcula la parte de cada uno.'}
          </p>
        )
      ) : (
        <div className="space-y-4">
          {itemsList && <p className="text-[11px] font-bold -mb-2" style={{ color: 'var(--mint)' }}>Pagado</p>}
          {[...byDay.entries()].map(([day, rows]) => (
            <div key={day}>
              <p className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--ink-3)' }}>
                {relativeDate(day, dateFormat)}
              </p>
              <div>
                {rows.map(e => {
                  const myPart = sharesByExp[e.id]?.[meId] ?? 0
                  const payer = e.paid_by === meId ? 'tú' : nameOf(e.paid_by)
                  const CatIcon = TRIP_CATEGORY_ICON[e.trip_category]
                  return (
                    <button key={e.id} onClick={() => !closed && setSheet({ expense: e })}
                      className="w-full flex items-center gap-3 py-2.5 text-left"
                      style={{ cursor: closed ? 'default' : 'pointer' }}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-soft)' }}>
                        <CatIcon className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{e.description}</p>
                        <p className="text-xs truncate" style={{ color: 'var(--ink-3)' }}>
                          {alone ? catLabel(e.trip_category) : `pagó ${payer} · tu parte ${formatCLP(myPart)}`}
                        </p>
                      </div>
                      <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(e.amount)}</p>
                      {!closed && <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const main =
    phase === 'planning'  ? <>{steps}{planCard}{gastos}{saldo}</>
    : phase === 'traveling' ? <>{spendHero}{saldo}{gastos}</>
    : phase === 'settling'  ? <>{settlementLedger}{summary}{gastos}</>
    : phase === 'done'      ? <>{doneCard}{summary}{gastos}</>
    : <>{summary}{gastos}</>

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 space-y-5">
      <Link href="/compartidos" className="inline-flex items-center gap-1.5 text-xs font-semibold min-h-[44px] -my-3" style={{ color: 'var(--ink-3)' }}>
        <ArrowLeft className="w-3.5 h-3.5" /> Compartidos
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl lg:text-3xl font-bold truncate" style={{ color: 'var(--ink)' }}>{group.name}</h1>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
              style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
              {TRIP_PHASE_LABEL[phase]}
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>
            {group.start_date ? fmtRange(group.start_date, group.end_date) : 'Fechas por definir'}
            {headerHint && (
              <span className="font-semibold" style={{ color: phase === 'settling' ? 'var(--gold)' : 'var(--ink-2)' }}> · {headerHint}</span>
            )}
          </p>
        </div>
        <button onClick={() => setEditOpen(true)} aria-label="Ajustes del viaje"
          className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full"
          style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--ink-2)' }}>
          <Settings2 className="w-4 h-4" />
        </button>
      </div>

      {error && <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{error}</p>}

      <div className="lg:grid lg:gap-6 lg:items-start space-y-5 lg:space-y-0" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px' }}>
        {/* Columna principal — su contenido y orden cambian con la fase del viaje */}
        <div className="space-y-5 min-w-0">
          {main}
        </div>

        {/* Columna lateral — personas, reparto y el historial de transferencias ya hechas */}
        <div className="space-y-5">
          {/* Personas */}
          <div id="personas" className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Personas</h2>
              </div>
              {isCreator && !closed && !inviteOpen && (
                <button onClick={() => setInviteOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold min-h-[44px] px-2 -my-2 -mr-2" style={{ color: 'var(--primary)' }}>
                  <UserPlus className="w-3.5 h-3.5" /> Invitar
                </button>
              )}
            </div>

            {members.length > 1 && <div>
              {members.map(m => (
                <div key={m.user_id} className="flex items-center gap-3 py-2">
                  {m.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                      style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                      {m.display_name.replace('@', '')[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
                      {m.user_id === meId ? 'Tú' : m.display_name}
                      {m.is_creator && <span className="text-[10px] font-bold ml-1.5" style={{ color: 'var(--ink-3)' }}>creador</span>}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                      @{m.username}
                      {m.status === 'pending' && ' · invitación pendiente'}
                      {m.status === 'accepted' && income && !m.income_consent && ' · sin compartir porcentaje'}
                    </p>
                  </div>
                  {!closed && !m.is_creator && (isCreator || m.user_id === meId) && (
                    confirmRemove === m.user_id ? (
                      <button disabled={busy} onClick={async () => { await run(() => removeSharedMember(group.id, m.user_id), m.user_id === meId ? 'Saliste del viaje' : 'Listo'); setConfirmRemove(null) }}
                        className="text-xs font-bold min-h-[44px] px-3" style={{ color: 'var(--coral)' }}>Confirmar</button>
                    ) : (
                      <button onClick={() => setConfirmRemove(m.user_id)} aria-label={m.user_id === meId ? 'Salir del viaje' : m.status === 'pending' ? 'Cancelar invitación' : 'Sacar del viaje'}
                        className="text-xs font-semibold flex items-center gap-1 min-h-[44px] px-3" style={{ color: 'var(--ink-3)' }}>
                        <X className="w-3.5 h-3.5" />{m.user_id === meId ? 'Salir' : m.status === 'pending' ? 'Cancelar' : 'Sacar'}
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>}

            {isCreator && inviteOpen && (
              <div className="mt-3 space-y-2">
                <UserSearch onPick={setInvitee} exclude={members.map(m => m.username)} />
                <div className="flex gap-2">
                  <button onClick={() => { setInviteOpen(false); setInvitee(null) }}
                    className="flex-1 py-2 text-xs font-semibold rounded-lg border"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink-2)', background: 'var(--surface)' }}>Cerrar</button>
                  <button disabled={busy || !invitee} onClick={async () => {
                    if (!invitee) return
                    const ok = await run(() => inviteToSharedGroup(group.id, invitee.username), `Invitación enviada a @${invitee.username}`)
                    if (ok) { setInviteOpen(false); setInvitee(null) }
                  }} className="flex-1 py-2 text-xs font-bold rounded-lg disabled:opacity-50"
                    style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>Invitar</button>
                </div>
              </div>
            )}

            {alone && pending.length === 0 && !inviteOpen && (
              <p className="text-xs mt-2" style={{ color: 'var(--ink-3)' }}>
                Solo tú por ahora. Si invitas a alguien, lo ya cargado se reparte entre todos.
              </p>
            )}
            {pending.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs mt-3" style={{ color: 'var(--ink-3)' }}>
                <Clock className="w-3.5 h-3.5" /> Los invitados que no han aceptado todavía no entran en el reparto.
              </p>
            )}

            {/* Reparto (solo importa con más de una persona) */}
            {(!alone || pending.length > 0 || (group.planned_people ?? 1) > 1) && (
              <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold mr-1" style={{ color: 'var(--ink-2)' }}>Reparto</span>
                  {(['equal', 'income'] as SplitMode[]).map(m => (
                    <button key={m} disabled={busy || closed || !isCreator} onClick={() => group.split_mode !== m && run(() => setSharedMode(group.id, m), 'Reparto actualizado')}
                      aria-pressed={group.split_mode === m}
                      className="px-3.5 py-2 min-h-[40px] rounded-full text-xs font-semibold border disabled:cursor-default"
                      style={group.split_mode === m
                        ? { background: 'var(--primary-soft)', color: 'var(--primary)', borderColor: 'var(--primary)' }
                        : { background: 'var(--surface)', color: 'var(--ink-3)', borderColor: 'var(--border)', opacity: isCreator ? 1 : 0.6 }}>
                      {m === 'equal' ? 'Partes iguales' : 'Según lo que gana cada uno'}
                    </button>
                  ))}
                </div>
                {income && !alone && (
                  <div className="text-xs space-y-1.5" style={{ color: 'var(--ink-2)' }}>
                    {group.split_error ? (
                      <p style={{ color: 'var(--gold)' }}>
                        Falta que todos acepten compartir su porcentaje y tengan ingresos registrados. Mientras tanto se usa lo último calculado.
                      </p>
                    ) : wSum > 0 && (
                      <p>
                        {accepted.map(m => `${nameOf(m.user_id)} ${Math.round(((weights[m.user_id] ?? 0) / wSum) * 100)}%`).join(' · ')}
                        <span style={{ color: 'var(--ink-3)' }}> — nadie ve el sueldo de otro.</span>
                      </p>
                    )}
                    {me && (
                      <label className="flex items-center gap-3 font-semibold min-h-[44px]" style={{ color: 'var(--ink)' }}>
                        <input type="checkbox" className="w-5 h-5 flex-shrink-0 accent-[var(--primary)]" checked={me.income_consent} disabled={busy || closed}
                          onChange={e => run(() => giveSharedConsent(group.id, e.target.checked))} />
                        Mostrar solo mi % en este viaje (nunca mi sueldo)
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Transferencias */}
          {settlements.length > 0 && (
            <div className="card p-4">
              <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>Transferencias entre ustedes</h2>
              <div>
                {settlements.map(s => (
                  <div key={s.id} className="flex items-center gap-3 py-2">
                    <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--mint)' }} />
                    <p className="flex-1 text-sm" style={{ color: 'var(--ink-2)' }}>
                      {nameOf(s.from_user)} → {nameOf(s.to_user)}{' '}
                      <span className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(s.amount)}</span>
                      <span style={{ color: 'var(--ink-3)' }}> · {relativeDate(s.date, dateFormat)}</span>
                    </p>
                    {!closed && (
                      <button disabled={busy} onClick={() => run(() => deleteSettlement(s.id), 'Transferencia eliminada')}
                        className="text-xs font-semibold min-h-[44px] px-3" style={{ color: 'var(--ink-3)' }}>Deshacer</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {sheet && (
        <SharedExpenseSheet
          key={sheet.expense?.id ?? 'new'}
          group={group} meId={meId}
          members={accepted.map(m => ({ user_id: m.user_id, name: m.display_name }))}
          weights={weights}
          shares={sheet.expense ? (sharesByExp[sheet.expense.id] ?? {}) : {}}
          paymentMethods={paymentMethods}
          expense={sheet.expense} today={today} onClose={() => setSheet(null)}
          defaultPlanned={phase === 'planning'}
        />
      )}
      {editOpen && (
        <TripSettingsSheet groupId={group.id} name={group.name} start={group.start_date} end={group.end_date}
          closed={closed} categories={categories} myCategoryId={myCategoryId} onClose={() => setEditOpen(false)} />
      )}
      {budgetOpen && (
        <TripBudgetSheet groupId={group.id} budget={group.budget ?? {}} people={people} minPeople={accepted.length}
          onClose={() => setBudgetOpen(false)} />
      )}
    </div>
  )
}
