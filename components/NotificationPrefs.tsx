'use client'

import { useState, useTransition } from 'react'
import { Bell, CreditCard, Target, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  userId: string
  notifyBilling:   boolean
  notifyBudget:    boolean
  notifyMonthly:   boolean
  notifyRecurring: boolean
  budgetAlertPct:  number   // umbral de la primera alerta (50–95)
}

const PCT_OPTIONS = [60, 70, 80, 90]

interface ToggleItem {
  key: 'notifyBilling' | 'notifyBudget' | 'notifyMonthly' | 'notifyRecurring'
  dbCol: string
  icon: React.ReactNode
  title: string
  subtitle: string
}

export default function NotificationPrefs({
  userId,
  notifyBilling:   initBilling,
  notifyBudget:    initBudget,
  notifyMonthly:   initMonthly,
  notifyRecurring: initRecurring,
  budgetAlertPct:  initPct,
}: Props) {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()

  const [state, setState] = useState({
    notifyBilling:   initBilling,
    notifyBudget:    initBudget,
    notifyMonthly:   initMonthly,
    notifyRecurring: initRecurring,
  })
  const [alertPct, setAlertPct] = useState(initPct)

  const savePct = (pct: number) => {
    setAlertPct(pct)
    startTransition(async () => {
      await supabase.from('profiles').update({ budget_alert_pct: pct }).eq('id', userId)
    })
  }

  const toggle = (key: keyof typeof state, dbCol: string) => {
    const newVal = !state[key]
    setState(prev => ({ ...prev, [key]: newVal }))
    startTransition(async () => {
      await supabase
        .from('profiles')
        .update({ [dbCol]: newVal })
        .eq('id', userId)
    })
  }

  const items: ToggleItem[] = [
    {
      key:      'notifyBilling',
      dbCol:    'notify_billing',
      icon:     <CreditCard className="w-5 h-5" style={{ color: '#7C3AED' }} />,
      title:    'Cierre de tarjeta',
      subtitle: 'Recibe un aviso 1-2 días antes del cierre de cada tarjeta de crédito.',
    },
    {
      key:      'notifyBudget',
      dbCol:    'notify_budget',
      icon:     <Target className="w-5 h-5" style={{ color: '#EA580C' }} />,
      title:    'Alertas de presupuesto',
      subtitle: `Aviso cuando alcances el ${alertPct}% y el 100% de tu presupuesto mensual.`,
    },
    {
      key:      'notifyMonthly',
      dbCol:    'notify_monthly',
      icon:     <Bell className="w-5 h-5" style={{ color: 'var(--primary)' }} />,
      title:    'Resumen mensual',
      subtitle: 'Email con tu resumen de gastos el primer día de cada mes.',
    },
    {
      key:      'notifyRecurring',
      dbCol:    'notify_recurring',
      icon:     <RefreshCw className="w-5 h-5" style={{ color: '#059669' }} />,
      title:    'Gastos recurrentes',
      subtitle: 'Recordatorio el día que vence un gasto manual, y aviso si al día siguiente aún no se registró.',
    },
  ]

  return (
    <div className="card overflow-hidden divide-y divide-gray-50 dark:divide-[#1a2744]">
      {items.map(item => (
        <div key={item.key}>
        <div className="flex items-center gap-4 px-4 py-4">
          {/* Icon */}
          <div
            className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              '--cat-bg':    item.key === 'notifyBilling' ? '#F5F3FF' : item.key === 'notifyBudget' ? '#FFF7ED' : item.key === 'notifyRecurring' ? '#ECFDF5' : 'var(--primary-soft)',
              '--cat-color': item.key === 'notifyBilling' ? '#7C3AED' : item.key === 'notifyBudget' ? '#EA580C' : item.key === 'notifyRecurring' ? '#059669' : 'var(--primary)',
            } as React.CSSProperties}
          >
            {item.icon}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.title}</p>
            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.subtitle}</p>
          </div>

          {/* Toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={state[item.key]}
            disabled={isPending}
            onClick={() => toggle(item.key, item.dbCol)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              state[item.key] ? 'bg-brand-500' : 'bg-gray-200 dark:bg-gray-700'
            } ${isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ${
                state[item.key] ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Umbral personalizable de la alerta de presupuesto */}
        {item.key === 'notifyBudget' && state.notifyBudget && (
          <div className="flex items-center gap-2 px-4 pb-4 pl-[72px]">
            <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>Avisarme al</span>
            <div className="flex items-center gap-1">
              {PCT_OPTIONS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => savePct(p)}
                  disabled={isPending}
                  className="px-2.5 py-1 rounded-full text-[11px] font-bold transition-all active:scale-95"
                  style={alertPct === p
                    ? { background: 'var(--primary)', color: 'var(--primary-ink)' }
                    : { background: 'var(--surface-2)', color: 'var(--ink-3)' }}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
        )}
        </div>
      ))}
    </div>
  )
}
