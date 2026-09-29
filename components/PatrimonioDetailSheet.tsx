'use client'

import { useState, useEffect, useMemo } from 'react'
import { X, TrendingUp, TrendingDown, Minus, Timer, Landmark, DollarSign } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import type { NetWorthSnapshot, NetWorthHistoryPoint } from '@/lib/net-worth'
import type { PortfolioPoint } from '@/lib/portfolio-history'
import { useBackdropClose } from './useBackdropClose'
import NetWorthChart, { MONTH_SHORT, MONTH_LONG, fmtDayShort, fmtDayLong, type NetWorthChartPoint } from './NetWorthChart'

// ── Detalle de patrimonio (rediseño sep 2026, Cas: "mejoremos la entrega de
// valor, también las ventanas al abrir el detalle") ────────────────────────
// Antes: el mismo gráfico del card (más chico, en un sheet de 2xl), un
// desglose con deltas y el histórico mensual. Nada que el card no dijera ya.
// Ahora el sheet responde preguntas que el card no puede:
//  - ¿Cuánto cambió en el último mes / 3 meses / desde que empecé? (selector
//    de período que recorta el gráfico Y los números del resumen)
//  - ¿Cuánto valía en una fecha puntual? (gráfico interactivo)
//  - ¿Cómo está repartido y qué categoría se movió?
//  - ¿Mis acciones suben por el mercado o porque compré más? (curva de
//    posiciones actuales a precio histórico, recortada al mismo período)
//  - Neto real mes a mes (bruto − deuda ya contraída), no solo el bruto.

interface Props {
  history:   NetWorthHistoryPoint[]  // curva semanal reconstruida (date, total), vieja → nueva
  snapshots: NetWorthSnapshot[]      // histórico mensual, viejo → nuevo, incluye el actual
  current:   NetWorthSnapshot
  committedDebtTotal: number
  // Curva diaria de las posiciones de HOY valorizadas a precio histórico —
  // muestra el efecto del mercado sin el ruido de compras nuevas.
  stockPortfolioHistory: PortfolioPoint[]
}

type Period = '1m' | '3m' | 'all'
const PERIODS: { key: Period; label: string; days: number | null }[] = [
  { key: '1m',  label: '1 mes',   days: 31 },
  { key: '3m',  label: '3 meses', days: 92 },
  { key: 'all', label: 'Todo',    days: null },
]

const CATEGORIES: {
  key: 'stocks_clp' | 'deposits_clp' | 'savings_clp' | 'usd_clp'
  label: string
  color: string
  Icon: typeof TrendingUp
}[] = [
  { key: 'stocks_clp',   label: 'Acciones',  color: 'var(--primary)', Icon: TrendingUp },
  { key: 'deposits_clp', label: 'Depósitos', color: 'var(--gold)',    Icon: Timer },
  { key: 'savings_clp',  label: 'Ahorro',    color: 'var(--mint)',    Icon: Landmark },
  { key: 'usd_clp',      label: 'Dólares',   color: '#A78BFA',        Icon: DollarSign },
]

function isoMinusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

/** Recorta una serie con fecha al período; garantiza al menos 2 puntos. */
function clip<T extends { date: string }>(series: T[], period: Period): T[] {
  const p = PERIODS.find(x => x.key === period)!
  if (p.days === null || series.length <= 2) return series
  const cutoff = isoMinusDays(p.days)
  const out = series.filter(s => s.date >= cutoff)
  return out.length >= 2 ? out : series.slice(-2)
}

function pctChange(from: number, to: number): number | null {
  return from > 0 ? Math.round(((to - from) / from) * 1000) / 10 : null
}

function Signed({ v, pct, className = '' }: { v: number; pct?: number | null; className?: string }) {
  const color = v > 0 ? 'var(--mint)' : v < 0 ? 'var(--coral)' : 'var(--ink-3)'
  return (
    <span className={`tabular-nums ${className}`} style={{ color }}>
      {v >= 0 ? '+' : '−'}{formatCLP(Math.abs(v))}
      {pct != null && ` (${v >= 0 ? '+' : ''}${pct}%)`}
    </span>
  )
}

/** Mini sparkline SVG (solo tendencia, sin ejes). */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null
  const W = 100, H = 28, pad = 3
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const xs = values.map((_, i) => pad + (i / (values.length - 1)) * (W - pad * 2))
  const ys = values.map(v => pad + (1 - (v - min) / range) * (H - pad * 2))
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x},${ys[i]}`).join(' ')
  return (
    <svg width="72" height="24" viewBox={`0 0 ${W} ${H}`} className="block flex-shrink-0" aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="2.5" fill={color} />
    </svg>
  )
}

export default function PatrimonioDetailSheet({ history, snapshots, current, committedDebtTotal, stockPortfolioHistory }: Props) {
  const [open, setOpen]     = useState(false)
  const [period, setPeriod] = useState<Period>('all')
  const backdropClose = useBackdropClose(() => setOpen(false))

  // Esc para cerrar + sin scroll de fondo mientras está abierto.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow }
  }, [open])

  const hasHistory = history.length >= 2
  const clipped = useMemo(() => hasHistory ? clip(history, period) : [], [history, period, hasHistory])
  const chartPoints: NetWorthChartPoint[] = hasHistory
    ? clipped.map(p => ({ label: fmtDayShort(p.date), full: fmtDayLong(p.date), total: p.total }))
    : snapshots.slice(-13).map(s => ({ label: MONTH_SHORT[s.month - 1], full: `${MONTH_LONG[s.month - 1]} ${s.year}`, total: s.total_clp }))

  const periodStart = chartPoints[0]?.total ?? current.total_clp
  const periodDelta = current.total_clp - periodStart
  const periodPct   = pctChange(periodStart, current.total_clp)
  const periodFrom  = hasHistory ? fmtDayShort(clipped[0].date) : chartPoints[0]?.label

  const netReal = current.total_clp - committedDebtTotal
  const prev = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null
  const monthlyRows = [...snapshots].slice(-13).reverse()

  const stockClipped = clip(stockPortfolioHistory, period)
  const stockPoints: NetWorthChartPoint[] = stockClipped.map(p => ({ label: fmtDayShort(p.date), full: fmtDayLong(p.date), total: p.value }))
  const stockDelta = stockClipped.length >= 2 ? stockClipped[stockClipped.length - 1].value - stockClipped[0].value : null
  const stockPct   = stockDelta !== null ? pctChange(stockClipped[0].value, stockClipped[stockClipped.length - 1].value) : null

  const cats = CATEGORIES.filter(c => current[c.key] > 0)
  const total = current.total_clp || 1

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-semibold hover:opacity-70 transition-opacity"
        style={{ color: 'var(--primary)' }}
      >
        Ver
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          role="dialog" aria-modal="true" aria-label="Detalle del patrimonio"
          {...backdropClose}
        >
          <div
            className="w-full lg:max-w-4xl rounded-t-3xl lg:rounded-3xl overflow-hidden flex flex-col"
            style={{ background: 'var(--surface)', maxHeight: '92dvh' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden flex-shrink-0" style={{ background: 'var(--border)' }} />

            {/* Header fijo: título + total, siempre visible al hacer scroll */}
            <div className="flex items-start justify-between gap-3 px-5 lg:px-6 pt-4 pb-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Patrimonio neto</p>
                <p className="text-2xl lg:text-3xl font-extrabold tabular-nums leading-tight mt-0.5"
                  style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>
                  {formatCLP(current.total_clp)}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors flex-shrink-0"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 lg:px-6 py-5 space-y-6 overflow-y-auto min-h-0">

              {/* Resumen: 3 respuestas rápidas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--surface-2)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>
                    {period === 'all' ? `Desde ${periodFrom}` : `Últ. ${PERIODS.find(p => p.key === period)!.label}`}
                  </p>
                  <p className="text-base font-extrabold mt-0.5"><Signed v={periodDelta} /></p>
                  {periodPct !== null && <p className="text-[10px] font-bold tabular-nums" style={{ color: 'var(--ink-3)' }}>{periodPct >= 0 ? '+' : ''}{periodPct}% · incluye aportes</p>}
                </div>
                <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--surface-2)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>
                    {prev ? `Vs cierre de ${MONTH_LONG[prev.month - 1]}` : 'Vs mes anterior'}
                  </p>
                  {prev ? (
                    <>
                      <p className="text-base font-extrabold mt-0.5"><Signed v={current.total_clp - prev.total_clp} /></p>
                      {pctChange(prev.total_clp, current.total_clp) !== null && (
                        <p className="text-[10px] font-bold tabular-nums" style={{ color: 'var(--ink-3)' }}>
                          {(() => { const p = pctChange(prev.total_clp, current.total_clp)!; return `${p >= 0 ? '+' : ''}${p}%` })()}
                        </p>
                      )}
                    </>
                  ) : <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>—</p>}
                </div>
                <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--surface-2)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Neto real</p>
                  <p className="text-base font-extrabold tabular-nums mt-0.5" style={{ color: netReal >= 0 ? 'var(--ink)' : 'var(--coral)' }}>
                    {formatCLP(netReal)}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--ink-3)' }}>
                    {committedDebtTotal > 0 ? `menos ${formatCLP(committedDebtTotal)} ya comprometidos` : 'sin deuda comprometida'}
                  </p>
                </div>
              </div>

              {/* Evolución con selector de período */}
              {chartPoints.length >= 2 && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Evolución</p>
                    {hasHistory && (
                      <div className="flex rounded-full p-0.5" style={{ background: 'var(--surface-2)' }} role="tablist">
                        {PERIODS.map(p => (
                          <button key={p.key} role="tab" aria-selected={period === p.key}
                            onClick={() => setPeriod(p.key)}
                            className="px-3 py-1 rounded-full text-[11px] font-bold transition-colors"
                            style={period === p.key
                              ? { background: 'var(--primary)', color: 'var(--primary-ink)' }
                              : { color: 'var(--ink-3)' }}>
                            {p.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <NetWorthChart points={chartPoints} idPrefix="nw-sheet" />
                  <p className="text-[10px] mt-1.5" style={{ color: 'var(--ink-3)' }}>
                    Toca o pasa el mouse sobre la curva para ver el valor de cada semana.
                  </p>
                </div>
              )}

              {/* Composición */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-3)' }}>
                  Composición {prev && <span className="normal-case font-medium">— cambio vs cierre de {MONTH_LONG[prev.month - 1]}</span>}
                </p>
                {cats.length > 1 && (
                  <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 mb-3" aria-hidden="true">
                    {cats.map(c => <div key={c.key} style={{ width: `${(current[c.key] / total) * 100}%`, background: c.color }} />)}
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  {cats.map(({ key, label, color, Icon }) => {
                    const value = current[key]
                    const share = Math.round((value / total) * 100)
                    // Dólares = saldo de la billetera, plata EN TRÁNSITO hacia
                    // acciones — su variación no es rendimiento ni pérdida.
                    const isTransit = key === 'usd_clp'
                    const prevValue = prev ? prev[key] : null
                    const delta = !isTransit && prevValue !== null ? value - prevValue : null
                    const trend = snapshots.slice(-7).map(s => s[key])
                    const DeltaIcon = delta === null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown
                    return (
                      <div key={key} className="flex items-center gap-3 rounded-2xl px-3 py-3" style={{ background: 'var(--surface-2)' }}>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface)' }}>
                          <Icon className="w-4 h-4" style={{ color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                            {label} <span className="text-[10px] font-bold" style={{ color: 'var(--ink-3)' }}>{share}%</span>
                          </p>
                          <p className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(value)}</p>
                          {isTransit ? (
                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-3)' }}>Por invertir en acciones</p>
                          ) : delta !== null && (
                            <p className="flex items-center gap-1 mt-0.5 text-[10px] font-bold">
                              <DeltaIcon className="w-3 h-3" style={{ color: delta > 0 ? 'var(--mint)' : delta < 0 ? 'var(--coral)' : 'var(--ink-3)' }} />
                              <Signed v={delta} pct={pctChange(prevValue!, value)} />
                            </p>
                          )}
                        </div>
                        {!isTransit && trend.length >= 2 && <Sparkline values={trend} color={color} />}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Acciones por mercado (sin compras nuevas) */}
              {stockPoints.length >= 2 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>
                      Acciones — efecto del mercado
                    </p>
                    {stockDelta !== null && <span className="text-[11px] font-bold"><Signed v={stockDelta} pct={stockPct} /></span>}
                  </div>
                  <NetWorthChart points={stockPoints} idPrefix="nw-stock" />
                  <p className="text-[10px] mt-1.5" style={{ color: 'var(--ink-3)' }}>
                    Tus posiciones de hoy valorizadas al cierre de cada día: aísla cuánto subió o bajó el mercado, sin contar compras nuevas.
                  </p>
                </div>
              )}

              {/* Histórico mensual: bruto y neto real */}
              {monthlyRows.length >= 2 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-3)' }}>
                    Cierre de cada mes
                  </p>
                  <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                    <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto] gap-x-4 px-3.5 py-2 text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: 'var(--ink-3)', borderBottom: '1px solid var(--border)' }}>
                      <span>Mes</span>
                      <span className="text-right">Bruto</span>
                      <span className="text-right hidden sm:block">Neto real</span>
                      <span className="text-right">Cambio</span>
                    </div>
                    {monthlyRows.map((s, i) => {
                      const older = monthlyRows[i + 1] ?? null
                      const pct = older ? pctChange(older.total_clp, s.total_clp) : null
                      const isCurrent = i === 0
                      return (
                        <div key={`${s.year}-${s.month}`}
                          className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center px-3.5 py-2.5"
                          style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                          <span className="text-xs font-semibold capitalize" style={{ color: 'var(--ink-2)' }}>
                            {MONTH_SHORT[s.month - 1]} {s.year}{isCurrent && <span className="normal-case font-medium" style={{ color: 'var(--ink-3)' }}> · hoy</span>}
                          </span>
                          <span className="text-xs font-bold tabular-nums text-right" style={{ color: 'var(--ink)' }}>{formatCLP(s.total_clp)}</span>
                          <span className="text-xs tabular-nums text-right hidden sm:block" style={{ color: 'var(--ink-2)' }}>
                            {s.net_clp != null ? formatCLP(s.net_clp) : '—'}
                          </span>
                          <span className="text-right">
                            {pct !== null ? (
                              <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full"
                                style={pct >= 0
                                  ? { background: 'rgba(31,190,141,0.14)', color: 'var(--mint)' }
                                  : { background: 'rgba(255,111,97,0.14)', color: 'var(--coral)' }}>
                                {pct >= 0 ? '+' : ''}{pct}%
                              </span>
                            ) : <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>—</span>}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </>
  )
}
