'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, ChevronUp, HandCoins, Check, MessageCircle, AlertTriangle } from 'lucide-react'
import { formatCLP, isEmoji, daysBetween, billingPeriod, statementDueDate } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import ExpenseRowIcon from '@/components/ExpenseRowIcon'
import { catOf, methodOf, shortDate, longDate, CLOSING, DUE_DAY, type DDebt, type DExpense } from './data'
import { sum } from './calc'

// Piezas que replican, con los mismos tokens y clases, las de la app real
// (ExpenseList compacto, filas de categoría, tarjeta «Te deben»). Las reales
// escriben en Supabase; estas trabajan en memoria.

export function dayLabel(date: string, today: string) {
  const d = daysBetween(date, today)
  return d === 0 ? 'Hoy' : d === 1 ? 'Ayer' : shortDate(date)
}

export function ExpenseRow({ e, today, onOpen, size = 36 }: { e: DExpense; today: string; onOpen: (e: DExpense) => void; size?: number }) {
  const c = catOf(e.categoryId)
  return (
    <button type="button" onClick={() => onOpen(e)}
      className="w-full flex items-center gap-3 px-4 py-3 lg:py-3.5 text-left transition-opacity hover:opacity-80 active:opacity-70">
      <ExpenseRowIcon description={e.description} categoryName={c.name} categoryColor={c.color} categoryBg={c.bg} size={size} />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--ink)' }}>{e.description}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="flex items-center gap-1 min-w-0 text-[11px] font-medium truncate" style={{ color: 'var(--ink-2)' }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
            <span className="truncate">{c.name}</span>
          </span>
          <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--ink-2)' }}>· {dayLabel(e.date, today)}</span>
        </div>
      </div>
      <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>{formatCLP(e.amount)}</p>
      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--ink-3)' }} />
    </button>
  )
}

export function CategoryRows({ rows }: { rows: { cat: ReturnType<typeof catOf>; total: number }[] }) {
  const max = rows[0]?.total ?? 1
  return (
    <>
      {rows.map(({ cat: c, total }) => {
        const limit = c.limit
        const catPct = limit ? Math.min(100, Math.round((total / limit) * 100)) : Math.round((total / max) * 100)
        const over = limit ? total > limit : false
        const overPct = limit && over ? Math.round(((total - limit) / limit) * 100) : 0
        const mildOver = over && overPct < 15
        const hardOver = over && overPct >= 15
        const barColor = hardOver ? 'var(--coral)' : mildOver ? 'var(--gold)' : limit && catPct >= 80 ? 'var(--gold)' : c.color
        const status = hardOver ? `+${formatCLP(total - limit!)} sobre` : mildOver ? `+${overPct}% · cuidado` : limit ? `${catPct}% de ${formatCLP(limit)}` : 'Sin límite'
        const statusColor = hardOver ? 'var(--coral-ink)' : mildOver ? 'var(--gold-ink)' : 'var(--ink-2)'
        const Icon = isEmoji(c.icon) ? null : getCategoryIcon(c.icon)
        return (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3.5 lg:py-4">
            <div className="w-10 h-10 lg:w-9 lg:h-9 rounded-xl flex items-center justify-center flex-shrink-0 cat-icon-bg"
              style={{ '--cat-bg': c.bg, '--cat-color': c.color } as React.CSSProperties}>
              {Icon ? <Icon className="w-5 h-5 lg:w-4 lg:h-4" style={{ color: c.color }} /> : <span className="text-lg lg:text-sm">{c.icon}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--ink)' }}>{c.name}</p>
                <div className="text-right flex-shrink-0">
                  <p className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(total)}</p>
                  <p className="text-[11px] font-semibold lg:hidden" style={{ color: statusColor }}>{status}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="progress-track flex-1 h-1.5 rounded-full overflow-hidden" style={{ '--bar-color': barColor } as React.CSSProperties}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${catPct}%`, backgroundColor: barColor }} />
                </div>
                <p className="hidden lg:block text-[11px] font-semibold flex-shrink-0 w-32 text-right" style={{ color: statusColor }}>{status}</p>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}

const STALE_DAYS = 7
const ago = (d: number) => (d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`)

export function groupDebts(debts: DDebt[], today: string) {
  const open = debts.filter(d => !d.paid)
  const people = new Map<string, { name: string; items: DDebt[] }>()
  for (const d of open) {
    const p = people.get(d.person) ?? { name: d.person, items: [] }
    p.items.push(d); people.set(d.person, p)
  }
  return [...people.values()]
    .map(p => {
      const items = [...p.items].sort((a, b) => (a.date < b.date ? -1 : 1))
      return { name: p.name, items, total: sum(items.map(i => i.amount)), oldestDays: daysBetween(items[0].date, today) }
    })
    .sort((a, b) => b.oldestDays - a.oldestDays)
}

export function DebtsCard({ debts, today, onPaid, onForgive }: {
  debts: DDebt[]; today: string
  onPaid: (ids: string[], who: string, total: number) => void
  onForgive: (id: string, who: string, amount: number) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const people = groupDebts(debts, today)
  if (people.length === 0) return null
  const pending = sum(people.map(p => p.total))
  const stale = people.filter(p => p.oldestDays >= STALE_DAYS).length
  const st = billingPeriod(today, CLOSING)
  const dueDate = statementDueDate(st.month, st.year, DUE_DAY)
  const soon = daysBetween(today, dueDate) <= 3

  return (
    <div className="card-flat overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <HandCoins className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} />
          <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Te deben</h2>
          {stale > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
              style={{ background: 'color-mix(in srgb, var(--gold) 15%, var(--surface))', color: 'var(--gold-ink)' }}>
              {stale} con +{STALE_DAYS} días
            </span>
          )}
        </div>
        <span key={pending} className="sd-flip text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(pending)}</span>
      </div>
      <p className="px-4 -mt-1 pb-3 text-[11px] leading-snug flex items-start gap-1.5" style={{ color: soon ? 'var(--gold-ink)' : 'var(--ink-3)' }}>
        {soon && <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-px" />}
        <span>Tu Visa vence el {longDate(dueDate)} y trae {formatCLP(pending)} que pagaste por otros.</span>
      </p>

      <div className="[&>*+*]:border-t [&>*+*]:border-[color-mix(in_srgb,var(--border)_55%,transparent)]">
        {people.map(p => {
          const isOpen = open === p.name
          const isStale = p.oldestDays >= STALE_DAYS
          return (
            <div key={p.name}>
              <button type="button" onClick={() => setOpen(isOpen ? null : p.name)} aria-expanded={isOpen}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition-opacity hover:opacity-80">
                <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                  style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>{p.name.charAt(0)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{p.name}</span>
                  <span className="block text-[11px] truncate" style={{ color: isStale ? 'var(--gold-ink)' : 'var(--ink-2)' }}>
                    {p.items.length === 1 ? `${p.items[0].concept} · ${ago(p.oldestDays)}` : `${p.items.length} gastos · el más antiguo ${ago(p.oldestDays)}`}
                  </span>
                </span>
                <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>{formatCLP(p.total)}</span>
                {isOpen ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} /> : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />}
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-3 sd-flip">
                  {p.items.length > 1 && (
                    <ul className="space-y-1.5">
                      {p.items.map(it => (
                        <li key={it.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate" style={{ color: 'var(--ink-2)' }}>{it.concept} · {shortDate(it.date)}</span>
                          <span className="flex items-center gap-2 flex-shrink-0">
                            <span className="tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>{formatCLP(it.amount)}</span>
                            <button type="button" onClick={() => onForgive(it.id, p.name, it.amount)} className="text-[11px] font-semibold min-h-[32px]" style={{ color: 'var(--ink-3)' }}>Lo asumo</button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => onPaid(p.items.map(i => i.id), p.name, p.total)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 min-h-[44px] rounded-xl text-sm font-bold active:scale-[.98] transition-transform"
                      style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
                      <Check className="w-4 h-4" /> Me pagó {formatCLP(p.total)}
                    </button>
                    <span className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold"
                      style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
                      <MessageCircle className="w-4 h-4" /> Recordar
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Estado de la Visa al que cae un gasto con tarjeta: cierre y fecha de pago. */
export function statementNote(e: DExpense) {
  if (methodOf(e.methodId).type !== 'credit') return null
  const { month, year } = billingPeriod(e.date, CLOSING)
  return {
    close: `${year}-${String(month).padStart(2, '0')}-${String(CLOSING).padStart(2, '0')}`,
    due: statementDueDate(month, year, DUE_DAY),
  }
}
