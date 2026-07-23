'use client'

import { ArrowUp, ArrowDown } from 'lucide-react'
import type { StockSale, StockPurchase } from '@/app/(dashboard)/inversiones/page'
import type { SpyBenchmarkResult } from '@/lib/benchmark'

// ── "Tu rendimiento": el feedback loop del portafolio (U5 del roadmap UX) ──
// Antes vivía en Inversiones → Billetera, donde nadie las busca — son
// métricas de las decisiones de ACCIONES (¿le ganaste al mercado?, ¿qué tan
// buenas fueron tus ventas?), no de la billetera. Se movieron a Acciones,
// al final de la página: el lugar natural para revisar resultado después de
// haber visto el detalle. Billetera vuelve a ser solo saldo y cartola.

function fmtUSD(n: number): string {
  return 'US$' + n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtUSDSigned(n: number): string {
  return (n >= 0 ? '+US$' : '-US$') + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${day} ${MES[m - 1]} ${String(y).slice(2)}`
}

interface Props {
  sales?:        StockSale[]
  spyBenchmark?: SpyBenchmarkResult | null
  /** D5 (roadmap de calidad de decisión): para cruzar ventas cerradas con el
   *  score de convicción con el que se decidieron sus compras. */
  purchases?:    StockPurchase[]
}

export default function PerformanceSection({ sales = [], spyBenchmark = null, purchases = [] }: Props) {
  // ── Métricas de calidad sobre ventas cerradas (Fase 2.1 del roadmap) ──────
  const salesStats = (() => {
    if (sales.length === 0) return null
    const pnls  = sales.map(s => Number(s.realized_pnl_usd))
    const wins  = pnls.filter(p => p > 0)
    const losses = pnls.filter(p => p < 0)
    const totalPnl = pnls.reduce((s, p) => s + p, 0)
    const avgWin  = wins.length   > 0 ? wins.reduce((s, p) => s + p, 0) / wins.length : 0
    const avgLoss = losses.length > 0 ? losses.reduce((s, p) => s + p, 0) / losses.length : 0
    const winRate = (wins.length / sales.length) * 100
    const wlRatio = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : null
    const best  = sales.reduce((b, s) => Number(s.realized_pnl_usd) > Number(b.realized_pnl_usd) ? s : b, sales[0])
    const worst = sales.reduce((w, s) => Number(s.realized_pnl_usd) < Number(w.realized_pnl_usd) ? s : w, sales[0])
    return { totalPnl, avgWin, avgLoss, winRate, wlRatio, wins: wins.length, losses: losses.length, count: sales.length, best, worst }
  })()

  // ── D5 (roadmap de calidad de decisión): ¿te fue mejor comprando con score
  // alto que con score bajo? Cruza cada venta cerrada con el score PROMEDIO
  // de las compras de ese ticker hasta la fecha de venta (aproximación: la
  // contabilidad es a costo promedio ponderado, no por lote, así que no hay
  // forma exacta de saber CUÁL compra específica se vendió — el promedio de
  // convicción de entrada es la mejor lectura disponible sin rehacer todo el
  // modelo de costos a FIFO/lotes).
  const scoreVsOutcome = (() => {
    const scoredSales = sales
      .map(s => {
        const entryScores = purchases
          .filter(p => p.ticker === s.ticker && p.purchase_date <= s.sale_date && p.conviction_score != null)
          .map(p => Number(p.conviction_score))
        if (entryScores.length === 0) return null
        const avgScore = entryScores.reduce((a, b) => a + b, 0) / entryScores.length
        const costBasis = Number(s.cost_basis_usd)
        const pnlPct = costBasis > 0 ? (Number(s.realized_pnl_usd) / costBasis) * 100 : 0
        return { avgScore, pnlPct }
      })
      .filter((x): x is { avgScore: number; pnlPct: number } => x !== null)

    if (scoredSales.length === 0) return null
    const highScore = scoredSales.filter(s => s.avgScore >= 70)
    const lowScore  = scoredSales.filter(s => s.avgScore < 55)
    const avg = (arr: { pnlPct: number }[]) => arr.length > 0 ? arr.reduce((s, x) => s + x.pnlPct, 0) / arr.length : null
    return {
      total: scoredSales.length,
      highCount: highScore.length, highAvgPct: avg(highScore),
      lowCount:  lowScore.length,  lowAvgPct:  avg(lowScore),
    }
  })()

  if (!salesStats && !spyBenchmark) return null

  return (
    <div className="space-y-4">
      <p className="text-sm font-bold px-1" style={{ color: 'var(--ink)' }}>Tu rendimiento</p>

      {/* ── ¿Le ganaste al mercado? Benchmark vs SPY con el mismo flujo de caja ── */}
      {spyBenchmark && (() => {
        const b = spyBenchmark
        const won = b.diffUsd >= 0
        return (
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 lg:px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>¿Le ganaste al mercado?</p>
              <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>vs. SPY · al {fmtDate(b.asOfDate)}</p>
            </div>
            <div className="px-4 lg:px-5 py-4">
              <p className="text-[11px] leading-relaxed mb-3" style={{ color: 'var(--ink-3)' }}>
                Si cada compra de acciones hubiera comprado SPY ese mismo día por el mismo monto (y cada venta hubiera vendido SPY ese día), hoy tendrías:
              </p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="rounded-2xl p-3 text-center" style={{ background: 'var(--surface-2)' }}>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Tus posiciones</p>
                  <p className="text-base font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtUSD(b.realValueUsd)}</p>
                </div>
                <div className="rounded-2xl p-3 text-center" style={{ background: 'var(--surface-2)' }}>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>En SPY habrías tenido</p>
                  <p className="text-base font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtUSD(b.shadowValueUsd)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: won ? 'rgba(31,190,141,0.10)' : 'rgba(255,111,97,0.10)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: won ? 'rgba(31,190,141,0.18)' : 'rgba(255,111,97,0.18)' }}>
                  {won ? <ArrowUp className="w-4 h-4" style={{ color: 'var(--mint)' }} /> : <ArrowDown className="w-4 h-4" style={{ color: 'var(--coral)' }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                    {won ? 'Le ganaste al mercado' : 'El mercado te ganó'}
                  </p>
                  {b.diffPct !== null && (
                    <p className="text-[11px] font-semibold" style={{ color: won ? 'var(--mint)' : 'var(--coral)' }}>
                      {won ? '+' : ''}{b.diffPct.toFixed(1)}% vs. SPY
                    </p>
                  )}
                </div>
                <p className="text-base font-bold tabular-nums shrink-0" style={{ color: won ? 'var(--mint)' : 'var(--coral)' }}>
                  {fmtUSDSigned(b.diffUsd)}
                </p>
              </div>
              <p className="text-[10px] leading-relaxed mt-2.5" style={{ color: 'var(--ink-3)' }}>
                Valorizado con el último cierre conocido de cada acción (no precio en vivo) — puede ir un día atrás.
                {won
                  ? ' Elegir acciones te sirvió esta vez, no significa que siga pasando.'
                  : ' Indexarse (comprar SPY y no tocarlo) suele ganarle a elegir acciones sueltas en el largo plazo — vale la pena tenerlo presente.'}
              </p>
            </div>
          </div>
        )
      })()}

      {/* ── Rendimiento de tus ventas: mide qué tan buenas fueron las decisiones ── */}
      {salesStats && (
        <div className="card overflow-hidden">
          <div className="px-4 lg:px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Rendimiento de tus ventas</p>
            <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
              {salesStats.count} venta{salesStats.count !== 1 ? 's' : ''} cerrada{salesStats.count !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="grid grid-cols-3 divide-x" style={{ borderColor: 'var(--border)' }}>
            <div className="p-3.5 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Win rate</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: salesStats.winRate >= 50 ? 'var(--mint)' : 'var(--coral)' }}>
                {salesStats.winRate.toFixed(0)}%
              </p>
              <p className="text-[10px] tabular-nums" style={{ color: 'var(--ink-3)' }}>
                {salesStats.wins}G · {salesStats.losses}P
              </p>
            </div>
            <div className="p-3.5 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Relación G/P</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                {salesStats.wlRatio !== null ? `${salesStats.wlRatio.toFixed(1)}×` : '—'}
              </p>
              <p className="text-[10px] tabular-nums" style={{ color: 'var(--ink-3)' }}>
                gana {fmtUSD(salesStats.avgWin)} / pierde {fmtUSD(Math.abs(salesStats.avgLoss))}
              </p>
            </div>
            <div className="p-3.5 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Realizado total</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: salesStats.totalPnl >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                {fmtUSDSigned(salesStats.totalPnl)}
              </p>
            </div>
          </div>
          {(salesStats.best || salesStats.worst) && (
            <div className="px-4 lg:px-5 py-2.5 border-t flex items-center justify-between gap-3 text-[11px]" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--ink-3)' }}>
                Mejor: <strong style={{ color: 'var(--mint)' }}>{salesStats.best.ticker} {fmtUSDSigned(Number(salesStats.best.realized_pnl_usd))}</strong>
              </span>
              <span style={{ color: 'var(--ink-3)' }}>
                Peor: <strong style={{ color: 'var(--coral)' }}>{salesStats.worst.ticker} {fmtUSDSigned(Number(salesStats.worst.realized_pnl_usd))}</strong>
              </span>
            </div>
          )}
          {/* Lectura honesta: menos de ~10 ventas es ruido, no tendencia — evita
              sobre-interpretar un win rate que en realidad es 2 de 3 */}
          {salesStats.count < 10 && (
            <div className="px-4 lg:px-5 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[10px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
                Con pocas ventas estos números cambian mucho con la próxima — tómalos como referencia, no como patrón todavía.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── D5 (roadmap de calidad de decisión): ¿comprar con más convicción
          rinde mejor? Solo cuenta con ventas cuyas compras guardaron el score
          (jul 2026 en adelante) — compras viejas no aportan a este cruce. ── */}
      {scoreVsOutcome && (scoreVsOutcome.highCount > 0 || scoreVsOutcome.lowCount > 0) && (
        <div className="card overflow-hidden">
          <div className="px-4 lg:px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Score de entrada vs. resultado</p>
            <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
              {scoreVsOutcome.total} venta{scoreVsOutcome.total !== 1 ? 's' : ''} con compra puntuada
            </p>
          </div>
          <div className="grid grid-cols-2 divide-x" style={{ borderColor: 'var(--border)' }}>
            <div className="p-3.5 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>
                Compraste con score ≥70
              </p>
              <p className="text-lg font-bold tabular-nums" style={{ color: scoreVsOutcome.highAvgPct !== null && scoreVsOutcome.highAvgPct >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                {scoreVsOutcome.highAvgPct !== null ? `${scoreVsOutcome.highAvgPct >= 0 ? '+' : ''}${scoreVsOutcome.highAvgPct.toFixed(1)}%` : '—'}
              </p>
              <p className="text-[10px] tabular-nums" style={{ color: 'var(--ink-3)' }}>
                {scoreVsOutcome.highCount} venta{scoreVsOutcome.highCount !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="p-3.5 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>
                Compraste con score &lt;55
              </p>
              <p className="text-lg font-bold tabular-nums" style={{ color: scoreVsOutcome.lowAvgPct !== null && scoreVsOutcome.lowAvgPct >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                {scoreVsOutcome.lowAvgPct !== null ? `${scoreVsOutcome.lowAvgPct >= 0 ? '+' : ''}${scoreVsOutcome.lowAvgPct.toFixed(1)}%` : '—'}
              </p>
              <p className="text-[10px] tabular-nums" style={{ color: 'var(--ink-3)' }}>
                {scoreVsOutcome.lowCount} venta{scoreVsOutcome.lowCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="px-4 lg:px-5 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
              % retorno promedio sobre el costo, comparado por el score de convicción con el que se compró (promedio si compraste ese ticker más de una vez).
              {scoreVsOutcome.total < 10 && ' Con pocas ventas puntuadas todavía, esta comparación es referencial — no un patrón confirmado.'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
