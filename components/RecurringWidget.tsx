'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn, formatCLP } from '@/lib/utils'
import { RefreshCw, Check, ChevronRight, X } from 'lucide-react'
import Link from 'next/link'
import ServiceLogo from './ServiceLogo'
import type { RecurringExpense } from '@/types'

interface Props {
  recurring: RecurringExpense[]
  registeredIds: string[]
  userId: string
  month: number
  year: number
}

type Status = 'overdue' | 'today' | 'soon'

function getActionStatus(billingDay: number, todayDay: number): Status | null {
  const diff = billingDay - todayDay
  if (diff < 0)  return 'overdue'
  if (diff === 0) return 'today'
  if (diff <= 3)  return 'soon'
  return null
}

const STATUS_STYLE: Record<Status, { bg: string; text: string; label: string }> = {
  overdue: { bg: 'bg-red-50',    text: 'text-red-500',    label: 'Vencido' },
  today:   { bg: 'bg-brand-50',  text: 'text-brand-700',  label: 'Hoy'     },
  soon:    { bg: 'bg-amber-50',  text: 'text-amber-600',  label: 'Próximo' },
}

export default function RecurringWidget({ recurring, registeredIds, userId, month, year }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const todayDay     = new Date().getDate()
  const registeredSet = new Set(registeredIds)
  const active       = recurring.filter(r => r.is_active)

  const [confirming, setConfirming]   = useState<string | null>(null)
  const [registering, setRegistering] = useState<string | null>(null)

  if (active.length === 0) return null

  const actionItems = active.filter(r => {
    if (registeredSet.has(r.id)) return false
    return getActionStatus(r.billing_day, todayDay) !== null
  })

  const totalMonthly    = active.reduce((s, r) => s + r.amount, 0)
  const totalActive     = active.length
  const totalRegistered = active.filter(r => registeredSet.has(r.id)).length
  const allDone         = actionItems.length === 0

  async function register(item: RecurringExpense) {
    setRegistering(item.id)
    const today = new Date()
    const useDay = Math.min(item.billing_day, today.getDate())
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(useDay).padStart(2, '0')}`

    await supabase.from('expenses').insert({
      user_id: userId,
      amount: item.amount,
      category_id: item.category_id,
      payment_method_id: item.payment_method_id,
      recurring_expense_id: item.id,
      description: item.name,
      date: dateStr,
    })

    setRegistering(null)
    setConfirming(null)
    router.refresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-sm font-bold text-gray-600 flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5 text-brand-500" />
          Recurrentes
        </h2>
        <Link href="/recurrentes" className="text-sm font-semibold text-brand-600 flex items-center gap-0.5">
          {totalRegistered}/{totalActive}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {allDone ? (
        <div className="card px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Todo al día</p>
              <p className="text-xs text-gray-400">{totalActive} recurrentes · {formatCLP(totalMonthly)}/mes</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {actionItems.map((item, idx) => {
            const status = getActionStatus(item.billing_day, todayDay)!
            const s = STATUS_STYLE[status]
            const isCuotas = item.total_installments != null && item.total_installments > 0

            return (
              <div
                key={item.id}
                className={cn('flex items-center gap-3 px-4 py-3.5', idx > 0 && 'border-t border-gray-50')}
              >
                <ServiceLogo domain={item.domain} name={item.name} size={36} />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">
                    Día {item.billing_day}
                    {isCuotas && (
                      <span className="ml-1.5 text-[10px] font-medium text-brand-600">
                        · cuota {(item.paid_installments ?? 0) + 1}/{item.total_installments}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCLP(item.amount)}</p>

                  {confirming === item.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setConfirming(null)}
                        className="p-1.5 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => register(item)}
                        disabled={registering === item.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg disabled:opacity-60"
                      >
                        {registering === item.id
                          ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : <><Check className="w-3.5 h-3.5" /> Listo</>
                        }
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirming(item.id)}
                      className={cn('px-2.5 py-1 text-xs rounded-lg font-semibold border border-current/10 transition-colors', s.bg, s.text)}
                    >
                      Registrar
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {actionItems.length > 1 && (
            <div className="px-4 py-2.5 border-t flex items-center justify-between" style={{ backgroundColor: '#D4F3FC', borderColor: '#B9ECFA' }}>
              <p className="text-xs font-medium text-gray-600">
                {actionItems.length} pendientes de {totalActive}
              </p>
              <p className="text-xs font-bold text-gray-700 tabular-nums">
                {formatCLP(actionItems.reduce((s, r) => s + r.amount, 0))}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
