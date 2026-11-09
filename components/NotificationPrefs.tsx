'use client'

import { useState, useTransition } from 'react'
import { Check, Bell, CreditCard, Target, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, BarChart2, Timer } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ToastProvider'
import SettingChip from '@/components/SettingChip'
import type { NotificationStatusSummary } from '@/lib/notification-status'

interface Props {
  userId: string
  notifyBilling:          boolean
  notifyBudget:           boolean
  notifyMonthly:          boolean
  notifyRecurring:        boolean
  notifyWatchlistDigest:  boolean
  notifyWeeklyReport:     boolean
  notifyDepositMaturity:  boolean
  notifyMarketDrop:       boolean
  budgetAlertPct:   number   // umbral de la primera alerta (50–95)
  billingAlertDays: number   // días de anticipación del aviso de cierre (1–7)
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
  key: 'notifyBilling' | 'notifyBudget' | 'notifyMonthly' | 'notifyRecurring' | 'notifyWatchlistDigest' | 'notifyWeeklyReport' | 'notifyDepositMaturity' | 'notifyMarketDrop'
  statusKey: 'billing' | 'budget' | 'monthly' | 'recurring' | 'watchlistDigest' | 'weeklyReport' | 'depositMaturity' | 'marketDrop'
  dbCol: string
  icon: React.ReactNode
  title: string
  subtitle: string
}

export default function NotificationPrefs({
  userId,
  notifyBilling:          initBilling,
  notifyBudget:           initBudget,
  notifyMonthly:          initMonthly,
  notifyRecurring:        initRecurring,
  notifyWatchlistDigest:  initWatchlistDigest,
  notifyWeeklyReport:     initWeeklyReport,
  notifyDepositMaturity:  initDepositMaturity,
  notifyMarketDrop:       initMarketDrop,
  budgetAlertPct:         initPct,
  billingAlertDays:       initDays,
  status,
}: Props) {
  const supabase = createClient()
  const { showToast } = useToast()
  const [isPending, startTransition] = useTransition()

  const [state, setState] = useState({
    notifyBilling:         initBilling,
    notifyBudget:          initBudget,
    notifyMonthly:         initMonthly,
    notifyRecurring:       initRecurring,
    notifyWatchlistDigest: initWatchlistDigest,
    notifyWeeklyReport:    initWeeklyReport,
    notifyDepositMaturity: initDepositMaturity,
    notifyMarketDrop:      initMarketDrop,
  })
  const [alertPct, setAlertPct] = useState(initPct)

  // Confirmación por fila: un chip "Guardado" de 2s junto al título del
  // ajuste que se acaba de escribir.
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const flashSaved = (key: string) => {
    setSavedKey(key)
    setTimeout(() => setSavedKey(k => (k === key ? null : k)), 2000)
  }

  const savePct = (pct: number) => {
    const prev = alertPct
    setAlertPct(pct)
    startTransition(async () => {
      const { error } = await supabase.from('profiles').update({ budget_alert_pct: pct }).eq('id', userId)
      if (error) {
        setAlertPct(prev)
        showToast('No se pudo guardar el umbral del presupuesto', { action: { label: 'Reintentar', onClick: () => savePct(pct) } })
        return
      }
      flashSaved('notifyBudget')
    })
  }

  const [alertDays, setAlertDays] = useState(initDays)
  const saveDays = (d: number) => {
    const prev = alertDays
    setAlertDays(d)
    startTransition(async () => {
      const { error } = await supabase.from('profiles').update({ billing_alert_days: d }).eq('id', userId)
      if (error) {
        setAlertDays(prev)
        showToast('No se pudo guardar la anticipación del aviso', { action: { label: 'Reintentar', onClick: () => saveDays(d) } })
        return
      }
      flashSaved('notifyBilling')
    })
  }

  const toggle = (key: keyof typeof state, dbCol: string) => {
    const newVal = !state[key]
    setState(prev => ({ ...prev, [key]: newVal }))
    startTransition(async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ [dbCol]: newVal })
        .eq('id', userId)
      if (error) {
        setState(prev => ({ ...prev, [key]: !newVal }))
        showToast('No se pudo guardar este aviso', { action: { label: 'Reintentar', onClick: () => toggle(key, dbCol) } })
        return
      }
      flashSaved(key)
    })
  }

  const items: ToggleItem[] = [
    {
      key:      'notifyBilling',
      statusKey: 'billing',
      dbCol:    'notify_billing',
      icon:     <CreditCard className="w-5 h-5" style={{ color: 'var(--primary)' }} />,
      title:    'Cierre de tarjeta',
      subtitle: `Recibe un aviso ${alertDays} día${alertDays !== 1 ? 's' : ''} antes del cierre de cada tarjeta de crédito.`,
    },
    {
      key:      'notifyBudget',
      statusKey: 'budget',
      dbCol:    'notify_budget',
      icon:     <Target className="w-5 h-5" style={{ color: 'var(--primary)' }} />,
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
      icon:     <RefreshCw className="w-5 h-5" style={{ color: 'var(--primary)' }} />,
      title:    'Gastos recurrentes',
      subtitle: 'Recordatorio el día que vence un gasto manual, y aviso si al día siguiente aún no se registró.',
    },
    {
      key:      'notifyWatchlistDigest',
      statusKey: 'watchlistDigest',
      dbCol:    'notify_watchlist_target',
      icon:     <TrendingUp className="w-5 h-5" style={{ color: 'var(--primary)' }} />,
      title:    'Análisis diario de acciones',
      subtitle: 'Email al cierre de Wall Street con señales de compra/venta para tu lista de seguimiento.',
    },
    {
      key:      'notifyWeeklyReport',
      statusKey: 'weeklyReport',
      dbCol:    'notify_weekly_report',
      icon:     <BarChart2 className="w-5 h-5" style={{ color: 'var(--primary)' }} />,
      title:    'Reporte semanal',
      subtitle: 'Resumen de la semana en bolsa: rendimiento de tu portafolio, mejores y peores posiciones.',
    },
    {
      key:      'notifyDepositMaturity',
      statusKey: 'depositMaturity',
      dbCol:    'notify_deposit_maturity',
      icon:     <Timer className="w-5 h-5" style={{ color: 'var(--primary)' }} />,
      title:    'Vencimiento de depósitos',
      subtitle: 'Aviso el día que vence un depósito a plazo para que puedas renovarlo o retirarlo.',
    },
    {
      key:      'notifyMarketDrop',
      statusKey: 'marketDrop',
      dbCol:    'notify_market_drop',
      icon:     <TrendingDown className="w-5 h-5" style={{ color: 'var(--primary)' }} />,
      title:    'Caídas fuertes de la bolsa',
      subtitle: 'Si tu cartera o el mercado caen fuerte en el día, te explicamos qué pasó y cómo afecta tus finanzas.',
    },
  ]

  return (
    <div className="card overflow-hidden">
      {items.map((item, idx) => (
        <div key={item.key} style={idx > 0 ? { borderTop: '1px solid var(--border)' } : undefined}>
        <div className="flex items-center gap-4 px-4 py-4">
          {/* Icon */}
          <div
            className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ '--cat-bg': 'var(--primary-soft)', '--cat-color': 'var(--primary)' } as React.CSSProperties}
          >
            {item.icon}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p id={`notif-${item.key}`} className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{item.title}</p>
              {savedKey === item.key && (
                <span role="status" className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: 'var(--mint-ink)' }}>
                  <Check className="w-3 h-3" /> Guardado
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--ink-3)' }}>{item.subtitle}</p>
            {state[item.key] && status && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[11px] font-medium" style={{ color: 'var(--ink-3)' }}>
                  Último aviso: {relativeSince(status[item.statusKey].lastSentAt)}
                </span>
                {status[item.statusKey].lagging && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: 'color-mix(in srgb, var(--gold) 18%, var(--surface))', color: 'var(--gold-ink)' }}
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
            aria-labelledby={`notif-${item.key}`}
            disabled={isPending}
            onClick={() => toggle(item.key, item.dbCol)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] before:absolute before:-inset-2.5 before:content-[''] ${
              isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
            style={{ background: state[item.key] ? 'var(--primary)' : 'var(--border)' }}
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
                <SettingChip key={d} active={alertDays === d} onClick={() => saveDays(d)} disabled={isPending}>
                  {d} día{d !== 1 ? 's' : ''}
                </SettingChip>
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
                <SettingChip key={p} active={alertPct === p} onClick={() => savePct(p)} disabled={isPending}>
                  {p}%
                </SettingChip>
              ))}
            </div>
          </div>
        )}
        </div>
      ))}
    </div>
  )
}
