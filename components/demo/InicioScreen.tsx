'use client'

import { Sun, Calendar, Wallet, Plus, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react'
import { formatCLP, daysBetween, statementDueDate, lastDueStatementRange, nextPaydayDate } from '@/lib/utils'
import CicloSueldo from '@/components/CicloSueldo'
import InfoTap from '@/components/InfoTap'
import ServiceLogo from '@/components/ServiceLogo'
import {
  BUDGET, SUELDO, INVERTIDO, LAST_STATEMENT_TOTAL, CLOSING, DUE_DAY, RECURRING,
  MONTHS, WEEKDAYS, greeting, monthShort, shortDate, catOf, type DDebt, type DExpense,
} from './data'
import { summarize, nextChargeDate, type MonthCtx } from './calc'
import { ExpenseRow, CategoryRows, DebtsCard } from './parts'

interface Props {
  ctx: MonthCtx
  expenses: DExpense[]
  debts: DDebt[]
  prevTotal: number
  onOpenExpense: (e: DExpense) => void
  onAdd: () => void
  onGo: (s: 'historial' | 'recurrentes') => void
  onDebtPaid: (ids: string[], who: string, total: number) => void
  onDebtForgive: (id: string, who: string, amount: number) => void
}

export default function InicioScreen({ ctx, expenses, debts, prevTotal, onOpenExpense, onAdd, onGo, onDebtPaid, onDebtForgive }: Props) {
  const s = summarize(expenses, ctx, prevTotal)
  const { dateStr: today, year, month } = ctx

  const isOver = s.total > BUDGET
  const usedPct = Math.min(100, Math.round((s.total / BUDGET) * 100))
  const upcomingPct = Math.max(0, Math.min(100 - usedPct, Math.round((s.upcoming / BUDGET) * 100)))
  const daysRemaining = ctx.daysInMonth - ctx.todayDate
  const prevM = month === 1 ? 12 : month - 1

  const wd = WEEKDAYS[new Date(today + 'T12:00:00').getDay()]
  const dateLabel = `${wd[0].toUpperCase()}${wd.slice(1)}, ${ctx.todayDate} de ${MONTHS[month - 1]} de ${year}`
  const nextPay = nextPaydayDate(today, null, true)
  const daysToPay = nextPay ? daysBetween(today, nextPay) : null

  // Estado de la Visa ya vencido que financió el sueldo anterior (misma lógica de Ciclo de sueldo de la app).
  const last = lastDueStatementRange(CLOSING, DUE_DAY)
  const dueDate = statementDueDate(last.month, last.year, DUE_DAY)
  const card = {
    id: 'visa', name: 'Visa', domain: 'visa.com', statementTotal: LAST_STATEMENT_TOTAL,
    closesOn: last.end, dueDate, daysToDue: daysBetween(today, dueDate),
    statementMonth: last.month, statementYear: last.year,
  }

  const conLimite = s.byCat.filter(x => x.cat.limit)
  const excedidas = conLimite.filter(x => x.total > x.cat.limit!).length

  const proximos = RECURRING
    .map(r => ({ r, date: nextChargeDate(r.day, ctx) }))
    .map(x => ({ ...x, days: daysBetween(today, x.date) }))
    .filter(x => x.days >= 0 && x.days <= 7)
    .sort((a, b) => a.days - b.days)

  const heroLabel = isOver ? 'Sobre el límite' : 'Te quedan'

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg lg:text-xl font-bold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            ¡{greeting(ctx.hour)}, Sofía! <Sun className="w-5 h-5" style={{ color: 'var(--gold)' }} aria-hidden />
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ink-2)' }}>{dateLabel}</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
          {daysToPay !== null && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--surface)', color: 'var(--ink-2)' }}>
              <Wallet className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--mint-ink)' }} />
              {daysToPay === 0 ? 'Hoy es tu sueldo' : `Sueldo en ${daysToPay} días`}
            </div>
          )}
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--surface)', color: 'var(--ink-2)' }}>
            <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} />
            {MONTHS[month - 1][0].toUpperCase() + MONTHS[month - 1].slice(1)} de {year}
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="hero-gradient rounded-3xl px-5 py-5 lg:px-8 lg:py-7 text-white mb-5">
        <div className="flex items-start justify-between gap-4 lg:gap-6">
          <div className="min-w-0">
            <p className="text-sm text-white font-medium mb-1.5 lg:mb-2">Gastado este mes</p>
            <p key={s.total} className="sd-flip text-4xl lg:text-6xl font-extrabold text-white tabular-nums leading-none tracking-tight">{formatCLP(s.total)}</p>
            <p className="text-sm text-white mt-2">de {formatCLP(BUDGET)} presupuestado</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm text-white font-medium mb-1.5 lg:mb-2 flex items-center justify-end gap-1">
              {isOver && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
              {heroLabel}
              <InfoTap explanation="Te quedan = tu presupuesto del período menos lo que ya gastaste." color="#fff" />
            </p>
            <p key={s.total + 1} className="sd-flip text-2xl lg:text-3xl font-bold leading-none text-white tabular-nums">
              {isOver ? `+${formatCLP(s.total - BUDGET)}` : formatCLP(BUDGET - s.total)}
            </p>
          </div>
        </div>

        <div className="mt-6 lg:mt-7">
          <div className="h-3 rounded-full overflow-hidden flex" role="progressbar" aria-label="Presupuesto usado" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usedPct}
            style={{ background: 'rgba(255,255,255,0.18)' }}>
            <div className="h-full transition-all duration-500" style={{ width: `${usedPct}%`, backgroundColor: isOver ? 'var(--coral-on-brand)' : 'var(--gold)' }} />
            {!isOver && upcomingPct > 0 && <div className="h-full transition-all duration-500" style={{ width: `${upcomingPct}%`, backgroundColor: 'rgba(255,255,255,0.22)' }} />}
          </div>
          <div className="flex items-center justify-between gap-3 mt-2 text-xs text-white">
            <span>
              {usedPct}% usado
              {s.upcoming > 0 && !isOver && <> · +{formatCLP(s.upcoming)} vienen este mes</>}
            </span>
            <span className="flex-shrink-0">{daysRemaining} días restantes</span>
          </div>
        </div>

        <div className="flex items-center gap-5 lg:gap-6 mt-5 pt-1 lg:pt-3">
          <div className="min-w-0">
            <p className="text-xs text-white font-medium flex items-center gap-1">
              Proyección
              <InfoTap explanation="Proyección = lo que ya gastaste en variables prorrateado a fin de mes, más los fijos que aún faltan por registrar." color="#fff" />
            </p>
            <p className="text-sm font-bold mt-1 tabular-nums text-white">{formatCLP(s.projection)}</p>
          </div>
          <div className="w-px h-8 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.14)' }} />
          <div className="min-w-0">
            <p className="text-xs text-white font-medium flex items-center gap-1">
              Vs. {monthShort(prevM)}
              <InfoTap explanation="Compara el gasto hasta hoy con el mismo día del mes pasado (no el mes completo)." color="#fff" />
            </p>
            {s.delta !== null ? (
              <p className="text-sm font-bold mt-1 tabular-nums text-white flex items-center gap-1">
                {s.delta !== 0 && (s.delta < 0 ? <ArrowDown className="w-3.5 h-3.5" aria-hidden /> : <ArrowUp className="w-3.5 h-3.5" aria-hidden />)}
                {Math.abs(s.delta)}% <span className="font-medium">· {formatCLP(Math.abs(s.total - prevTotal))}</span>
              </p>
            ) : <p className="text-sm font-bold mt-1 text-white">—</p>}
          </div>
        </div>
      </div>

      {/* ── Columnas: en teléfono, primero lo que pesa en el sueldo ── */}
      <div className="grid gap-5 items-start lg:grid-cols-[1fr_1fr_310px]">
        <div className="order-3 lg:order-none">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>Últimos gastos</h2>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onGo('historial')} className="text-sm font-semibold hover:opacity-70 transition-opacity min-h-[44px] px-1" style={{ color: 'var(--primary)' }}>Ver todo</button>
              <button type="button" onClick={onAdd} aria-label="Agregar gasto"
                className="w-8 h-8 rounded-full flex items-center justify-center active:scale-95 transition-transform" style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
                <Plus className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>
          <div className="card-flat overflow-hidden">
            {expenses.slice(0, 8).map(e => <ExpenseRow key={e.id} e={e} today={today} onOpen={onOpenExpense} />)}
          </div>
        </div>

        <div className="order-2 lg:order-none">
          <div className="flex items-center justify-between mb-2.5">
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>Por categoría</h2>
              {conLimite.length > 0 && (
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                  <span style={{ color: 'var(--mint-ink)' }}>{conLimite.length - excedidas} dentro</span>
                  {excedidas > 0 && <> · <span style={{ color: 'var(--coral-ink)' }}>{excedidas} excedida{excedidas > 1 ? 's' : ''}</span></>}
                  {' '}de {conLimite.length} con límite
                </p>
              )}
            </div>
          </div>
          <div className="card-flat overflow-hidden">
            <CategoryRows rows={s.byCat} />
          </div>
        </div>

        <div className="order-1 lg:order-none space-y-4">
          <CicloSueldo
            sueldo={SUELDO}
            sueldoMonthLabel={`de ${monthShort(prevM)}`}
            card={card}
            investGoal={null}
            investedThisMonth={INVERTIDO}
            debitSpentThisMonth={s.debitSpent}
          />
          <DebtsCard debts={debts} today={today} onPaid={onDebtPaid} onForgive={onDebtForgive} />

          <div className="card-flat p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Próximos pagos</h2>
              <button type="button" onClick={() => onGo('recurrentes')} className="text-xs font-semibold min-h-[44px] -my-3" style={{ color: 'var(--primary)' }}>Ver todo</button>
            </div>
            {proximos.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Nada vence en los próximos 7 días.</p>
            ) : (
              <ul className="space-y-2">
                {proximos.slice(0, 3).map(({ r, date, days }) => {
                  const c = catOf(r.categoryId)
                  return (
                    <li key={r.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
                      <ServiceLogo domain={r.domain} name={r.name} size={32} fallbackColor={c.color} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{r.name}</span>
                        <span className="block text-[11px]" style={{ color: 'var(--ink-3)' }}>{shortDate(date)} · {days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`}</span>
                      </span>
                      <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(r.amount)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
