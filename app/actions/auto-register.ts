'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

/** Días reales del mes (clamp para billing_day > días del mes) */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * Día efectivo de cobro para un billing_day en un mes dado.
 * Si billing_day = 31 y el mes tiene 28 días → devuelve 28.
 */
function effectiveDay(billingDay: number, year: number, month: number): number {
  return Math.min(billingDay, daysInMonth(year, month))
}

export async function runAutoRegister() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const today       = new Date()
  const todayStr    = today.toISOString().split('T')[0]
  const cookieKey   = `auto_reg_${user.id.slice(0, 8)}_${todayStr}`
  const cookieStore = await cookies()

  if (cookieStore.has(cookieKey)) return   // ya corrió hoy

  const todayDay     = today.getDate()
  const currentMonth = today.getMonth() + 1
  const currentYear  = today.getFullYear()
  const monthStr     = String(currentMonth).padStart(2, '0')
  const nextMonth    = currentMonth === 12 ? 1  : currentMonth + 1
  const nextYear     = currentMonth === 12 ? currentYear + 1 : currentYear

  // Traemos todos (sin filtro de día) y filtramos en JS para manejar el clamp
  const { data: autoRecurring } = await supabase
    .from('recurring_expenses')
    .select('id, amount, category_id, payment_method_id, billing_day, name')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .eq('auto_register', true)

  // Un recurrente debe registrarse hoy si su día efectivo en este mes ≤ hoy
  const due = (autoRecurring ?? []).filter(r => {
    const eff = effectiveDay(r.billing_day, currentYear, currentMonth)
    return eff <= todayDay
  })

  if (due.length > 0) {
    const { data: alreadyRegistered } = await supabase
      .from('expenses')
      .select('recurring_expense_id')
      .eq('user_id', user.id)
      .not('recurring_expense_id', 'is', null)
      .gte('date', `${currentYear}-${monthStr}-01`)
      .lt('date',  `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)

    const registeredSet = new Set((alreadyRegistered ?? []).map(e => e.recurring_expense_id))

    const toInsert = due
      .filter(r => !registeredSet.has(r.id))
      .map(r => {
        const eff = effectiveDay(r.billing_day, currentYear, currentMonth)
        return {
          user_id:              user.id,
          amount:               r.amount,
          category_id:          r.category_id,
          payment_method_id:    r.payment_method_id,
          recurring_expense_id: r.id,
          description:          r.name,
          // Si billing_day = 31 en febrero → fecha = último día de febrero
          date: `${currentYear}-${monthStr}-${String(eff).padStart(2, '0')}`,
        }
      })

    if (toInsert.length > 0) {
      await supabase.from('expenses').insert(toInsert)
    }
  }

  // Marcar como ejecutado hoy (expira a medianoche)
  const midnight = new Date(today)
  midnight.setHours(24, 0, 0, 0)
  cookieStore.set(cookieKey, '1', {
    expires:  midnight,
    httpOnly: true,
    sameSite: 'lax',
    path:     '/',
  })
}
