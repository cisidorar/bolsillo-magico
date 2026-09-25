'use server'

import { createClient } from '@/lib/supabase/server'
import { billingPeriodRange, currentStatementRange, getNowChile } from '@/lib/utils'
import { monthlyDueDates, annualDueDates, intervalDueDate, effectiveDay, CATCHUP_MONTHS } from '@/lib/recurring-due'
import { cookies } from 'next/headers'

export async function runAutoRegister(): Promise<{ registered: string[] }> {
  // sep 2026 (Cas: "tampoco registro claude ningun gasto recurrente" — el
  // Netflix del 11/9 y varios más llevaban semanas sin registrarse, en
  // MÚLTIPLES dispositivos y después de recargar la app): esta función no
  // logueaba absolutamente nada — ni el motivo de un early-return (sin
  // sesión, bloqueado por la cookie del día), ni los errores de los inserts
  // (`if (!error) insertedNames.push(...)` descartaba el error en silencio).
  // Server Action llamada desde un useEffect sin .catch() en el cliente
  // (AutoRegister.tsx): cualquier excepción acá se perdía como promise
  // rejection silenciosa, sin rastro en ningún lado. Try/catch + logs acá
  // para que la próxima falla, si la hay, quede en get_runtime_logs de
  // Vercel en vez de ser un misterio total otra vez.
  try {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user) {
    console.error('[auto-register] sin sesión de usuario', authError?.message)
    return { registered: [] }
  }

  // Hora de Chile (no UTC): evita registrar con la fecha de "mañana" entre
  // ~20:00-00:00 hora Santiago, que desalinea dedup y período de facturación.
  const { now: today, dateStr: todayStr, todayDate: todayDay, month: currentMonth, year: currentYear } = getNowChile()
  const cookieKey   = `auto_reg_${user.id.slice(0, 8)}_${todayStr}`
  const cookieStore = await cookies()

  if (cookieStore.has(cookieKey)) {
    console.log(`[auto-register] ${cookieKey} ya corrió hoy, se salta`)
    return { registered: [] }
  }

  const nextMonth    = currentMonth === 12 ? 1  : currentMonth + 1
  const nextYear     = currentMonth === 12 ? currentYear + 1 : currentYear

  const { data: autoRecurring } = await supabase
    .from('recurring_expenses')
    .select('id, amount, category_id, payment_method_id, billing_day, billing_month, interval_months, name, total_installments, paid_installments, created_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .eq('auto_register', true)

  // Inicio de la ventana de catch-up (ver lib/recurring-due.ts): las consultas
  // de dedup de más abajo tienen que abarcarla completa, no solo el mes en curso.
  const catchupStart = (() => {
    let m = currentMonth - CATCHUP_MONTHS, y = currentYear
    while (m <= 0) { m += 12; y -= 1 }
    return `${y}-${String(m).padStart(2, '0')}-01`
  })()

  // ── Gastos normales (sin cuotas, sin cobro anual) ────────────────────────
  // sep 2026 (bug reportado por Cas: "por qué no está registrado el gasto
  // recurrente spotify 29 de agosto"): antes esto solo miraba el mes
  // calendario en curso (`eff <= todayDay` con currentMonth), y como el
  // auto-registro corre ÚNICAMENTE al abrir la app, un cobro de fin de mes
  // caía en un hueco permanente si la persona no abría la app entre el día
  // del cobro y el cierre del mes. Caso real: Spotify cobra el 29, Cas usó
  // la app por última vez el 27 de agosto y volvió el 2 de septiembre — al
  // volver, `29 <= 2` era falso y agosto ya no se recuperaba nunca.
  //
  // Ahora se revisan también los meses ya cerrados dentro de una ventana
  // acotada, y cada cobro se registra con SU fecha real (no la de hoy), que
  // es lo que mantiene coherente el historial y el período de facturación de
  // la tarjeta.
  // "Cada N meses" (interval_months>1, sep 2026: Comida Kida) va aparte —
  // no caen en un día fijo del mes, así que monthlyDueDates no aplica. Se
  // ancla al último gasto REAL registrado, ver más abajo.
  const normalItems = (autoRecurring ?? []).filter(r =>
    r.total_installments == null && r.billing_month == null && (r.interval_months ?? 1) <= 1
  )
  const intervalItems = (autoRecurring ?? []).filter(r =>
    r.total_installments == null && r.billing_month == null && (r.interval_months ?? 1) > 1
  )
  const normalDue: { r: (typeof normalItems)[number]; date: string }[] = []
  for (const r of normalItems) {
    for (const due of monthlyDueDates({ billingDay: r.billing_day }, todayStr, r.created_at)) {
      normalDue.push({ r, date: due.date })
    }
  }

  // ── Cuotas con auto_register ─────────────────────────────────────────────
  // Se registran al INICIO del período de facturación: el día siguiente al billing_day.
  // Ej: billing_day=24, el nuevo período empieza el 25 → registrar cuando hoy >= 25.
  const cuotaItems = (autoRecurring ?? []).filter(r =>
    r.total_installments != null &&
    (r.paid_installments ?? 0) < r.total_installments
  )

  // Determinar qué cuotas corresponden al período actual
  const cuotaDue = cuotaItems.filter(r => {
    // El período de facturación abierto AHORA MISMO — currentStatementRange
    // ya sabe que el corte pasa a las 14:00 hora Chile el día exacto de
    // cierre, no a medianoche (a diferencia de billingPeriod, que es puro
    // por fecha y no debe reinterpretar gastos ya guardados).
    const { start } = currentStatementRange(r.billing_day)
    return todayStr >= start
  })

  let insertedNames: string[] = []

  // ── Registrar normales ───────────────────────────────────────────────────
  if (normalDue.length > 0) {
    // Dedup por dos vías: (a) ya existe un gasto vinculado a este ítem
    // recurrente ese mes, o (b) el usuario ya lo registró a mano (sin
    // vincular) con el mismo nombre y monto — evita duplicar cargos como
    // "Netflix $18.770" cuando la persona lo anotó manualmente antes de que
    // corriera el auto-registro.
    //
    // Las dos claves llevan el MES adentro (sep 2026, junto con el catch-up):
    // antes bastaba "existe un gasto de este recurrente" porque la ventana era
    // un solo mes; ahora que se miran varios, sin el mes en la clave un cobro
    // ya registrado en julio bloquearía el de agosto.
    const { data: alreadyNormal } = await supabase
      .from('expenses')
      .select('recurring_expense_id, description, amount, date')
      .eq('user_id', user.id)
      .gte('date', catchupStart)
      .lt('date',  `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)

    const ym = (date: string) => date.slice(0, 7)

    const registeredNormalIds = new Set(
      (alreadyNormal ?? [])
        .filter(e => e.recurring_expense_id)
        .map(e => `${e.recurring_expense_id}::${ym(e.date as string)}`)
    )
    const registeredNormalKeys = new Set(
      (alreadyNormal ?? [])
        .filter(e => !e.recurring_expense_id)
        .map(e => `${(e.description ?? '').trim().toLowerCase()}::${e.amount}::${ym(e.date as string)}`)
    )

    const toInsert = normalDue
      .filter(({ r, date }) => !registeredNormalIds.has(`${r.id}::${ym(date)}`))
      .filter(({ r, date }) => !registeredNormalKeys.has(`${r.name.trim().toLowerCase()}::${r.amount}::${ym(date)}`))
      .map(({ r, date }) => ({
        user_id:              user.id,
        amount:               r.amount,
        category_id:          r.category_id,
        payment_method_id:    r.payment_method_id,
        recurring_expense_id: r.id,
        description:          r.name,
        date,
      }))

    if (toInsert.length > 0) {
      console.log(`[auto-register] ${toInsert.length} normales por registrar:`, toInsert.map(e => `${e.description}(${e.date})`))
      // upsert ignoreDuplicates: si otra pestaña ganó la carrera, no aborta el
      // lote completo ni duplica (índice único user+recurring+date en BD)
      const { error } = await supabase
        .from('expenses')
        .upsert(toInsert, { onConflict: 'user_id,recurring_expense_id,date', ignoreDuplicates: true })
      if (!error) insertedNames.push(...toInsert.map(e => e.description))
      else console.error('[auto-register] upsert normales falló:', error.message)
    }
  }

  // ── Registrar "cada N meses" ──────────────────────────────────────────────
  // Se ancla al último gasto REAL vinculado a cada ítem (no a un día fijo del
  // mes) — por eso necesita su propia consulta de "último pago", sin límite
  // de fecha hacia atrás: un ítem cada 6 meses puede tener su última compra
  // fuera de la ventana de catch-up de los demás.
  if (intervalItems.length > 0) {
    const { data: lastPaidRows } = await supabase
      .from('expenses')
      .select('recurring_expense_id, date')
      .eq('user_id', user.id)
      .in('recurring_expense_id', intervalItems.map(r => r.id))
      .order('date', { ascending: false })

    const lastPaidByItem: Record<string, string> = {}
    for (const e of lastPaidRows ?? []) {
      if (!e.recurring_expense_id) continue
      if (!lastPaidByItem[e.recurring_expense_id]) lastPaidByItem[e.recurring_expense_id] = e.date as string
    }

    const intervalToInsert = intervalItems
      .map(r => ({ r, due: intervalDueDate(r.interval_months, lastPaidByItem[r.id] ?? null, r.created_at, todayStr) }))
      .filter((x): x is { r: (typeof intervalItems)[number]; due: NonNullable<ReturnType<typeof intervalDueDate>> } => x.due !== null)
      .map(({ r, due }) => ({
        user_id:              user.id,
        amount:               r.amount,
        category_id:          r.category_id,
        payment_method_id:    r.payment_method_id,
        recurring_expense_id: r.id,
        description:          r.name,
        date:                 due.date,
      }))

    if (intervalToInsert.length > 0) {
      console.log(`[auto-register] ${intervalToInsert.length} "cada N meses" por registrar:`, intervalToInsert.map(e => `${e.description}(${e.date})`))
      const { error } = await supabase
        .from('expenses')
        .upsert(intervalToInsert, { onConflict: 'user_id,recurring_expense_id,date', ignoreDuplicates: true })
      if (!error) insertedNames.push(...intervalToInsert.map(e => e.description))
      else console.error('[auto-register] upsert "cada N meses" falló:', error.message)
    }
  }

  // ── Registrar cuotas ─────────────────────────────────────────────────────
  for (const r of cuotaDue) {
    // Período de facturación abierto AHORA MISMO para esta tarjeta
    const { start, end } = currentStatementRange(r.billing_day)

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
    } else {
      console.error(`[auto-register] insert cuota falló (${r.name}):`, error.message)
    }
  }

  // ── Gastos anuales ───────────────────────────────────────────────────────
  // Se registran UNA VEZ en el año calendario, en el día de cobro del mes
  // configurado en billing_month.
  //
  // sep 2026: mismo hueco que los normales, pero peor — antes exigía
  // `currentMonth === bm`, o sea que la app tenía que abrirse DENTRO del mes
  // del cobro anual o ese año se perdía entero. Ahora annualDueDates aplica
  // la misma ventana de catch-up que los mensuales.
  const annualItems = (autoRecurring ?? []).filter(r =>
    r.total_installments == null && r.billing_month != null
  )

  for (const r of annualItems) {
    const due = annualDueDates(
      { billingDay: r.billing_day, billingMonth: r.billing_month },
      todayStr,
      r.created_at,
    )[0]
    if (!due) continue

    // Dedup por año calendario: ¿ya existe este gasto en ese año?
    const { data: existingAnnual } = await supabase
      .from('expenses')
      .select('id')
      .eq('recurring_expense_id', r.id)
      .gte('date', `${due.year}-01-01`)
      .lte('date', `${due.year}-12-31`)
      .limit(1)

    if (existingAnnual && existingAnnual.length > 0) continue

    const { error } = await supabase.from('expenses').insert({
      user_id:              user.id,
      amount:               r.amount,
      category_id:          r.category_id,
      payment_method_id:    r.payment_method_id,
      recurring_expense_id: r.id,
      description:          r.name,
      date:                 due.date,
    })

    if (!error) insertedNames.push(r.name)
    else console.error(`[auto-register] insert anual falló (${r.name}):`, error.message)
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

  // Categoría para los cargos de administración: sin esto, category_id
  // quedaba null y el cargo desaparecía de "Por categoría" (byCat lo filtra),
  // rompiendo el cuadre visual entre el total del mes y la suma de categorías.
  // Reutiliza "Comisiones" si ya existe, o la crea una sola vez.
  let feeCategoryId: string | null = null
  if ((cardsWithFee ?? []).length > 0) {
    const { data: existingCat } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', user.id)
      .ilike('name', 'Comisiones')
      .maybeSingle()

    if (existingCat) {
      feeCategoryId = existingCat.id
    } else {
      const { count } = await supabase
        .from('categories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
      const { data: createdCat } = await supabase
        .from('categories')
        .insert({
          user_id:    user.id,
          name:       'Comisiones',
          icon:       'Landmark',
          color:      '#5F5E5A',
          bg_color:   '#F1EFE8',
          is_default: false,
          sort_order: (count ?? 0) + 1,
        })
        .select('id')
        .maybeSingle()
      feeCategoryId = createdCat?.id ?? null
    }
  }

  for (const card of cardsWithFee ?? []) {
    const billingDay = card.billing_day as number
    const fee        = card.admin_fee as number

    // Solo registrar si hoy ES el día de cierre
    const eff = effectiveDay(billingDay, currentYear, currentMonth)
    if (todayDay !== eff) continue

    // Período de facturación que cierra hoy: como ya sabemos que hoy ES el
    // día de corte (línea anterior), el período que cierra es siempre el de
    // este mes calendario — sin ambigüedad de hora. Nunca calcular esto vía
    // currentStatementRange aquí: después de las 14:00 esa función ya
    // apunta al período NUEVO recién abierto, y el cargo de administración
    // es el cargo de cierre del período que ACABA de terminar, no una
    // compra nueva sujeta al cutover.
    const { start, end } = billingPeriodRange(currentMonth, currentYear, billingDay)

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
      category_id:       feeCategoryId,
      payment_method_id: card.id,
      description:       feeDesc,
      date:              todayStr,
    })

    if (!error) insertedNames.push(feeDesc)
    else console.error(`[auto-register] insert cargo admin falló (${feeDesc}):`, error.message)
  }

  const midnight = new Date(today)
  midnight.setHours(24, 0, 0, 0)
  cookieStore.set(cookieKey, '1', {
    expires:  midnight,
    httpOnly: true,
    sameSite: 'lax',
    path:     '/',
  })

  if (insertedNames.length > 0) console.log('[auto-register] registrados:', insertedNames)
  return { registered: insertedNames }

  } catch (err) {
    console.error('[auto-register] excepción no capturada:', err instanceof Error ? err.message : err)
    return { registered: [] }
  }
}
