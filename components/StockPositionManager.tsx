'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, RefreshCw, TrendingUp, Pencil,
  Trash2, Check, AlertCircle, Bell, ArrowUp, ArrowDown, ChevronRight,
} from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import type { StockPosition } from '@/app/(dashboard)/inversiones/page'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Quote {
  price:         number
  changePercent: number
  name:          string
  currency:      string
  history7d?:    number[]
}
type Quotes = Record<string, Quote>

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
}: {
  values: number[]
  w?: number
  h?: number
  color: string
  strokeWidth?: number
}) {
  if (values.length < 2) {
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
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
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={2} fill={color} />
    </svg>
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
  const supabase = createClient()

  const [positions,   setPositions]   = useState<StockPosition[]>(initialPositions)
  const [quotes,      setQuotes]      = useState<Quotes>({})
  const [usdClp,      setUsdClp]      = useState<number | null>(null)
  const [loadingQ,    setLoadingQ]    = useState(false)
  const [quotesError, setQuotesError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [secsAgo,     setSecsAgo]     = useState(0)

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

  useEffect(() => {
    if (positions.length) fetchQuotes(positions.map(p => p.ticker))
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

  // Portfolio 7d sparkline: sum shares × price[d] per day
  const histLens = positions.map(p => quotes[p.ticker]?.history7d?.length ?? 0).filter(l => l > 0)
  const histLen  = histLens.length === positions.length && histLens.length > 0 ? Math.min(...histLens) : 0
  const portfolioHistory: number[] = histLen > 1
    ? Array.from({ length: histLen }, (_, d) =>
        positions.reduce((s, p) => s + p.shares * (quotes[p.ticker]?.history7d?.[d] ?? p.avg_cost_usd), 0)
      )
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

        {/* Estado en vivo / error */}
        <div className="flex items-center gap-2 min-w-0">
          {lastUpdated && !quotesError && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ background: 'var(--mint)' }} />
              <span style={{ color: 'var(--mint)' }}>En vivo</span>
              <span style={{ color: 'var(--ink-3)' }}>
                · hace {secsAgo < 60 ? `${secsAgo}s` : `${Math.floor(secsAgo / 60)}m`}
              </span>
            </div>
          )}
          {quotesError && (
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--coral)' }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{quotesError}</span>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 shrink-0">
          {positions.length > 0 && (
            <button
              onClick={() => fetchQuotes(positions.map(p => p.ticker))}
              disabled={loadingQ}
              title="Actualizar precios"
              className="p-2 rounded-xl border transition-colors disabled:opacity-40"
              style={{ color: 'var(--ink-3)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingQ ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all active:scale-[.97]"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Agregar acción
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

      {/* ── Hero card (ancho completo) ────────────────────────────────────── */}
      {positions.length > 0 && (
        <div className="card overflow-hidden p-5 lg:p-6 flex flex-col hero-gradient" style={{ minHeight: 180 }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Valor del portafolio
          </p>

          {/* Valor + badge + chip en una línea */}
          <div className="flex items-center flex-wrap gap-2 lg:gap-3 mb-1">
            <p className="text-4xl lg:text-5xl font-bold tabular-nums leading-none" style={{ fontFamily: 'Fredoka, sans-serif', color: 'white' }}>
              {hasQ ? fmtUSD(totalValueUsd) : fmtUSD(totalCostUsd)}
            </p>
            <span className="px-2 py-1 rounded-lg text-xs font-bold self-center" style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}>
              USD
            </span>
            {hasQ && (
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs lg:text-sm font-semibold self-center"
                style={{
                  background: totalGainUsd >= 0 ? 'rgba(31,190,141,0.22)' : 'rgba(255,111,97,0.22)',
                  color: 'white',
                }}
              >
                {totalGainUsd >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                {fmtUSDSigned(totalGainUsd)} ({fmtPct(totalGainPct)}) ganancia total
              </div>
            )}
          </div>

          {totalValueClp && (
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
              ≈ {formatCLP(totalValueClp)} CLP
            </p>
          )}

          {/* Sparkline del portfolio ocupa todo el ancho */}
          {portfolioHistory.length >= 2 ? (
            <div className="mt-4 -mb-3 -mx-3 lg:-mx-4">
              <Sparkline
                values={portfolioHistory}
                w={900} h={64}
                color="rgba(255,194,60,0.9)"
                strokeWidth={2}
              />
            </div>
          ) : (
            <div className="mt-4" />
          )}
        </div>
      )}

      {/* ── KPI row (4 columnas) ─────────────────────────────────────────── */}
      {positions.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

          {/* Invertido */}
          <div className="card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Invertido</p>
            <p className="text-xl font-extrabold tabular-nums leading-tight" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>
              {fmtUSD(totalCostUsd)}
            </p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--ink-3)' }}>costo de compra</p>
          </div>

          {/* Cambio de hoy */}
          <div className="card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Cambio de hoy</p>
            <p className="text-xl font-extrabold tabular-nums leading-tight" style={{
              fontFamily: 'Fredoka, sans-serif',
              color: hasQ ? (todayChangeUsd >= 0 ? 'var(--mint)' : 'var(--coral)') : 'var(--ink)',
            }}>
              {hasQ ? fmtUSDSigned(todayChangeUsd) : '—'}
            </p>
            {hasQ && (
              <div className="flex items-center gap-1 mt-1">
                {todayChangeUsd >= 0
                  ? <ArrowUp className="w-3 h-3" style={{ color: 'var(--mint)' }} />
                  : <ArrowDown className="w-3 h-3" style={{ color: 'var(--coral)' }} />}
                <p className="text-[10px] font-semibold" style={{ color: todayChangeUsd >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                  {fmtPct(todayChangePct)} hoy
                </p>
              </div>
            )}
          </div>

          {/* Posiciones */}
          <div className="card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Posiciones</p>
            <p className="text-xl font-extrabold leading-tight" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>
              {positions.length}
            </p>
            {hasQ && (posUp > 0 || posDown > 0) && (
              <div className="flex items-center gap-2 mt-1 text-[10px] font-semibold">
                {posUp   > 0 && <span style={{ color: 'var(--mint)' }}>{posUp}↑</span>}
                {posDown > 0 && <span style={{ color: 'var(--coral)' }}>{posDown}↓</span>}
                <span style={{ color: 'var(--ink-3)' }}>hoy</span>
              </div>
            )}
          </div>

          {/* Mejor posición */}
          <div className="card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Mejor posición</p>
            {bestPos ? (
              <>
                <p className="text-xl font-extrabold leading-tight" style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--ink)' }}>
                  {bestPos.ticker}
                </p>
                <p className="text-[10px] font-semibold mt-1" style={{ color: bestPos.pct >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                  {fmtPct(bestPos.pct)} retorno
                </p>
              </>
            ) : (
              <p className="text-xl font-extrabold" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink-3)' }}>—</p>
            )}
          </div>
        </div>
      )}

      {/* ── Mis posiciones table ─────────────────────────────────────────── */}
      {positions.length > 0 && (
        <div className="card overflow-hidden">

          {/* Table header */}
          <div className="flex items-center justify-between px-4 lg:px-6 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Mis posiciones</p>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
              >
                {positions.length}
              </span>
            </div>
            <p className="text-[10px] flex items-center gap-1" style={{ color: 'var(--ink-3)' }}>
              <span>⊙</span> Precios vía API · cierre hoy
            </p>
          </div>

          {/* Column headers (desktop only) */}
          <div
            className="hidden lg:grid px-6 py-2 text-[10px] font-bold uppercase tracking-widest border-b"
            style={{ gridTemplateColumns: '2fr 0.9fr 1fr 1fr 1fr 1.1fr 52px', color: 'var(--ink-3)', borderColor: 'var(--border)' }}
          >
            <span>Acción</span>
            <span className="text-right">Cant.</span>
            <span className="text-center">7 días</span>
            <span className="text-right">Precio</span>
            <span className="text-right">Valor</span>
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
              const history7d    = q?.history7d ?? []
              const histTrend    = history7d.length >= 2
                ? history7d[history7d.length - 1] >= history7d[0]
                : true
              const avatarBg     = tickerColor(pos.ticker)
              const initials     = pos.ticker.slice(0, 2)

              return (
                <div key={pos.id} className="group px-4 lg:px-6 py-3 hover:bg-[var(--surface-2)] transition-colors">

                  {/* Desktop row */}
                  <div className="hidden lg:grid items-center" style={{ gridTemplateColumns: '2fr 0.9fr 1fr 1fr 1fr 1.1fr 52px' }}>

                    {/* Acción: avatar + ticker + name */}
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
                      <p className="text-[10px] tabular-nums" style={{ color: 'var(--ink-3)' }}>@{fmtUSD(pos.avg_cost_usd)}</p>
                    </div>

                    {/* 7 días sparkline */}
                    <div className="flex items-center justify-center">
                      {history7d.length >= 2 ? (
                        <Sparkline
                          values={history7d}
                          w={80} h={28}
                          color={histTrend ? '#1FBE8D' : '#FF6F61'}
                        />
                      ) : (
                        <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>—</span>
                      )}
                    </div>

                    {/* Precio actual */}
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
                      ) : '—'}
                    </div>

                    {/* Actions + Chevron */}
                    <div className="flex items-center justify-end gap-0.5">
                      {/* Editar / borrar aparecen en hover */}
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
                      {/* Chevron siempre visible */}
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
                    {history7d.length >= 2 && (
                      <Sparkline values={history7d} w={56} h={22} color={histTrend ? '#1FBE8D' : '#FF6F61'} />
                    )}
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
            <span>⊙ Precios vía API · datos del cierre</span>
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
