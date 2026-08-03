'use client'

import { useState, useEffect, useMemo } from 'react'
import { useBackdropClose } from '@/components/useBackdropClose'
import { X, Check, Calculator, CreditCard, AlertTriangle, ThumbsUp, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  cn, formatCLP, getNowChile, nextPaydayDate,
  lastClosedStatementRange, billingPeriod, statementDueDate,
} from '@/lib/utils'
import { buildCashFlowTimeline, withinWindow, type CashFlowEvent } from '@/lib/cash-flow'
import { buildCommittedTimeline, type CommittedTimelineItem } from '@/lib/committed-timeline'
import { evaluateAffordability, type Verdict } from '@/lib/affordability'
import InfoTap from './InfoTap'
import type { PaymentMethod } from '@/types'

interface Props {
  isOpen: boolean
  onClose: () => void
}

function fmtNum(raw: string): string {
  if (!raw) return ''
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// Misma lógica que en RecurringManager.tsx / recurrentes/page.tsx — próxima
// fecha de cobro de un recurrente activo, para el evento de flujo de caja.
function nextBillingDate(billingDay: number, from: Date, billingMonth: number | null): Date {
  const d = from.getDate(), m = from.getMonth() + 1, y = from.getFullYear()
  if (billingMonth !== null) {
    const lastOfBm = (yy: number) => new Date(yy, billingMonth, 0).getDate()
    const thisYear = new Date(y, billingMonth - 1, Math.min(billingDay, lastOfBm(y)))
    if (billingMonth > m || (billingMonth === m && Math.min(billingDay, lastOfBm(y)) >= d)) return thisYear
    return new Date(y + 1, billingMonth - 1, Math.min(billingDay, lastOfBm(y + 1)))
  }
  const lastThisMonth = new Date(y, m, 0).getDate()
  const thisMonthDay = Math.min(billingDay, lastThisMonth)
  if (thisMonthDay >= d) return new Date(y, m - 1, thisMonthDay)
  const nextM = m === 12 ? 1 : m + 1, nextY = m === 12 ? y + 1 : y
  const lastNext = new Date(nextY, nextM, 0).getDate()
  return new Date(nextY, nextM - 1, Math.min(billingDay, lastNext))
}

const MONTH_NAMES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

interface RecurringRow { name: string; amount: number; billing_month: number | null; total_installments: number | null; paid_installments: number | null; is_active: boolean; billing_day: number }

const VERDICT_COPY: Record<Verdict, { label: string; color: string; bg: string; border: string; icon: typeof ThumbsUp }> = {
  yes:   { label: 'Sí, sin problema',  color: 'var(--mint)',  bg: 'rgba(31,190,141,0.10)', border: 'rgba(31,190,141,0.25)', icon: ThumbsUp },
  tight: { label: 'Sí, pero justo',    color: 'var(--gold)',  bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', icon: AlertTriangle },
  no:    { label: 'Mejor esperar',     color: 'var(--coral)', bg: 'rgba(239,91,82,0.10)',  border: 'rgba(239,91,82,0.25)',  icon: AlertTriangle },
}

/**
 * E4 — "¿Me lo puedo comprar?" Compone, sin ningún dato nuevo, lo que ya vive
 * repartido en presupuesto / flujo de caja de 30 días / compromiso futuro,
 * en un único veredicto. Se autoabastece de datos al abrir (mismo patrón que
 * ExpenseSheet con fetchData) — RLS filtra por usuario, no hace falta userId.
 */
export default function AffordabilitySheet({ isOpen, onClose }: Props) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('')
  const [installments, setInstallments] = useState(1)
  const [pmId, setPmId] = useState<string | null>(null)

  const [budgetRemaining, setBudgetRemaining] = useState<number | null>(null)
  const [cashFlowMin, setCashFlowMin] = useState<number | null>(null)
  const [cashFlowMinLabel, setCashFlowMinLabel] = useState<string | null>(null)
  const [income, setIncome] = useState<number | null>(null)
  const [monthlyCommitted, setMonthlyCommitted] = useState(0)
  const [monthlyInvestGoal, setMonthlyInvestGoal] = useState<number | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)

    ;(async () => {
      const { now, year, month, dateStr } = getNowChile()
      const monthStr = `${year}-${String(month).padStart(2, '0')}`
      const twoMonthsAgo = new Date(year, now.getMonth() - 2, 1).toISOString().split('T')[0]

      const [
        { data: budgetRow },
        { data: recurring },
        { data: pms },
        { data: incomeRow },
        { data: profileRow },
        { data: expensesWindow },
      ] = await Promise.all([
        supabase.from('budgets').select('amount').eq('month', month).eq('year', year).maybeSingle(),
        supabase.from('recurring_expenses')
          .select('name, amount, billing_month, total_installments, paid_installments, is_active, billing_day')
          .eq('is_active', true),
        supabase.from('payment_methods').select('*').order('sort_order'),
        supabase.from('incomes').select('amount').order('year', { ascending: false }).order('month', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('profiles').select('payday, payday_last_business_day, monthly_invest_goal').maybeSingle(),
        supabase.from('expenses').select('amount, date, payment_method_id').gte('date', twoMonthsAgo).lte('date', now.toISOString().split('T')[0]),
      ])

      setPaymentMethods(pms ?? [])
      const defaultPm = (pms ?? []).find((p: PaymentMethod) => p.is_default)
      setPmId(defaultPm?.id ?? (pms ?? [])[0]?.id ?? null)

      // Presupuesto restante de este mes
      const spentThisMonth = (expensesWindow ?? [])
        .filter((e: { date: string }) => e.date.slice(0, 7) === monthStr)
        .reduce((s: number, e: { amount: number }) => s + e.amount, 0)
      setBudgetRemaining(budgetRow?.amount != null ? budgetRow.amount - spentThisMonth : null)

      const inc = incomeRow?.amount ?? null
      setIncome(inc)
      setMonthlyInvestGoal(profileRow?.monthly_invest_goal ?? null)

      // Estados de cuenta con vencimiento conocido — se calculan una vez y
      // alimentan el flujo de caja (más abajo). NO se suman al compromiso
      // del próximo mes: el monto de tarjeta cambia cada mes según lo que se
      // gaste, no es "comprometido" de antemano como una cuota o un fijo —
      // ver misma decisión en /recurrentes (buildCommittedTimeline).
      const cardStatements = ((pms ?? []) as PaymentMethod[])
        .filter(c => c.card_type === 'credit' && c.billing_day && c.payment_due_day)
        .map(card => {
          const range = lastClosedStatementRange(card.billing_day!)
          const total = (expensesWindow ?? [])
            .filter((e: { payment_method_id: string | null; date: string }) => {
              if (e.payment_method_id !== card.id) return false
              const bp = billingPeriod(e.date, card.billing_day!)
              return bp.month === range.month && bp.year === range.year
            })
            .reduce((s: number, e: { amount: number }) => s + e.amount, 0)
          const dueDate = statementDueDate(range.month, range.year, card.payment_due_day!)
          return { label: card.name, amount: total, dueDate }
        })

      // Compromiso del próximo mes (sin esta compra) — mismo cálculo que
      // CommittedTimeline en /recurrentes.
      const committedItems: CommittedTimelineItem[] = ((recurring ?? []) as RecurringRow[]).map(r => ({
        name: r.name, amount: r.amount, billing_month: r.billing_month,
        totalInstallments: r.total_installments, paidInstallments: r.paid_installments ?? 0, isActive: r.is_active,
      }))
      const committedMonths = buildCommittedTimeline(committedItems, month, year)
      setMonthlyCommitted(committedMonths[0]?.total ?? 0)

      // Flujo de caja 30 días (recurrentes + sueldo + estados de cuenta con
      // fecha de vencimiento configurada) — misma composición que
      // /recurrentes, simplificada: solo tarjetas con payment_due_day.
      const events: CashFlowEvent[] = []
      const paydayNum = profileRow?.payday ?? null
      const paydayLBD = profileRow?.payday_last_business_day ?? false
      const nextPayday = nextPaydayDate(dateStr, paydayNum, paydayLBD)
      if (nextPayday && inc !== null) events.push({ date: nextPayday, type: 'income', label: 'Sueldo', amount: inc })

      ;((recurring ?? []) as RecurringRow[]).forEach(r => {
        const d = nextBillingDate(r.billing_day, now, r.billing_month)
        const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        events.push({ date: dStr, type: 'recurring', label: r.name, amount: -r.amount })
      })

      cardStatements.forEach(st => {
        events.push({ date: st.dueDate, type: 'card', label: st.label, amount: -st.amount })
      })

      const timeline = withinWindow(buildCashFlowTimeline(events, dateStr), 30)
      if (timeline.length > 0) {
        const min = timeline.reduce((worst, e) => e.runningBalance < worst.runningBalance ? e : worst, timeline[0])
        setCashFlowMin(min.runningBalance)
        const d = new Date(min.date + 'T12:00:00')
        setCashFlowMinLabel(`${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`)
      } else {
        setCashFlowMin(null)
        setCashFlowMinLabel(null)
      }

      setLoading(false)
    })()
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCard = useMemo(() => paymentMethods.find(p => p.id === pmId) ?? null, [paymentMethods, pmId])
  const isCredit = selectedCard?.card_type === 'credit'
  const amountNum = parseInt(amount.replace(/\D/g, '')) || 0

  const releaseLabel = useMemo(() => {
    if (installments <= 1) return null
    const { month, year } = getNowChile()
    let m = month + installments - 1, y = year
    while (m > 12) { m -= 12; y++ }
    return MONTH_NAMES[m - 1]
  }, [installments])

  const result = useMemo(() => {
    if (amountNum <= 0) return null
    return evaluateAffordability({
      amount: amountNum,
      installments: isCredit ? installments : 1,
      budgetRemaining, cashFlowMin, cashFlowMinLabel, income, monthlyCommitted, monthlyInvestGoal, releaseLabel,
    })
  }, [amountNum, installments, isCredit, budgetRemaining, cashFlowMin, cashFlowMinLabel, income, monthlyCommitted, monthlyInvestGoal, releaseLabel])

  function reset() {
    setAmount(''); setInstallments(1)
  }
  // Hook llamado siempre, ANTES del `if (!isOpen) return null` — el
  // componente queda montado con isOpen alternando true/false (SideNav/
  // BottomNav no lo desmontan), así que el hook no puede depender de esa
  // condición sin romper el orden de hooks entre renders.
  const backdropClose = useBackdropClose(() => { reset(); onClose() })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center bg-black/50" {...backdropClose}>
      <div className="w-full lg:max-w-md bg-white rounded-t-3xl lg:rounded-3xl max-h-[92vh] overflow-y-auto" style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1 lg:hidden" />

        <div className="flex items-start justify-between px-5 pt-3 pb-3 lg:px-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-soft)' }}>
              <Calculator className="w-4 h-4" style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>¿Me lo puedo comprar?</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Un vistazo rápido antes de decidir</p>
            </div>
          </div>
          <button onClick={() => { reset(); onClose() }} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)' }}>
            <X className="w-4 h-4" style={{ color: 'var(--ink-3)' }} />
          </button>
        </div>

        <div className="px-5 pt-4 pb-5 lg:px-6 flex flex-col gap-4">
          {loading ? (
            <div className="py-10 flex items-center justify-center">
              <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
            </div>
          ) : (
            <>
              {/* Monto */}
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-3)' }}>¿Cuánto cuesta?</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none" style={{ color: 'var(--ink-3)' }}>$</span>
                  <input
                    type="text" inputMode="numeric" autoFocus
                    value={amount ? fmtNum(amount) : ''}
                    onChange={e => setAmount(e.target.value.replace(/\D/g, ''))}
                    placeholder="0"
                    className="sheet-input w-full rounded-xl pl-7 pr-4 py-3 text-lg font-bold outline-none transition-colors"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                  />
                </div>
              </div>

              {/* Método de pago */}
              {paymentMethods.length > 0 && (
                <div>
                  <label className="text-xs font-semibold block mb-2" style={{ color: 'var(--ink-3)' }}>Método de pago</label>
                  <div className="flex flex-wrap gap-2">
                    {paymentMethods.map(p => (
                      <button key={p.id} onClick={() => { setPmId(p.id); if (p.card_type !== 'credit') setInstallments(1) }}
                        className="px-3 py-1.5 rounded-full text-xs border transition-all"
                        style={pmId === p.id
                          ? { background: 'var(--primary)', color: 'var(--primary-ink)', borderColor: 'var(--primary)' }
                          : { background: 'var(--surface-2)', color: 'var(--ink-2)', borderColor: 'var(--border)' }}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Cuotas (solo crédito) */}
              {isCredit && (
                <div className="flex items-center justify-between px-4 py-2.5 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                    <CreditCard className="w-3.5 h-3.5" /> Cuotas
                  </span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setInstallments(v => Math.max(1, v - 1))} className="w-7 h-7 rounded-full flex items-center justify-center font-bold" style={{ color: 'var(--primary)', background: 'var(--surface)' }}>−</button>
                    <span className="text-sm font-extrabold tabular-nums w-6 text-center" style={{ color: 'var(--ink)' }}>{installments}</span>
                    <button onClick={() => setInstallments(v => Math.min(24, v + 1))} className="w-7 h-7 rounded-full flex items-center justify-center font-bold" style={{ color: 'var(--primary)', background: 'var(--surface)' }}>+</button>
                  </div>
                </div>
              )}

              {/* Veredicto */}
              {result && (() => {
                const copy = VERDICT_COPY[result.verdict]
                const Icon = copy.icon
                return (
                  <div className="rounded-2xl p-4" style={{ background: copy.bg, border: `1.5px solid ${copy.border}` }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: copy.color }} />
                      <p className="text-sm font-extrabold" style={{ color: copy.color }}>{copy.label}</p>
                    </div>
                    {installments > 1 && (
                      <p className="text-xs mb-2" style={{ color: 'var(--ink-3)' }}>
                        {formatCLP(result.immediateImpact)}/mes × {installments} cuotas
                      </p>
                    )}
                    {result.reasons.length > 0 ? (
                      <ul className="space-y-1.5 mt-1">
                        {result.reasons.map((r, i) => (
                          <li key={i} className="text-xs leading-relaxed flex items-start gap-1.5" style={{ color: 'var(--ink-2)' }}>
                            <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0" style={{ background: copy.color }} />
                            {r.text}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
                        Tienes margen de sobra en presupuesto y flujo de caja este mes.
                      </p>
                    )}
                    {result.reasons.some(r => r.text.includes('flujo de 30 días')) && (
                      <p className="text-[11px] mt-2.5 pt-2.5 flex items-start gap-1.5" style={{ color: 'var(--ink-3)', borderTop: `1px solid ${copy.border}` }}>
                        <InfoTap
                          explanation="El flujo de 30 días NO es tu cuenta bancaria real — parte de $0 hoy y solo suma/resta lo que sabes que va a entrar y salir. Si queda negativo es que ese cargo caería antes que el ingreso que lo cubre, aunque hoy tengas plata guardada."
                          color="var(--ink-3)"
                        />
                        Sobre el flujo de 30 días
                      </p>
                    )}
                  </div>
                )
              })()}

              {!result && amount === '' && (
                <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--ink-3)' }} />
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>
                    Ingresa el monto para ver el impacto en tu presupuesto, tu flujo de caja de 30 días y lo que te queda disponible tras tu meta de ahorro.
                  </p>
                </div>
              )}

              <button onClick={() => { reset(); onClose() }} className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
                style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
                <Check className="w-4 h-4" /> Listo
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
