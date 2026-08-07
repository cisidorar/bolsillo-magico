'use client'

import { useState, useTransition } from 'react'
import { Bell, CreditCard, Target, RefreshCw, AlertTriangle, TrendingUp, BarChart2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { NotificationStatusSummary } from '@/lib/notification-status'

interface Props {
  userId: string
  notifyBilling:         boolean
  notifyBudget:          boolean
  notifyMonthly:         boolean
  notifyRecurring:       boolean
  notifyWatchlistDigest: boolean
  notifyWeeklyReport:    boolean
  budgetAlertPct:  number   // umbral de la primera alerta (50–95)
  billingAlertDays: number  // días de anticipación del aviso de cierre (1–7)
  /** E1: último envío real de cada canal, para notar si un aviso quedó silenciosamente roto. */
  status?: NotificationStatusSummary
}

// "hace 3 días", "hoy", "nunca" — sin librería de fechas, alcance chico.
function relativeSince(iso: string | null): string {
  if (!iso) return 'nunca'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  const months = Math.floor(days / 30)
  return `hace ${months} mes${months !== 1 ? 'es' : ''}`
}

const PCT_OPTIONS  = [60, 70, 80, 90]
const DAYS_OPTIONS = [1, 2, 3, 5]

interface ToggleItem {
  key: 'notifyBilling' | 'notifyBudget' | 'notifyMonthly' | 'notifyRecurring' | 'notifyWatchlistDigest' | 'notifyWeeklyReport'
  statusKey: 'billing' | 'budget' | 'monthly' | 'recurring' | 'watchlistDigest' | 'weeklyReport'
  dbCol: string
  icon: React.ReactNode
  title: string
  subtitle: string
}

export default function NotificationPrefs({
  userId,
  notifyBilling:         initBilling,
  notifyBudget:          initBudget,
  notifyMonthly:         initMonthly,
  notifyRecurring:       initRecurring,
  notifyWatchlistDigest: initWatchlistDigest,
  notifyWeeklyReport:    initWeeklyReport,
  budgetAlertPct:        initPct,
  billingAlertDays:      initDays,
  status,
}: Props) {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()

  const [state, setState] = useState({
    notifyBilling:         initBilling,
    notifyBudget:          initBudget,
    notifyMonthly:         initMonthly,
    notifyRecurring:       initRecurring,
    notifyWatchlistDigest: initWatchlistDigest,
    notifyWeeklyReport:    initWeeklyReport,
  })
  const [alertPct, setAlertPct] = useState(initPct)

  const savePct = (pct: number) => {
    setAlertPct(pct)
    startTransition(async () => {
      await supabase.from('profiles').update({ budget_alert_pct: pct }).eq('id', userId)
    })
  }

  const [alertDays, setAlertDays] = useState(initDays)
  const saveDays = (d: number) => {
    setAlertDays(d)
    startTransition(async () => {
      await supabase.from('profiles').update({ billing_alert_days: d }).eq('id', userId)
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
      statusKey: 'billing',
      dbCol:    'notify_billing',
      icon:     <CreditCard className="w-5 h-5" style={{ color: '#7C3AED' }} />,
      title:    'Cierre de tarjeta',
      subtitle: `Recibe un aviso ${alertDays} día${alertDays !== 1 ? 's' : ''} antes del cierre de cada tarjeta de crédito.`,
    },
    {
      key:      'notifyBudget',
      statusKey: 'budget',
      dbCol:    'notify_budget',
      icon:     <Target className="w-5 h-5" style={{ color: '#EA580C' }} />,
      title:    'Alertas de presupuesto',
      subtitle: `Aviso cuando alcances el ${alertPct}% y el 100% de tu presupuesto mensual.`,
    },
    {
      key:      'notifyMonthly',
      statusKey: 'monthly',
      dbCol:    'notify_monthly',
      icon:     <Bell className="w-5 h-5" style={{ color: 'var(--primary)' }} />,
      title:    'Resumen mensual',
      subtitle: 'Email con tu resumen de gastos el primer día de cada mes.',
    },
    {
      key:      'notifyRecurring',
      statusKey: 'recurring',
      dbCol:    'notify_recurring',
      icon:     <RefreshCw className="w-5 h-5" style={{ color: '#059669' }} />,
      title:    'Gastos recurrentes',
      subtitle: 'Recordatorio el día que vence un gasto manual, y aviso si al día siguiente aún no se registró.',
    },
    {
      key:      'notifyWatchlistDigest',
      statusKey: 'watchlistDigest',
      dbCol:    'notify_watchlist_target',
      icon:     <TrendingUp className="w-5 h-5" style={{ color: '#2B7CF6' }} />,
      title:    'Análisis diario de acciones',
      subtitle: 'Email al cierre de Wall Street con señales de compra/venta para tu lista de seguimiento.',
    },
    {
      key:      'notifyWeeklyReport',
      statusKey: 'weeklyReport',
      dbCol:    'notify_weekly_report',
      icon:     <BarChart2 className="w-5 h-5" style={{ color: '#7C3AED' }} />,
      title:    'Reporte semanal',
      subtitle: 'Resumen de la semana en bolsa: rendimiento de tu portafolio, mejores y peores posiciones.',
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
            style={({
              notifyBilling:         { '--cat-bg': '#F5F3FF', '--cat-color': '#7C3AED' },
              notifyBudget:          { '--cat-bg': '#FFF7ED', '--cat-color': '#EA580C' },
              notifyMonthly:         { '--cat-bg': 'var(--primary-soft)', '--cat-color': 'var(--primary)' },
              notifyRecurring:       { '--cat-bg': '#ECFDF5', '--cat-color': '#059669' },
              notifyWatchlistDigest: { '--cat-bg': '#EEF4FF', '--cat-color': '#2B7CF6' },
              notifyWeeklyReport:    { '--cat-bg': '#F5F3FF', '--cat-color': '#7C3AED' },
            } as Record<string, React.CSSProperties>)[item.key]}
          >
            {item.icon}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.title}</p>
            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.subtitle}</p>
            {state[item.key] && status && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[11px] font-medium" style={{ color: 'var(--ink-3)' }}>
                  Último aviso: {relativeSince(status[item.statusKey].lastSentAt)}
                </span>
                {status[item.statusKey].lagging && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--gold, #B45309)' }}
                  >
                    <AlertTriangle className="w-2.5 h-2.5" />
                    revisa si te llegó
                  </span>
                )}
              </div>
            )}
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

        {/* Anticipación del aviso de cierre de tarjeta */}
        {item.key === 'notifyBilling' && state.notifyBilling && (
          <div className="flex items-center gap-2 px-4 pb-4 pl-[72px]">
            <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>Avisarme</span>
            <div className="flex items-center gap-1">
              {DAYS_OPTIONS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => saveDays(d)}
                  disabled={isPending}
                  className="px-2.5 py-1 rounded-full text-[11px] font-bold transition-all active:scale-95"
                  style={alertDays === d
                    ? { background: 'var(--primary)', color: 'var(--primary-ink)' }
                    : { background: 'var(--surface-2)', color: 'var(--ink-3)' }}
                >
                  {d} día{d !== 1 ? 's' : ''}
                </button>
              ))}
            </div>
            <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>antes</span>
          </div>
        )}

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
