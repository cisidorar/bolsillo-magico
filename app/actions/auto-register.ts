'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function effectiveDay(billingDay: number, year: number, month: number): number {
  return Math.min(billingDay, daysInMonth(year, month))
}

/**
 * Devuelve la fecha de inicio del período de facturación actual.
 * Si billing_day = 24 y hoy = 25 jun → inicio del período = 25 jun (billing_day + 1).
 * Si billing_day = 31 y el mes previo tiene 30 días → inicio = 1 del mes actual.
 */
function billingPeriodStartDate(
  billingDay: number,
  year: number,
  month: number // mes actual (1-12)
): { year: number; month: number; day: number } {
  const startDay = billingDay + 1
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear  = month === 1 ? year - 1 : year
  const daysInPrev = daysInMonth(prevYear, prevMonth)

  if (billingDay >= daysInPrev) {
    // El corte caía en el último día del mes anterior → el nuevo período empezó el día 1
    return { year, month, day: 1 }
  }
  return { year, month, day: startDay }
}

export async function runAutoRegister(): Promise<{ registered: string[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { registered: [] }

  const today       = new Date()
  const todayStr    = today.toISOString().split('T')[0]
  const cookieKey   = `auto_reg_${user.id.slice(0, 8)}_${todayStr}`
  const cookieStore = await cookies()

  if (cookieStore.has(cookieKey)) return { registered: [] }

  const todayDay     = today.getDate()
  const currentMonth = today.getMonth() + 1
  const currentYear  = today.getFullYear()
  const monthStr     = String(currentMonth).padStart(2, '0')
  const nextMonth    = currentMonth === 12 ? 1  : currentMonth + 1
  const nextYear     = currentMonth === 12 ? currentYear + 1 : currentYear

  const { data: autoRecurring } = await supabase
    .from('recurring_expenses')
    .select('id, amount, category_id, payment_method_id, billing_day, name, total_installments, paid_installments')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .eq('auto_register', true)

  // ── Gastos recurrentes normales (sin cuotas) ─────────────────────────────
  // Se registran cuando hoy >= billing_day del mes actual.
  const normalItems = (autoRecurring ?? []).filter(r => r.total_installments == null)
  const normalDue   = normalItems.filter(r => {
    const eff = effectiveDay(r.billing_day, currentYear, currentMonth)
    return eff <= todayDay
  })

  // ── Cuotas con auto_register ─────────────────────────────────────────────
  // Se registran al INICIO del período de facturación (billing_day + 1).
  // Cuota N+1 se registra en el período siguiente al que registró la cuota N.
  const cuotaItems = (autoRecurring ?? []).filter(r =>
    r.total_installments != null &&
    (r.paid_installments ?? 0) < r.total_installments
  )
  const cuotaDue = cuotaItems.filter(r => {
    const start = billingPeriodStartDate(r.billing_day, currentYear, currentMonth)
    return todayDay >= start.day && start.month === currentMonth && start.year === currentYear
  })

  let insertedNames: string[] = []

  // ── Registrar normales ───────────────────────────────────────────────────
  if (normalDue.length > 0) {
    const { data: alreadyNormal } = await supabase
      .from('expenses')
      .select('recurring_expense_id')
      .eq('user_id', user.id)
      .not('recurring_expense_id', 'is', null)
      .gte('date', `${currentYear}-${monthStr}-01`)
      .lt('date',  `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)

    const registeredNormal = new Set((alreadyNormal ?? []).map(e => e.recurring_expense_id))

    const toInsert = normalDue
      .filter(r => !registeredNormal.has(r.id))
      .map(r => {
        const eff = effectiveDay(r.billing_day, currentYear, currentMonth)
        return {
          user_id:              user.id,
          amount:               r.amount,
          category_id:          r.category_id,
          payment_method_id:    r.payment_method_id,
          recurring_expense_id: r.id,
          description:          r.name,
          date: `${currentYear}-${monthStr}-${String(eff).padStart(2, '0')}`,
        }
      })

    if (toInsert.length > 0) {
      await supabase.from('expenses').insert(toInsert)
      insertedNames.push(...toInsert.map(e => e.description))
    }
  }

  // ── Registrar cuotas ─────────────────────────────────────────────────────
  if (cuotaDue.length > 0) {
    // Verificar cuáles ya tienen una cuota registrada en este período.
    // El período de cuota N va desde billing_day+1 del mes M al billing_day del mes M+1.
    // Pero para simplificar la dedup, buscamos si ya existe un gasto de esta recurrente
    // cuya fecha esté en el rango del período de facturación actual.
    const { data: alreadyCuota } = await supabase
      .from('expenses')
      .select('recurring_expense_id')
      .eq('user_id', user.id)
      .not('recurring_expense_id', 'is', null)
      .gte('date', `${currentYear}-${monthStr}-01`)
      .lt('date',  `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)

    const registeredCuota = new Set((alreadyCuota ?? []).map(e => e.recurring_expense_id))

    const cuotaToInsert = cuotaDue
      .filter(r => !registeredCuota.has(r.id))

    for (const r of cuotaToInsert) {
      const start = billingPeriodStartDate(r.billing_day, currentYear, currentMonth)
      const dateStr = `${start.year}-${String(start.month).padStart(2, '0')}-${String(start.day).padStart(2, '0')}`

      const { error } = await supabase.from('expenses').insert({
        user_id:              user.id,
        amount:               r.amount,
        category_id:          r.category_id,
        payment_method_id:    r.payment_method_id,
        recurring_expense_id: r.id,
        description:          r.name,
        date:                 dateStr,
      })

      if (!error) {
        const newPaid = (r.paid_installments ?? 0) + 1
        const isDone  = newPaid >= (r.total_installments ?? 0)

        await supabase
          .from('recurring_expenses')
          .update({
            paid_installments: newPaid,
            ...(isDone ? { is_active: false } : {}),
          })
          .eq('id', r.id)

        insertedNames.push(r.name)
      }
    }
  }

  const midnight = new Date(today)
  midnight.setHours(24, 0, 0, 0)
  cookieStore.set(cookieKey, '1', {
    expires:  midnight,
    httpOnly: true,
    sameSite: 'lax',
    path:     '/',
  })

  return { registered: insertedNames }
}
