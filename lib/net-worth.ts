import type { SupabaseClient } from '@supabase/supabase-js'
import { billingPeriod } from './utils'
import { fetchClDolarYear, type UsdClpObservation } from './cl-indicators'

// ── F4: cálculo y snapshot de patrimonio neto ────────────────────────────────
// Valoriza los tres tipos de activos y hace upsert del snapshot del mes actual.
// Los meses pasados quedan congelados (histórico real, no recalculado).
//
// P1 (fix real, jul 2026): hasta ahora el snapshot solo guardaba el BRUTO.
// La resta de deuda comprometida (cuotas pendientes + tarjeta por facturar)
// vivía solo en la UI (PatrimonioCards "Neto real"), nunca se persistía — el
// histórico y el gráfico de evolución medían bruto, premiando endeudarse
// (comprar en cuotas infla la curva) sin registrar el efecto de pagar deuda.
// Ahora el snapshot calcula y persiste también debt_clp y net_clp, de forma
// autocontenida (no depende de que quien llame ya haya calculado la deuda),
// para que también pueda correr desde el cron diario sin visitar /analisis.

export interface NetWorthSnapshot {
  month:        number
  year:         number
  stocks_clp:   number
  deposits_clp: number
  savings_clp:  number
  usd_clp:      number   // caja de dólares valorizada al USDCLP en caché
  total_clp:    number
  // Null en snapshots guardados ANTES de este fix (jul 2026) — no se
  // recalculan retroactivamente, los meses pasados quedan congelados.
  debt_clp:     number | null   // deuda comprometida a futuro (cuotas pendientes + tarjeta por facturar)
  net_clp:      number | null   // patrimonio neto real = total_clp - debt_clp
}

export interface NetWorthResult {
  current:   NetWorthSnapshot          // valores de hoy (los del upsert)
  snapshots: NetWorthSnapshot[]        // histórico (incluye el actual), viejo → nuevo
  stocksPriced: boolean                // false = acciones valorizadas al costo (sin precio en caché)
}

/**
 * Interés compuesto acumulado de cuenta de ahorro (misma fórmula que
 * DepositManager). `asOf` (ms epoch, default ahora) permite evaluar el
 * interés devengado a una fecha PASADA — lo usa computeNetWorthWeeklyHistory
 * para reconstruir cuánto habría devengado la cuenta en cada punto de la
 * curva, no solo hoy.
 */
function savingsEarned(balance: number, annualRate: number, startDate: string, asOf: number = Date.now()): number {
  const s    = new Date(startDate + 'T12:00:00')
  const days = Math.max(0, Math.floor((asOf - s.getTime()) / 86_400_000))
  return Math.round(balance * (Math.pow(1 + annualRate / 100, days / 365) - 1))
}

/** Interés devengado lineal de depósito a plazo (misma fórmula que TermDepositManager). `asOf`: ver savingsEarned. */
function depositAccrued(amount: number, rate: number, startDate: string, maturityDate: string, asOf: number = Date.now()): number {
  const start = new Date(startDate + 'T12:00:00').getTime()
  const end   = new Date(maturityDate + 'T12:00:00').getTime()
  const total = Math.round((end - start) / 86_400_000)
  const gone  = Math.min(Math.max(Math.floor((asOf - start) / 86_400_000), 0), total)
  const interest = Math.round(amount * (rate / 100))
  return total > 0 ? Math.round(interest * (gone / total)) : 0
}

/**
 * Deuda comprometida a futuro: cuotas pendientes (ya compradas, faltan por
 * pagar) + compras a crédito ya hechas cuyo estado de cuenta aún no cierra
 * (próximos 6 meses). Misma fórmula que usa /analisis para "Ya comprometido",
 * pero autocontenida — no depende de que la página que llama ya la haya
 * calculado, para poder correr también desde el cron diario.
 * No incluye recurrentes indefinidos (arriendo, suscripciones): son gasto
 * futuro recurrente, no deuda ya contraída sobre un activo.
 *
 * @param asOf Fecha de referencia para el cálculo (offsets de facturación Y
 *   cota superior de los gastos considerados). Por defecto es "ahora", pero
 *   `reconcileClosedMonthDebt` la fija al último día de un mes ya cerrado
 *   para recalcular su deuda sin filtrarse gastos de meses posteriores.
 */
export async function computeCommittedDebt(
  supabase: SupabaseClient,
  userId: string,
  asOf: Date,
): Promise<number> {
  const asOfMonthIdx = asOf.getFullYear() * 12 + asOf.getMonth()
  const asOfStr  = asOf.toISOString().split('T')[0]
  const lookback = new Date(asOf.getTime() - 60 * 86_400_000).toISOString().split('T')[0]

  const [{ data: recurring }, { data: cardExpenses }] = await Promise.all([
    supabase.from('recurring_expenses')
      .select('amount, total_installments, paid_installments')
      .eq('user_id', userId).eq('is_active', true).not('total_installments', 'is', null),
    supabase.from('expenses')
      .select('amount, date, payment_method:payment_methods(card_type, billing_day)')
      .eq('user_id', userId).gte('date', lookback).lte('date', asOfStr),
  ])

  const cuotasPendingTotal = (recurring ?? []).reduce((s, r) => {
    const remaining = Math.max(0, (r.total_installments ?? 0) - (r.paid_installments ?? 0))
    return remaining > 0 ? s + remaining * r.amount : s
  }, 0)

  let cardPending = 0
  for (const e of (cardExpenses ?? []) as unknown as { amount: number; date: string; payment_method: { card_type: string; billing_day: number | null } | null }[]) {
    const pm = e.payment_method
    if (!pm || pm.card_type !== 'credit' || !pm.billing_day) continue
    const stmt   = billingPeriod(e.date, pm.billing_day)
    const offset = (stmt.year * 12 + (stmt.month - 1)) - asOfMonthIdx
    if (offset >= 1 && offset <= 6) cardPending += e.amount
  }

  return cuotasPendingTotal + cardPending
}

// Días del mes siguiente durante los cuales se sigue corrigiendo la deuda del
// mes recién cerrado (ver reconcileClosedMonthDebt).
const DEBT_GRACE_DAYS = 10

/**
 * Reconciliación de ventana de gracia (jul 2026): el usuario no registra
 * gastos a diario — a veces carga la semana completa de una sola vez, fechada
 * al día real en que ocurrió cada gasto. Eso significa que al cerrar un mes,
 * los gastos con tarjeta de la última semana pueden no estar cargados todavía
 * — el snapshot de `debt_clp`/`net_clp` de ese mes se congela subestimando la
 * deuda justo en el peor momento (el cierre), y como los meses pasados no se
 * recalculan, ese hueco quedaría permanente.
 *
 * Esta función corre en el cron durante los primeros `DEBT_GRACE_DAYS` del
 * mes siguiente: recalcula SOLO `debt_clp`/`net_clp` (nunca los activos, que
 * si se recalcularan con las fórmulas de interés seguirían la fecha de HOY,
 * no la del cierre, e inyectarían interés futuro en un mes ya cerrado) del
 * mes anterior, usando lo que ya se haya cargado tarde, y sin mirar gastos
 * fechados después de ese mes (`computeCommittedDebt` con `asOf` = último día
 * del mes cerrado).
 */
export async function reconcileClosedMonthDebt(
  supabase: SupabaseClient,
  userId: string,
  today: Date,
): Promise<void> {
  if (today.getDate() > DEBT_GRACE_DAYS) return

  const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const prevMonth = prevMonthDate.getMonth() + 1
  const prevYear  = prevMonthDate.getFullYear()
  const lastDayOfPrevMonth = new Date(prevYear, prevMonth, 0) // día 0 del mes siguiente = último día de este

  const { data: existing } = await supabase
    .from('net_worth_snapshots')
    .select('total_clp, debt_clp')
    .eq('user_id', userId).eq('month', prevMonth).eq('year', prevYear)
    .maybeSingle()
  if (!existing) return // no hay snapshot de ese mes (usuario nuevo o sin activos) — nada que corregir

  const newDebt = await computeCommittedDebt(supabase, userId, lastDayOfPrevMonth)
  if (newDebt === existing.debt_clp) return // nada cambió, no gastar un write

  const newNet = existing.total_clp - newDebt
  const { error } = await supabase.from('net_worth_snapshots')
    .update({ debt_clp: newDebt, net_clp: newNet, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('month', prevMonth).eq('year', prevYear)
  if (error) console.error('[reconcileClosedMonthDebt] update error:', error.message)
}

/**
 * @param knownDebtTotal Si quien llama ya calculó la deuda comprometida con
 *   más detalle (ej. /analisis, que necesita el desglose mes a mes para la
 *   card "Ya comprometido"), pasarla acá evita recalcularla con una ventana
 *   distinta y que ambos números diverjan. Si se omite (ej. desde el cron,
 *   que no tiene ese cálculo a mano), se calcula internamente.
 */
export async function computeAndSnapshotNetWorth(
  supabase: SupabaseClient,
  userId: string,
  now: Date,
  knownDebtTotal?: number,
): Promise<NetWorthResult> {
  const [{ data: stocks }, { data: deposits }, { data: savings }, { data: usdRows }, { data: history }, committedDebtTotal] = await Promise.all([
    supabase.from('stock_positions').select('ticker, shares, avg_cost_usd, wallet_cost_usd').eq('user_id', userId),
    supabase.from('term_deposits').select('amount, interest_rate, start_date, maturity_date').eq('user_id', userId),
    supabase.from('savings_accounts').select('balance, annual_rate, start_date').eq('user_id', userId),
    supabase.from('usd_purchases').select('usd_amount, total_paid_clp, kind').eq('user_id', userId),
    supabase.from('net_worth_snapshots').select('month, year, stocks_clp, deposits_clp, savings_clp, usd_clp, total_clp, debt_clp, net_clp')
      .eq('user_id', userId).order('year').order('month'),
    knownDebtTotal !== undefined ? Promise.resolve(knownDebtTotal) : computeCommittedDebt(supabase, userId, now),
  ])

  // ── Ahorro: saldo + interés compuesto ────────────────────────────────────
  const savingsClp = (savings ?? []).reduce((s, a) =>
    s + a.balance + savingsEarned(a.balance, Number(a.annual_rate), a.start_date), 0)

  // ── Depósitos: capital + devengado (solo vigentes; vencidos = capital + interés total) ─
  const depositsClp = (deposits ?? []).reduce((s, d) =>
    s + d.amount + depositAccrued(d.amount, Number(d.interest_rate), d.start_date, d.maturity_date), 0)

  // ── Acciones y dólares: precio de caché × USD/CLP; fallback al costo ─────
  let stocksClp = 0
  let usdClp = 0
  // stocksPriced: sólo se marca false por un hueco REAL — hay posiciones de
  // acciones que no se pueden valorizar (falta su precio o el tipo de cambio).
  // La billetera USD NO cuenta acá: su fallback (costo en CLP) es un valor
  // real conocido, no una subvaloración, así que no debe bloquear el snapshot
  // mensual de un usuario que no tiene acciones pero sí billetera USD.
  let stocksPriced = true
  const positions = stocks ?? []
  const usdPurchases = usdRows ?? []
  // Saldo de billetera = aportes + ventas − Σ wallet_cost_usd (la porción del
  // costo de cada posición que salió de la billetera; lo legacy no descuenta)
  const movementsUsd = usdPurchases.reduce((s, r) => s + Number(r.usd_amount), 0)
  const openCostUsd  = positions.reduce((s, p) => s + Number(p.wallet_cost_usd ?? 0), 0)
  const totalUsdCash = usdPurchases.length > 0 ? Math.max(0, movementsUsd - openCostUsd) : 0
  if (positions.length > 0 || totalUsdCash > 0) {
    const tickers = positions.map(p => p.ticker)
    const { data: cached } = await supabase
      .from('price_cache')
      .select('ticker, price')
      .in('ticker', [...tickers, 'USDCLP'])
    const priceMap = new Map((cached ?? []).map(c => [c.ticker, Number(c.price)]))
    const fx = priceMap.get('USDCLP') ?? null
    if (positions.length > 0 && fx === null) stocksPriced = false
    for (const p of positions) {
      const priceUsd = priceMap.get(p.ticker)
      if (priceUsd === undefined) stocksPriced = false
      const usd = (priceUsd ?? Number(p.avg_cost_usd)) * Number(p.shares)
      // Sin FX en caché no se puede convertir a mercado: usar costo × último FX conocido no existe → aproximar con 950 sería inventar.
      // Preferimos excluir la conversión solo si no hay FX; en ese caso el valor queda en 0 y se marca stocksPriced=false.
      if (fx !== null) stocksClp += Math.round(usd * fx)
    }
    // Caja de dólares: al FX de mercado; sin FX, fallback a un piso real conocido.
    // Fix: el fallback ANTES sumaba total_paid_clp de TODOS los movimientos
    // (incluyendo aportes ya invertidos en acciones vía wallet_cost_usd) sin
    // descontar esa porción — plata que salió de la billetera se contaba dos
    // veces (como caja Y como acción). totalUsdCash ya está neto en USD
    // (aportes + ventas − wallet_cost_usd); acá se valoriza esa cifra neta a
    // la tasa CLP/USD promedio histórica de los aportes (no la de mercado,
    // que no tenemos sin FX, pero sí un piso real de lo efectivamente pagado).
    const depositRows  = usdPurchases.filter(r => r.kind === 'deposit' && r.total_paid_clp != null)
    const depositUsdSum = depositRows.reduce((s, r) => s + Number(r.usd_amount), 0)
    const depositClpSum = depositRows.reduce((s, r) => s + Number(r.total_paid_clp), 0)
    const avgHistoricalRate = depositUsdSum > 0 ? depositClpSum / depositUsdSum : null
    usdClp = fx !== null
      ? Math.round(totalUsdCash * fx)
      : avgHistoricalRate !== null
        ? Math.round(totalUsdCash * avgHistoricalRate)
        : 0
  }

  const totalClp = stocksClp + depositsClp + savingsClp + usdClp
  const netClp   = totalClp - committedDebtTotal
  const current: NetWorthSnapshot = {
    month: now.getMonth() + 1,
    year:  now.getFullYear(),
    stocks_clp:   stocksClp,
    deposits_clp: depositsClp,
    savings_clp:  savingsClp,
    usd_clp:      usdClp,
    total_clp:    totalClp,
    debt_clp:     committedDebtTotal,
    net_clp:      netClp,
  }

  // ── Upsert del snapshot del mes actual (fire-and-forget con await corto) ─
  // No persistir si hay posiciones de acciones sin precio en caché: el total
  // quedaría subvalorado (stocksClp = 0 para esas posiciones) y, como los
  // meses pasados quedan congelados por diseño, ese hueco sería permanente.
  if (totalClp > 0 && stocksPriced) {
    await supabase.from('net_worth_snapshots').upsert(
      { user_id: userId, ...current, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,month,year' },
    )
  }

  // Histórico: reemplazar/insertar el mes actual con los valores frescos
  const hist = (history ?? []).filter(h => !(h.month === current.month && h.year === current.year))
  const snapshots = totalClp > 0 ? [...hist, current] : hist

  return { current, snapshots, stocksPriced }
}

// ── Evolución semanal reconstruida (ago 2026) ────────────────────────────────
// Cas: "me gustaria que se viera la evolucion por mas meses". El histórico
// REAL de snapshots mensuales solo tiene un punto por mes desde que existe
// esta función (jul 2026) — y sus propios activos (ahorro, depósito,
// acciones, billetera USD) tampoco existen antes de esa fecha, así que no
// hay "más meses" que mostrar: no es un hueco de datos, es que el
// patrimonio invertido recién empezó a existir. Lo que sí se puede hacer es
// una curva más fina DENTRO de esa ventana real, reconstruida semana a
// semana a partir de movimientos con fecha real en vez de esperar a que se
// acumule un snapshot mensual por mes:
//  - Acciones: shares acumuladas de stock_purchases/stock_sales hasta cada
//    fecha × precio de cierre de price_history a esa fecha (o el costo
//    promedio pagado hasta ahí, si aún no hay precio histórico) × USD/CLP
//    histórico (mindicador.cl vía fetchClDolarYear).
//  - Ahorro/depósitos: las mismas fórmulas de interés que ya usa el
//    snapshot de HOY (savingsEarned/depositAccrued), evaluadas a cada fecha
//    en vez de a "ahora". Asume que el saldo no tuvo depósitos/retiros sin
//    registrar desde que se creó la cuenta — no hay un libro de movimientos,
//    solo el saldo actual, así que es la mejor aproximación disponible (la
//    misma que ya usa el cálculo de HOY, solo evaluada en el pasado).
//  - Billetera USD: no existe un flag por compra de "se pagó con la
//    billetera o con CLP externo", solo el total acumulado de hoy
//    (`wallet_cost_usd` en stock_positions). Se asume orden cronológico
//    (FIFO): las compras más antiguas consumen primero el cupo de la
//    billetera, hasta llegar al total de hoy. Es una aproximación
//    declarada, no un dato exacto — por eso el ÚLTIMO punto de la curva se
//    fuerza a calzar exacto con `current` (mismo número que ya muestra el
//    hero de arriba), la reconstrucción solo rellena los puntos intermedios.
export interface NetWorthHistoryPoint {
  date:  string  // YYYY-MM-DD (inicio de cada semana reconstruida)
  total: number  // CLP
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

/** Última observación de una serie ordenada ascendente con date <= `date` (null si `date` es anterior a toda la serie). */
function latestAtOrBefore<T extends { date: string }>(series: T[], date: string): T | null {
  let result: T | null = null
  for (const obs of series) {
    if (obs.date > date) break
    result = obs
  }
  return result
}

export async function computeNetWorthWeeklyHistory(
  supabase: SupabaseClient,
  userId: string,
  current: NetWorthSnapshot,
): Promise<NetWorthHistoryPoint[]> {
  const [{ data: savings }, { data: deposits }, { data: purchases }, { data: sales }, { data: usdRows }, { data: positions }] = await Promise.all([
    supabase.from('savings_accounts').select('balance, annual_rate, start_date').eq('user_id', userId),
    supabase.from('term_deposits').select('amount, interest_rate, start_date, maturity_date').eq('user_id', userId),
    supabase.from('stock_purchases').select('ticker, shares, total_paid_usd, purchase_date').eq('user_id', userId).order('purchase_date'),
    supabase.from('stock_sales').select('ticker, shares_sold, sale_date').eq('user_id', userId).order('sale_date'),
    supabase.from('usd_purchases').select('usd_amount, purchase_date').eq('user_id', userId).order('purchase_date'),
    supabase.from('stock_positions').select('ticker, shares, avg_cost_usd, wallet_cost_usd').eq('user_id', userId),
  ])

  const savingsRows  = savings ?? []
  const depositRows  = deposits ?? []
  const purchaseRows = (purchases ?? []) as { ticker: string; shares: number; total_paid_usd: number; purchase_date: string }[]
  const saleRows     = (sales ?? []) as { ticker: string; shares_sold: number; sale_date: string }[]
  const usdMovements = (usdRows ?? []) as { usd_amount: number; purchase_date: string }[]
  const positionRows = (positions ?? []) as { ticker: string; shares: number; avg_cost_usd: number; wallet_cost_usd: number | null }[]
  const walletCostUsdFinal = positionRows.reduce((s, p) => s + Number(p.wallet_cost_usd ?? 0), 0)

  // Fecha de arranque real: la más antigua entre las 4 fuentes de activos.
  // Sin ninguna, no hay nada que reconstruir (usuario sin activos todavía).
  const candidateStarts = [
    ...savingsRows.map(s => s.start_date),
    ...depositRows.map(d => d.start_date),
    ...purchaseRows.map(p => p.purchase_date),
    ...usdMovements.map(u => u.purchase_date),
  ].filter(Boolean) as string[]
  if (candidateStarts.length === 0) return []
  const startDate = [...candidateStarts].sort()[0]
  const todayStr  = toDateStr(new Date())

  // Reconciliación: posiciones que hoy tienen más shares que lo que suman
  // sus stock_purchases/stock_sales (datos legacy, importados o editados a
  // mano, de antes de que existiera este tracking) — sin esto, esas
  // posiciones quedarían en $0 en TODA la curva reconstruida y solo
  // aparecerían de golpe en el último punto (forzado a calzar con `current`),
  // viéndose como un salto/glitch. Se trata el faltante como si existiera
  // desde `startDate`, valorizado a su costo promedio actual.
  const trackedShares = new Map<string, number>()
  for (const p of purchaseRows) trackedShares.set(p.ticker, (trackedShares.get(p.ticker) ?? 0) + Number(p.shares))
  for (const s of saleRows)     trackedShares.set(s.ticker, (trackedShares.get(s.ticker) ?? 0) - Number(s.shares_sold))
  for (const pos of positionRows) {
    const gap = Number(pos.shares) - (trackedShares.get(pos.ticker) ?? 0)
    if (gap > 1e-6) {
      purchaseRows.push({
        ticker: pos.ticker, shares: gap, total_paid_usd: gap * Number(pos.avg_cost_usd ?? 0), purchase_date: startDate,
      })
    }
  }
  if (startDate >= todayStr) return []

  // FIFO de financiamiento de la billetera — ver comentario de la función.
  let walletBudgetLeft = walletCostUsdFinal
  const walletFundedByPurchase = purchaseRows.map(p => {
    const funded = Math.min(Number(p.total_paid_usd), Math.max(0, walletBudgetLeft))
    walletBudgetLeft -= funded
    return funded
  })

  // Precios históricos por ticker (price_history) — una sola consulta.
  const tickers = [...new Set(purchaseRows.map(p => p.ticker))]
  const { data: priceRows } = tickers.length > 0
    ? await supabase.from('price_history').select('ticker, date, close').in('ticker', tickers).order('date')
    : { data: [] as { ticker: string; date: string; close: number }[] }
  const priceByTicker = new Map<string, { date: string; close: number }[]>()
  for (const r of (priceRows ?? []) as { ticker: string; date: string; close: number }[]) {
    if (!priceByTicker.has(r.ticker)) priceByTicker.set(r.ticker, [])
    priceByTicker.get(r.ticker)!.push({ date: r.date, close: Number(r.close) })
  }

  // FX histórico USD/CLP — todos los años que cubre el rango (cache 24h c/u).
  const startYear = Number(startDate.slice(0, 4))
  const endYear   = Number(todayStr.slice(0, 4))
  const years  = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i)
  const fxByYear = await Promise.all(years.map(y => fetchClDolarYear(supabase, y)))
  const fxSeries = fxByYear
    .flatMap(s => s ?? [])
    .sort((a, b) => a.date.localeCompare(b.date)) as UsdClpObservation[]

  // Fechas semanales desde el inicio real hasta hoy (siempre termina en hoy).
  const dates: string[] = []
  let cursor = new Date(startDate + 'T12:00:00')
  const todayDate = new Date(todayStr + 'T12:00:00')
  let guard = 0
  while (cursor < todayDate && guard < 120) {
    dates.push(toDateStr(cursor))
    cursor = new Date(cursor.getTime() + 7 * 86_400_000)
    guard++
  }
  dates.push(todayStr)
  if (dates.length < 2) return []

  const points: NetWorthHistoryPoint[] = dates.map(D => {
    const asOf = new Date(D + 'T12:00:00').getTime()
    const fx = latestAtOrBefore(fxSeries, D)?.value ?? null

    // Acciones: shares acumuladas a D × precio de cierre más reciente ≤ D
    // (o el costo promedio pagado hasta D, si todavía no hay precio histórico).
    let stocksClp = 0
    if (fx !== null) {
      for (const ticker of tickers) {
        const bought = purchaseRows.filter(p => p.ticker === ticker && p.purchase_date <= D)
        const sold   = saleRows.filter(s => s.ticker === ticker && s.sale_date <= D)
        const shares = bought.reduce((s, p) => s + Number(p.shares), 0) - sold.reduce((s, r) => s + Number(r.shares_sold), 0)
        if (shares <= 0) continue
        const histPrice  = latestAtOrBefore(priceByTicker.get(ticker) ?? [], D)?.close
        const boughtCost = bought.reduce((s, p) => s + Number(p.total_paid_usd), 0)
        const boughtShs  = bought.reduce((s, p) => s + Number(p.shares), 0)
        const price = histPrice ?? (boughtShs > 0 ? boughtCost / boughtShs : 0)
        stocksClp += Math.round(shares * price * fx)
      }
    }

    // Ahorro y depósitos: 0 si la cuenta/depósito todavía no existía a esa fecha.
    const savingsClp = savingsRows
      .filter(s => s.start_date <= D)
      .reduce((s, a) => s + a.balance + savingsEarned(a.balance, Number(a.annual_rate), a.start_date, asOf), 0)
    const depositsClp = depositRows
      .filter(d => d.start_date <= D)
      .reduce((s, d) => s + d.amount + depositAccrued(d.amount, Number(d.interest_rate), d.start_date, d.maturity_date, asOf), 0)

    // Billetera USD: aportes + ventas acumulados a D, menos lo ya asignado a
    // acciones a D según el FIFO de arriba.
    let usdClp = 0
    if (fx !== null) {
      const movementsUsd = usdMovements.filter(u => u.purchase_date <= D).reduce((s, u) => s + Number(u.usd_amount), 0)
      const openCostUsd  = purchaseRows.reduce((s, p, i) => p.purchase_date <= D ? s + walletFundedByPurchase[i] : s, 0)
      usdClp = Math.round(Math.max(0, movementsUsd - openCostUsd) * fx)
    }

    return { date: D, total: stocksClp + savingsClp + depositsClp + usdClp }
  })

  // El último punto siempre calza exacto con el patrimonio ya calculado "en
  // vivo" (mismo número que el hero de arriba) — la reconstrucción es
  // aproximada, pero la cifra de hoy no debería depender de ella.
  points[points.length - 1] = { date: todayStr, total: current.total_clp }

  return points
}
