'use client'

import { Wallet } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { TRIP_CATEGORIES, type TripCategory } from '@/lib/shared-split'
import { budgetTotal, type TripBudget } from '@/lib/trip-plan'
import { TRIP_CATEGORY_ICON } from '@/lib/trip-category-icons'

// Lo primero que se ve al abrir un viaje: cuánto se ha gastado el grupo
// contra el presupuesto. Antes vivía enterrado al final de TripPlanCard y
// solo se mostraba si ya había gasto; ahora es el ancla de la página — y
// cubre también el estado sin presupuesto (antes el early-return de
// TripPlanCard), para que haya un solo lugar que pide estimar costos.
export default function TripSpendHero({
  budget, spent, closed, onEditBudget,
}: {
  budget:       TripBudget
  spent:        Record<TripCategory, number>
  closed:       boolean
  onEditBudget: () => void
}) {
  const total = budgetTotal(budget)
  const spentTotal = Object.values(spent).reduce((s, x) => s + x, 0)

  // Sin presupuesto no hay tarjeta: solo un enlace discreto para estimarlo.
  if (total === 0) {
    return closed ? null : (
      <button onClick={onEditBudget} className="inline-flex items-center gap-1.5 text-xs font-semibold min-h-[44px]" style={{ color: 'var(--primary)' }}>
        <Wallet className="w-3.5 h-3.5" /> Estimar costos del viaje
      </button>
    )
  }

  const pct = Math.round((spentTotal / total) * 100)
  const over = spentTotal > total
  const near = !over && pct >= 90
  const barColor = over || near ? 'var(--gold)' : 'var(--primary)'
  const rows = TRIP_CATEGORIES.filter(c => (budget[c.key] ?? 0) > 0 || spent[c.key] > 0)

  return (
    <div className="card p-5 space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Gastado del viaje</p>
        <p className="font-display text-3xl lg:text-4xl font-extrabold tabular-nums leading-none mt-1.5" style={{ color: 'var(--ink)' }}>
          {formatCLP(spentTotal)}
        </p>
        <p className="text-xs mt-1.5" style={{ color: over || near ? 'var(--gold)' : 'var(--ink-3)' }}>
          de {formatCLP(total)} · {pct}%{over ? ' — se pasó del presupuesto' : ''}
        </p>
        <div className="h-2.5 rounded-full mt-2.5 overflow-hidden" style={{ background: 'var(--surface-2)' }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: barColor }} />
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-2.5 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
          {rows.map(c => {
            const b = budget[c.key] ?? 0, s = spent[c.key]
            const catOver = b > 0 && s > b
            const w = b > 0 ? Math.min(100, Math.round((s / b) * 100)) : 100
            const Icon = TRIP_CATEGORY_ICON[c.key]
            return (
              <div key={c.key} className="flex items-center gap-2.5 pt-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)' }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: 'var(--ink-3)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-[11px]">
                    <span style={{ color: 'var(--ink-2)' }}>{c.label}</span>
                    <span className="tabular-nums" style={{ color: catOver ? 'var(--gold)' : 'var(--ink-3)' }}>
                      {formatCLP(s)}{b > 0 ? ` / ${formatCLP(b)}` : ' (sin estimar)'}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${w}%`, background: catOver ? 'var(--gold)' : 'var(--primary)' }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
