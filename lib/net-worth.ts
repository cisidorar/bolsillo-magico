import type { SupabaseClient } from '@supabase/supabase-js'
import { billingPeriod } from './utils'

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

/** Interés compuesto acumulado de cuenta de ahorro (misma fórmula que DepositManager). */
function savingsEarned(balance: number, annualRate: number, startDate: string): number {
  const s    = new Date(startDate + 'T12:00:00')
  const days = Math.max(0, Math.floor((Date.now() - s.getTime()) / 86_400_000))
  return Math.round(balance * (Math.pow(1 + annualRate / 100, days / 365) - 1))
}

/** Interés devengado lineal de depósito a plazo (misma fórmula que TermDepositManager). */
function depositAccrued(amount: number, rate: number, startDate: string, maturityDate: string): number {
  const start = new Date(startDate + 'T12:00:00').getTime()
  const end   = new Date(maturityDate + 'T12:00:00').getTime()
  const total = Math.round((end - start) / 86_400_000)
  const gone  = Math.min(Math.max(Math.floor((Date.now() - start) / 86_400_000), 0), total)
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
 */
async function computeCommittedDebt(
  supabase: SupabaseClient,
  userId: string,
  now: Date,
): Promise<number> {
  const nowMonthIdx = now.getFullYear() * 12 + now.getMonth()
  const lookback = new Date(now.getTime() - 60 * 86_400_000).toISOString().split('T')[0]

  const [{ data: recurring }, { data: cardExpenses }] = await Promise.all([
    supabase.from('recurring_expenses')
      .select('amount, total_installments, paid_installments')
      .eq('user_id', userId).eq('is_active', true).not('total_installments', 'is', null),
    supabase.from('expenses')
      .select('amount, date, payment_method:payment_methods(card_type, billing_day)')
      .eq('user_id', userId).gte('date', lookback),
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
    const offset = (stmt.year * 12 + (stmt.month - 1)) - nowMonthIdx
    if (offset >= 1 && offset <= 6) cardPending += e.amount
  }

  return cuotasPendingTotal + cardPending
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
