'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, TrendingUp, Landmark, Pencil,
  Trash2, Check, AlertCircle, Bell, ArrowUp, ArrowDown, ChevronRight,
} from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import type { StockPosition } from '@/app/(dashboard)/inversiones/page'
import type { TickerHistory } from '@/app/api/stock-history/route'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Quote {
  price:         number
  changePercent: number
  name:          string
  currency:      string
  history7d?:    number[]
}
type Quotes   = Record<string, Quote>
type HistData = Record<string, TickerHistory>

// ── Formatting ────────────────────────────────────────────────────────────────
function fmtUSD(n: number): string {
  return '$' + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtUSDSigned(n: number): string {
  return (n >= 0 ? '+$' : '-$') + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(n: number, showSign = true): string {
  const s = Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return showSign ? (n >= 0 ? `+${s}%` : `-${s}%`) : `${s}%`
}

// ── Ticker avatar color (deterministic) ───────────────────────────────────────
const AVATAR_PALETTE = [
  '#1B6DD4','#1FBE8D','#FF6F61','#FBC23C',
  '#A78BFA','#F472B6','#34D399','#FB923C','#60A5FA','#F87171',
]
function tickerColor(ticker: string): string {
  let h = 0
  for (let i = 0; i < ticker.length; i++) h = ticker.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length]
}

// ── Sparkline SVG ──────────────────────────────────────────────────────────────
function Sparkline({
  values,
  w = 80, h = 28,
  color,
  strokeWidth = 1.5,
  responsive = false,
}: {
  values: number[]
  w?: number
  h?: number
  color: string
  strokeWidth?: number
  responsive?: boolean
}) {
  if (values.length < 2) {
    return (
      <svg width={responsive ? '100%' : w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio={responsive ? 'none' : undefined}>
        <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
      </svg>
    )
  }
  const pad = 2
  const min = Math.min(...values)
  const max = Math.max(...values)
  const rng = max - min || 1
  const xs  = values.map((_, i) => pad + (i / (values.length - 1)) * (w - pad * 2))
  const ys  = values.map(v => h - pad - ((v - min) / rng) * (h - pad * 2))
  const d   = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')

  return (
    <svg
      width={responsive ? '100%' : w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio={responsive ? 'none' : undefined}
      className="overflow-visible"
    >
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      {!responsive && <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={2} fill={color} />}
    </svg>
  )
}

// ── Evolution Chart ────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function parseYM(ym: string): Date {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} '${String(y).slice(2)}`
}

function computePortfolioPoints(
  history:   HistData,
  positions: StockPosition[],
): { date: string; value: number }[] {
  // Reunir todas las fechas disponibles
  const allDates = new Set<string>()
  for (const h of Object.values(history)) h.dates.forEach(d => allDates.add(d))
  const sorted = Array.from(allDates).sort()
  if (!sorted.length) return []

  return sorted.map(date => {
    let value = 0
    for (const pos of positions) {
      const h = history[pos.ticker]
      if (h) {
        // buscar el índice exacto o el último disponible antes de esta fecha
        let price: number | null = null
        for (let i = 0; i < h.dates.length; i++) {
          if (h.dates[i] <= date) price = h.closes[i]
        }
        value += pos.shares * (price ?? pos.avg_cost_usd)
      } else {
        value += pos.shares * pos.avg_cost_usd
      }
    }
    return { date, value }
  })
}

type Range = '3M' | '6M' | '1A'

function EvolutionChart({
  history,
  positions,
}: {
  history:   HistData
  positions: StockPosition[]
}) {
  const [range, setRange] = useState<Range>('1A')

  const allPoints = computePortfolioPoints(history, positions)
  if (allPoints.length < 2) return null

  const monthsBack = range === '3M' ? 3 : range === '6M' ? 6 : 12
  const points     = allPoints.slice(-monthsBack)
  if (points.length < 2) return null

  // SVG dimensions
  const W       = 1000
  const H       = 180
  const padL    = 4
  const padR    = 4
  const padT    = 12
  const padB    = 28   // espacio para labels eje X

  const values  = points.map(p => p.value)
  const minV    = Math.min(...values)
  const maxV    = Math.max(...values)
  const rangeV  = maxV - minV || 1

  const toX = (i: number) =>
    padL + (i / (points.length - 1)) * (W - padL - padR)
  const toY = (v: number) =>
    padT + (1 - (v - minV) / rangeV) * (H - padT - padB)

  const linePath  = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`).join(' ')
  const areaPath  = `${linePath} L${toX(points.length - 1).toFixed(1)},${H - padB} L${toX(0).toFixed(1)},${H - padB} Z`

  const isUp      = points[points.length - 1].value >= points[0].value
  const lineColor = isUp ? '#1FBE8D' : '#FF6F61'
  const fillId    = 'evolGrad'

  // Labels eje X: mostrar cada N para no saturar
  const step      = points.length <= 4 ? 1 : points.length <= 7 ? 1 : Math.ceil(points.length / 6)
  const labelIdxs = points.reduce<number[]>((acc, _, i) => {
    if (i === 0 || i === points.length - 1 || i % step === 0) acc.push(i)
    return acc
  }, [])

  // Cambio total en el rango
  const startVal  = points[0].value
  const endVal    = points[points.length - 1].value
  const changeUsd = endVal - startVal
  const changePct = startVal > 0 ? (changeUsd / startVal) * 100 : 0

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Evolución del portafolio</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
            {monthLabel(points[0].date)} → {monthLabel(points[points.length - 1].date)}
            &nbsp;·&nbsp;
            <span style={{ color: isUp ? 'var(--mint)' : 'var(--coral)', fontWeight: 600 }}>
              {changeUsd >= 0 ? '+' : ''}{fmtUSD(changeUsd)} ({fmtPct(changePct)})
            </span>
          </p>
        </div>

        {/* Toggle de rango */}
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'var(--surface-2)' }}>
          {(['3M','6M','1A'] as Range[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="px-3 py-1 text-xs font-semibold rounded-lg transition-all"
              style={{
                background: range === r ? 'var(--primary)' : 'transparent',
                color:      range === r ? 'var(--primary-ink)' : 'var(--ink-3)',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* SVG chart */}
      <div className="px-2 pb-3">
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={lineColor} stopOpacity={0.18} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0}    />
            </linearGradient>
          </defs>

          {/* Grid lines horizontales (sutiles) */}
          {[0.25, 0.5, 0.75].map(t => {
            const y = padT + t * (H - padT - padB)
            return (
              <line key={t}
                x1={padL} y1={y} x2={W - padR} y2={y}
                stroke="var(--border)" strokeWidth={0.5} strokeDasharray="4 4" />
            )
          })}

          {/* Área de relleno */}
          <path d={areaPath} fill={`url(#${fillId})`} />

          {/* Línea principal */}
          <path d={linePath} fill="none" stroke={lineColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {/* Punto final (highlight) */}
          <circle
            cx={toX(points.length - 1)} cy={toY(endVal)} r={4}
            fill={lineColor} stroke="var(--surface)" strokeWidth={2}
          />

          {/* Labels eje X */}
          {labelIdxs.map(i => (
            <text
              key={i}
              x={toX(i)} y={H - 6}
              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
              fontSize={11}
              fill="var(--ink-3)"
              fontFamily="'Plus Jakarta Sans', sans-serif"
            >
              {monthLabel(points[i].date)}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}

// ── Input helpers ─────────────────────────────────────────────────────────────
const inputBase: React.CSSProperties = {
  color:       'var(--ink)',
  background:  'var(--surface-2)',
  borderColor: 'var(--border)',
  borderRadius: 12,
  outline:     'none',
  transition:  'border-color 150ms, box-shadow 150ms',
}
function focusOn(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'var(--primary)'
  e.currentTarget.style.boxShadow   = '0 0 0 3px var(--primary-soft)'
}
function focusOff(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'var(--border)'
  e.currentTarget.style.boxShadow   = 'none'
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  userId:           string
  initialPositions: StockPosition[]
}
interface FormState { ticker: string; shares: string; totalPaid: string; notes: string }
const emptyForm: FormState = { ticker: '', shares: '', totalPaid: '', notes: '' }

export default function StockPositionManager({ userId, initialPositions }: Props) {
  const supabase     = createClient()
  const searchParams = useSearchParams()
  const isAhorro     = searchParams.get('view') === 'ahorro'

  const [positions,      setPositions]      = useState<StockPosition[]>(initialPositions)
  const [quotes,         setQuotes]         = useState<Quotes>({})
  const [usdClp,         setUsdClp]         = useState<number | null>(null)
  const [loadingQ,       setLoadingQ]       = useState(false)
  const [quotesError,    setQuotesError]    = useState('')
  const [lastUpdated,    setLastUpdated]    = useState<Date | null>(null)
  const [secsAgo,        setSecsAgo]        = useState(0)
  const [monthlyHistory, setMonthlyHistory] = useState<HistData>({})
  const [loadingHistory, setLoadingHistory] = useState(false)

  const [showForm,   setShowForm]   = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [form,       setForm]       = useState<FormState>(emptyForm)
  const [saving,     setSaving]     = useState(false)
  const [formError,  setFormError]  = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Live "hace Xs" timer
  useEffect(() => {
    const t = setInterval(() => {
      if (lastUpdated) setSecsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [lastUpdated])

  const fetchQuotes = useCallback(async (tickers: string[]) => {
    if (!tickers.length) return
    setLoadingQ(true)
    setQuotesError('')
    try {
      const res = await fetch(`/api/stock-price?symbols=${tickers.join(',')}&history=true`)
      if (!res.ok) throw new Error('fetch')
      const data: Quotes = await res.json()
      setUsdClp(data['USDCLP=X']?.price ?? null)
      setQuotes(data)
      setLastUpdated(new Date())
      setSecsAgo(0)
    } catch {
      setQuotesError('No se pudieron obtener los precios. Intenta de nuevo.')
    } finally {
      setLoadingQ(false)
    }
  }, [])

  const fetchHistory = useCallback(async (tickers: string[]) => {
    if (!tickers.length) return
    setLoadingHistory(true)
    try {
      const res = await fetch(`/api/stock-history?symbols=${tickers.join(',')}&months=12`)
      if (!res.ok) return
      const data: HistData = await res.json()
      setMonthlyHistory(data)
    } catch {
      // historial opcional — no mostrar error
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    if (positions.length) {
      const tickers = positions.map(p => p.ticker)
      fetchQuotes(tickers)
      fetchHistory(tickers)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Computed ─────────────────────────────────────────────────────────────
  const hasQ        = positions.length > 0 && Object.keys(quotes).some(k => k !== 'USDCLP=X')
  const totalCostUsd = positions.reduce((s, p) => s + p.shares * p.avg_cost_usd, 0)
  const totalValueUsd= positions.reduce((s, p) => {
    const q = quotes[p.ticker]
    return s + p.shares * (q?.price ?? p.avg_cost_usd)
  }, 0)
  const totalGainUsd  = totalValueUsd - totalCostUsd
  const totalGainPct  = totalCostUsd > 0 ? (totalGainUsd / totalCostUsd) * 100 : 0
  const totalValueClp = usdClp ? Math.round(totalValueUsd * usdClp) : null

  const todayChangeUsd = positions.reduce((s, p) => {
    const q = quotes[p.ticker]
    if (!q?.changePercent) return s
    return s + p.shares * q.price * (q.changePercent / 100)
  }, 0)
  const todayChangePct = totalValueUsd > 0 ? (todayChangeUsd / (totalValueUsd - todayChangeUsd)) * 100 : 0

  const posUp   = positions.filter(p => (quotes[p.ticker]?.changePercent ?? 0) > 0).length
  const posDown = positions.filter(p => (quotes[p.ticker]?.changePercent ?? 0) < 0).length

  const bestPos = positions.reduce<{ ticker: string; pct: number } | null>((best, p) => {
    const q    = quotes[p.ticker]
    if (!q) return best
    const pct  = ((q.price - p.avg_cost_usd) / p.avg_cost_usd) * 100
    if (!best || pct > best.pct) return { ticker: p.ticker, pct }
    return best
  }, null)

  // Portfolio sparkline: usa historial real si está disponible, si no muestra costo → valor actual
  const histLens = positions.map(p => quotes[p.ticker]?.history7d?.length ?? 0).filter(l => l > 0)
  const histLen  = histLens.length > 0 ? Math.min(...histLens) : 0
  const portfolioHistory: number[] = histLen > 1
    ? Array.from({ length: histLen }, (_, d) =>
        positions.reduce((s, p) => s + p.shares * (quotes[p.ticker]?.history7d?.[d] ?? p.avg_cost_usd), 0)
      )
    : hasQ
      ? [totalCostUsd, totalValueUsd]   // fallback 2 puntos: costo → valor actual
      : []

  // ── CRUD ─────────────────────────────────────────────────────────────────
  function openAdd() { setForm(emptyForm); setEditingId(null); setFormError(''); setShowForm(true) }
  function openEdit(pos: StockPosition) {
    const totalPaid = (pos.shares * pos.avg_cost_usd).toFixed(2)
    setForm({ ticker: pos.ticker, shares: String(pos.shares), totalPaid, notes: pos.notes ?? '' })
    setEditingId(pos.id); setFormError(''); setShowForm(true)
  }
  function cancelForm() { setShowForm(false); setEditingId(null); setForm(emptyForm); setFormError('') }

  async function savePosition() {
    const ticker     = form.ticker.trim().toUpperCase()
    const shares     = parseFloat(form.shares)
    const totalPaid  = parseFloat(form.totalPaid)
    if (!ticker || !/^[A-Z0-9.\-]{1,10}$/.test(ticker)) { setFormError('Ticker inválido (ej: AAPL, BRK.B)'); return }
    if (isNaN(shares)    || shares    <= 0) { setFormError('Número de acciones inválido'); return }
    if (isNaN(totalPaid) || totalPaid <= 0) { setFormError('Total pagado inválido'); return }
    const avgCost = totalPaid / shares

    setSaving(true); setFormError('')
    if (editingId) {
      const { error } = await supabase.from('stock_positions')
        .update({ shares, avg_cost_usd: avgCost, notes: form.notes.trim() || null, updated_at: new Date().toISOString() })
        .eq('id', editingId).eq('user_id', userId)
      setSaving(false)
      if (error) { setFormError('Error al guardar'); return }
      setPositions(prev => prev.map(p => p.id === editingId ? { ...p, shares, avg_cost_usd: avgCost, notes: form.notes.trim() || null } : p))
    } else {
      const { data, error } = await supabase.from('stock_positions')
        .upsert({ user_id: userId, ticker, shares, avg_cost_usd: avgCost, notes: form.notes.trim() || null }, { onConflict: 'user_id,ticker' })
        .select().single()
      setSaving(false)
      if (error) { setFormError('Error al guardar'); return }
      const newPos = data as StockPosition
      setPositions(prev => {
        const idx = prev.findIndex(p => p.ticker === ticker)
        return idx >= 0 ? prev.map(p => p.ticker === ticker ? newPos : p) : [newPos, ...prev]
      })
      fetchQuotes([...positions.map(p => p.ticker), ticker])
    }
    cancelForm()
  }

  async function deletePosition(id: string) {
    setDeletingId(id)
    await supabase.from('stock_positions').delete().eq('id', id).eq('user_id', userId)
    setPositions(prev => prev.filter(p => p.id !== id))
    setDeletingId(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        {/* Estado en vivo — izquierda */}
        <div className="flex items-center gap-2 min-w-0 text-[11px]">
          {lastUpdated && !quotesError && (
            <>
              <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ background: 'var(--mint)' }} />
              <span style={{ color: 'var(--mint)' }} className="font-semibold">Precios en vivo</span>
            </>
          )}
          {quotesError && (
            <div className="flex items-center gap-1.5" style={{ color: 'var(--coral)' }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <button onClick={() => fetchQuotes(positions.map(p => p.ticker))}
                disabled={loadingQ} className="underline underline-offset-2 disabled:opacity-50">
                Reintentar
              </button>
            </div>
          )}
        </div>

        {/* Tabs + Agregar — derecha */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="view-toggle-wrap flex items-center gap-1 rounded-xl p-1">
            <Link
              href="/inversiones"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                !isAhorro ? 'view-toggle-active-purchase' : 'view-toggle-btn'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Acciones</span>
            </Link>
            <Link
              href="/inversiones?view=ahorro"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isAhorro ? 'view-toggle-active-purchase' : 'view-toggle-btn'
              }`}
            >
              <Landmark className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ahorro</span>
            </Link>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all active:scale-[.97] shrink-0"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Agregar
          </button>
        </div>
      </div>

      {/* ── Add/Edit form ────────────────────────────────────────────────── */}
      {showForm && (
        <div className="card p-4 lg:p-5" style={{ borderColor: 'var(--primary)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--ink-3)' }}>
            {editingId ? 'Editar posición' : 'Nueva posición'}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--ink-3)' }}>Ticker</label>
              <input type="text" value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                placeholder="AAPL" maxLength={10} disabled={!!editingId}
                className="w-full text-sm font-bold border px-3 py-2 disabled:opacity-50"
                style={{ ...inputBase, fontFamily: 'ui-monospace, monospace' }} onFocus={focusOn} onBlur={focusOff} />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--ink-3)' }}>N° acciones</label>
              <input type="number" value={form.shares} onChange={e => setForm(f => ({ ...f, shares: e.target.value }))}
                placeholder="10" min="0.0001" step="any"
                className="w-full text-sm border px-3 py-2" style={inputBase} onFocus={focusOn} onBlur={focusOff} />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--ink-3)' }}>Total pagado (USD)</label>
              <input type="number" value={form.totalPaid} onChange={e => setForm(f => ({ ...f, totalPaid: e.target.value }))}
                placeholder="896.99" min="0.01" step="0.01"
                className="w-full text-sm border px-3 py-2" style={inputBase} onFocus={focusOn} onBlur={focusOff} />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--ink-3)' }}>Nota (opcional)</label>
              <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="ej: compra inicial" maxLength={80}
                className="w-full text-sm border px-3 py-2" style={inputBase} onFocus={focusOn} onBlur={focusOff} />
            </div>
          </div>
          {form.shares && form.totalPaid && parseFloat(form.shares) > 0 && parseFloat(form.totalPaid) > 0 && (
            <p className="text-xs mb-3 font-semibold tabular-nums" style={{ color: 'var(--ink-3)' }}>
              Precio por acción: {fmtUSD(parseFloat(form.totalPaid) / parseFloat(form.shares))}
            </p>
          )}
          {formError && <p className="text-xs mb-2 font-medium" style={{ color: 'var(--coral)' }}>{formError}</p>}
          <div className="flex gap-2">
            <button onClick={savePosition} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold transition-all disabled:opacity-50 active:scale-[.98]"
              style={{ background: 'var(--primary)', color: 'var(--primary-ink)', borderRadius: 10, boxShadow: '0 6px 14px var(--shadow)' }}>
              <Check className="w-3.5 h-3.5" /> {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={cancelForm}
              className="px-4 py-2 text-xs font-semibold border"
              style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {positions.length === 0 && !showForm && (
        <div className="card flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--primary-soft)' }}>
            <TrendingUp className="w-7 h-7" style={{ color: 'var(--primary)' }} />
          </div>
          <p className="text-base font-bold mb-1" style={{ color: 'var(--ink)' }}>Sin posiciones</p>
          <p className="text-sm mb-5" style={{ color: 'var(--ink-3)' }}>Agregá tus acciones para hacer seguimiento de tu portfolio.</p>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}>
            <Plus className="w-4 h-4" /> Agregar primera acción
          </button>
        </div>
      )}

      {/* ── Hero card + 3 KPIs (lado a lado en desktop) ─────────────────── */}
      {positions.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-4 lg:items-stretch">

          {/* ── Hero card ── */}
          <div className="card overflow-hidden hero-gradient w-full lg:min-w-0" style={{ flex: '40 1 0' }}>
            {/* Valor */}
            <div className="px-5 pt-5 lg:px-6 lg:pt-6 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                Valor del portafolio
              </p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-4xl lg:text-5xl font-bold tabular-nums leading-none" style={{ fontFamily: 'Fredoka, sans-serif', color: 'white' }}>
                  {hasQ ? fmtUSD(totalValueUsd) : fmtUSD(totalCostUsd)}
                </p>
                <span className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>USD</span>
              </div>
              {totalValueClp && (
                <p className="text-[11px] mt-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  ≈ {formatCLP(totalValueClp)} CLP
                </p>
              )}
            </div>

            {/* Divider + 3 sub-KPIs */}
            <div className="border-t grid grid-cols-3" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
              {/* Invertido */}
              <div className="px-4 py-3 lg:px-5 lg:py-4">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Invertido</p>
                <p className="text-base lg:text-lg font-bold tabular-nums" style={{ color: 'white' }}>
                  {fmtUSD(totalCostUsd)}
                </p>
              </div>
              {/* Ganancia total */}
              <div className="px-4 py-3 lg:px-5 lg:py-4 border-l" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Ganancia total</p>
                <p className="text-base lg:text-lg font-bold tabular-nums" style={{ color: hasQ ? (totalGainUsd >= 0 ? '#1FBE8D' : '#FF6F61') : 'rgba(255,255,255,0.5)' }}>
                  {hasQ ? fmtUSDSigned(totalGainUsd) : '—'}
                </p>
              </div>
              {/* Retorno */}
              <div className="px-4 py-3 lg:px-5 lg:py-4 border-l" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Retorno</p>
                <p className="text-base lg:text-lg font-bold tabular-nums" style={{ color: hasQ ? (totalGainPct >= 0 ? '#1FBE8D' : '#FF6F61') : 'rgba(255,255,255,0.5)' }}>
                  {hasQ ? fmtPct(totalGainPct) : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* ── 3 KPI cards horizontales ── */}
          <div className="grid grid-cols-3 gap-3 w-full lg:min-w-0" style={{ flex: '60 1 0', alignContent: 'stretch' }}>

            {/* Cambio hoy */}
            <div className="card p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Cambio hoy</p>
              <p className="text-xl font-extrabold tabular-nums" style={{
                fontFamily: 'Fredoka, sans-serif',
                color: hasQ ? (todayChangeUsd >= 0 ? 'var(--mint)' : 'var(--coral)') : 'var(--ink)',
              }}>
                {hasQ ? fmtUSDSigned(todayChangeUsd) : '—'}
              </p>
              {hasQ && (
                <div className="flex items-center gap-1 mt-0.5">
                  {todayChangeUsd >= 0
                    ? <ArrowUp className="w-3 h-3" style={{ color: 'var(--mint)' }} />
                    : <ArrowDown className="w-3 h-3" style={{ color: 'var(--coral)' }} />}
                  <span className="text-[10px] font-semibold" style={{ color: todayChangeUsd >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                    {fmtPct(todayChangePct)} hoy
                  </span>
                </div>
              )}
            </div>

            {/* Posiciones */}
            <div className="card p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Posiciones</p>
              <p className="text-xl font-extrabold" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>
                {positions.length}
              </p>
              {hasQ && (posUp > 0 || posDown > 0) && (
                <div className="flex items-center gap-2 mt-0.5 text-[10px] font-semibold">
                  {posUp   > 0 && <span style={{ color: 'var(--mint)' }}>{posUp}↑</span>}
                  {posDown > 0 && <span style={{ color: 'var(--coral)' }}>{posDown}↓</span>}
                </div>
              )}
            </div>

            {/* Mejor retorno */}
            <div className="card p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Mejor retorno</p>
              {bestPos ? (
                <>
                  <p className="text-xl font-extrabold" style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--ink)' }}>
                    {bestPos.ticker}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {bestPos.pct >= 0
                      ? <ArrowUp className="w-3 h-3" style={{ color: 'var(--mint)' }} />
                      : <ArrowDown className="w-3 h-3" style={{ color: 'var(--coral)' }} />}
                    <span className="text-[10px] font-semibold" style={{ color: bestPos.pct >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                      {fmtPct(bestPos.pct)} total
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-xl font-extrabold" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink-3)' }}>—</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Gráfica de evolución mensual ─────────────────────────────────── */}
      {positions.length > 0 && (
        loadingHistory
          ? (
            <div className="card p-5 flex items-center gap-3" style={{ height: 80 }}>
              <div className="w-4 h-4 rounded-full animate-pulse" style={{ background: 'var(--primary)' }} />
              <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Cargando evolución histórica…</p>
            </div>
          )
          : Object.keys(monthlyHistory).length > 0
            ? <EvolutionChart history={monthlyHistory} positions={positions} />
            : null
      )}

      {/* ── Mis posiciones table ─────────────────────────────────────────── */}
      {positions.length > 0 && (
        <div className="card overflow-hidden">

          {/* Table header bar */}
          <div className="flex items-center justify-between px-4 lg:px-6 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            {/* ≡ Filtrar */}
            <button
              className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-colors"
              style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <span className="text-sm leading-none">≡</span>
              Filtrar
            </button>
            {/* ⊙ cierre · hace Xs */}
            <p className="text-[10px] flex items-center gap-1.5" style={{ color: 'var(--ink-3)' }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: lastUpdated ? 'var(--mint)' : 'var(--ink-3)' }} />
              cierre ·{' '}
              {lastUpdated
                ? `hace ${Math.round((Date.now() - lastUpdated.getTime()) / 1000)}s`
                : 'sin datos'}
            </p>
          </div>

          {/* Column headers (desktop only) */}
          <div
            className="hidden lg:grid px-6 py-2 text-[10px] font-bold uppercase tracking-widest border-b"
            style={{ gridTemplateColumns: '2fr 0.9fr 1fr 1fr 1fr 1.1fr 52px', color: 'var(--ink-3)', borderColor: 'var(--border)' }}
          >
            <span>Empresa</span>
            <span className="text-right">Cant.</span>
            <span className="text-right">Precio hoy</span>
            <span className="text-right">Valor</span>
            <span className="text-right">Invertido</span>
            <span className="text-right">Retorno</span>
            <span></span>
          </div>

          {/* Rows */}
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {positions.map(pos => {
              const q            = quotes[pos.ticker]
              const currentPrice = q?.price ?? null
              const changePct    = q?.changePercent ?? null
              const currentValue = currentPrice !== null ? pos.shares * currentPrice : null
              const costBasis    = pos.shares * pos.avg_cost_usd
              const gainUsd      = currentValue !== null ? currentValue - costBasis : null
              const gainPct      = gainUsd !== null && costBasis > 0 ? (gainUsd / costBasis) * 100 : null
              const isUp         = gainUsd !== null && gainUsd >= 0
              const todayUp      = changePct !== null && changePct >= 0
              const avatarBg     = tickerColor(pos.ticker)
              const initials     = pos.ticker.slice(0, 2)

              return (
                <div key={pos.id} className="group px-4 lg:px-6 py-3 hover:bg-[var(--surface-2)] transition-colors">

                  {/* Desktop row — Empresa | Cant. | Precio hoy | Valor | Invertido | Retorno | actions */}
                  <div className="hidden lg:grid items-center" style={{ gridTemplateColumns: '2fr 0.9fr 1fr 1fr 1fr 1.1fr 52px' }}>

                    {/* Empresa: avatar + ticker + name */}
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-[11px] font-bold text-white"
                        style={{ background: avatarBg }}
                      >
                        {initials}
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: 'var(--ink)', fontFamily: 'ui-monospace, monospace' }}>
                          {pos.ticker}
                        </p>
                        <p className="text-[11px] truncate max-w-[140px]" style={{ color: 'var(--ink-3)' }}>
                          {q?.name ?? '…'}
                        </p>
                      </div>
                    </div>

                    {/* Cant. */}
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{pos.shares}</p>
                    </div>

                    {/* Precio hoy */}
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                        {currentPrice !== null ? fmtUSD(currentPrice) : (loadingQ ? '…' : '—')}
                      </p>
                      {changePct !== null && (
                        <p className="text-[10px] font-semibold tabular-nums" style={{ color: todayUp ? 'var(--mint)' : 'var(--coral)' }}>
                          {fmtPct(changePct)}
                        </p>
                      )}
                    </div>

                    {/* Valor */}
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                        {currentValue !== null ? fmtUSD(currentValue) : '—'}
                      </p>
                    </div>

                    {/* Invertido */}
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>
                        {fmtUSD(costBasis)}
                      </p>
                      <p className="text-[10px] tabular-nums" style={{ color: 'var(--ink-3)' }}>@{fmtUSD(pos.avg_cost_usd)}</p>
                    </div>

                    {/* Retorno */}
                    <div className="text-right">
                      {gainUsd !== null ? (
                        <>
                          <p className="text-sm font-bold tabular-nums" style={{ color: isUp ? 'var(--mint)' : 'var(--coral)' }}>
                            {fmtUSDSigned(gainUsd)}
                          </p>
                          {gainPct !== null && (
                            <div className="flex items-center justify-end gap-0.5 text-[10px] font-semibold"
                              style={{ color: isUp ? 'var(--mint)' : 'var(--coral)' }}>
                              {isUp ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                              {fmtPct(gainPct, false)}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-sm" style={{ color: 'var(--ink-3)' }}>—</span>
                      )}
                    </div>

                    {/* Actions hover-only + Chevron */}
                    <div className="flex items-center justify-end gap-0.5">
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={e => { e.stopPropagation(); openEdit(pos) }}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: 'var(--ink-3)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); deletePosition(pos.id) }}
                          disabled={deletingId === pos.id}
                          className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                          style={{ color: 'var(--ink-3)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--coral)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <ChevronRight
                        className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                        style={{ color: 'var(--ink-3)' }}
                      />
                    </div>
                  </div>

                  {/* Mobile row */}
                  <div className="lg:hidden flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-[11px] font-bold text-white"
                      style={{ background: avatarBg }}
                    >
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: 'var(--ink)', fontFamily: 'ui-monospace, monospace' }}>{pos.ticker}</span>
                        {changePct !== null && (
                          <span className="text-[10px] font-semibold" style={{ color: todayUp ? 'var(--mint)' : 'var(--coral)' }}>
                            {fmtPct(changePct)} hoy
                          </span>
                        )}
                      </div>
                      <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                        {pos.shares} acc. · {currentPrice !== null ? fmtUSD(currentPrice) : '—'}
                      </p>
                    </div>
                    <div className="text-right shrink-0 min-w-[72px]">
                      {gainUsd !== null ? (
                        <>
                          <p className="text-sm font-bold tabular-nums" style={{ color: isUp ? 'var(--mint)' : 'var(--coral)' }}>
                            {fmtUSDSigned(gainUsd)}
                          </p>
                          {gainPct !== null && (
                            <p className="text-[10px] font-semibold" style={{ color: isUp ? 'var(--mint)' : 'var(--coral)' }}>
                              {fmtPct(gainPct, false)}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>{fmtUSD(costBasis)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={e => { e.stopPropagation(); openEdit(pos) }} className="p-1.5 rounded-lg" style={{ color: 'var(--ink-3)' }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); deletePosition(pos.id) }} disabled={deletingId === pos.id}
                        className="p-1.5 rounded-lg disabled:opacity-50" style={{ color: 'var(--ink-3)' }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 ml-1" style={{ color: 'var(--ink-3)' }} />
                    </div>
                  </div>

                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-4 lg:px-6 py-2.5 border-t flex items-center justify-between text-[10px]" style={{ borderColor: 'var(--border)', color: 'var(--ink-3)' }}>
            <span>Fuente: Finnhub · precios en USD</span>
            {usdClp && <span>1 USD = {formatCLP(Math.round(usdClp))} CLP</span>}
          </div>
        </div>
      )}

      {/* ── Alertas de precio (teaser) ───────────────────────────────────── */}
      <div
        className="card flex items-center gap-4 px-5 py-4"
        style={{ opacity: 0.75 }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--primary-soft)' }}
        >
          <Bell className="w-4 h-4" style={{ color: 'var(--primary)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Alertas de precio</p>
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
              style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
            >
              Próximamente
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
            Te avisaremos cuando una acción suba o baje del precio que definas.
          </p>
        </div>
        <p className="text-xs font-semibold shrink-0" style={{ color: 'var(--ink-3)' }}>Configurar →</p>
      </div>

    </div>
  )
}
