'use server'

import { createClient } from '@/lib/supabase/server'
import { billingPeriod, billingPeriodRange } from '@/lib/utils'
import { cookies } from 'next/headers'

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function effectiveDay(billingDay: number, year: number, month: number): number {
  return Math.min(billingDay, daysInMonth(year, month))
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

  // ── Gastos normales (sin cuotas) ─────────────────────────────────────────
  // Se registran cuando hoy >= billing_day del mes actual.
  const normalItems = (autoRecurring ?? []).filter(r => r.total_installments == null)
  const normalDue   = normalItems.filter(r => {
    const eff = effectiveDay(r.billing_day, currentYear, currentMonth)
    return eff <= todayDay
  })

  // ── Cuotas con auto_register ─────────────────────────────────────────────
  // Se registran al INICIO del período de facturación: el día siguiente al billing_day.
  // Ej: billing_day=24, el nuevo período empieza el 25 → registrar cuando hoy >= 25.
  const cuotaItems = (autoRecurring ?? []).filter(r =>
    r.total_installments != null &&
    (r.paid_installments ?? 0) < r.total_installments
  )

  // Determinar qué cuotas corresponden al período actual
  const cuotaDue = cuotaItems.filter(r => {
    // El período de facturación actual (el que está abierto hoy)
    const { month: stmtM, year: stmtY } = billingPeriod(todayStr, r.billing_day)
    // Empieza el día siguiente al corte del mes anterior
    const { start } = billingPeriodRange(stmtM, stmtY, r.billing_day)
    // Fireable si hoy ya llegó el inicio del período
    return todayStr >= start
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
  for (const r of cuotaDue) {
    // Período de facturación abierto hoy para esta tarjeta
    const { month: stmtM, year: stmtY } = billingPeriod(todayStr, r.billing_day)
    const { start, end } = billingPeriodRange(stmtM, stmtY, r.billing_day)

    // Dedup: ¿ya existe una cuota de este ítem dentro del período actual?
    const { data: existing } = await supabase
      .from('expenses')
      .select('id')
      .eq('recurring_expense_id', r.id)
      .gte('date', start)
      .lte('date', end)
      .limit(1)

    if (existing && existing.length > 0) continue // ya registrada este período

    const { error } = await supabase.from('expenses').insert({
      user_id:              user.id,
      amount:               r.amount,
      category_id:          r.category_id,
      payment_method_id:    r.payment_method_id,
      recurring_expense_id: r.id,
      description:          r.name,
      date:                 start, // inicio del período de facturación
    })

    if (!error) {
      const newPaid = (r.paid_installments ?? 0) + 1
      const isDone  = newPaid >= (r.total_installments ?? 0)
      await supabase
        .from('recurring_expenses')
        .update({ paid_installments: newPaid, ...(isDone ? { is_active: false } : {}) })
        .eq('id', r.id)
      insertedNames.push(r.name)
    }
  }

  // ── Cargo de administración de tarjetas de crédito ───────────────────────
  // Se registra UNA VEZ el día de cierre (billing_day) de cada tarjeta.
  // Dedup: verificar que no exista ya un gasto con la misma descripción
  // y monto dentro del período de facturación actual.
  const { data: cardsWithFee } = await supabase
    .from('payment_methods')
    .select('id, name, admin_fee, billing_day')
    .eq('user_id', user.id)
    .eq('card_type', 'credit')
    .not('admin_fee', 'is', null)
    .gt('admin_fee', 0)
    .not('billing_day', 'is', null)

  for (const card of cardsWithFee ?? []) {
    const billingDay = card.billing_day as number
    const fee        = card.admin_fee as number

    // Solo registrar si hoy ES el día de cierre
    const eff = effectiveDay(billingDay, currentYear, currentMonth)
    if (todayDay !== eff) continue

    // Período de facturación que cierra hoy
    const { month: bpM, year: bpY } = billingPeriod(todayStr, billingDay)
    const { start, end } = billingPeriodRange(bpM, bpY, billingDay)

    const feeDesc = `Cargo administración ${card.name}`

    // Dedup: ¿ya existe este cargo en el período actual?
    const { data: existing } = await supabase
      .from('expenses')
      .select('id')
      .eq('user_id', user.id)
      .eq('payment_method_id', card.id)
      .eq('amount', fee)
      .eq('description', feeDesc)
      .gte('date', start)
      .lte('date', end)
      .limit(1)

    if (existing && existing.length > 0) continue

    const { error } = await supabase.from('expenses').insert({
      user_id:           user.id,
      amount:            fee,
      category_id:       null,
      payment_method_id: card.id,
      description:       feeDesc,
      date:              todayStr,
    })

    if (!error) insertedNames.push(feeDesc)
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
