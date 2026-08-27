'use client'

import { useState } from 'react'
import { X, TrendingUp, TrendingDown, Minus, Timer, Landmark, DollarSign } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import type { NetWorthSnapshot } from '@/lib/net-worth'
import { useBackdropClose } from './useBackdropClose'
import { NetWorthChart, MONTH_SHORT } from './PatrimonioCards'

interface Props {
  netWorthPoints: { label: string; total: number }[]  // curva ya calculada (semanal o mensual, ver PatrimonioCards)
  snapshots: NetWorthSnapshot[]  // histórico mensual, viejo → nuevo, incluye el actual
  current: NetWorthSnapshot
}

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

/** Mini sparkline SVG (solo tendencia, sin ejes) para el rendimiento de una categoría en el tiempo. */
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
    <svg width="100" height="28" viewBox={`0 0 ${W} ${H}`} className="block flex-shrink-0" aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="2.5" fill={color} />
    </svg>
  )
}

/** F4-detalle (ago 2026, pedido de Cas): "Ver" ahora abre un sheet con más
 * profundidad que el mini-gráfico del hero — curva completa, desglose por
 * categoría con variación mes a mes (especialmente Acciones, que es la más
 * volátil) y el histórico mensual crudo. Antes "Ver" mandaba a /inversiones,
 * que muestra el estado actual pero no la evolución de cada categoría. */
export default function PatrimonioDetailSheet({ netWorthPoints, snapshots, current }: Props) {
  const [open, setOpen] = useState(false)
  const backdropClose = useBackdropClose(() => setOpen(false))

  const prev = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null
  const monthlyRows = [...snapshots].slice(-13).reverse() // más reciente primero, hasta 13 meses

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
          {...backdropClose}
        >
          <div
            className="w-full lg:max-w-2xl rounded-t-3xl lg:rounded-3xl overflow-hidden"
            style={{ background: 'var(--surface)', maxHeight: '92dvh' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

            <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Evolución del patrimonio</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>Total y desglose por categoría en el tiempo</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(92dvh - 88px)' }}>

              {/* Curva completa, tamaño grande */}
              {netWorthPoints.length >= 2 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-3)' }}>
                    Patrimonio total
                  </p>
                  <NetWorthChart points={netWorthPoints} />
                </div>
              )}

              {/* Desglose por categoría con variación mes a mes */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-3)' }}>
                  Por categoría {prev && <span className="normal-case font-medium">— vs mes anterior</span>}
                </p>
                <div className="space-y-2">
                  {CATEGORIES.filter(c => current[c.key] > 0).map(({ key, label, color, Icon }) => {
                    const value = current[key]
                    const prevValue = prev ? prev[key] : null
                    const delta = prevValue !== null ? value - prevValue : null
                    const deltaPct = delta !== null && prevValue && prevValue > 0
                      ? Math.round((delta / prevValue) * 1000) / 10
                      : null
                    const trend = snapshots.slice(-7).map(s => s[key])
                    const DeltaIcon = delta === null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown
                    const deltaColor = delta === null || delta === 0 ? 'var(--ink-3)' : delta > 0 ? 'var(--mint)' : 'var(--coral)'

                    return (
                      <div key={key} className="flex items-center gap-3 rounded-2xl px-3 py-3" style={{ background: 'var(--surface-2)' }}>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface)' }}>
                          <Icon className="w-4 h-4" style={{ color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>{label}</p>
                          <p className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(value)}</p>
                          {delta !== null && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <DeltaIcon className="w-3 h-3" style={{ color: deltaColor }} />
                              <span className="text-[10px] font-bold tabular-nums" style={{ color: deltaColor }}>
                                {delta >= 0 ? '+' : '−'}{formatCLP(Math.abs(delta))}
                                {deltaPct !== null && ` (${delta >= 0 ? '+' : ''}${deltaPct}%)`}
                              </span>
                            </div>
                          )}
                        </div>
                        {trend.length >= 2 && <Sparkline values={trend} color={color} />}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Histórico mensual crudo */}
              {monthlyRows.length >= 2 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-3)' }}>
                    Histórico mensual
                  </p>
                  <div className="rounded-2xl overflow-hidden divide-y" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                    {monthlyRows.map((s, i) => {
                      const older = monthlyRows[i + 1] ?? null
                      const pct = older && older.total_clp > 0
                        ? Math.round(((s.total_clp - older.total_clp) / older.total_clp) * 1000) / 10
                        : null
                      return (
                        <div key={`${s.year}-${s.month}`} className="flex items-center justify-between px-3.5 py-2.5">
                          <span className="text-xs font-semibold capitalize" style={{ color: 'var(--ink-2)' }}>
                            {MONTH_SHORT[s.month - 1]} {s.year}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(s.total_clp)}</span>
                            {pct !== null && (
                              <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full"
                                style={pct >= 0
                                  ? { background: 'rgba(31,190,141,0.14)', color: 'var(--mint)' }
                                  : { background: 'rgba(255,111,97,0.14)', color: 'var(--coral)' }}>
                                {pct >= 0 ? '+' : ''}{pct}%
                              </span>
                            )}
                          </div>
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
