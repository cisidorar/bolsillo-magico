// W3 (roadmap de vista, fase 2): evolución del valor del portafolio en el
// tiempo — antes no había ningún gráfico, solo números del instante. Es una
// APROXIMACIÓN honesta: usa las posiciones ACTUALES (shares de hoy) hacia
// atrás, no reconstruye compras/ventas históricas — mismo tipo de caveat que
// ya usa PerformanceSection. Sirve para ver la FORMA de la curva, no un
// registro contable exacto.

export interface PriceRow {
  ticker: string
  date:   string
  close:  number
}

export interface PositionShares {
  ticker: string
  shares: number
}

export interface PortfolioPoint {
  date:  string
  value: number
}

/**
 * Reconstruye el valor de la cartera día a día a partir de precios de cierre
 * y las posiciones (shares) ACTUALES. Para tickers sin cierre en un día dado
 * (fin de semana, feriado, o antes de su primer dato disponible) se usa el
 * último cierre conocido (carry-forward) — si un ticker todavía no tiene
 * ningún cierre previo, no aporta al total ese día (queda subestimado, no
 * sobreestimado).
 *
 * `windowDays` recorta a los últimos N días con dato (no calendario) antes de
 * `maxPoints` — evita mandar cientos de puntos al SVG.
 */
export function computePortfolioHistory(
  rows: PriceRow[],
  positions: PositionShares[],
  windowDays = 130,
  maxPoints = 60,
): PortfolioPoint[] {
  if (positions.length === 0) return []

  const sharesByTicker = new Map<string, number>()
  for (const p of positions) {
    if (p.shares <= 0) continue
    sharesByTicker.set(p.ticker, (sharesByTicker.get(p.ticker) ?? 0) + p.shares)
  }
  if (sharesByTicker.size === 0) return []

  const byTicker = new Map<string, { date: string; close: number }[]>()
  for (const r of rows) {
    if (!sharesByTicker.has(r.ticker)) continue
    if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, [])
    byTicker.get(r.ticker)!.push({ date: r.date, close: r.close })
  }
  for (const arr of byTicker.values()) arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const allDates = [...new Set(rows.filter(r => sharesByTicker.has(r.ticker)).map(r => r.date))].sort()
  if (allDates.length === 0) return []

  const idx = new Map<string, number>()
  const lastClose = new Map<string, number>()
  for (const t of byTicker.keys()) idx.set(t, -1)

  const points: PortfolioPoint[] = []
  for (const date of allDates) {
    let value = 0
    for (const [ticker, shares] of sharesByTicker) {
      const series = byTicker.get(ticker)
      if (!series) continue
      let i = idx.get(ticker)!
      while (i + 1 < series.length && series[i + 1].date <= date) {
        i++
        lastClose.set(ticker, series[i].close)
      }
      idx.set(ticker, i)
      const close = lastClose.get(ticker)
      if (close !== undefined) value += shares * close
    }
    points.push({ date, value })
  }

  const windowed = points.slice(-windowDays)
  if (windowed.length <= maxPoints) return windowed

  const step = windowed.length / maxPoints
  const sampled: PortfolioPoint[] = []
  for (let i = 0; i < maxPoints; i++) sampled.push(windowed[Math.floor(i * step)])
  const last = windowed[windowed.length - 1]
  if (sampled[sampled.length - 1]?.date !== last.date) sampled.push(last)
  return sampled
}
