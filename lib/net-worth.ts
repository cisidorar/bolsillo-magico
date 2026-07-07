import type { SupabaseClient } from '@supabase/supabase-js'

// ── F4: cálculo y snapshot de patrimonio neto ────────────────────────────────
// Valoriza los tres tipos de activos y hace upsert del snapshot del mes actual.
// Los meses pasados quedan congelados (histórico real, no recalculado).

export interface NetWorthSnapshot {
  month:        number
  year:         number
  stocks_clp:   number
  deposits_clp: number
  savings_clp:  number
  usd_clp:      number   // caja de dólares valorizada al USDCLP en caché
  total_clp:    number
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

export async function computeAndSnapshotNetWorth(
  supabase: SupabaseClient,
  userId: string,
  now: Date,
): Promise<NetWorthResult> {
  const [{ data: stocks }, { data: deposits }, { data: savings }, { data: usdRows }, { data: history }] = await Promise.all([
    supabase.from('stock_positions').select('ticker, shares, avg_cost_usd, wallet_funded').eq('user_id', userId),
    supabase.from('term_deposits').select('amount, interest_rate, start_date, maturity_date').eq('user_id', userId),
    supabase.from('savings_accounts').select('balance, annual_rate, start_date').eq('user_id', userId),
    supabase.from('usd_purchases').select('usd_amount, total_paid_clp, kind').eq('user_id', userId),
    supabase.from('net_worth_snapshots').select('month, year, stocks_clp, deposits_clp, savings_clp, usd_clp, total_clp')
      .eq('user_id', userId).order('year').order('month'),
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
  let stocksPriced = true
  const positions = stocks ?? []
  const usdPurchases = usdRows ?? []
  // Saldo de billetera = aportes + ventas − costo de posiciones FINANCIADAS
  // por la billetera (wallet_funded); las legacy no salieron de estos aportes
  const movementsUsd = usdPurchases.reduce((s, r) => s + Number(r.usd_amount), 0)
  const openCostUsd  = positions
    .filter(p => p.wallet_funded === true)
    .reduce((s, p) => s + Number(p.shares) * Number(p.avg_cost_usd), 0)
  const totalUsdCash = usdPurchases.length > 0 ? Math.max(0, movementsUsd - openCostUsd) : 0
  if (positions.length > 0 || totalUsdCash > 0) {
    const tickers = positions.map(p => p.ticker)
    const { data: cached } = await supabase
      .from('price_cache')
      .select('ticker, price')
      .in('ticker', [...tickers, 'USDCLP'])
    const priceMap = new Map((cached ?? []).map(c => [c.ticker, Number(c.price)]))
    const fx = priceMap.get('USDCLP') ?? null
    if (fx === null) stocksPriced = false
    for (const p of positions) {
      const priceUsd = priceMap.get(p.ticker)
      if (priceUsd === undefined) stocksPriced = false
      const usd = (priceUsd ?? Number(p.avg_cost_usd)) * Number(p.shares)
      // Sin FX en caché no se puede convertir a mercado: usar costo × último FX conocido no existe → aproximar con 950 sería inventar.
      // Preferimos excluir la conversión solo si no hay FX; en ese caso el valor queda en 0 y se marca stocksPriced=false.
      if (fx !== null) stocksClp += Math.round(usd * fx)
    }
    // Caja de dólares: al FX de mercado; sin FX, fallback al costo (lo pagado
    // en CLP es un piso real conocido, a diferencia de las acciones).
    usdClp = fx !== null
      ? Math.round(totalUsdCash * fx)
      : usdPurchases.reduce((s, r) => s + r.total_paid_clp, 0)
  }

  const totalClp = stocksClp + depositsClp + savingsClp + usdClp
  const current: NetWorthSnapshot = {
    month: now.getMonth() + 1,
    year:  now.getFullYear(),
    stocks_clp:   stocksClp,
    deposits_clp: depositsClp,
    savings_clp:  savingsClp,
    usd_clp:      usdClp,
    total_clp:    totalClp,
  }

  // ── Upsert del snapshot del mes actual (fire-and-forget con await corto) ─
  if (totalClp > 0) {
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
