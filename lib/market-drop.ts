// ── Aviso de caída fuerte (nov 2026) ─────────────────────────────────────────
// Cas, tras la semana del 22–30 oct 2026 (Intel −28,6% en un día, SOXL −24,7%,
// su cartera −9% el 30/10): "quiero que tras una de esas caídas fuertes llegue
// un correo con una explicación y cómo afecta mis finanzas".
//
// Este módulo es puro (sin red ni DB): decide si el día cuenta como caída
// fuerte y arma los números de impacto. La explicación de POR QUÉ cayó la
// arma /api/cron/market-drop con titulares + IA; el "cómo te afecta" sale de
// acá y es determinístico — la IA no calcula nada sobre la plata de Cas.
//
// La variación del día se mide como Σ acciones × (cierre − cierre anterior),
// NO comparando snapshots de cartera: un snapshot sube si ese día compraste
// (ej. 19/10 "+9,8%" fue una compra), y eso no es rendimiento.

import { detectLeverage } from './leveraged-etfs'

export const DROP_RULES = {
  /** Cartera propia: caída del día igual o peor que esto (en %). */
  portfolioPct: -4,
  /** Mercado (SPY): caída del día igual o peor que esto dispara aunque tu cartera aguante. */
  marketPct: -2.5,
  /** Una posición sola que se desploma, si además pesa en tu cartera. */
  positionPct: -15,
  positionMinShare: 0.08,
  /** Piso absoluto: con una cartera chica, un −4% de US$20 no amerita correo. */
  minLossUsd: 25,
} as const

export interface DropPositionInput {
  ticker:     string
  shares:     number
  avgCostUsd: number
  close:      number | null   // cierre del día analizado
  prevClose:  number | null   // cierre de la rueda anterior
  name?:      string | null
}

export interface DropContext {
  walletUsd:       number         // efectivo en la billetera USD (no se mueve con la bolsa)
  spyPct:          number | null  // variación del día de SPY, en %
  usdClp:          number | null
  netWorthClp:     number | null  // patrimonio neto (último snapshot)
  safeClp:         number | null  // ahorros + depósitos en pesos (no dependen de la bolsa)
  monthlySpendClp: number | null  // gasto mensual promedio
}

export interface DropMover {
  ticker:    string
  pct:       number   // variación del día, %
  changeUsd: number   // aporte a la variación de la cartera, USD
  shareOfLoss: number // fracción de la pérdida total explicada por esta posición (0..1), solo perdedoras
  weight:    number   // peso de la posición en la cartera al cierre anterior (0..1)
  leverage:  number | null
}

export type DropTrigger = 'portfolio' | 'market' | 'position'

export interface DropReport {
  triggers:      DropTrigger[]
  prevValueUsd:  number   // acciones (cierre anterior) + billetera
  valueUsd:      number   // acciones (cierre de hoy) + billetera
  changeUsd:     number   // negativo en una caída
  changePct:     number   // vs prevValueUsd
  stocksChangePct: number // solo la parte en acciones
  spyPct:        number | null
  losers:        DropMover[]  // de peor a menos peor, máx 5
  gainers:       DropMover[]  // las que subieron (amortiguaron), máx 3
  topShareOfLoss: number      // fracción de la pérdida que explican las 2 peores
  costBasisUsd:  number
  unrealizedUsd: number       // valor acciones hoy − costo
  unrealizedPct: number
  changeClp:     number | null
  pctOfNetWorth: number | null   // |pérdida| / patrimonio neto, %
  daysOfSpending: number | null  // |pérdida| expresada en días de gasto promedio
  safeClp:       number | null
}

function round2(n: number) { return Math.round(n * 100) / 100 }

/**
 * Devuelve el reporte si el día califica como caída fuerte, o null si no.
 * Posiciones sin cierre de hoy o de ayer se ignoran en la variación (no se
 * inventa movimiento), pero su valor al costo sigue contando en el total.
 */
export function analyzeDrop(positions: DropPositionInput[], ctx: DropContext): DropReport | null {
  const held = positions.filter(p => p.shares > 0)
  if (held.length === 0) return null

  let prevStocks = 0, nowStocks = 0, costBasis = 0
  const movers: Omit<DropMover, 'shareOfLoss' | 'weight'>[] = []
  for (const p of held) {
    costBasis += p.shares * p.avgCostUsd
    if (p.close == null || p.prevClose == null || p.prevClose <= 0) {
      const v = p.shares * (p.close ?? p.prevClose ?? p.avgCostUsd)
      prevStocks += v; nowStocks += v
      continue
    }
    prevStocks += p.shares * p.prevClose
    nowStocks  += p.shares * p.close
    movers.push({
      ticker:    p.ticker,
      pct:       (p.close / p.prevClose - 1) * 100,
      changeUsd: p.shares * (p.close - p.prevClose),
      leverage:  detectLeverage(p.ticker, p.name)?.factor ?? null,
    })
  }

  const wallet    = Math.max(0, ctx.walletUsd)
  const prevValue = prevStocks + wallet
  const nowValue  = nowStocks + wallet
  const change    = nowValue - prevValue
  if (prevValue <= 0) return null
  const changePct       = (change / prevValue) * 100
  const stocksChangePct = prevStocks > 0 ? ((nowStocks - prevStocks) / prevStocks) * 100 : 0

  const totalLoss = movers.filter(m => m.changeUsd < 0).reduce((s, m) => s + m.changeUsd, 0)
  const withWeights: DropMover[] = movers.map(m => {
    const prevPos = held.find(h => h.ticker === m.ticker)!
    const weight  = prevStocks > 0 ? (prevPos.shares * (prevPos.prevClose ?? 0)) / prevStocks : 0
    return { ...m, weight, shareOfLoss: m.changeUsd < 0 && totalLoss < 0 ? m.changeUsd / totalLoss : 0 }
  })

  const triggers: DropTrigger[] = []
  if (changePct <= DROP_RULES.portfolioPct) triggers.push('portfolio')
  if (ctx.spyPct != null && ctx.spyPct <= DROP_RULES.marketPct) triggers.push('market')
  if (withWeights.some(m => m.pct <= DROP_RULES.positionPct && m.weight >= DROP_RULES.positionMinShare)) triggers.push('position')
  // Sin pérdida real que contar (cartera chica o el día te fue bien) no hay correo,
  // aunque el mercado se haya caído.
  if (triggers.length === 0 || change > -DROP_RULES.minLossUsd) return null

  const losers  = withWeights.filter(m => m.changeUsd < 0).sort((a, b) => a.changeUsd - b.changeUsd).slice(0, 5)
  const gainers = withWeights.filter(m => m.changeUsd > 0).sort((a, b) => b.changeUsd - a.changeUsd).slice(0, 3)
  const topShareOfLoss = losers.slice(0, 2).reduce((s, m) => s + m.shareOfLoss, 0)

  const changeClp = ctx.usdClp ? Math.round(change * ctx.usdClp) : null
  const lossClp   = changeClp != null ? Math.abs(changeClp) : null

  return {
    triggers,
    prevValueUsd:  round2(prevValue),
    valueUsd:      round2(nowValue),
    changeUsd:     round2(change),
    changePct:     round2(changePct),
    stocksChangePct: round2(stocksChangePct),
    spyPct:        ctx.spyPct != null ? round2(ctx.spyPct) : null,
    losers:        losers.map(m => ({ ...m, pct: round2(m.pct), changeUsd: round2(m.changeUsd) })),
    gainers:       gainers.map(m => ({ ...m, pct: round2(m.pct), changeUsd: round2(m.changeUsd) })),
    topShareOfLoss,
    costBasisUsd:  round2(costBasis),
    unrealizedUsd: round2(nowStocks - costBasis),
    unrealizedPct: costBasis > 0 ? round2(((nowStocks - costBasis) / costBasis) * 100) : 0,
    changeClp,
    pctOfNetWorth: lossClp != null && ctx.netWorthClp && ctx.netWorthClp > 0
      ? round2((lossClp / ctx.netWorthClp) * 100) : null,
    daysOfSpending: lossClp != null && ctx.monthlySpendClp && ctx.monthlySpendClp > 0
      ? Math.round(lossClp / (ctx.monthlySpendClp / 30)) : null,
    safeClp: ctx.safeClp,
  }
}

const fmtPct = (n: number, d = 1) =>
  (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'
const fmtUsd = (n: number) =>
  (n < 0 ? '−' : '') + 'US$' + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
// Magnitud sin signo, para frases que ya dicen "bajó"
const absPct = (n: number, d = 1) => Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'
const fmtClp = (n: number) =>
  (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-CL')

/**
 * "Cómo te afecta", en frases cortas y sin recomendación de compra/venta.
 * Determinístico: sale solo de los números del reporte.
 */
export function impactLines(r: DropReport): string[] {
  const lines: string[] = []

  // 1. Cuánto, en las dos monedas
  lines.push(
    `Tu inversión en dólares bajó ${absPct(r.changePct)} hoy: ${fmtUsd(Math.abs(r.changeUsd))} menos` +
    (r.changeClp != null ? ` (≈ ${fmtClp(Math.abs(r.changeClp))}).` : '.'),
  )

  // 2. Contra el mercado
  if (r.spyPct != null) {
    const gap = r.stocksChangePct - r.spyPct
    if (gap <= -1) lines.push(`El mercado amplio (S&P 500) se movió ${fmtPct(r.spyPct)}; tus acciones ${fmtPct(r.stocksChangePct)}, bastante más que el mercado.`)
    else if (gap >= 1) lines.push(`El mercado amplio (S&P 500) se movió ${fmtPct(r.spyPct)}; tus acciones aguantaron mejor (${fmtPct(r.stocksChangePct)}).`)
    else lines.push(`Tus acciones se movieron parecido al mercado amplio (S&P 500 ${fmtPct(r.spyPct)}).`)
  }

  // 3. Dónde se concentró
  const top = r.losers.slice(0, 2)
  if (top.length > 0) {
    const names = top.map(m => `${m.ticker} (${fmtPct(m.pct)})`).join(' y ')
    lines.push(
      top.length === 2 || r.topShareOfLoss < 0.999
        ? `${Math.round(r.topShareOfLoss * 100)}% de la pérdida vino de ${names}: la caída estuvo concentrada, no fue pareja en toda tu cartera.`
        : `Casi toda la pérdida vino de ${names}.`,
    )
  }

  // 4. Apalancados
  const lev = r.losers.find(m => m.leverage && m.leverage >= 2)
  if (lev) {
    lines.push(`${lev.ticker} es un ETF ${lev.leverage}×: multiplica el movimiento diario de su sector, por eso cayó ${fmtPct(lev.pct)}. En días así pesa más que su tamaño en tu cartera.`)
  }

  // 5. Lo que amortiguó
  if (r.gainers.length > 0) {
    lines.push(`Amortiguó: ${r.gainers.map(m => `${m.ticker} (${fmtPct(m.pct)})`).join(', ')}.`)
  }

  // 6. Contra lo invertido
  lines.push(
    r.unrealizedUsd >= 0
      ? `Aun con la caída, tus acciones valen ${fmtUsd(r.unrealizedUsd)} más de lo que pagaste (${fmtPct(r.unrealizedPct)}).`
      : `Con la caída, tus acciones quedaron ${fmtUsd(Math.abs(r.unrealizedUsd))} bajo lo que pagaste (${fmtPct(r.unrealizedPct)}). Es una pérdida en papel: solo se concreta si vendes.`,
  )

  // 7. Peso en tu vida financiera
  const scale: string[] = []
  if (r.pctOfNetWorth != null) scale.push(`un ${r.pctOfNetWorth.toLocaleString('es-CL', { maximumFractionDigits: 1 })}% de tu patrimonio neto`)
  if (r.daysOfSpending != null && r.daysOfSpending > 0) scale.push(`≈ ${r.daysOfSpending} días de tu gasto promedio`)
  if (scale.length > 0) lines.push(`En perspectiva, la baja equivale a ${scale.join(' y ')}.`)

  // 8. Lo que no se mueve
  if (r.safeClp != null && r.safeClp > 0) {
    lines.push(`Tus ahorros y depósitos en pesos (${fmtClp(r.safeClp)}) no dependen de la bolsa: siguen intactos, igual que tu gasto del mes.`)
  }

  return lines
}
