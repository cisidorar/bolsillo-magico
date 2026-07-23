'use client'

import { useState, useEffect } from 'react'
import {
  Info, RefreshCw, TrendingUp, TrendingDown, Target, Activity, BarChart3, Gauge,
  Newspaper, ExternalLink, Plus, Minus, DollarSign, CalendarClock,
} from 'lucide-react'
import type { TechnicalAnalysis, SignalTone } from '@/lib/technical'
import type { NewsResponse } from '@/app/api/stock-news/route'
import type { SignalBacktestResponse } from '@/app/api/signal-backtest/route'
import { computeConviction } from '@/lib/conviction'
import { positionSizeUsd } from '@/lib/technical'
import { getCachedBacktestStats } from '@/lib/analysis-cache'
import { detectLeverage } from '@/lib/leveraged-etfs'
import { getEarnings } from '@/lib/earnings-cache'
import { businessDaysUntil, type EarningsInfo } from '@/lib/earnings'
import { ConvictionChip } from '@/components/RiskRail'
import { relativeDate } from '@/lib/utils'
import type { StockPosition, StockSale, StockPurchase } from '@/app/(dashboard)/inversiones/page'

// ── U3/U4 (roadmap UX): detalle decision-first único, para cualquier ticker
// (posición o favorito). Extraído de WatchlistPanel.tsx durante U4 — antes
// vivía SOLO ahí, ahora Radar.tsx lo reutiliza para todo, con el bloque de
// posición ("Tu posición · plan de salida") ahora también trayendo el
// timeline de "Movimientos" (que antes solo existía en el modal transaccional
// de StockPositionManager) y botones funcionales "Comprar más" / "Vender".

export interface OwnedPosition { shares: number; avgCost: number }

function fmtUSD(n: number): string {
  return '$' + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const TONE_STYLE: Record<SignalTone, { color: string; bg: string }> = {
  mint:    { color: 'var(--mint)',  bg: 'rgba(31,190,141,0.12)' },
  gold:    { color: 'var(--gold)',  bg: 'rgba(255,194,60,0.14)' },
  coral:   { color: 'var(--coral)', bg: 'rgba(255,111,97,0.12)' },
  neutral: { color: 'var(--ink-2)', bg: 'var(--surface-2)' },
}

// ── RSI gauge ────────────────────────────────────────────────────────────────

function RsiBar({ value }: { value: number }) {
  const color = value <= 30 ? 'var(--mint)' : value >= 70 ? 'var(--gold)' : 'var(--primary)'
  return (
    <div>
      <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
        <div className="absolute inset-y-0" style={{ left: '30%', width: 1.5, background: 'var(--border)' }} />
        <div className="absolute inset-y-0" style={{ left: '70%', width: 1.5, background: 'var(--border)' }} />
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] font-semibold" style={{ color: 'var(--ink-3)' }}>bajo 30: cayó de más</span>
        <span className="text-[9px] font-semibold" style={{ color: 'var(--ink-3)' }}>sobre 70: subió de más</span>
      </div>
    </div>
  )
}

// ── Gráfico de 12 meses con niveles dibujados ────────────────────────────────

function PriceChart({ a }: { a: TechnicalAnalysis }) {
  // padR 68: con precios de 4 cifras ("$2.354,39") la etiqueta se cortaba
  const W = 560, H = 200, padL = 6, padR = 68, padT = 10, padB = 20
  const pts = a.chart
  if (pts.length < 10) return null

  const levels = [
    ...a.supportLevels.map(l => ({ ...l, kind: 'support' as const })),
    ...a.resistanceLevels.map(l => ({ ...l, kind: 'resistance' as const })),
  ]
  const values = [
    ...pts.map(p => p.close),
    ...pts.map(p => p.sma200).filter((v): v is number => v !== null),
    ...levels.map(l => l.price),
  ]
  const min = Math.min(...values) * 0.99
  const max = Math.max(...values) * 1.01
  const rng = max - min || 1

  const x = (i: number) => padL + (i / (pts.length - 1)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - (v - min) / rng) * (H - padT - padB)

  const priceLine = pts.map((p, i) => `${x(i)},${y(p.close)}`).join(' ')
  const smaPts = pts.map((p, i) => (p.sma200 !== null ? `${x(i)},${y(p.sma200)}` : null)).filter(Boolean) as string[]

  // Anti-colisión: si dos niveles quedan a <12px, la etiqueta del de abajo se
  // desplaza (la línea se queda en su precio real)
  const sortedLevels = levels
    .map(l => ({ ...l, lineY: y(l.price) }))
    .sort((a, b) => a.lineY - b.lineY)
  let prevLabelY = -Infinity
  const labeledLevels = sortedLevels.map(l => {
    const labelY = Math.max(l.lineY, prevLabelY + 12)
    prevLabelY = labelY
    return { ...l, labelY }
  })

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block" aria-hidden="true">
      {/* Niveles horizontales con precio a la derecha */}
      {labeledLevels.map(l => {
        const color = l.kind === 'support' ? 'var(--mint)' : 'var(--gold)'
        return (
          <g key={`${l.kind}-${l.price}`}>
            <line x1={padL} y1={l.lineY} x2={W - padR} y2={l.lineY} stroke={color} strokeWidth="1.2" strokeDasharray="5 4" opacity="0.7" />
            <text x={W - padR + 4} y={l.labelY + 3} fontSize="10" fontWeight="700" fill={color}>
              {fmtUSD(l.price)}
            </text>
          </g>
        )
      })}
      {/* SMA200 */}
      {smaPts.length > 1 && (
        <polyline points={smaPts.join(' ')} fill="none" stroke="var(--ink-3)" strokeWidth="1.5"
          strokeDasharray="2 3" opacity="0.8" />
      )}
      {/* Precio */}
      <polyline points={priceLine} fill="none" stroke="var(--primary)" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1].close)} r="3.5" fill="var(--primary)" />
      {/* Fechas */}
      <text x={padL} y={H - 5} fontSize="10" fontWeight="600" fill="var(--ink-3)">{fmtDateLabel(pts[0].date)}</text>
      <text x={W - padR} y={H - 5} fontSize="10" fontWeight="600" fill="var(--ink-3)" textAnchor="end">{fmtDateLabel(pts[pts.length - 1].date)}</text>
    </svg>
  )
}

const MONTHS_ES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
function fmtDateLabel(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number)
  return `${MONTHS_ES[m - 1]} ${String(y).slice(2)}`
}

type DetailSection = 'plan' | 'chart' | 'signals' | 'history'

export default function TechnicalDetail({
  a, ticker, name, position, rawPosition, purchases, sales, livePrice, portfolioValueUsd, walletAvailableUsd, spyReturn6m,
  onBuyMore, onSell,
}: {
  a:         TechnicalAnalysis
  ticker:    string
  /** Nombre completo del fondo/empresa (de la quote) — D6: respaldo para detectar ETFs apalancados por nombre. */
  name?:     string | null
  position?: OwnedPosition        // solo si el ticker está en cartera
  /** Fila cruda de stock_positions — para el trailing persistido y el fallback sintético de Movimientos. */
  rawPosition?: StockPosition | null
  /** Compras/ventas registradas (TODAS, se filtran por ticker adentro) — para el timeline de Movimientos. */
  purchases?: StockPurchase[]
  sales?:     StockSale[]
  livePrice?: number              // quote en vivo; fallback al cierre del análisis
  /** Para convertir los tramos de compra de % a montos concretos en USD. */
  portfolioValueUsd?: number
  walletAvailableUsd?: number | null
  /** Para el score de convicción de la cabecera — mismo criterio que el ranking de favoritos. */
  spyReturn6m?: number | null
  /** U4 roadmap UX: el modal transaccional ahora se invoca desde acá, no al revés. */
  onBuyMore?: (ticker: string) => void
  onSell?:    (ticker: string) => void
}) {
  // U3 (roadmap UX): cabecera fija con score + acción + monto; el resto vive
  // en secciones colapsables — antes eran ~12 bloques apilados en un solo scroll.
  const [openSection, setOpenSection] = useState<DetailSection>('plan')
  // D6 (roadmap de calidad de decisión): ETFs apalancados (SOXL 3×, etc.)
  // tienen decay estructural y su volatilidad hace que la regla del 1% de
  // riesgo por posición se quede corta — con 3× de apalancamiento implícito,
  // "arriesgar 1%" es en realidad arriesgar ~3%. Se divide el monto sugerido
  // por el factor para que la sugerencia siga representando el mismo riesgo
  // económico real.
  const leverage = detectLeverage(ticker, name)

  // D3 (roadmap de calidad de decisión): el motor técnico es ciego a
  // resultados trimestrales — podía sugerir comprar la víspera del evento
  // donde el gráfico menos predice. Fetch on-demand cacheado 24h server-side
  // (mismo patrón que noticias), por ticker al abrir su detalle.
  const [earnings, setEarnings] = useState<EarningsInfo | null>(null)
  useEffect(() => {
    let cancelled = false
    setEarnings(null)
    getEarnings(ticker).then(e => { if (!cancelled) setEarnings(e) }).catch(() => {})
    return () => { cancelled = true }
  }, [ticker])
  const daysToEarnings = businessDaysUntil(earnings?.nextDate ?? null)
  const earningsSoon  = daysToEarnings !== null && daysToEarnings <= 5   // aviso visible
  const earningsVeryClose = daysToEarnings !== null && daysToEarnings <= 2   // reduce el monto sugerido

  // Monto sugerido por tramo: % del tramo × el máximo por riesgo (regla del
  // 1%, misma que en Acciones). El tramo "ahora" además queda topado al
  // efectivo real disponible — no tiene sentido sugerir comprar más de lo
  // que hay en la billetera.
  const sizing = portfolioValueUsd !== undefined && portfolioValueUsd > 0
    ? positionSizeUsd(portfolioValueUsd, livePrice ?? a.price, a.alarm)
    : null
  const cashCap = walletAvailableUsd !== null && walletAvailableUsd !== undefined ? Math.max(0, walletAvailableUsd) : null
  function trancheUsd(pct: number, now: boolean): number | null {
    if (!sizing) return null
    let cap = leverage ? sizing.maxUsd / leverage.factor : sizing.maxUsd
    // D3: con resultados a ≤2 días hábiles, solo se sugiere la mitad del
    // tramo de HOY — el resto del plan (retrocesos/rupturas futuras) no se
    // toca, es específicamente la entrada de hoy la que pierde certeza.
    if (now && earningsVeryClose) cap = cap / 2
    const raw = cap * (pct / 100)
    return now && cashCap !== null ? Math.min(raw, cashCap) : raw
  }
  // Noticias on-demand: la IA solo RESUME titulares (Finnhub), jamás toca el
  // análisis técnico. Cache 12 h server-side; el estado se resetea por ticker
  // vía key={ticker} en el call site.
  const [news, setNews] = useState<NewsResponse | 'loading' | 'error' | null>(null)
  async function loadNews() {
    setNews('loading')
    try {
      const r = await fetch(`/api/stock-news?symbol=${ticker}`)
      if (!r.ok) throw new Error()
      setNews(await r.json() as NewsResponse)
    } catch { setNews('error') }
  }

  // Evaluación de señales a posteriori (Fase 2.3 del roadmap) — on-demand,
  // mismo patrón que noticias: es una consulta pesada (recorre ~1 año de
  // señales) que no vale la pena precargar para cada ticker de la watchlist.
  const [backtest, setBacktest] = useState<SignalBacktestResponse['result'] | 'loading' | 'error' | null>(null)
  async function loadBacktest() {
    setBacktest('loading')
    try {
      const r = await fetch(`/api/signal-backtest?symbol=${ticker}`)
      if (!r.ok) throw new Error()
      const d = await r.json() as SignalBacktestResponse
      setBacktest(d.result)
    } catch { setBacktest('error') }
  }
  const range = a.high52 - a.low52 || 1
  const posPct = Math.min(Math.max(((a.price - a.low52) / range) * 100, 0), 100)
  // Distancias de niveles contra el precio EN VIVO (el análisis es al cierre de
  // ayer; sin esto se llegó a mostrar "piso a −0.5%" con el piso ya perforado)
  const pxNow = livePrice ?? a.price
  const distNow = (levelPrice: number) => Math.round(((levelPrice - pxNow) / pxNow) * 1000) / 10
  // Movimiento fuerte intradía: el análisis es al cierre anterior — con ±3% o
  // más de desvío, señales y radar quedaron viejos (caso INTC −10% mostrando
  // "a +3.6% de romper el techo")
  const devPct  = Math.round(((pxNow - a.price) / a.price) * 1000) / 10
  const bigMove = Math.abs(devPct) >= 3
  const trendColor = a.trend.aboveSma200 === null ? 'var(--ink-3)'
    : a.trend.aboveSma200 && a.trend.sma200Rising !== false ? 'var(--mint)'
    : !a.trend.aboveSma200 && a.trend.sma200Rising === false ? 'var(--coral)'
    : 'var(--gold)'

  const RATING_UI: Record<TechnicalAnalysis['rating']['label'], { color: string; bg: string }> = {
    compra_fuerte: { color: 'var(--mint)',  bg: 'rgba(31,190,141,0.20)' },
    compra:        { color: 'var(--mint)',  bg: 'rgba(31,190,141,0.10)' },
    neutral:       { color: 'var(--gold)',  bg: 'rgba(255,194,60,0.14)' },
    venta:         { color: 'var(--coral)', bg: 'rgba(255,111,97,0.10)' },
    venta_fuerte:  { color: 'var(--coral)', bg: 'rgba(255,111,97,0.20)' },
  }
  const ratingUi = { ...RATING_UI[a.rating.label], text: `Lectura técnica: ${a.rating.action}` }

  // Cabecera: score de convicción (mismo cálculo que el ranking de favoritos)
  // + la acción concreta de HOY con monto, no solo el rating en abstracto.
  // D1 (roadmap de calidad de decisión): mismo track record cacheado por
  // Radar al pedir el análisis de este ticker — antes se pasaba null acá.
  const conviction = computeConviction(a, getCachedBacktestStats(ticker), spyReturn6m)
  const buyNow  = a.buy.find(t => t.now)
  const sellNow = position ? a.sell.find(t => t.now) : undefined
  let headerAction: string
  let headerColor: string
  if (sellNow) {
    const currentValue = position!.shares * (livePrice ?? a.price)
    const usdAmount = currentValue * (sellNow.pct / 100)
    headerAction = `Vende ${fmtUSD(usdAmount)} ahora`
    headerColor = 'var(--gold)'
  } else if (buyNow) {
    const usd = trancheUsd(buyNow.pct, true)
    const noCash = cashCap !== null && cashCap < 1
    headerAction = noCash ? 'Sin saldo disponible para comprar' : usd !== null ? `Compra ${fmtUSD(usd)} ahora` : 'Compra ahora'
    headerColor = 'var(--mint)'
  } else {
    headerAction = position ? 'Mantener — sin acción hoy' : 'No comprar hoy'
    headerColor = 'var(--ink-3)'
  }
  // Bug reportado por Cas (jul 2026): con tier de compra pero sin gatillo de
  // entrada hoy, la cabecera decía "No comprar hoy" y el texto de abajo
  // arrancaba con "Compra clara: la evidencia está a favor" — mismo bloque,
  // dos lecturas opuestas en dos líneas seguidas. conviction.verdict describe
  // el SCORE (evidencia general), no si hay gatillo hoy; isActionableBuyNow ya
  // exige ambas cosas para la acción, pero el verdict no lo sabía. Acá se
  // reescribe la frase para ese caso puntual en vez de dejar pasar la
  // contradicción textual.
  const buyTierNoTrigger = !sellNow && !buyNow && (conviction.tier === 'compra' || conviction.tier === 'compra_fuerte')
  const rationale = buyTierNoTrigger
    ? `Buena evidencia en general (${conviction.score}/100), pero sin gatillo de entrada hoy — ${a.rating.action.toLowerCase()}. Revisa el plan de compra abajo para saber qué lo activaría.`
    : [conviction.verdict, conviction.reasons[0]].filter(Boolean).join(' ')

  const SECTIONS: { id: DetailSection; label: string; icon: typeof BarChart3 }[] = [
    { id: 'plan',    label: 'Plan',              icon: Target },
    { id: 'chart',   label: 'Gráfico y niveles', icon: BarChart3 },
    { id: 'signals', label: 'Señales y radar',   icon: Activity },
    { id: 'history', label: 'Historial',         icon: Newspaper },
  ]

  // Timeline de "Movimientos" — extraído del modal transaccional de
  // StockPositionManager (U4 roadmap UX): compras registradas + ventas, más
  // antiguo primero. Si nunca se registró una compra individual (posición
  // legacy), se sintetiza una sola "Compra inicial" desde el agregado.
  // D5 (roadmap de calidad de decisión): score de convicción con el que se
  // decidió cada compra, cuando está guardado (compras registradas antes de
  // jul 2026 no lo tienen — queda null, no se inventa).
  type Movement = { type: 'buy' | 'sell'; date: string; shares: number; pricePerShare: number; amount: number; synthetic?: boolean; convictionScore?: number | null }
  const movements: Movement[] = (() => {
    if (!position) return []
    const purchasesForTicker = (purchases ?? []).filter(p => p.ticker === ticker)
    const salesForTicker     = (sales ?? []).filter(s => s.ticker === ticker)
    const costBasis = position.shares * position.avgCost
    const list: Movement[] = [
      ...(purchasesForTicker.length > 0
        ? purchasesForTicker.map(p => ({
            type: 'buy' as const, date: p.purchase_date, shares: Number(p.shares),
            pricePerShare: Number(p.total_paid_usd) / Number(p.shares), amount: -Number(p.total_paid_usd),
            convictionScore: p.conviction_score ?? null,
          }))
        : rawPosition
          ? [{
              type: 'buy' as const, date: rawPosition.created_at.slice(0, 10), shares: position.shares,
              pricePerShare: position.avgCost, amount: -costBasis, synthetic: true,
            }]
          : []),
      ...salesForTicker.map(s => ({
        type: 'sell' as const, date: s.sale_date, shares: Number(s.shares_sold),
        pricePerShare: Number(s.proceeds_usd) / Number(s.shares_sold), amount: Number(s.proceeds_usd),
      })),
    ]
    return list.sort((a, b) => a.date.localeCompare(b.date))
  })()

  return (
    <div className="px-4 lg:px-6 pb-4 lg:pb-6 space-y-3 lg:space-y-4">

      {/* -2. Aviso de apalancamiento (D6, roadmap de calidad de decisión):
          ETFs 3×/2× no están pensados para mantener meses — pierden valor en
          lateral aunque el índice termine plano ("decay"). El monto sugerido
          de las secciones de abajo ya viene dividido por el factor. */}
      {leverage && (
        <div className="rounded-2xl px-3.5 py-3" style={{ background: 'rgba(255,194,60,0.10)', border: '1px solid rgba(255,194,60,0.3)' }}>
          <p className="text-xs font-bold" style={{ color: 'var(--gold)' }}>
            Apalancado {leverage.factor}× — pensado para días u horas, no para mantener
          </p>
          <p className="text-[10px] mt-1 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            Se mueve {leverage.factor}× lo que se mueve su índice cada DÍA — mantenerlo semanas en un mercado
            lateral pierde valor aunque el índice termine plano ("decay"). El monto sugerido de abajo ya está
            dividido por {leverage.factor} para arriesgar el mismo 1% real de tu portafolio.
          </p>
        </div>
      )}

      {/* -1.5 Aviso de resultados próximos (D3, roadmap de calidad de decisión):
          el motor es 100% técnico y ciego a eventos — sin esto se podía sugerir
          comprar la víspera del reporte, justo cuando el gráfico menos predice. */}
      {earningsSoon && daysToEarnings !== null && (
        <div className="rounded-2xl px-3.5 py-3 flex items-start gap-2.5" style={{ background: 'rgba(255,194,60,0.10)', border: '1px solid rgba(255,194,60,0.3)' }}>
          <CalendarClock className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} />
          <div>
            <p className="text-xs font-bold" style={{ color: 'var(--gold)' }}>
              Reporta resultados {daysToEarnings === 0 ? 'hoy' : `en ${daysToEarnings} día${daysToEarnings !== 1 ? 's' : ''} hábil${daysToEarnings !== 1 ? 'es' : ''}`}
            </p>
            <p className="text-[10px] mt-1 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              El gráfico pesa menos hasta entonces — un gap de apertura puede saltarse tu alarma de salida por completo.
              {earningsVeryClose && ' El monto sugerido de hoy ya está reducido a la mitad por esto.'}
            </p>
          </div>
        </div>
      )}

      {/* -1. Guard intradía: hoy se movió fuerte, el análisis quedó viejo */}
      {bigMove && (
        <div className="rounded-2xl px-3.5 py-3" style={{ background: 'rgba(255,111,97,0.10)', border: '1px solid rgba(255,111,97,0.25)' }}>
          <p className="text-xs font-bold" style={{ color: 'var(--coral)' }}>
            Hoy se mueve fuerte: {devPct > 0 ? '+' : ''}{devPct}% respecto del cierre analizado
          </p>
          <p className="text-[10px] mt-1 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            Las señales y el rating de abajo son del cierre anterior y pueden estar obsoletos. Las distancias
            de los niveles ya usan el precio en vivo. Todo se recalcula al próximo cierre.
          </p>
        </div>
      )}

      {/* 0. Cabecera fija: score + acción con monto + el porqué en 2 líneas
          (U3 del roadmap UX) — esto es lo único que hace falta leer para
          decidir; el resto de bloques son profundización opcional. */}
      <div className="rounded-2xl px-3.5 py-3" style={{ background: ratingUi.bg, borderLeft: `3px solid ${ratingUi.color}` }}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <ConvictionChip score={conviction.score} tier={conviction.tier} />
            <p className="text-sm font-extrabold truncate" style={{ color: headerColor }}>{headerAction}</p>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 tabular-nums"
            style={{ background: 'var(--surface)', color: ratingUi.color }}>
            {a.rating.pros} a favor · {a.rating.cons} en contra
          </span>
        </div>
        <p className="text-xs leading-relaxed font-semibold mt-1.5" style={{ color: 'var(--ink)' }}>{rationale}</p>
        {position && a.rating.caution && (
          <p className="text-[11px] mt-1.5 font-bold" style={{ color: 'var(--gold)' }}>
            Aunque la tendencia larga sigue al alza, se están acumulando señales de debilidad — buen momento para evaluar si tomar ganancias.
          </p>
        )}
      </div>

      {/* Navegación de secciones — solo una a la vez, "Plan" abierta por defecto */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
        {SECTIONS.map(s => {
          const Icon = s.icon
          const active = openSection === s.id
          return (
            <button
              key={s.id}
              onClick={() => setOpenSection(s.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold flex-shrink-0 transition-all"
              style={active
                ? { background: 'var(--primary)', color: 'white' }
                : { background: 'var(--surface-2)', color: 'var(--ink-3)' }}
            >
              <Icon className="w-3 h-3" />
              {s.label}
            </button>
          )
        })}
      </div>

      {/* ── Sección: Plan (compra + salida) ─────────────────────────────── */}
      {openSection === 'plan' && <>
      {/* 0.5 Tu posición — retorno vs costo + PLAN DE SALIDA por tramos
          (simétrico al plan de compra; reemplaza la referencia pasiva de piso) */}
      {position && (() => {
        const px = livePrice ?? a.price
        const retPct = ((px - position.avgCost) / position.avgCost) * 100
        const retColor = retPct >= 0 ? 'var(--mint)' : 'var(--coral)'
        return (
          <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--surface-2)', borderLeft: '3px solid var(--gold)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Tu posición · plan de salida</p>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
              <p className="text-xs font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                {position.shares.toLocaleString('es-CL', { maximumFractionDigits: 6 })} acc. · costo prom. {fmtUSD(position.avgCost)}
              </p>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums"
                style={{ background: retPct >= 0 ? 'rgba(31,190,141,0.12)' : 'rgba(255,111,97,0.12)', color: retColor }}>
                {retPct >= 0 ? '+' : ''}{retPct.toFixed(1)}% vs tu costo
              </span>
            </div>
            <div className="space-y-0.5">
              {a.sell.map((t, i) => {
                const currentValue = position.shares * (livePrice ?? a.price)
                const usdAmount = currentValue * (t.pct / 100)
                return (
                  <p key={i} className="text-sm font-bold tabular-nums leading-snug" style={{ color: 'var(--ink)' }}>
                    <span className="font-extrabold" style={{ color: t.now ? 'var(--gold)' : 'var(--ink-3)' }}>
                      {t.now ? `Vende ${fmtUSD(usdAmount)}` : `${t.pct}%`}
                    </span>
                    {' '}{t.cond}
                    {t.now && <span className="font-semibold" style={{ color: 'var(--ink-3)' }}> ({t.pct}% de la posición)</span>}
                  </p>
                )
              })}
            </div>
            <p className="text-xs leading-relaxed mt-1.5" style={{ color: 'var(--ink-2)' }}>{a.sellPlan}</p>
            {/* Trailing persistido (ratchet del cron): si quedó por sobre el alarm del día, manda él */}
            {rawPosition?.trail_stop_usd != null && Number(rawPosition.trail_stop_usd) > (a.alarm ?? -Infinity) + 0.005 && (
              <p className="text-[11px] font-semibold mt-1.5" style={{ color: 'var(--gold)' }}>
                Tu salida móvil quedó en {fmtUSD(Number(rawPosition.trail_stop_usd))}: subió junto al precio y no baja aunque los niveles del día bajen.
              </p>
            )}

            {/* Movimientos — timeline de compras/ventas, extraído del modal
                transaccional (U4 roadmap UX): valioso, no podía perderse */}
            {movements.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Movimientos</p>
                  <p className="text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                    {movements.length} operación{movements.length !== 1 ? 'es' : ''}
                  </p>
                </div>
                <div className="rounded-xl divide-y overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  {movements.map((m, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: m.type === 'buy' ? 'rgba(43,124,246,0.14)' : 'rgba(31,190,141,0.14)' }}>
                        {m.type === 'buy'
                          ? <Plus className="w-3 h-3" style={{ color: 'var(--primary)' }} strokeWidth={2.5} />
                          : <Minus className="w-3 h-3" style={{ color: 'var(--mint)' }} strokeWidth={2.5} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold" style={{ color: 'var(--ink)' }}>
                          {m.type === 'buy' ? (m.synthetic ? 'Compra inicial' : 'Compra') : 'Venta'} · {m.shares.toLocaleString('es-CL', { maximumFractionDigits: 6 })} acc.
                          {/* D5: score con el que se decidió esta compra, si quedó guardado */}
                          {m.type === 'buy' && m.convictionScore != null && (
                            <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                              score {m.convictionScore}
                            </span>
                          )}
                        </p>
                        <p className="text-[9px] tabular-nums" style={{ color: 'var(--ink-3)' }}>
                          {relativeDate(m.date)} · @{fmtUSD(m.pricePerShare)}
                        </p>
                      </div>
                      <p className="text-[11px] font-bold tabular-nums shrink-0" style={{ color: m.amount >= 0 ? 'var(--mint)' : 'var(--ink-2)' }}>
                        {m.amount >= 0 ? '+' : '-'}{fmtUSD(Math.abs(m.amount))}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comprar más / Vender — abren el modal transaccional (U4 roadmap UX):
                el detalle ya no es solo informativo. */}
            {(onBuyMore || onSell) && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                {onBuyMore && (
                  <button
                    onClick={() => onBuyMore(ticker)}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-xs transition-all active:scale-[.98]"
                    style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
                  >
                    <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                    Comprar más
                  </button>
                )}
                {onSell && (
                  <button
                    onClick={() => onSell(ticker)}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-xs border transition-all active:scale-[.98]"
                    style={{ background: 'transparent', color: 'var(--mint)', borderColor: 'rgba(31,190,141,0.4)' }}
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    Vender
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* 1.5 Zona de compra + plan — el número primero, la explicación después */}
      <div className="rounded-2xl px-3.5 py-3" style={{ background: 'rgba(43,124,246,0.07)', borderLeft: '3px solid var(--primary)' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--primary)' }}>Plan de compra</p>
        {a.buy.length > 0 ? (
          <div className="space-y-0.5">
            {a.buy.map((t, i) => {
              const usd = trancheUsd(t.pct, t.now)
              const noCash = t.now && cashCap !== null && cashCap < 1
              return (
                <p key={i} className="text-sm font-bold tabular-nums leading-snug" style={{ color: 'var(--ink)' }}>
                  <span className="font-extrabold" style={{ color: t.now ? 'var(--mint)' : 'var(--primary)' }}>
                    {noCash ? 'Sin saldo disponible' : usd !== null ? `Compra ${fmtUSD(usd)}` : `${t.pct}%`}
                  </span>
                  {' '}{t.cond}
                  {usd !== null && !noCash && <span className="font-semibold" style={{ color: 'var(--ink-3)' }}> ({t.pct}%)</span>}
                </p>
              )
            })}
          </div>
        ) : (
          <p className="text-sm font-extrabold leading-snug" style={{ color: 'var(--ink-3)' }}>Nada por ahora</p>
        )}
        <p className="text-xs leading-relaxed mt-1.5" style={{ color: 'var(--ink-2)' }}>{a.entryPlan}</p>
      </div>
      </>}

      {/* ── Sección: Historial (noticias + backtest, ambos on-demand) ──── */}
      {openSection === 'history' && <>
      {/* 1.7 Noticias on-demand — botón ghost mientras no se pide (una tarjeta
          entera para un link pesaba demasiado en la pila superior) */}
      <div className={news === null ? 'px-1' : 'rounded-2xl px-3.5 py-3'}
        style={news === null ? undefined : { background: 'var(--surface-2)' }}>
        {news === null ? (
          <button onClick={loadNews} className="flex items-center gap-1.5 text-xs font-bold transition-opacity hover:opacity-80"
            style={{ color: bigMove ? 'var(--coral)' : 'var(--primary)' }}>
            <Newspaper className="w-3.5 h-3.5 flex-shrink-0" />
            {bigMove ? '¿Qué está pasando hoy? — ver noticias' : '¿Qué está pasando? — ver noticias'}
          </button>
        ) : news === 'loading' ? (
          <p className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
            <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
            Buscando y resumiendo noticias de {ticker}…
          </p>
        ) : news === 'error' ? (
          <p className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
            No se pudieron obtener noticias.{' '}
            <button onClick={loadNews} className="underline underline-offset-2 font-bold" style={{ color: 'var(--primary)' }}>Reintentar</button>
          </p>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--ink-3)' }}>
              <Newspaper className="w-3 h-3" /> Noticias recientes
            </p>
            <p className="text-xs leading-relaxed font-semibold" style={{ color: 'var(--ink)' }}>
              {news.summary ?? (news.headlines.length === 0
                ? 'Sin noticias relevantes en los últimos días.'
                : 'No se pudo generar el resumen — estos son los titulares:')}
            </p>
            {news.headlines.length > 0 && (
              <div className="mt-2 space-y-1">
                {news.headlines.map(h => (
                  <a key={h.url} href={h.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-start gap-1.5 text-[11px] leading-snug transition-opacity hover:opacity-75"
                    style={{ color: 'var(--ink-2)' }}>
                    <ExternalLink className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: 'var(--ink-3)' }} />
                    <span>{h.title} <span style={{ color: 'var(--ink-3)' }}>· {h.source}</span></span>
                  </a>
                ))}
              </div>
            )}
            <p className="text-[9px] mt-2 leading-relaxed" style={{ color: 'var(--ink-3)' }}>
              Resumen automático de titulares — puede omitir contexto y no afecta la lectura técnica de arriba.
            </p>
          </>
        )}
      </div>
      </>}

      {/* ── Sección: Gráfico y niveles ───────────────────────────────────── */}
      {openSection === 'chart' && <>
      {/* 2. Gráfico 12 meses con niveles y SMA200 */}
      <div className="rounded-2xl px-3 pt-3 pb-2" style={{ background: 'var(--surface-2)' }}>
        <div className="flex items-center justify-between mb-1 px-0.5">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Últimos 12 meses</p>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-[9px] font-semibold" style={{ color: 'var(--ink-3)' }}>
              <span className="inline-block w-3 border-t-2" style={{ borderColor: 'var(--primary)' }} /> precio
            </span>
            <span className="flex items-center gap-1 text-[9px] font-semibold" style={{ color: 'var(--ink-3)' }}>
              <span className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: 'var(--ink-3)' }} /> promedio largo (200d)
            </span>
          </div>
        </div>
        <PriceChart a={a} />
      </div>

      {/* 3-6. Tendencia, rendimiento, RSI, rango y niveles — apilados (ya no
          comparten grid con señales/radar, que ahora es su propia sección) */}
      <div className="space-y-3">
          {/* 3. Tendencia de fondo + rendimiento */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>
                {a.trend.aboveSma200 === false
                  ? <TrendingDown className="w-3 h-3" style={{ color: trendColor }} />
                  : <TrendingUp className="w-3 h-3" style={{ color: trendColor }} />}
                Tendencia larga
              </p>
              {a.trend.aboveSma200 !== null ? (
                <>
                  <p className="text-xs font-extrabold" style={{ color: trendColor }}>
                    {a.trend.aboveSma200 ? 'Subiendo' : 'Cayendo'} hace {a.trend.weeksInState} sem.
                  </p>
                  <p className="text-[10px] mt-0.5 tabular-nums" style={{ color: 'var(--ink-3)' }}>
                    {a.trend.distPct !== null && `${a.trend.distPct > 0 ? '+' : ''}${a.trend.distPct}% vs su promedio largo`}
                    {a.trend.sma200Rising !== null && ` · promedio ${a.trend.sma200Rising ? 'subiendo' : 'bajando'}`}
                  </p>
                  <p className="text-[9px] mt-1 font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
                    {a.trend.aboveSma200 ? 'Sobre' : 'Bajo'} su SMA200
                  </p>
                </>
              ) : <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Historia insuficiente</p>}
            </div>
            <div className="rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--ink-3)' }}>
                <BarChart3 className="w-3 h-3" />
                Rendimiento
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {([['1m', a.returns.m1], ['6m', a.returns.m6], ['1a', a.returns.y1]] as const).map(([label, v]) => (
                  <span key={label} className="text-[10px] font-bold px-2 py-1 rounded-full tabular-nums"
                    style={v === null
                      ? { background: 'var(--surface)', color: 'var(--ink-3)' }
                      : { background: v >= 0 ? 'rgba(31,190,141,0.12)' : 'rgba(255,111,97,0.12)', color: v >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                    {label} {v !== null ? `${v > 0 ? '+' : ''}${v}%` : '—'}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 6. Momentum (secundario): RSI + rango 52 semanas */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>
                <Activity className="w-3 h-3" />
                Impulso · RSI
              </p>
              {a.rsi14 !== null ? (
                <>
                  <p className="text-xl font-extrabold tabular-nums leading-none mb-1.5"
                    style={{ color: a.rsi14 <= 30 ? 'var(--mint)' : a.rsi14 >= 70 ? 'var(--gold)' : 'var(--ink)' }}>
                    {Math.round(a.rsi14)}
                  </p>
                  <RsiBar value={a.rsi14} />
                </>
              ) : <p className="text-xs" style={{ color: 'var(--ink-3)' }}>—</p>}
            </div>
            <div className="rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--ink-3)' }}>
                <Gauge className="w-3 h-3" />
                Rango del año
              </p>
              <div className="relative h-2 rounded-full" style={{ background: 'linear-gradient(90deg, rgba(255,111,97,0.35), rgba(255,194,60,0.35), rgba(31,190,141,0.35))' }}>
                <div className="absolute -top-0.5 w-3 h-3 rounded-full border-2"
                  style={{ left: `calc(${posPct}% - 6px)`, background: 'var(--surface)', borderColor: 'var(--ink)' }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] font-semibold tabular-nums" style={{ color: 'var(--ink-3)' }}>{fmtUSD(a.low52)}</span>
                <span className="text-[9px] font-semibold tabular-nums" style={{ color: 'var(--ink-3)' }}>{fmtUSD(a.high52)}</span>
              </div>
            </div>
          </div>

          {/* 4. Niveles con historia — en la columna de contexto para equilibrar alturas */}
          {(a.supportLevels.length > 0 || a.resistanceLevels.length > 0) && (
            <div className="space-y-1.5">
              {a.resistanceLevels.map(l => {
                const d = distNow(l.price)
                const crossedUp = pxNow > l.price   // el precio en vivo ya lo superó
                return (
                  <div key={`r-${l.price}`} className="flex items-center gap-2.5 rounded-2xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--gold)' }} />
                    <p className="text-[11px] flex-1 min-w-0" style={{ color: 'var(--ink-2)' }}>
                      <span className="font-bold" style={{ color: 'var(--gold)' }}>Techo {fmtUSD(l.price)}</span>
                      <span className="tabular-nums"> · a {d > 0 ? '+' : ''}{d}%</span>
                      {' '}· {l.touches} toque{l.touches !== 1 ? 's' : ''} · último {l.weeksSinceLast === 0 ? 'esta semana' : `hace ${l.weeksSinceLast} sem.`}
                      {crossedUp && (
                        <span className="ml-1.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                          style={{ background: 'rgba(31,190,141,0.14)', color: 'var(--mint)' }}>
                          hoy por encima
                        </span>
                      )}
                    </p>
                  </div>
                )
              })}
              {a.supportLevels.map(l => {
                const d = distNow(l.price)
                const brokenDown = pxNow < l.price  // el precio en vivo ya lo perforó
                return (
                  <div key={`s-${l.price}`} className="flex items-center gap-2.5 rounded-2xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--mint)' }} />
                    <p className="text-[11px] flex-1 min-w-0" style={{ color: 'var(--ink-2)' }}>
                      <span className="font-bold" style={{ color: 'var(--mint)' }}>Piso {fmtUSD(l.price)}</span>
                      <span className="tabular-nums"> · a {d > 0 ? '+' : ''}{d}%</span>
                      {' '}· {l.touches} toque{l.touches !== 1 ? 's' : ''} · último {l.weeksSinceLast === 0 ? 'esta semana' : `hace ${l.weeksSinceLast} sem.`}
                      {brokenDown && (
                        <span className="ml-1.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                          style={{ background: 'rgba(255,111,97,0.14)', color: 'var(--coral)' }}>
                          hoy por debajo — ojo
                        </span>
                      )}
                    </p>
                  </div>
                )
              })}
              <p className="text-[9px] font-semibold px-1" style={{ color: 'var(--ink-3)' }}>
                Piso (soporte): precio donde antes dejó de caer · Techo (resistencia): donde antes dejó de subir.
              </p>
            </div>
          )}
      </div>
      </>}

      {/* ── Sección: Señales y radar ─────────────────────────────────────── */}
      {openSection === 'signals' && <>
        <div className="space-y-3">
          {/* 5. Señales (incluye divergencias) */}
          {a.signals.length > 0 ? (
            <div className="space-y-2">
              {a.signals.map(s => {
                const t = TONE_STYLE[s.tone]
                return (
                  <div key={s.kind} className="flex items-start gap-2.5 rounded-2xl px-3 py-2.5" style={{ background: t.bg }}>
                    <span className="w-1.5 h-1.5 rounded-full inline-block mt-1.5 flex-shrink-0" style={{ background: t.color }} />
                    <div className="min-w-0">
                      <p className="text-xs font-bold leading-tight" style={{ color: t.color }}>{s.title}</p>
                      <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>{s.detail}</p>
                      <p className="text-[9px] mt-1 font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>{s.tech}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
              Nada fuera de lo normal esta semana: el precio se mueve dentro de su rango habitual.
            </p>
          )}

          {/* 5.5 Radar: cerca de pasar — oculto en días de movimiento fuerte
              (sus distancias vienen del cierre anterior y quedan obsoletas) */}
          {!bigMove && a.watch.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest pt-1" style={{ color: 'var(--ink-3)' }}>
                Para revisar pronto — cerca de pasar
              </p>
              {a.watch.map(w => {
                const t = TONE_STYLE[w.tone]
                return (
                  <div key={w.kind} className="flex items-start gap-2.5 rounded-2xl px-3 py-2.5"
                    style={{ background: 'var(--surface-2)', borderLeft: `2.5px solid ${t.color}` }}>
                    <div className="min-w-0">
                      <p className="text-xs font-bold leading-tight" style={{ color: t.color }}>{w.title}</p>
                      <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>{w.detail}</p>
                      <p className="text-[9px] mt-1 font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>{w.tech}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </>}

      {/* 7. Evaluación de señales a posteriori — on-demand, mismo patrón que noticias
          (vive en Historial junto a Noticias, ambas son profundización on-demand) */}
      {openSection === 'history' && <>
      <div className={backtest === null ? 'px-1' : 'rounded-2xl px-3.5 py-3'}
        style={backtest === null ? undefined : { background: 'var(--surface-2)' }}>
        {backtest === null ? (
          <button onClick={loadBacktest} className="flex items-center gap-1.5 text-xs font-bold transition-opacity hover:opacity-80"
            style={{ color: 'var(--primary)' }}>
            <BarChart3 className="w-3.5 h-3.5 flex-shrink-0" />
            ¿Le funcionó esta señal antes? — ver historial
          </button>
        ) : backtest === 'loading' ? (
          <p className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
            <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
            Revisando el último año de señales de {ticker}…
          </p>
        ) : backtest === 'error' ? (
          <p className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
            No se pudo evaluar (falta historia suficiente).{' '}
            <button onClick={loadBacktest} className="underline underline-offset-2 font-bold" style={{ color: 'var(--primary)' }}>Reintentar</button>
          </p>
        ) : backtest.stats.length === 0 ? (
          <p className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
            {ticker} no tuvo señales de compra/venta en el último año — sin datos para evaluar.
          </p>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-3)' }}>
              <BarChart3 className="w-3 h-3" /> Cómo le fue a esta señal en {ticker} (último año)
            </p>
            <div className="space-y-2">
              {backtest.stats.map(s => {
                const isBuy = s.label === 'compra' || s.label === 'compra_fuerte'
                const color = isBuy ? 'var(--mint)' : 'var(--coral)'
                return (
                  <div key={s.label} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ background: 'var(--surface)' }}>
                    <div className="min-w-0">
                      <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>
                        {s.label === 'compra_fuerte' ? 'Compra fuerte' : s.label === 'compra' ? 'Compra'
                          : s.label === 'venta_fuerte' ? 'Venta fuerte' : 'Venta'}
                        <span className="font-semibold ml-1" style={{ color: 'var(--ink-3)' }}>· {s.count} vez{s.count !== 1 ? 'es' : ''}</span>
                      </p>
                      {s.hitRate20 !== null && (
                        <p className="text-[10px] tabular-nums" style={{ color: 'var(--ink-3)' }}>
                          Acertó {s.hitRate20}% de las veces a 1 mes
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold tabular-nums" style={{ color }}>
                        {s.avgReturn20 !== null ? `${s.avgReturn20 > 0 ? '+' : ''}${s.avgReturn20}%` : '—'} <span className="text-[9px] font-semibold" style={{ color: 'var(--ink-3)' }}>1m</span>
                      </p>
                      <p className="text-[10px] tabular-nums" style={{ color: 'var(--ink-3)' }}>
                        {s.avgReturn60 !== null ? `${s.avgReturn60 > 0 ? '+' : ''}${s.avgReturn60}%` : '—'} a 3m
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-[9px] mt-2 leading-relaxed" style={{ color: 'var(--ink-3)' }}>
              Retorno promedio del PRECIO (no de una operación real) en los {backtest.windowDays} días hábiles tras cada vez que la señal apareció en esta acción. Pocas repeticiones = poco confiable; no es garantía de que se repita.
            </p>
          </>
        )}
      </div>
      </>}

      {/* Disclaimer único al pie — U3 elimina los micro-descargos repetidos
          por bloque (noticias, backtest) en favor de este, que ya cubre todo. */}
      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
        <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
        Lectura informativa al cierre del {a.asOf}. No es recomendación de compra o venta: estas señales
        fallan seguido, pueden tardar semanas en confirmarse y un piso roto se convierte en caída.
        La decisión es siempre tuya.
      </p>
    </div>
  )
}
