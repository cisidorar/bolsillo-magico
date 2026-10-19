'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PiggyBank, Calendar, Pencil, CircleCheck, TriangleAlert, CircleHelp } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { useToast } from '@/components/ToastProvider'
import { saveTripGoal, addToTripGoal } from '@/app/actions/shared'
import { budgetTotal, myBudgetShare, tripAffordability, type TripBudget, type TripVerdict } from '@/lib/trip-plan'

export interface TripGoal { id: string; target_amount: number; current_amount: number; target_date: string | null }

// El veredicto que tripAffordability() ya calcula (ready/yes/tight/no/unknown)
// se mostraba antes solo como un matiz de la frase de abajo. Acá es el primer
// hecho que se lee — una insignia con la misma jerarquía de severidad del
// resto de la app (nunca coral: nada acá es urgente hoy).
const VERDICT_BADGE: Record<TripVerdict, { label: string; color: string; bg: string; icon: typeof CircleCheck }> = {
  ready:   { label: 'Cubierto',          color: 'var(--mint)',     bg: 'rgba(31,190,141,0.12)',  icon: CircleCheck },
  yes:     { label: 'Vas bien',          color: 'var(--mint)',     bg: 'rgba(31,190,141,0.12)',  icon: CircleCheck },
  tight:   { label: 'Justo',             color: 'var(--gold-ink)', bg: 'rgba(255,194,60,0.15)',  icon: TriangleAlert },
  no:      { label: 'No alcanza a tiempo', color: 'var(--gold-ink)', bg: 'rgba(255,194,60,0.15)', icon: TriangleAlert },
  unknown: { label: 'Falta info',        color: 'var(--ink-2)',    bg: 'var(--surface-2)',       icon: CircleHelp },
}

export default function TripPlanCard({
  groupId, groupName, budget, people, myFraction, capacity, myPaid, goal, startDate, today, closed,
  onEditBudget, onEditDates, derived = false, split,
}: {
  /** Composición del plan: reservas por pagar vs. gasto durante el viaje */
  split?:       { before: number; during: number }
  /** El total sale de lo agregado (por pagar + pagado), no de un presupuesto explícito */
  derived?:     boolean
  groupId:      string
  groupName:    string
  budget:       TripBudget
  people:       number
  /** Tu porción del reparto (según sueldo) o null = partes iguales */
  myFraction:   number | null
  /** Lo que ahorras al mes en promedio; null sin ingresos registrados */
  capacity:     number | null
  /** Tu parte de los gastos ya registrados en el viaje */
  myPaid:       number
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
  // La meta es lo que te falta pagar de tu parte (lo ya registrado en el viaje ya salió de tu bolsillo).
  const goalTarget = Math.max(0, myShare - myPaid)

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

  // Sin presupuesto no hay nada que mostrar acá — TripSpendHero ya cubre el
  // estado "¿te alcanza?" inicial con el mismo CTA de estimar costos.
  if (total === 0) return null

  const pct = goal && goal.target_amount > 0 ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100)) : 0

  const alone = people <= 1
  const covered = a.remaining === 0 && myShare > 0

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>{alone ? 'Lo que cuesta el viaje' : 'Tu parte estimada'}</p>
          <p className="font-display text-3xl font-extrabold tabular-nums mt-0.5 leading-none" style={{ color: 'var(--ink)' }}>{formatCLP(myShare)}</p>
          <p className="text-xs mt-1.5" style={{ color: 'var(--ink-3)' }}>
            {alone
              ? (derived ? 'Suma de lo que agregaste' : 'Según tu presupuesto')
              : `de ${formatCLP(total)} · ${people} personas, ${myFraction != null ? 'según lo que gana cada uno' : 'partes iguales'}`}
          </p>
          {(() => {
            const vb = VERDICT_BADGE[a.verdict]
            return (
              <span className="inline-flex items-center gap-1.5 mt-2.5 px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: vb.bg, color: vb.color }}>
                <vb.icon className="w-3.5 h-3.5" /> {vb.label}
              </span>
            )
          })()}
        </div>
        {!closed && (
          <button onClick={onEditBudget} className="inline-flex items-center gap-1 text-xs font-semibold flex-shrink-0 min-h-[44px] px-2 -mt-2 -mr-2" style={{ color: 'var(--primary)' }}>
            <Pencil className="w-3.5 h-3.5" /> {derived ? 'Presupuesto' : 'Editar'}
          </button>
        )}
      </div>

      {/* De qué se compone: lo que se paga antes de salir vs. lo que se gasta en ruta */}
      {split && split.before + split.during > 0 && (
        <div>
          <div className="flex h-2 rounded-full overflow-hidden gap-0.5" role="img"
            aria-label={`Antes de salir ${formatCLP(split.before)}, durante el viaje ${formatCLP(split.during)}`}>
            {split.before > 0 && <div style={{ flex: split.before, background: 'var(--primary)' }} />}
            {split.during > 0 && <div style={{ flex: split.during, background: 'rgba(77,147,255,0.35)' }} />}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs">
            <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--primary)' }} />
              Antes de salir <b className="tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(split.before)}</b>
            </span>
            <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: 'rgba(77,147,255,0.35)' }} />
              Durante el viaje <b className="tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(split.during)}</b>
            </span>
          </div>
        </div>
      )}

      {/* Ritmo: cuánto apartar al mes para llegar con todo pagado — el veredicto ya está arriba */}
      {covered ? null
      : a.perMonth != null && a.months != null && a.months > 0 ? (
        <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
          Para llegar con todo pagado: aparta{' '}
          <b className="tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(a.perMonth)} al mes</b>
          {' '}durante {a.months} {a.months === 1 ? 'mes' : 'meses'}.
        </p>
      ) : !startDate && !closed ? (
        <button onClick={onEditDates} className="inline-flex items-center gap-1.5 text-xs font-semibold min-h-[44px] -my-2" style={{ color: 'var(--primary)' }}>
          <Calendar className="w-3.5 h-3.5" /> Pon la fecha de salida para saber cuánto apartar al mes
        </button>
      ) : null}

      {/* Meta de ahorro */}
      {!covered || goal ? (
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
                    <button disabled={busy} onClick={addSaving} className="text-xs font-bold min-h-[44px] px-2" style={{ color: 'var(--primary)' }}>Sumar</button>
                    <button onClick={() => setAddOpen(false)} className="text-xs min-h-[44px] px-2" style={{ color: 'var(--ink-3)' }}>Cancelar</button>
                  </div>
                ) : (
                  <button onClick={() => setAddOpen(true)} className="text-xs font-semibold min-h-[44px] pr-2" style={{ color: 'var(--primary)' }}>+ Sumar ahorro</button>
                )}
                {goal.target_amount !== goalTarget && goalTarget > 0 && (
                  <button disabled={busy} onClick={createGoal} className="text-xs font-semibold min-h-[44px] px-2" style={{ color: 'var(--ink-3)' }}>
                    Ajustar meta a {formatCLP(goalTarget)}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : !closed && goalTarget > 0 && (
          <button disabled={busy} onClick={createGoal}
            className="w-full flex items-center justify-center gap-1.5 py-3 min-h-[44px] rounded-xl text-xs font-bold border disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: 'var(--surface)' }}>
            <PiggyBank className="w-4 h-4" /> Crear meta de ahorro de {formatCLP(goalTarget)}
          </button>
        )
      ) : null}

      {error && <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{error}</p>}
    </div>
  )
}
