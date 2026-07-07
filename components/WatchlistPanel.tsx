'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, ChevronRight, ChevronDown, ChevronUp, Star, Info, RefreshCw, X, Search, Check, TrendingUp, TrendingDown, AlertTriangle, Target, Activity, BarChart3, Gauge, Newspaper, ExternalLink } from 'lucide-react'
import ServiceLogo from '@/components/ServiceLogo'
import type { TechnicalAnalysis, SignalTone } from '@/lib/technical'
import type { SearchResult } from '@/app/api/stock-search/route'
import type { NewsResponse } from '@/app/api/stock-news/route'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WatchlistItem {
  id:           string
  ticker:       string
  target_price: number | null
}

/**
 * Dirección del precio objetivo según cartera:
 * - Sin posición → objetivo de ENTRADA: alcanzado si el precio cae hasta ahí (price ≤ target).
 * - Con posición → objetivo de SALIDA: alcanzado si el precio sube hasta ahí (price ≥ target).
 */
function targetReached(item: WatchlistItem, price: number | undefined, owned: boolean): boolean {
  if (item.target_price === null || price === undefined) return false
  return owned ? price >= item.target_price : price <= item.target_price
}

/** A ≤3% del precio objetivo sin haberlo alcanzado — entra al radar "al ojo". */
function nearTarget(item: WatchlistItem, price: number | undefined, owned: boolean): boolean {
  if (item.target_price === null || price === undefined) return false
  if (targetReached(item, price, owned)) return false
  return Math.abs(price - item.target_price) / item.target_price <= 0.03
}

interface Quote { price: number; changePercent: number; name: string; domain?: string }

export interface OwnedPosition { shares: number; avgCost: number }

interface Props {
  userId:       string
  initialItems: WatchlistItem[]
  positions:    Record<string, OwnedPosition>   // por ticker — condiciona venta/toma de ganancias y da contexto en el detalle
}

const TICKER_RE = /^[A-Z0-9.\-]{1,12}$/

/**
 * Marca una acción como "interesante de revisar" según su lectura técnica.
 * El rating ya exige al menos un gatillo reciente (no basta el estado de
 * tendencia), así que estos flags aparecen y desaparecen — no viven para siempre.
 * - buy: entrada o suma (con o sin posición).
 * - sell: solo con posición — no tiene sentido destacar "vender" algo que no posees.
 * - caution: solo con posición — tendencia aún alcista pero presión bajista
 *   acumulada: considerar toma de ganancias antes de que se pierda la tendencia.
 */
function actionFlag(a: TechnicalAnalysis | 'loading' | 'error' | undefined, owned: boolean): 'buy' | 'sell' | 'caution' | null {
  if (typeof a !== 'object') return null
  const isBuy  = a.rating.label === 'compra' || a.rating.label === 'compra_fuerte'
  const isSell = a.rating.label === 'venta'  || a.rating.label === 'venta_fuerte'
  if (isBuy) return 'buy'
  if (isSell && owned) return 'sell'
  if (a.rating.caution && owned) return 'caution'
  return null
}

const FLAG_UI: Record<'buy' | 'sell' | 'caution', { color: string; bg: string; softBg: string }> = {
  buy:     { color: 'var(--mint)',  bg: 'rgba(31,190,141,0.16)', softBg: 'rgba(31,190,141,0.06)' },
  sell:    { color: 'var(--coral)', bg: 'rgba(255,111,97,0.16)', softBg: 'rgba(255,111,97,0.06)' },
  caution: { color: 'var(--gold)',  bg: 'rgba(255,194,60,0.18)', softBg: 'rgba(255,194,60,0.07)' },
}

const TONE_STYLE: Record<SignalTone, { color: string; bg: string }> = {
  mint:    { color: 'var(--mint)',  bg: 'rgba(31,190,141,0.12)' },
  gold:    { color: 'var(--gold)',  bg: 'rgba(255,194,60,0.14)' },
  coral:   { color: 'var(--coral)', bg: 'rgba(255,111,97,0.12)' },
  neutral: { color: 'var(--ink-2)', bg: 'var(--surface-2)' },
}

function fmtUSD(n: number): string {
  return '$' + n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function avatarColor(t: string): string {
  const palette = ['#2B7CF6','#1FBE8D','#FF6F61','#FFC23C','#A78BFA','#F472B6','#34D399','#FB923C']
  let h = 0
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return palette[Math.abs(h) % palette.length]
}

// ── RSI gauge ────────────────────────────────────────────────────────────────

function RsiBar({ value }: { value: number }) {
  const color = value <= 30 ? 'var(--mint)' : value >= 70 ? 'var(--gold)' : 'var(--primary)'
  return (
    <div>
      <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
        {/* Zonas 30 / 70 */}
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

// ── Panel técnico de un ticker — lectura de largo plazo ─────────────────────

function TechnicalDetail({ a, ticker, position, livePrice }: {
  a:         TechnicalAnalysis
  ticker:    string
  position?: OwnedPosition        // solo si el ticker está en cartera
  livePrice?: number              // quote en vivo; fallback al cierre del análisis
}) {
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

  return (
    <div className="px-4 lg:px-6 pb-4 lg:pb-6 space-y-3 lg:space-y-4">

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

      {/* 0. Lectura técnica + veredicto — una sola tarjeta (son la misma idea:
          la conclusión y su porqué; separadas duplicaban el ritmo visual) */}
      <div className="rounded-2xl px-3.5 py-3" style={{ background: ratingUi.bg, borderLeft: `3px solid ${ratingUi.color}` }}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold" style={{ color: ratingUi.color }}>{ratingUi.text}</p>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 tabular-nums"
            style={{ background: 'var(--surface)', color: ratingUi.color }}>
            {a.rating.pros} a favor · {a.rating.cons} en contra
          </span>
        </div>
        <p className="text-xs leading-relaxed font-semibold mt-1.5" style={{ color: 'var(--ink)' }}>{a.verdict}</p>
        {position && a.rating.caution && (
          <p className="text-[11px] mt-1.5 font-bold" style={{ color: 'var(--gold)' }}>
            Aunque la tendencia larga sigue al alza, se están acumulando señales de debilidad — buen momento para evaluar si tomar ganancias.
          </p>
        )}
        <p className="text-[10px] mt-1.5 leading-relaxed" style={{ color: 'var(--ink-3)' }}>
          Regla automática sobre los indicadores de abajo — no es asesoría financiera ni predice el futuro.
        </p>
      </div>

      {/* 0.5 Tu posición — retorno vs costo y referencia de stop (solo en cartera) */}
      {position && (() => {
        const px = livePrice ?? a.price
        const retPct = ((px - position.avgCost) / position.avgCost) * 100
        const retColor = retPct >= 0 ? 'var(--mint)' : 'var(--coral)'
        const stop = a.supportLevels[0] ?? null
        return (
          <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--surface-2)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Tu posición</p>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                {position.shares.toLocaleString('es-CL', { maximumFractionDigits: 4 })} acc. · costo prom. {fmtUSD(position.avgCost)}
              </p>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums"
                style={{ background: retPct >= 0 ? 'rgba(31,190,141,0.12)' : 'rgba(255,111,97,0.12)', color: retColor }}>
                {retPct >= 0 ? '+' : ''}{retPct.toFixed(1)}% vs tu costo
              </span>
            </div>
            {stop && (
              <p className="text-[10px] mt-1 tabular-nums" style={{ color: 'var(--ink-3)' }}>
                Piso más cercano: {fmtUSD(stop.price)} ({distNow(stop.price) > 0 ? '+' : ''}{distNow(stop.price)}%). Muchos lo usan de referencia: si el precio lo atraviesa hacia abajo, es señal de alerta para la posición.
              </p>
            )}
          </div>
        )
      })()}

      {/* 1.5 Plan de entrada — directo, generado por código */}
      <div className="rounded-2xl px-3.5 py-3" style={{ background: 'rgba(43,124,246,0.07)', borderLeft: '3px solid var(--primary)' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--primary)' }}>Para entrar con base</p>
        <p className="text-xs leading-relaxed font-semibold" style={{ color: 'var(--ink)' }}>{a.entryPlan}</p>
      </div>

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
              Resumen automático de titulares — puede omitir contexto; no es recomendación ni afecta la lectura técnica.
            </p>
          </>
        )}
      </div>

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

      {/* 3-6. Stats a la izquierda, niveles/señales a la derecha en desktop */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start space-y-3 lg:space-y-0">

        {/* Columna izquierda: tendencia, rendimiento, RSI, rango */}
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

        {/* Columna derecha: señales + radar */}
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
      </div>

      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
        <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
        Lectura informativa al cierre del {a.asOf}. No es recomendación de compra o venta: estas señales
        fallan seguido, pueden tardar semanas en confirmarse y un piso roto se convierte en caída.
        La decisión es siempre tuya.
      </p>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function WatchlistPanel({ userId, initialItems, positions }: Props) {
  const supabase = createClient()
  const owned = new Set(Object.keys(positions))

  const [items,      setItems]      = useState<WatchlistItem[]>(initialItems)
  const [quotes,     setQuotes]     = useState<Record<string, Quote>>({})
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [analyses,   setAnalyses]   = useState<Record<string, TechnicalAnalysis | 'loading' | 'error'>>({})
  const [errDetails, setErrDetails] = useState<Record<string, string>>({})

  // Nota: el tag "Nueva" por señal (diff vs última visita) se probó y se quitó
  // a pedido de Cas (jul 2026) — el radar "revisar pronto" cumple mejor ese rol.

  // Sección plegable: cerrada por defecto, recuerda la preferencia
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('watchlistOpen') === '1') setOpen(true)
  }, [])
  const toggleOpen = () => setOpen(v => {
    try { localStorage.setItem('watchlistOpen', v ? '0' : '1') } catch { /* modo privado */ }
    return !v
  })

  // Buscador (popup)
  const [showSearch, setShowSearch] = useState(false)
  const [query,      setQuery]      = useState('')
  const [results,    setResults]    = useState<SearchResult[]>([])
  const [searching,  setSearching]  = useState(false)
  const [addingSym,  setAddingSym]  = useState<string | null>(null)
  const [addError,   setAddError]   = useState('')
  const searchSeq = useRef(0)

  // ── Quotes de los favoritos ────────────────────────────────────────────────
  const fetchQuotes = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) return
    // La API acepta máx 25 símbolos por request: con 30+ favoritos hay que
    // trocear (antes los que pasaban de 25 se perdían en silencio)
    for (let i = 0; i < tickers.length; i += 25) {
      const chunk = tickers.slice(i, i + 25)
      try {
        const r = await fetch(`/api/stock-price?symbols=${chunk.join(',')}`, { cache: 'no-store' })
        if (!r.ok) continue
        // La route devuelve { quotes, marketOpen, marketLabel }
        const data = await r.json() as { quotes?: Record<string, Quote> }
        if (data.quotes) setQuotes(prev => ({ ...prev, ...data.quotes }))
      } catch { /* silencioso: el panel funciona sin quote */ }
    }
  }, [])

  // ── Análisis técnico ──────────────────────────────────────────────────────
  const fetchAnalysis = useCallback(async (ticker: string, force = false) => {
    setAnalyses(prev => ({ ...prev, [ticker]: prev[ticker] && prev[ticker] !== 'error' ? prev[ticker] : 'loading' }))
    try {
      // no-store: la ruta ya tiene su propio criterio de frescura (price_history +
      // STALE_D); el Cache-Control HTTP es para el navegador, no para el cliente —
      // si confiamos en él acá, un cambio de forma del JSON (como este) puede
      // quedar pegado en cache hasta que expire, sin forma de refrescar desde la UI.
      const r = await fetch(`/api/technical?symbol=${ticker}${force ? '&force=1' : ''}`, { cache: 'no-store' })
      if (!r.ok) {
        const body = await r.json().catch(() => null) as { detail?: string } | null
        if (body?.detail) setErrDetails(prev => ({ ...prev, [ticker]: body.detail! }))
        throw new Error()
      }
      const data = await r.json() as { analysis: TechnicalAnalysis }
      setAnalyses(prev => ({ ...prev, [ticker]: data.analysis }))
      setErrDetails(prev => { const { [ticker]: _omit, ...rest } = prev; return rest })
    } catch {
      setAnalyses(prev => ({ ...prev, [ticker]: 'error' }))
    }
  }, [])

  // Avisos in-app: al entrar se precargan las señales de todos los favoritos.
  // Secuencial + pausa: Alpha Vantage free también limita por minuto, y con
  // ~15 favoritos en frío una ráfaga podría rebotar. El cache de 24 h hace que
  // en visitas siguientes esto sea instantáneo y sin requests.
  useEffect(() => {
    const tickers = initialItems.map(i => i.ticker)
    fetchQuotes(tickers)
    ;(async () => {
      for (const t of tickers) {
        await fetchAnalysis(t)
        await new Promise(res => setTimeout(res, 400))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openDetail(ticker: string) {
    setExpanded(ticker)
    const a = analyses[ticker]
    if (a && a !== 'error') return
    await fetchAnalysis(ticker)
  }

  // ── Búsqueda con debounce ─────────────────────────────────────────────────
  useEffect(() => {
    if (!showSearch) return
    const q = query.trim()
    if (q.length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    const seq = ++searchSeq.current
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/stock-search?q=${encodeURIComponent(q)}`)
        const data = r.ok ? await r.json() as { results: SearchResult[] } : { results: [] }
        if (searchSeq.current === seq) setResults(data.results)
      } catch {
        if (searchSeq.current === seq) setResults([])
      } finally {
        if (searchSeq.current === seq) setSearching(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [query, showSearch])

  function openSearch() {
    setShowSearch(true); setQuery(''); setResults([]); setAddError('')
  }
  function closeSearch() {
    setShowSearch(false); setQuery(''); setResults([]); setAddError('')
  }

  // ── Precio objetivo ───────────────────────────────────────────────────────
  const [targetInput, setTargetInput] = useState<string | null>(null)  // null = no editando
  const [targetBusy,  setTargetBusy]  = useState(false)
  useEffect(() => { setTargetInput(null) }, [expanded])  // cerrar editor al cambiar de ticker

  async function saveTarget(item: WatchlistItem, value: number | null) {
    setTargetBusy(true)
    const { error } = await supabase
      .from('watchlist')
      .update({ target_price: value })
      .eq('id', item.id)
      .eq('user_id', userId)
    setTargetBusy(false)
    if (error) return
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, target_price: value } : i))
    setTargetInput(null)
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  async function addSymbol(symbol: string) {
    const t = symbol.trim().toUpperCase()
    if (!TICKER_RE.test(t)) { setAddError('Ticker inválido'); return }
    if (items.some(i => i.ticker === t)) return
    setAddingSym(t); setAddError('')
    const { data, error } = await supabase
      .from('watchlist')
      .insert({ user_id: userId, ticker: t })
      .select('id, ticker, target_price')
      .single()
    setAddingSym(null)
    if (error) { setAddError(error.message); return }
    setItems(prev => [...prev, data as WatchlistItem])
    fetchQuotes([t])
    fetchAnalysis(t)
  }

  async function removeTicker(item: WatchlistItem) {
    setItems(prev => prev.filter(i => i.id !== item.id))
    if (expanded === item.ticker) setExpanded(null)
    await supabase.from('watchlist').delete().eq('id', item.id).eq('user_id', userId)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mt-6">
      {/* Header plegable + acción Seguir */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <button
          onClick={toggleOpen}
          className="flex items-center gap-2 min-w-0 text-left transition-opacity hover:opacity-80"
          aria-expanded={open}
        >
          <Star className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--gold)' }} />
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Favoritos en seguimiento</p>
          {items.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
              {items.length}
            </span>
          )}
          {/* Aviso in-app visible aún con la lista plegada: candidatas a comprar/vender */}
          {!open && (() => {
            const flags = items
              .map(i => actionFlag(analyses[i.ticker], owned.has(i.ticker)))
              .filter((f): f is 'buy' | 'sell' | 'caution' => f !== null)
            const targets = items.filter(i => targetReached(i, quotes[i.ticker]?.price, owned.has(i.ticker)))
            const count = new Set([
              ...items.filter(i => actionFlag(analyses[i.ticker], owned.has(i.ticker)) !== null).map(i => i.id),
              ...targets.map(i => i.id),
            ]).size
            const watchTotal = items.filter(i => {
              const a = analyses[i.ticker]
              return (typeof a === 'object' && a.watch.length > 0)
                || nearTarget(i, quotes[i.ticker]?.price, owned.has(i.ticker))
            }).length
            if (count === 0 && watchTotal === 0) return null
            // Severidad: venta > toma de ganancias > compra/precio objetivo
            const worst: 'buy' | 'sell' | 'caution' =
              flags.includes('sell') ? 'sell' : flags.includes('caution') ? 'caution' : 'buy'
            const ui = FLAG_UI[worst]
            return (
              <>
                {count > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: ui.bg, color: ui.color }}>
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: ui.color }} />
                    {count} para revisar
                  </span>
                )}
                {watchTotal > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                    {watchTotal} revisar pronto
                  </span>
                )}
              </>
            )
          })()}
          {open
            ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
            : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />}
        </button>
        <button
          onClick={() => { setOpen(true); openSearch() }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all active:scale-[.97] shrink-0"
          style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Seguir
        </button>
      </div>

      {/* ── Popup de búsqueda por nombre ─────────────────────────────────── */}
      {showSearch && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={e => { if (e.target === e.currentTarget) closeSearch() }}
        >
          <div
            className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-hidden flex flex-col"
            style={{ background: 'var(--surface)', maxHeight: '80dvh' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Buscar acción o ETF</h2>
              <button
                onClick={closeSearch}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Input */}
            <div className="px-5 pt-4 pb-2">
              <div className="flex items-center gap-2.5 border px-4 py-3"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', borderRadius: 12 }}>
                <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
                <input
                  type="text"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setAddError('') }}
                  placeholder="ej: Apple, Netflix, Vanguard S&P 500…"
                  maxLength={40}
                  autoFocus
                  className="flex-1 text-sm bg-transparent outline-none border-0 min-w-0"
                  style={{ color: 'var(--ink)' }}
                />
                {searching && <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" style={{ color: 'var(--ink-3)' }} />}
              </div>
              {addError && <p className="text-xs font-medium mt-2" style={{ color: 'var(--coral)' }}>{addError}</p>}
            </div>

            {/* Resultados */}
            <div className="px-5 pb-5 overflow-y-auto flex-1">
              {query.trim().length < 2 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--ink-3)' }}>
                  Escribe el nombre de la empresa o del fondo — también funciona con el ticker.
                </p>
              ) : !searching && results.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Sin resultados para “{query.trim()}”</p>
                  {TICKER_RE.test(query.trim().toUpperCase()) && (
                    <button
                      onClick={() => addSymbol(query.trim().toUpperCase())}
                      disabled={addingSym !== null}
                      className="mt-3 px-4 py-2 rounded-xl text-xs font-bold transition-opacity hover:opacity-85 disabled:opacity-50"
                      style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
                    >
                      Seguir “{query.trim().toUpperCase()}” de todas formas
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  {results.map(r => {
                    const followed = items.some(i => i.ticker === r.symbol)
                    const busy = addingSym === r.symbol
                    return (
                      <div key={r.symbol} className="flex items-center gap-3 rounded-2xl px-3 py-3" style={{ background: 'var(--surface-2)' }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-extrabold text-white"
                          style={{ background: avatarColor(r.symbol) }}>
                          {r.symbol.slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold leading-tight truncate" style={{ color: 'var(--ink)' }}>{r.name}</p>
                          <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                            {r.symbol} · {r.type === 'etf' ? 'ETF' : 'Acción'}
                          </p>
                        </div>
                        {followed ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl flex-shrink-0"
                            style={{ background: 'rgba(31,190,141,0.12)', color: 'var(--mint)' }}>
                            <Check className="w-3.5 h-3.5" /> Siguiendo
                          </span>
                        ) : (
                          <button
                            onClick={() => addSymbol(r.symbol)}
                            disabled={busy}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold flex-shrink-0 transition-all active:scale-95 disabled:opacity-50"
                            style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
                          >
                            {busy ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" strokeWidth={3} />}
                            Seguir
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Empty state / lista — solo cuando la sección está desplegada */}
      {!open ? null : items.length === 0 ? (
        <div className="card px-6 py-8 text-center">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Sigue acciones o ETFs sin tener posición</p>
          <p className="text-xs mt-1 max-w-md mx-auto leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            Busca por nombre (Apple, Netflix, Vanguard…) y toca la fila para ver su lectura en simple:
            hacia dónde va la tendencia, los pisos y techos donde suele frenarse, y si subió o cayó demasiado rápido.
          </p>
          <button
            onClick={openSearch}
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl text-xs font-bold transition-opacity hover:opacity-85"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 8px 18px var(--shadow)' }}
          >
            <Search className="w-3.5 h-3.5" />
            Buscar y seguir
          </button>
        </div>
      ) : (
        <>
        {/* Resumen: radar de cosas por pasar */}
        {(() => {
          const withWatch = items.filter(i => {
            const a = analyses[i.ticker]
            return (typeof a === 'object' && a.watch.length > 0)
              || nearTarget(i, quotes[i.ticker]?.price, owned.has(i.ticker))
          })
          if (withWatch.length === 0) return null
          return (
            <p className="text-[11px] font-bold mb-2 px-1" style={{ color: 'var(--primary)' }}>
              {withWatch.length} para revisar pronto (cerca de que pase algo) — ordenados por probabilidad de compra
            </p>
          )
        })()}
        <div className="card overflow-hidden divide-y" style={{ borderColor: 'var(--border)' }}>
          {[...items].sort((x, y) => {
            // Orden por probabilidad de compra pronto: objetivo alcanzado >
            // compra fuerte > compra > radar comprador (avisos mint + cerca
            // del objetivo). Empates conservan el orden de agregado.
            const buyRank = (item: WatchlistItem): number => {
              const a = analyses[item.ticker]
              const price = quotes[item.ticker]?.price
              const isOwned = owned.has(item.ticker)
              let r = 0
              if (!isOwned && targetReached(item, price, isOwned)) r += 100
              if (typeof a === 'object') {
                if (a.rating.label === 'compra_fuerte') r += 90
                else if (a.rating.label === 'compra')   r += 80
                r += a.watch.filter(w => w.tone === 'mint').length * 10
                r += Math.max(0, a.rating.triggerScore)
              }
              if (nearTarget(item, price, isOwned)) r += 40
              return r
            }
            return buyRank(y) - buyRank(x)
          }).map(item => {
            const q = quotes[item.ticker]
            const a = analyses[item.ticker]
            const isOwned = owned.has(item.ticker)
            const flag = actionFlag(a, isOwned)
            const atTarget = targetReached(item, q?.price, isOwned)
            const watchCount = (typeof a === 'object' ? a.watch.length : 0)
              + (nearTarget(item, q?.price, isOwned) ? 1 : 0)
            return (
              <div key={item.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(item.ticker)}
                  onKeyDown={e => e.key === 'Enter' && openDetail(item.ticker)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer transition-colors hover:bg-black/5 group"
                  style={flag ? {
                    borderLeft: `3px solid ${FLAG_UI[flag].color}`,
                    background: FLAG_UI[flag].softBg,
                  } : undefined}
                >
                  <ServiceLogo
                    domain={q?.domain ?? null}
                    name={item.ticker}
                    size={36}
                    fallbackColor={avatarColor(item.ticker)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{item.ticker}</p>
                      {/* Previsualización unificada: SIEMPRE la lectura técnica como
                          chip — antes convivían "Compra", "N señales" o nada, y cada
                          fila contaba una historia distinta */}
                      {typeof a === 'object' && (() => {
                        const l = a.rating.label
                        const ui = flag === 'caution'
                          ? { color: FLAG_UI.caution.color, bg: FLAG_UI.caution.bg, text: 'Toma de ganancias', Icon: AlertTriangle }
                          : l === 'compra_fuerte' ? { color: FLAG_UI.buy.color,  bg: FLAG_UI.buy.bg,  text: 'Compra fuerte', Icon: TrendingUp }
                          : l === 'compra'        ? { color: FLAG_UI.buy.color,  bg: FLAG_UI.buy.bg,  text: 'Compra',        Icon: TrendingUp }
                          : l === 'venta_fuerte'  ? { color: FLAG_UI.sell.color, bg: FLAG_UI.sell.bg, text: 'Venta fuerte',  Icon: TrendingDown }
                          : l === 'venta'         ? { color: FLAG_UI.sell.color, bg: FLAG_UI.sell.bg, text: 'Venta',         Icon: TrendingDown }
                          : { color: 'var(--ink-3)', bg: 'var(--surface-2)', text: 'Neutral', Icon: null }
                        const Icon = ui.Icon
                        return (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: ui.bg, color: ui.color }}>
                            {Icon && <Icon className="w-3 h-3" />}
                            {ui.text}
                          </span>
                        )
                      })()}
                      {atTarget && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                          <Target className="w-3 h-3" />
                          En tu precio
                        </span>
                      )}
                      {/* Radar: cerca de que pase algo — solo si no hay chip más fuerte */}
                      {!flag && !atTarget && watchCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                          revisar pronto
                        </span>
                      )}
                    </div>
                    {q?.name && (
                      <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>
                        {q.name}{isOwned && ' · en cartera'}
                      </p>
                    )}
                  </div>
                  {q ? (
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtUSD(q.price)}</p>
                      <p className="text-[11px] font-semibold tabular-nums"
                        style={{ color: q.changePercent >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                        {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
                      </p>
                    </div>
                  ) : (
                    /* Skeleton mientras llega la cotización */
                    <div className="text-right flex-shrink-0 animate-pulse">
                      <div className="h-3.5 w-16 rounded-md ml-auto" style={{ background: 'var(--surface-2)' }} />
                      <div className="h-2.5 w-10 rounded-md mt-1.5 ml-auto" style={{ background: 'var(--surface-2)' }} />
                    </div>
                  )}
                  <ChevronRight className="w-4 h-4 flex-shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--ink-3)' }} />
                </div>
              </div>
            )
          })}
        </div>
        </>
      )}

      {/* ── Popup de detalle técnico ─────────────────────────────────────── */}
      {expanded !== null && (() => {
        const ticker = expanded
        const q = quotes[ticker]
        const a = analyses[ticker]
        const item = items.find(i => i.ticker === ticker)
        return (
          <div
            className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.65)' }}
            onClick={e => { if (e.target === e.currentTarget) setExpanded(null) }}
          >
            <div
              className="w-full lg:max-w-3xl rounded-t-3xl lg:rounded-3xl overflow-hidden flex flex-col"
              style={{ background: 'var(--surface)', maxHeight: '88dvh' }}
            >
              <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

              {/* Header: ticker + quote */}
              <div className="flex items-center gap-3 px-5 lg:px-6 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <ServiceLogo
                  domain={q?.domain ?? null}
                  name={ticker}
                  size={40}
                  fallbackColor={avatarColor(ticker)}
                />
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold leading-tight" style={{ color: 'var(--ink)' }}>{ticker}</h2>
                  {q?.name && (
                    <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>
                      {q.name}{owned.has(ticker) && ' · en cartera'}
                    </p>
                  )}
                </div>
                {q && (
                  <div className="text-right flex-shrink-0 mr-1">
                    <p className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtUSD(q.price)}</p>
                    <p className="text-[11px] font-semibold tabular-nums"
                      style={{ color: q.changePercent >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                      {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}% hoy
                    </p>
                  </div>
                )}
                <button
                  onClick={() => setExpanded(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0 transition-colors"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Precio objetivo — entrada (sin posición) o salida (en cartera) */}
              {item && (() => {
                const isOwned  = owned.has(ticker)
                const reached  = targetReached(item, q?.price, isOwned)
                return (
                  <div className="flex items-center gap-2.5 px-5 lg:px-6 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
                    <Target className="w-4 h-4 flex-shrink-0" style={{ color: reached ? 'var(--primary)' : 'var(--ink-3)' }} />
                    {targetInput !== null ? (
                      <>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={targetInput}
                          onChange={e => setTargetInput(e.target.value)}
                          placeholder={isOwned ? 'Precio de salida en USD' : 'Precio de entrada en USD'}
                          autoFocus
                          className="flex-1 min-w-0 text-xs font-semibold outline-none border rounded-xl px-3 py-1.5"
                          style={{ color: 'var(--ink)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                        />
                        <button
                          onClick={() => {
                            const v = parseFloat(targetInput)
                            if (Number.isFinite(v) && v > 0) saveTarget(item, Math.round(v * 100) / 100)
                          }}
                          disabled={targetBusy}
                          className="px-3 py-1.5 rounded-xl text-[11px] font-bold flex-shrink-0 transition-all active:scale-95 disabled:opacity-50"
                          style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
                        >
                          Guardar
                        </button>
                        <button
                          onClick={() => setTargetInput(null)}
                          className="px-3 py-1.5 rounded-xl text-[11px] font-bold flex-shrink-0 transition-colors"
                          style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : item.target_price !== null ? (
                      <>
                        <p className="flex-1 min-w-0 text-xs font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>
                          Objetivo de {isOwned ? 'salida' : 'entrada'}:{' '}
                          <span className="font-bold" style={{ color: 'var(--ink)' }}>{fmtUSD(item.target_price)}</span>
                          {reached ? (
                            <span className="ml-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full"
                              style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                              Llegó a tu precio
                            </span>
                          ) : q && (
                            <span className="ml-2 text-[10px] font-bold" style={{ color: 'var(--ink-3)' }}>
                              a {(Math.abs(q.price - item.target_price) / item.target_price * 100).toFixed(1)}% de distancia
                            </span>
                          )}
                        </p>
                        <button
                          onClick={() => setTargetInput(String(item.target_price))}
                          className="px-3 py-1.5 rounded-xl text-[11px] font-bold flex-shrink-0 transition-colors hover:bg-black/5"
                          style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => saveTarget(item, null)}
                          disabled={targetBusy}
                          className="px-3 py-1.5 rounded-xl text-[11px] font-bold flex-shrink-0 transition-colors hover:bg-black/5 disabled:opacity-50"
                          style={{ background: 'transparent', color: 'var(--coral)' }}
                        >
                          Quitar
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setTargetInput('')}
                        className="flex-1 text-left text-xs font-semibold transition-opacity hover:opacity-75"
                        style={{ color: 'var(--ink-3)' }}
                      >
                        Definir precio objetivo de {isOwned ? 'salida' : 'entrada'} — te avisamos con un chip cuando llegue
                      </button>
                    )}
                  </div>
                )
              })()}

              {/* Body */}
              <div className="overflow-y-auto pt-4">
                {a === 'loading' || a === undefined ? (
                  <div className="mx-4 mb-4 rounded-2xl px-4 py-3 flex items-center gap-2.5"
                    style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                    <span className="text-xs font-semibold">Calculando indicadores de {ticker}…</span>
                  </div>
                ) : a === 'error' ? (
                  <div className="mx-4 mb-4 rounded-2xl px-4 py-3 flex items-center gap-3"
                    style={{ background: 'rgba(255,111,97,0.08)', border: '1px solid rgba(255,111,97,0.2)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold" style={{ color: 'var(--coral)' }}>
                        No pudimos obtener los datos de {ticker}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                        {errDetails[ticker]
                          ? <>Respuesta de los proveedores: {errDetails[ticker]}</>
                          : 'Puede ser un problema momentáneo del proveedor o un ticker no soportado.'}
                      </p>
                    </div>
                    <button
                      onClick={() => fetchAnalysis(ticker, true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold flex-shrink-0 transition-all active:scale-95"
                      style={{ background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}
                    >
                      <RefreshCw className="w-3 h-3" />
                      Reintentar
                    </button>
                  </div>
                ) : (
                  <TechnicalDetail
                    key={ticker}
                    a={a}
                    ticker={ticker}
                    position={positions[ticker]}
                    livePrice={q?.price}
                  />
                )}

                {/* Dejar de seguir — vive en el popup, no en la fila */}
                {item && (
                  <div className="px-4 pb-4">
                    <button
                      onClick={() => { removeTicker(item); setExpanded(null) }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-2xl border transition-colors hover:bg-black/5"
                      style={{ color: 'var(--coral)', borderColor: 'rgba(255,111,97,0.3)', background: 'transparent' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Dejar de seguir {ticker}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
