'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Handshake, Clock, Users, Check, Settings2, UserPlus, X } from 'lucide-react'
import { formatCLP, relativeDate, type DateFormat } from '@/lib/utils'
import { useToast } from '@/components/ToastProvider'
import {
  groupBalance, suggestedTransfers, tripStage, spentByCategory, TRIP_CATEGORIES, type SplitMode,
} from '@/lib/shared-split'
import {
  settleShared, deleteSettlement,
  inviteToSharedGroup, removeSharedMember, setSharedMode, giveSharedConsent,
  type FoundUser,
} from '@/app/actions/shared'
import SharedExpenseSheet from './SharedExpenseSheet'
import TripSettingsSheet from './TripSettingsSheet'
import UserSearch from './UserSearch'
import TripPlanCard, { type TripGoal } from './TripPlanCard'
import TripBudgetSheet from './TripBudgetSheet'
import type {
  SharedGroup, SharedExpenseRow, SharedShareRow, SettlementRow, SharedMemberInfo,
} from '@/lib/shared-types'
import type { Category, PaymentMethod } from '@/types'

const STAGE_LABEL = {
  planning:  'Planificando',
  traveling: 'En viaje',
  settling:  'Por saldar',
  closed:    'Cerrado',
} as const

function fmtRange(start: string | null, end: string | null): string {
  const f = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
  if (start && end) return `${f(start)} al ${f(end)}`
  if (start) return `Desde el ${f(start)}`
  return 'Fechas por definir'
}

export default function SharedTripView({
  group, meId, members, expenses, shares, settlements, categories, paymentMethods,
  myCategoryId, weights, capacity, goal, today, dateFormat,
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
  const stage = tripStage(group, today, anyPending)

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

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 space-y-5">
      <Link href="/compartidos" className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
        <ArrowLeft className="w-3.5 h-3.5" /> Compartidos
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl lg:text-3xl font-bold truncate" style={{ color: 'var(--ink)' }}>{group.name}</h1>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
              style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
              {STAGE_LABEL[stage]}
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>
            {group.start_date || closed
              ? fmtRange(group.start_date, group.end_date)
              : <button onClick={() => setEditOpen(true)} className="font-semibold" style={{ color: 'var(--primary)' }}>+ Agregar fechas</button>}
          </p>
        </div>
        <button onClick={() => setEditOpen(true)} aria-label="Ajustes del viaje"
          className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink-2)' }}>
          <Settings2 className="w-4 h-4" />
        </button>
      </div>

      {error && <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{error}</p>}

      <TripPlanCard
        groupId={group.id} groupName={group.name} budget={group.budget ?? {}}
        people={people} myFraction={myFraction} capacity={capacity}
        myPaid={bal.share[meId] ?? 0} spent={spentByCategory(expenses)} goal={goal}
        startDate={group.start_date} today={today} closed={closed}
        onEditBudget={() => setBudgetOpen(true)} onEditDates={() => setEditOpen(true)}
      />

      {/* Personas */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" style={{ color: 'var(--primary)' }} />
            <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Personas</h2>
          </div>
          {isCreator && !closed && !inviteOpen && (
            <button onClick={() => setInviteOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--primary)' }}>
              <UserPlus className="w-3.5 h-3.5" /> Invitar
            </button>
          )}
        </div>

        {members.length > 1 && <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
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
                    className="text-xs font-bold" style={{ color: 'var(--coral)' }}>Confirmar</button>
                ) : (
                  <button onClick={() => setConfirmRemove(m.user_id)} aria-label="Sacar"
                    className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--ink-3)' }}>
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
            Solo tú por ahora. Puedes cargar gastos desde ya; cuando invites a alguien se reparten entre los que estén.
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
                  className="px-3 py-1 rounded-full text-xs font-semibold border disabled:cursor-default"
                  style={group.split_mode === m
                    ? { background: 'var(--primary-soft)', color: 'var(--primary)', borderColor: 'var(--primary)' }
                    : { background: 'var(--surface)', color: 'var(--ink-3)', borderColor: 'var(--border)', opacity: isCreator ? 1 : 0.6 }}>
                  {m === 'equal' ? 'Parejo' : 'Según sueldo'}
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
                  <label className="flex items-center gap-2 font-semibold" style={{ color: 'var(--ink)' }}>
                    <input type="checkbox" checked={me.income_consent} disabled={busy || closed}
                      onChange={e => run(() => giveSharedConsent(group.id, e.target.checked))} />
                    Compartir mi porcentaje en este viaje
                  </label>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Saldo */}
      {!alone && expenses.length > 0 && (
        <>
          <div className="rounded-3xl p-5 border" style={{ background: balStyle.bg, borderColor: balStyle.border }}>
            <p className="text-xs font-semibold" style={{ color: balStyle.color }}>Tu saldo del viaje</p>
            <p className="font-display text-3xl font-bold mt-1 tabular-nums" style={{ color: balStyle.color }}>
              {owed ? `Te deben ${formatCLP(mine)}`
                : owes ? `Debes ${formatCLP(-mine)}`
                : expenses.length === 0 ? 'Sin gastos todavía' : 'Estás a mano'}
            </p>

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
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-50"
                          style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
                          <Handshake className="w-3 h-3" /> {t.from === meId ? 'Ya transferí' : 'Me llegó'}
                        </button>
                      )}
                    </div>
                  )
                })}
                <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                  Registrar una transferencia solo la anota; no crea gastos ni ingresos.
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
        </>
      )}

      {/* Gastos */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Gastos del viaje</h2>
            {bal.total > 0 && (
              <p className="text-xs tabular-nums" style={{ color: 'var(--ink-3)' }}>
                {formatCLP(bal.total)} en total · tu parte {formatCLP(bal.share[meId] ?? 0)}{!alone ? ` · pusiste ${formatCLP(bal.paid[meId] ?? 0)}` : ''}
              </p>
            )}
          </div>
          {!closed && (
            <button onClick={() => setSheet({ expense: null })}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
              style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
              <Plus className="w-3.5 h-3.5" /> Gasto
            </button>
          )}
        </div>

        {expenses.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--ink-3)' }}>
            Cuando reserves o pagues algo (pasajes, alojamiento…) agrégalo aquí. En tus gastos queda solo tu parte.
          </p>
        ) : (
          <div className="space-y-4">
            {[...byDay.entries()].map(([day, rows]) => (
              <div key={day}>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  {relativeDate(day, dateFormat)}
                </p>
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {rows.map(e => {
                    const myPart = sharesByExp[e.id]?.[meId] ?? 0
                    const payer = e.paid_by === meId ? 'tú' : nameOf(e.paid_by)
                    return (
                      <button key={e.id} onClick={() => !closed && setSheet({ expense: e })}
                        className="w-full flex items-center gap-3 py-2.5 text-left"
                        style={{ cursor: closed ? 'default' : 'pointer' }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{e.description}</p>
                          <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                            {catLabel(e.trip_category)} · pagó {payer} · tu parte {formatCLP(myPart)}
                          </p>
                        </div>
                        <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(e.amount)}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transferencias */}
      {settlements.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>Transferencias entre ustedes</h2>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
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
                    className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Deshacer</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {sheet && (
        <SharedExpenseSheet
          key={sheet.expense?.id ?? 'new'}
          group={group} meId={meId}
          members={accepted.map(m => ({ user_id: m.user_id, name: m.display_name }))}
          weights={weights}
          shares={sheet.expense ? (sharesByExp[sheet.expense.id] ?? {}) : {}}
          paymentMethods={paymentMethods}
          expense={sheet.expense} today={today} onClose={() => setSheet(null)}
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
