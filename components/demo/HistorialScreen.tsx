'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Search, SlidersHorizontal, Wallet, TrendingUp, Calendar } from 'lucide-react'
import { formatCLP, isEmoji, billingPeriod } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import { PaymentIcon } from '@/components/PaymentIcon'
import ExpenseRowIcon from '@/components/ExpenseRowIcon'
import InfoTap from '@/components/InfoTap'
import { CATEGORIES, MONTHS, catOf, methodOf, statementOf, CLOSING, monthShort, type DExpense } from './data'
import { sum, pad, type MonthCtx } from './calc'

interface Props {
  ctx: MonthCtx
  expenses: DExpense[]
  prevTotal: number
  onOpenExpense: (e: DExpense) => void
}

const ddmmyyyy = (s: string) => `${s.slice(8)}/${s.slice(5, 7)}/${s.slice(0, 4)}`

export default function HistorialScreen({ ctx, expenses, prevTotal, onOpenExpense }: Props) {
  const [offset, setOffset] = useState(0)
  const [billing, setBilling] = useState(false)
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [cats, setCats] = useState<string[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const sel = useMemo(() => {
    const t = ctx.year * 12 + (ctx.month - 1) + offset
    return { month: (t % 12) + 1, year: Math.floor(t / 12) }
  }, [ctx, offset])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return expenses
      .filter(e => {
        if (billing) {
          const st = statementOf(e)
          if (st.month !== sel.month || st.year !== sel.year) return false
        } else if (!e.date.startsWith(`${sel.year}-${pad(sel.month)}`)) return false
        if (cats.length && !cats.includes(e.categoryId)) return false
        if (q && !(e.description.toLowerCase().includes(q) || catOf(e.categoryId).name.toLowerCase().includes(q))) return false
        return true
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [expenses, billing, sel, cats, query])

  const total = sum(rows.map(e => e.amount))
  const isCurrent = offset === 0
  const days = isCurrent ? Math.max(1, ctx.todayDate) : new Date(sel.year, sel.month, 0).getDate()
  const delta = isCurrent && prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null

  const groups = useMemo(() => {
    const m = new Map<string, DExpense[]>()
    for (const e of rows) m.set(e.date, [...(m.get(e.date) ?? []), e])
    return [...m.entries()]
  }, [rows])

  const monthLabel = MONTHS[sel.month - 1][0].toUpperCase() + MONTHS[sel.month - 1].slice(1)
  const toggleCat = (id: string) => setCats(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]))

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h1 className="text-xl lg:text-2xl font-bold" style={{ color: 'var(--ink)' }}>Historial</h1>
        <div className="flex items-center gap-1 rounded-xl px-1" style={{ background: 'var(--surface)' }}>
          <button type="button" aria-label="Mes anterior" disabled={offset <= -1} onClick={() => setOffset(o => o - 1)}
            className="w-11 h-11 flex items-center justify-center disabled:opacity-30" style={{ color: 'var(--primary)' }}><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-semibold min-w-[96px] text-center" style={{ color: 'var(--primary)' }}>{monthLabel}</span>
          <button type="button" aria-label="Mes siguiente" disabled={offset >= 0} onClick={() => setOffset(o => o + 1)}
            className="w-11 h-11 flex items-center justify-center disabled:opacity-30" style={{ color: 'var(--primary)' }}><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
        {[
          { Icon: Wallet, bg: 'var(--surface-2)', fg: 'var(--ink-2)', label: 'Total del mes', value: formatCLP(total), sub: `${rows.length} registros`, tone: 'var(--ink)' },
          { Icon: TrendingUp, bg: 'color-mix(in srgb, var(--coral) 14%, var(--surface))', fg: 'var(--coral-ink)', label: `vs mes anterior${isCurrent ? ` · día ${ctx.todayDate}` : ''}`,
            value: delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta}%`, sub: delta === null ? 'sin comparación' : `${delta > 0 ? '+' : '−'}${formatCLP(Math.abs(total - prevTotal))}`, tone: delta !== null && delta > 0 ? 'var(--coral-ink)' : 'var(--ink)' },
          { Icon: Calendar, bg: 'var(--surface-2)', fg: 'var(--ink-2)', label: 'Promedio diario', value: formatCLP(Math.round(total / days)), sub: 'por día', tone: 'var(--ink)' },
        ].map(({ Icon, bg, fg, label, value, sub, tone }) => (
          <div key={label} className="card-flat p-4 flex items-center gap-3.5">
            <span className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
              <Icon className="w-5 h-5" style={{ color: fg }} />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-medium truncate" style={{ color: 'var(--ink-2)' }}>{label}</span>
              <span key={value} className="sd-flip block text-xl font-extrabold tabular-nums leading-tight" style={{ color: tone }}>{value}</span>
              <span className="block text-[11px]" style={{ color: 'var(--ink-3)' }}>{sub}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2.5 mt-5">
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--surface)' }} role="group" aria-label="Cómo ver los gastos">
          {[[false, 'Compra'], [true, 'Facturación']].map(([v, l]) => (
            <button key={String(v)} type="button" aria-pressed={billing === v} onClick={() => setBilling(v as boolean)}
              className="px-3.5 min-h-[40px] rounded-lg text-xs font-bold transition-colors"
              style={billing === v ? { background: 'var(--primary)', color: 'var(--primary-ink)' } : { color: 'var(--ink-2)' }}>
              {l as string}
            </button>
          ))}
        </div>
        <InfoTap explanation={billing
          ? `Por facturación: cada compra con la Visa se cuenta en el estado de cuenta donde la pagas (cierra el ${CLOSING}).`
          : 'Por compra: cada gasto se cuenta en el mes en que lo hiciste.'} />
        <label className="flex-1 min-w-[200px] flex items-center gap-2 px-3.5 min-h-[44px] rounded-xl" style={{ background: 'var(--surface)' }}>
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar gasto, comercio o categoría..."
            className="flex-1 bg-transparent outline-none text-sm min-w-0" style={{ color: 'var(--ink)' }} />
        </label>
        <button type="button" onClick={() => setFiltersOpen(o => !o)} aria-expanded={filtersOpen}
          className="flex items-center gap-2 px-3.5 min-h-[44px] rounded-xl text-sm font-semibold" style={{ background: 'var(--surface)', color: cats.length ? 'var(--primary)' : 'var(--ink-2)' }}>
          <SlidersHorizontal className="w-4 h-4" /> Filtros{cats.length ? ` · ${cats.length}` : ''} <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {filtersOpen && (
        <div className="flex flex-wrap gap-2 mt-3 sd-flip">
          {CATEGORIES.map(c => {
            const on = cats.includes(c.id)
            return (
              <button key={c.id} type="button" aria-pressed={on} onClick={() => toggleCat(c.id)}
                className="px-3 min-h-[36px] rounded-full text-xs font-semibold transition-colors"
                style={on ? { background: c.color, color: '#fff' } : { background: 'var(--surface)', color: 'var(--ink-2)' }}>
                {c.name}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-center justify-between mt-5 mb-3">
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'var(--surface)', color: 'var(--ink-2)' }}>{rows.length} registros</span>
        {billing && <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Estado de {MONTHS[sel.month - 1]}: las compras con Visa se cuentan donde las pagas</span>}
      </div>

      {groups.length === 0 ? (
        <div className="card-flat p-8 text-center text-sm" style={{ color: 'var(--ink-3)' }}>No hay gastos con estos filtros.</div>
      ) : (
        <div className="space-y-3">
          {groups.map(([date, list]) => {
            const shut = collapsed.has(date)
            return (
              <div key={date}>
                <button type="button" aria-expanded={!shut}
                  onClick={() => setCollapsed(s => { const n = new Set(s); if (n.has(date)) n.delete(date); else n.add(date); return n })}
                  className="w-full flex items-center justify-between min-h-[44px] pl-2.5 pr-1" style={{ borderLeft: '2px solid var(--primary)' }}>
                  <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{ddmmyyyy(date)}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--surface)', color: 'var(--ink-3)' }}>{list.length}</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(sum(list.map(e => e.amount)))}</span>
                    {shut ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--ink-3)' }} /> : <ChevronUp className="w-4 h-4" style={{ color: 'var(--ink-3)' }} />}
                  </span>
                </button>
                {!shut && (
                  <div className="card-flat overflow-hidden mt-1.5 [&>*+*]:border-t [&>*+*]:border-[color-mix(in_srgb,var(--border)_55%,transparent)]">
                    {list.map(e => {
                      const c = catOf(e.categoryId), m = methodOf(e.methodId)
                      const Icon = isEmoji(c.icon) ? null : getCategoryIcon(c.icon)
                      const st = billingPeriod(e.date, m.type === 'credit' ? CLOSING : null)
                      return (
                        <button key={e.id} type="button" onClick={() => onOpenExpense(e)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left transition-opacity hover:opacity-80 active:opacity-70">
                          <ExpenseRowIcon description={e.description} categoryName={c.name} categoryColor={c.color} categoryBg={c.bg} size={40} />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{e.description}</span>
                            <span className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="cat-badge inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                style={{ '--cat-bg': c.bg, '--cat-color': c.color } as React.CSSProperties}>
                                {Icon && <Icon className="w-2.5 h-2.5" />}{c.name}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
                                <PaymentIcon cardType={m.type === 'credit' ? 'credit' : m.type === 'cash' ? 'cash' : 'debit'} />{m.name}
                              </span>
                              {billing && m.type === 'credit' && (
                                <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>· estado de {monthShort(st.month)}</span>
                              )}
                            </span>
                          </span>
                          <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--coral-ink)' }}>−{formatCLP(e.amount)}</span>
                          <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--ink-3)' }} />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
