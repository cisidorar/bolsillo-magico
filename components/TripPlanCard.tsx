'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, ThumbsUp, AlertTriangle, Info, PiggyBank, Calendar, Pencil } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { useToast } from '@/components/ToastProvider'
import { saveTripGoal, addToTripGoal } from '@/app/actions/shared'
import { TRIP_CATEGORIES, type TripCategory } from '@/lib/shared-split'
import { budgetTotal, myBudgetShare, tripAffordability, type TripBudget, type TripVerdict } from '@/lib/trip-plan'

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

// UX5: nada de esto es urgente "hoy" → nunca coral. mint = confirmación, gold = atención.
const VERDICT: Record<TripVerdict, { label: string; color: string; bg: string; icon: typeof ThumbsUp }> = {
  ready:   { label: 'Ya lo tienes cubierto',     color: 'var(--mint)',  bg: 'rgba(31,190,141,0.12)', icon: ThumbsUp },
  yes:     { label: 'Te alcanza',                 color: 'var(--mint)',  bg: 'rgba(31,190,141,0.12)', icon: ThumbsUp },
  tight:   { label: 'Te alcanza, pero justo',     color: 'var(--gold)',  bg: 'rgba(255,194,60,0.14)', icon: AlertTriangle },
  no:      { label: 'Así no te alcanza a tiempo', color: 'var(--gold)',  bg: 'rgba(255,194,60,0.14)', icon: AlertTriangle },
  unknown: { label: 'Falta saber cuánto ahorras', color: 'var(--ink-2)', bg: 'var(--surface-2)',      icon: Info },
}

function monthLabel(today: string, plusMonths: number): string {
  const d = new Date(today + 'T12:00:00')
  d.setMonth(d.getMonth() + plusMonths)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export interface TripGoal { id: string; target_amount: number; current_amount: number; target_date: string | null }

export default function TripPlanCard({
  groupId, groupName, budget, people, myFraction, capacity, myPaid, spent, goal, startDate, today, closed,
  onEditBudget, onEditDates,
}: {
  groupId:      string
  groupName:    string
  budget:       TripBudget
  people:       number
  /** Tu porción del reparto (según sueldo) o null = parejo */
  myFraction:   number | null
  /** Lo que ahorras al mes en promedio; null sin ingresos registrados */
  capacity:     number | null
  /** Tu parte de los gastos ya registrados en el viaje */
  myPaid:       number
  /** Gastado del grupo por categoría */
  spent:        Record<TripCategory, number>
  goal:         TripGoal | null
  startDate:    string | null
  today:        string
  closed:       boolean
  onEditBudget: () => void
  onEditDates:  () => void
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [add, setAdd] = useState('')
  const [error, setError] = useState('')

  const total = budgetTotal(budget)
  const myShare = myBudgetShare(total, people, myFraction)
  const saved = goal?.current_amount ?? 0
  const a = tripAffordability({ myShare, covered: myPaid + saved, capacity, startDate, today })
  const v = VERDICT[a.verdict]
  const spentTotal = Object.values(spent).reduce((s, x) => s + x, 0)
  // La meta es lo que te falta pagar de tu parte (lo ya registrado en el viaje ya salió de tu bolsillo).
  const goalTarget = Math.max(0, myShare - myPaid)
  const rows = TRIP_CATEGORIES.filter(c => (budget[c.key] ?? 0) > 0 || spent[c.key] > 0)

  async function createGoal() {
    setBusy(true); setError('')
    const res = await saveTripGoal({ groupId, goalId: goal?.id ?? null, name: groupName, target: goalTarget, targetDate: startDate })
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    showToast(goal ? 'Meta actualizada' : 'Meta de ahorro creada')
    router.refresh()
  }

  async function addSaving() {
    const n = parseInt(add.replace(/\D/g, ''), 10) || 0
    if (!goal || n <= 0) return
    setBusy(true); setError('')
    const res = await addToTripGoal(goal.id, n)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    setAdd(''); setAddOpen(false)
    showToast(`Sumaste ${formatCLP(n)} al viaje`)
    router.refresh()
  }

  // ── Sin presupuesto: una sola pregunta ────────────────────────────────────
  if (total === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-soft)' }}>
            <Wallet className="w-5 h-5" style={{ color: 'var(--primary)' }} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>¿Te alcanza para este viaje?</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
              Estima cuánto costaría (alojamiento, pasajes, comida…) y cuántos van. Con lo que ahorras cada mes te decimos si llegas y cuánto apartar.
            </p>
            {!closed && (
              <button onClick={onEditBudget}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold"
                style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
                Estimar costos
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const pct = goal && goal.target_amount > 0 ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100)) : 0

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Tu parte estimada</p>
          <p className="font-display text-3xl font-bold tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>{formatCLP(myShare)}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
            de {formatCLP(total)} en total{people > 1 ? ` · ${people} personas${myFraction != null ? ', según sueldo' : ', parejo'}` : ''}
          </p>
        </div>
        {!closed && (
          <button onClick={onEditBudget} className="inline-flex items-center gap-1 text-xs font-semibold flex-shrink-0" style={{ color: 'var(--primary)' }}>
            <Pencil className="w-3.5 h-3.5" /> Editar
          </button>
        )}
      </div>

      {/* Veredicto */}
      <div className="rounded-2xl p-3.5" style={{ background: v.bg }}>
        <p className="flex items-center gap-1.5 text-sm font-bold" style={{ color: v.color }}>
          <v.icon className="w-4 h-4" /> {v.label}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--ink-2)' }}>
          {a.verdict === 'ready' && 'Entre lo que ya pagaste y lo que tienes ahorrado para el viaje, tu parte está cubierta.'}
          {a.verdict === 'unknown' && 'Registra tus ingresos de los últimos meses en Ingresos y aquí verás si llegas a tiempo.'}
          {(a.verdict === 'yes' || a.verdict === 'tight' || a.verdict === 'no') && (
            <>
              Ahorras unos {formatCLP(Math.max(0, capacity ?? 0))} al mes.{' '}
              {a.perMonth != null && a.months != null && a.months > 0
                ? <>Para llegar a la salida necesitas apartar <b className="tabular-nums">{formatCLP(a.perMonth)}</b> al mes durante {a.months} {a.months === 1 ? 'mes' : 'meses'}.</>
                : a.perMonth != null
                  ? <>Te faltan <b className="tabular-nums">{formatCLP(a.remaining)}</b> y la salida ya llegó.</>
                  : a.monthsToSave != null
                    ? <>A ese ritmo juntas los {formatCLP(a.remaining)} que faltan en {a.monthsToSave} {a.monthsToSave === 1 ? 'mes' : 'meses'}: podrías ir desde {monthLabel(today, a.monthsToSave)}.</>
                    : <>Hoy estás gastando todo lo que entra, así que no queda margen para el viaje.</>}
              {a.verdict === 'no' && a.monthsToSave != null && a.perMonth != null && (
                <> Al ritmo actual lo juntas en {a.monthsToSave} {a.monthsToSave === 1 ? 'mes' : 'meses'} ({monthLabel(today, a.monthsToSave)}): mueve la fecha, baja el presupuesto o recorta otro gasto.</>
              )}
            </>
          )}
        </p>
        {!startDate && !closed && a.verdict !== 'ready' && (
          <button onClick={onEditDates} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--primary)' }}>
            <Calendar className="w-3.5 h-3.5" /> Poner fecha de salida
          </button>
        )}
      </div>

      {/* Meta de ahorro */}
      {a.verdict !== 'ready' || goal ? (
        goal ? (
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--ink-2)' }}>
                <PiggyBank className="w-3.5 h-3.5" /> Ahorrado para el viaje
              </span>
              <span className="tabular-nums" style={{ color: 'var(--ink-3)' }}>
                {formatCLP(goal.current_amount)} de {formatCLP(goal.target_amount)}
              </span>
            </div>
            <div className="h-2 rounded-full mt-1.5 overflow-hidden" style={{ background: 'var(--surface-2)' }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--mint)' }} />
            </div>
            {!closed && (
              <div className="flex flex-wrap items-center gap-3 mt-2">
                {addOpen ? (
                  <div className="flex items-center gap-2">
                    <input inputMode="numeric" autoFocus value={add} placeholder="$ monto"
                      onChange={e => setAdd(e.target.value.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.'))}
                      className="w-28 text-sm border px-2.5 py-1.5 rounded-lg outline-none tabular-nums"
                      style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }} />
                    <button disabled={busy} onClick={addSaving} className="text-xs font-bold" style={{ color: 'var(--primary)' }}>Sumar</button>
                    <button onClick={() => setAddOpen(false)} className="text-xs" style={{ color: 'var(--ink-3)' }}>Cancelar</button>
                  </div>
                ) : (
                  <button onClick={() => setAddOpen(true)} className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>+ Sumar ahorro</button>
                )}
                {goal.target_amount !== goalTarget && goalTarget > 0 && (
                  <button disabled={busy} onClick={createGoal} className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
                    Ajustar meta a {formatCLP(goalTarget)}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : !closed && goalTarget > 0 && (
          <button disabled={busy} onClick={createGoal}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: 'var(--surface)' }}>
            <PiggyBank className="w-4 h-4" /> Crear meta de ahorro de {formatCLP(goalTarget)}
          </button>
        )
      ) : null}

      {error && <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{error}</p>}

      {/* Presupuesto vs gastado (solo si ya hay gastos) */}
      {spentTotal > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
            Gastado del grupo: {formatCLP(spentTotal)} de {formatCLP(total)}
          </p>
          {rows.map(c => {
            const b = budget[c.key] ?? 0, s = spent[c.key]
            const over = b > 0 && s > b
            const w = b > 0 ? Math.min(100, Math.round((s / b) * 100)) : 100
            return (
              <div key={c.key}>
                <div className="flex justify-between text-[11px]">
                  <span style={{ color: 'var(--ink-2)' }}>{c.label}</span>
                  <span className="tabular-nums" style={{ color: over ? 'var(--gold)' : 'var(--ink-3)' }}>
                    {formatCLP(s)}{b > 0 ? ` / ${formatCLP(b)}` : ' (sin estimar)'}
                  </span>
                </div>
                <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                  <div className="h-full rounded-full" style={{ width: `${w}%`, background: over ? 'var(--gold)' : 'var(--primary)' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
