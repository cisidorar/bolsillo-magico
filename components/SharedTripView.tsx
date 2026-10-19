'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Handshake, Lock, Unlock, Clock, Users, Check } from 'lucide-react'
import { formatCLP, relativeDate, type DateFormat } from '@/lib/utils'
import { useToast } from '@/components/ToastProvider'
import {
  groupBalance, balanceFor, tripStage, ratioToPct, TRIP_CATEGORIES,
  type SplitMode,
} from '@/lib/shared-split'
import {
  confirmSharedRatio, rejectSharedRatio, proposeSharedRatio, settleShared,
  deleteSettlement, setSharedGroupClosed, setMySharedCategory,
} from '@/app/actions/shared'
import SharedExpenseSheet from './SharedExpenseSheet'
import type { SharedGroup, SharedExpenseRow, SettlementRow } from '@/lib/shared-types'
import type { Category, PaymentMethod } from '@/types'

const MODE_LABEL: Record<SplitMode, string> = { income: 'según sueldo', equal: '50 / 50', fixed: 'porcentaje fijo' }
const STAGE_LABEL = {
  invited:   'Esperando invitación',
  planning:  'Planificando',
  traveling: 'En viaje',
  settling:  'Por saldar',
  closed:    'Cerrado',
} as const

function fmtRange(start: string | null, end: string | null): string {
  const f = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
  if (start && end) return `${f(start)} al ${f(end)}`
  if (start) return `Desde el ${f(start)}`
  return 'Sin fechas todavía'
}

export default function SharedTripView({
  group, meId, names, inviteEmail, expenses, settlements, categories, paymentMethods, myCategoryId, today, dateFormat,
}: {
  group:          SharedGroup
  meId:           string
  names:          Record<string, string>
  /** Correo de la invitación pendiente (si la otra persona todavía no acepta) */
  inviteEmail:    string | null
  expenses:       SharedExpenseRow[]
  settlements:    SettlementRow[]
  categories:     Category[]
  paymentMethods: PaymentMethod[]
  myCategoryId:   string | null
  today:          string
  dateFormat:     DateFormat
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [sheet, setSheet] = useState<{ expense: SharedExpenseRow | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [settleOpen, setSettleOpen] = useState(false)
  const [proposeOpen, setProposeOpen] = useState(false)
  const [propMode, setPropMode] = useState<SplitMode>('equal')
  const [propPct, setPropPct] = useState('50')

  const meIsA   = group.member_a === meId
  const otherId = (meIsA ? group.member_b : group.member_a)
  const otherName = otherId ? (names[otherId] ?? 'la otra persona') : (inviteEmail ?? 'la otra persona')
  const closed  = group.closed_at != null
  const accepted = group.member_b != null

  const bal = groupBalance(expenses, settlements, group.member_a, group.member_b ?? '')
  const mine = balanceFor(bal, meIsA)          // > 0: te deben · < 0: debes
  const stage = tripStage(group, today, bal.netA)
  const myPaid  = meIsA ? bal.paidA : bal.paidB
  const myShare = meIsA ? bal.shareA : bal.shareB

  const hasRatio = group.ratio_agreed_at != null && group.ratio_a != null
  const pct = hasRatio ? ratioToPct(group.ratio_a!) : null
  const myPct = pct ? (meIsA ? pct.a : pct.b) : null
  const hasPending = group.pending_mode != null
  const iProposed = group.pending_by === meId

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) {
    setBusy(true); setError('')
    const res = await fn()
    setBusy(false)
    if (!res.ok) { setError(res.error ?? 'No se pudo completar.'); return false }
    if (okMsg) showToast(okMsg)
    router.refresh()
    return true
  }

  // Días con gastos, más reciente primero
  const byDay = new Map<string, SharedExpenseRow[]>()
  for (const e of [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))) {
    byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
  }
  const catLabel = (k: string) => TRIP_CATEGORIES.find(c => c.key === k)?.label ?? k

  // Saldo: mint si te deben, gold si debes (nunca coral — UX5, no es urgencia del día)
  const owed = mine > 0, owes = mine < 0
  const balStyle = owed
    ? { bg: 'rgba(31,190,141,0.12)', border: 'rgba(31,190,141,0.35)', color: 'var(--mint)' }
    : owes
      ? { bg: 'rgba(255,194,60,0.14)', border: 'rgba(255,194,60,0.45)', color: 'var(--gold)' }
      : { bg: 'var(--surface-2)', border: 'var(--border)', color: 'var(--ink-2)' }

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 space-y-5">
      <Link href="/compartidos" className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
        <ArrowLeft className="w-3.5 h-3.5" /> Compartidos
      </Link>

      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl lg:text-3xl font-bold truncate" style={{ color: 'var(--ink)' }}>{group.name}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>
            {fmtRange(group.start_date, group.end_date)} · con {otherName}
          </p>
        </div>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
          style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
          {STAGE_LABEL[stage]}
        </span>
      </div>

      {error && <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{error}</p>}

      {/* Esperando que acepte */}
      {!accepted && (
        <div className="card p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--gold)' }} />
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Esperando a {inviteEmail ?? 'la otra persona'}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
              Cuando entre a la app con ese correo verá la invitación. Hasta entonces no se pueden registrar gastos.
            </p>
          </div>
        </div>
      )}

      {/* Reparto */}
      {accepted && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4" style={{ color: 'var(--primary)' }} />
            <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Reparto</h2>
          </div>

          {hasRatio && (
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
              <span className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{myPct}% tú · {100 - myPct!}% {otherName}</span>
              {' '}— {group.split_mode ? MODE_LABEL[group.split_mode] : ''}, acordado por los dos.
            </p>
          )}
          {!hasRatio && !hasPending && (
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
              Todavía no hay un reparto acordado. Propongan uno para registrar gastos con porcentaje (mientras tanto sirven 50/50 y montos exactos).
            </p>
          )}

          {hasPending && !iProposed && (
            <div className="mt-3 rounded-xl p-3" style={{ background: 'var(--primary-soft)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {otherName} propone repartir {MODE_LABEL[group.pending_mode!]}
                {group.pending_mode !== 'income' && group.pending_ratio_a != null && (() => {
                  const p = ratioToPct(group.pending_ratio_a!)
                  return ` (${meIsA ? p.a : p.b}% tú · ${meIsA ? p.b : p.a}% ${otherName})`
                })()}.
              </p>
              {group.pending_mode === 'income' && (
                <p className="text-xs mt-1" style={{ color: 'var(--ink-2)' }}>
                  Al confirmar aceptas calcular el porcentaje con los ingresos de los dos. Ninguno ve el sueldo del otro, solo el resultado.
                </p>
              )}
              <div className="flex gap-2 mt-3">
                <button disabled={busy} onClick={() => run(() => confirmSharedRatio(group.id), 'Reparto acordado')}
                  className="flex-1 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                  style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>Confirmar</button>
                <button disabled={busy} onClick={() => run(() => rejectSharedRatio(group.id))}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold border disabled:opacity-50"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink-2)', background: 'var(--surface)' }}>Rechazar</button>
              </div>
            </div>
          )}
          {hasPending && iProposed && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
              <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
                Propusiste repartir {MODE_LABEL[group.pending_mode!]}. Falta que {otherName} lo confirme.
              </p>
              <button disabled={busy} onClick={() => run(() => rejectSharedRatio(group.id))}
                className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--ink-3)' }}>Cancelar</button>
            </div>
          )}

          {!hasPending && !closed && (
            <div className="mt-3">
              {!proposeOpen ? (
                <button onClick={() => setProposeOpen(true)} className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>
                  {hasRatio ? 'Proponer otro reparto' : 'Proponer un reparto'}
                </button>
              ) : (
                <div className="rounded-xl p-3 space-y-3" style={{ background: 'var(--surface-2)' }}>
                  <div className="grid grid-cols-3 gap-2">
                    {(['income', 'equal', 'fixed'] as SplitMode[]).map(m => (
                      <button key={m} onClick={() => setPropMode(m)}
                        className="py-2 rounded-lg text-xs font-semibold border"
                        style={propMode === m
                          ? { background: 'var(--primary-soft)', color: 'var(--primary)', borderColor: 'var(--primary)' }
                          : { background: 'var(--surface)', color: 'var(--ink-2)', borderColor: 'var(--border)' }}>
                        {m === 'income' ? 'Sueldo' : m === 'equal' ? '50 / 50' : '% fijo'}
                      </button>
                    ))}
                  </div>
                  {propMode === 'fixed' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: 'var(--ink-2)' }}>Tu parte</span>
                      <input type="number" min={0} max={100} value={propPct} onChange={e => setPropPct(e.target.value)}
                        className="w-20 text-sm border px-2 py-1.5 rounded-lg outline-none"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }} />
                      <span className="text-xs" style={{ color: 'var(--ink-2)' }}>%</span>
                    </div>
                  )}
                  <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                    Si cambia el reparto, los gastos que siguen el acuerdo se recalculan cuando {otherName} lo confirme.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setProposeOpen(false)} className="flex-1 py-2 text-xs font-semibold rounded-lg border"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink-2)', background: 'var(--surface)' }}>Cancelar</button>
                    <button disabled={busy} onClick={async () => {
                      const p = parseFloat(propPct.replace(',', '.'))
                      if (propMode === 'fixed' && !(p >= 0 && p <= 100)) { setError('El porcentaje tiene que estar entre 0 y 100.'); return }
                      // fixedRatio es la parte del miembro A
                      const mineRatio = p / 100
                      const ratioA = meIsA ? mineRatio : 1 - mineRatio
                      if (await run(() => proposeSharedRatio(group.id, propMode, propMode === 'fixed' ? ratioA : null), 'Propuesta enviada')) setProposeOpen(false)
                    }} className="flex-1 py-2 text-xs font-bold rounded-lg disabled:opacity-50"
                      style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>Proponer</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Saldo + totales */}
      {accepted && (
        <>
          <div className="rounded-3xl p-5 border" style={{ background: balStyle.bg, borderColor: balStyle.border }}>
            <p className="text-xs font-semibold" style={{ color: balStyle.color }}>Saldo del viaje</p>
            <p className="font-display text-3xl font-bold mt-1 tabular-nums" style={{ color: balStyle.color }}>
              {owed ? `${otherName} te debe ${formatCLP(mine)}`
                : owes ? `Le debes ${formatCLP(-mine)} a ${otherName}`
                : expenses.length === 0 ? 'Sin gastos todavía' : 'Están a mano'}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-2)' }}>
              {owed ? 'Pusiste más de lo que te correspondía.' : owes ? 'Pusiste menos de lo que te correspondía.' : 'Nadie le debe nada a nadie.'}
            </p>
            {mine !== 0 && !closed && (
              <div className="mt-3">
                {!settleOpen ? (
                  <button onClick={() => setSettleOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold"
                    style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
                    <Handshake className="w-3.5 h-3.5" /> Saldar
                  </button>
                ) : (
                  <div className="rounded-xl p-3" style={{ background: 'var(--surface)' }}>
                    <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
                      {owed
                        ? `¿${otherName} te transfirió ${formatCLP(mine)}?`
                        : `¿Le transferiste ${formatCLP(-mine)} a ${otherName}?`}
                      {' '}Esto solo registra la transferencia; no crea gastos ni ingresos.
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => setSettleOpen(false)} className="flex-1 py-2 text-xs font-semibold rounded-lg border"
                        style={{ borderColor: 'var(--border)', color: 'var(--ink-2)' }}>Todavía no</button>
                      <button disabled={busy} onClick={async () => {
                        // Quien debe le transfiere a quien puso de más
                        const from = owes ? meId : otherId!
                        const to   = owes ? otherId! : meId
                        const ok = await run(() => settleShared(group.id, from, to, Math.abs(mine), today), 'Transferencia registrada')
                        if (ok) setSettleOpen(false)
                      }} className="flex-1 py-2 text-xs font-bold rounded-lg disabled:opacity-50"
                        style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
                        {owes ? 'Sí, ya transferí' : 'Sí, me transfirió'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { l: 'Total gastado', v: bal.total },
              { l: 'Pusiste tú', v: myPaid },
              { l: 'Te correspondía', v: myShare },
            ].map(s => (
              <div key={s.l} className="card p-3 lg:p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-3)' }}>{s.l}</p>
                <p className="text-sm lg:text-lg font-bold tabular-nums mt-1 whitespace-nowrap" style={{ color: 'var(--ink)' }}>{formatCLP(s.v)}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Gastos */}
      {accepted && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Gastos del viaje</h2>
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
              Aún no hay gastos. Agrega el primero (el alojamiento, los pasajes…) y la app calcula la parte de cada uno.
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
                      const myPart = meIsA ? e.share_a : e.share_b
                      const payer = e.paid_by === meId ? 'tú' : (names[e.paid_by] ?? 'la otra persona')
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
      )}

      {/* Transferencias */}
      {settlements.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>Transferencias entre ustedes</h2>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {settlements.map(s => (
              <div key={s.id} className="flex items-center gap-3 py-2">
                <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--mint)' }} />
                <p className="flex-1 text-sm" style={{ color: 'var(--ink-2)' }}>
                  {s.from_user === meId ? 'Le transferiste' : `${names[s.from_user] ?? 'La otra persona'} te transfirió`}{' '}
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

      {/* Mi categoría + cerrar */}
      {accepted && (
        <div className="card p-4 space-y-3">
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Tu parte en tus gastos</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
              Cada gasto del viaje queda en tu historial solo con lo que te toca, en esta categoría. {otherName} elige la suya.
            </p>
            <select
              value={myCategoryId ?? ''}
              onChange={e => e.target.value && run(() => setMySharedCategory(group.id, e.target.value), 'Categoría actualizada')}
              className="mt-2 w-full text-sm border px-3 py-2.5 rounded-xl outline-none"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)' }}>
              {!myCategoryId && <option value="">Sin categoría</option>}
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button disabled={busy} onClick={() => run(() => setSharedGroupClosed(group.id, !closed), closed ? 'Viaje reabierto' : 'Viaje cerrado')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
            {closed ? <><Unlock className="w-3.5 h-3.5" /> Reabrir viaje</> : <><Lock className="w-3.5 h-3.5" /> Cerrar viaje</>}
          </button>
        </div>
      )}

      {sheet && accepted && (
        <SharedExpenseSheet
          group={group} meId={meId} names={names} paymentMethods={paymentMethods}
          expense={sheet.expense} today={today} onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}
