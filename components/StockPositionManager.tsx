'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, RefreshCw, TrendingUp, TrendingDown, Pencil,
  Trash2, Check, AlertCircle,
} from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import type { StockPosition } from '@/app/(dashboard)/inversiones/page'

interface Quote {
  price:         number
  changePercent: number
  name:          string
  currency:      string
}
type Quotes = Record<string, Quote>

// ── Style helpers ─────────────────────────────────────────────────────────────
const inputBase: React.CSSProperties = {
  color:        'var(--ink)',
  background:   'var(--surface-2)',
  borderColor:  'var(--border)',
  borderRadius:  12,
  outline:      'none',
  transition:   'border-color 150ms, box-shadow 150ms',
}
function focusOn(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'var(--primary)'
  e.currentTarget.style.boxShadow   = '0 0 0 3px var(--primary-soft)'
}
function focusOff(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'var(--border)'
  e.currentTarget.style.boxShadow   = 'none'
}

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', {
    style:                 'currency',
    currency:              'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}
function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  userId:           string
  initialPositions: StockPosition[]
}

interface FormState {
  ticker:     string
  shares:     string
  avgCostUsd: string
  notes:      string
}

const emptyForm: FormState = { ticker: '', shares: '', avgCostUsd: '', notes: '' }

export default function StockPositionManager({ userId, initialPositions }: Props) {
  const supabase = createClient()

  const [positions,    setPositions]    = useState<StockPosition[]>(initialPositions)
  const [quotes,       setQuotes]       = useState<Quotes>({})
  const [usdClp,       setUsdClp]       = useState<number | null>(null)
  const [loadingQ,     setLoadingQ]     = useState(false)
  const [quotesError,  setQuotesError]  = useState('')
  const [lastUpdated,  setLastUpdated]  = useState<Date | null>(null)

  const [showForm,  setShowForm]  = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form,      setForm]      = useState<FormState>(emptyForm)
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState('')
  const [deletingId,setDeletingId]= useState<string | null>(null)

  const fetchQuotes = useCallback(async (tickers: string[]) => {
    if (!tickers.length) return
    setLoadingQ(true)
    setQuotesError('')
    try {
      const res = await fetch(`/api/stock-price?symbols=${tickers.join(',')}`)
      if (!res.ok) throw new Error('fetch failed')
      const data: Quotes = await res.json()
      setUsdClp(data['USDCLP=X']?.price ?? null)
      setQuotes(data)
      setLastUpdated(new Date())
    } catch {
      setQuotesError('No se pudieron obtener los precios. Intenta de nuevo.')
    } finally {
      setLoadingQ(false)
    }
  }, [])

  // Fetch on mount when there are positions
  useEffect(() => {
    if (positions.length) fetchQuotes(positions.map(p => p.ticker))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Computed totals ───────────────────────────────────────────────────────
  const hasQuotes    = Object.keys(quotes).length > 1 // more than just USDCLP=X
  const totalCostUsd = positions.reduce((s, p) => s + p.shares * p.avg_cost_usd, 0)
  const totalValueUsd= positions.reduce((s, p) => {
    const q = quotes[p.ticker]
    return s + p.shares * (q?.price ?? p.avg_cost_usd)
  }, 0)
  const totalGainUsd = totalValueUsd - totalCostUsd
  const totalGainPct = totalCostUsd > 0 ? (totalGainUsd / totalCostUsd) * 100 : 0
  const totalValueClp= usdClp ? Math.round(totalValueUsd * usdClp) : null

  // Today's portfolio change: sum of (shares × price × changePct/100) per position
  const todayChangeUsd = positions.reduce((s, p) => {
    const q = quotes[p.ticker]
    if (!q || !q.changePercent) return s
    return s + p.shares * q.price * (q.changePercent / 100)
  }, 0)

  // ── CRUD helpers ─────────────────────────────────────────────────────────
  function openAdd() {
    setForm(emptyForm); setEditingId(null); setFormError(''); setShowForm(true)
  }
  function openEdit(pos: StockPosition) {
    setForm({ ticker: pos.ticker, shares: String(pos.shares), avgCostUsd: String(pos.avg_cost_usd), notes: pos.notes ?? '' })
    setEditingId(pos.id); setFormError(''); setShowForm(true)
  }
  function cancelForm() {
    setShowForm(false); setEditingId(null); setForm(emptyForm); setFormError('')
  }

  async function savePosition() {
    const ticker  = form.ticker.trim().toUpperCase()
    const shares  = parseFloat(form.shares)
    const avgCost = parseFloat(form.avgCostUsd)

    if (!ticker || !/^[A-Z0-9.\-]{1,10}$/.test(ticker)) { setFormError('Ticker inválido (ej: AAPL, BRK.B)'); return }
    if (isNaN(shares) || shares <= 0)                    { setFormError('Número de acciones inválido'); return }
    if (isNaN(avgCost) || avgCost <= 0)                  { setFormError('Precio de compra inválido'); return }

    setSaving(true); setFormError('')

    if (editingId) {
      const { error } = await supabase
        .from('stock_positions')
        .update({ shares, avg_cost_usd: avgCost, notes: form.notes.trim() || null, updated_at: new Date().toISOString() })
        .eq('id', editingId).eq('user_id', userId)

      setSaving(false)
      if (error) { setFormError('Error al guardar'); return }
      setPositions(prev => prev.map(p =>
        p.id === editingId ? { ...p, shares, avg_cost_usd: avgCost, notes: form.notes.trim() || null } : p
      ))
    } else {
      const { data, error } = await supabase
        .from('stock_positions')
        .upsert(
          { user_id: userId, ticker, shares, avg_cost_usd: avgCost, notes: form.notes.trim() || null },
          { onConflict: 'user_id,ticker' }
        )
        .select().single()

      setSaving(false)
      if (error) { setFormError('Error al guardar'); return }

      const newPos = data as StockPosition
      setPositions(prev => {
        const exists = prev.findIndex(p => p.ticker === ticker)
        return exists >= 0
          ? prev.map(p => p.ticker === ticker ? newPos : p)
          : [newPos, ...prev]
      })
      // Fetch quote for the new ticker too
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

      {/* ── KPI summary (only when positions exist) ─────────────────────── */}
      {positions.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

          <div className="card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Valor total</p>
            <p className="text-xl font-extrabold tabular-nums leading-tight" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>
              {hasQuotes ? fmtUSD(totalValueUsd) : '—'}
            </p>
            {totalValueClp !== null && (
              <p className="text-[11px] mt-0.5 tabular-nums" style={{ color: 'var(--ink-3)' }}>≈ {formatCLP(totalValueClp)}</p>
            )}
          </div>

          <div className="card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Invertido</p>
            <p className="text-xl font-extrabold tabular-nums leading-tight" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>
              {fmtUSD(totalCostUsd)}
            </p>
          </div>

          <div className="card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Ganancia total</p>
            <div className="flex items-center gap-1.5">
              {hasQuotes && (totalGainUsd >= 0
                ? <TrendingUp  className="w-4 h-4" style={{ color: 'var(--mint)'  }} />
                : <TrendingDown className="w-4 h-4" style={{ color: 'var(--coral)' }} />
              )}
              <p className="text-xl font-extrabold tabular-nums leading-tight" style={{
                fontFamily: 'Fredoka, sans-serif',
                color: hasQuotes ? (totalGainUsd >= 0 ? 'var(--mint)' : 'var(--coral)') : 'var(--ink)',
              }}>
                {hasQuotes ? fmtUSD(totalGainUsd) : '—'}
              </p>
            </div>
            {hasQuotes && (
              <p className="text-[11px] mt-0.5 font-semibold tabular-nums" style={{ color: totalGainPct >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                {fmtPct(totalGainPct)}
              </p>
            )}
          </div>

          <div className="card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Cambio hoy</p>
            <p className="text-xl font-extrabold tabular-nums leading-tight" style={{
              fontFamily: 'Fredoka, sans-serif',
              color: hasQuotes ? (todayChangeUsd >= 0 ? 'var(--mint)' : 'var(--coral)') : 'var(--ink)',
            }}>
              {hasQuotes ? fmtUSD(todayChangeUsd) : '—'}
            </p>
          </div>

        </div>
      )}

      {/* ── Main card ───────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">

        {/* Card header */}
        <div
          className="flex items-center justify-between px-4 lg:px-6 py-3 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
              {positions.length} {positions.length === 1 ? 'posición' : 'posiciones'}
            </p>
            {lastUpdated && (
              <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                {lastUpdated.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {positions.length > 0 && (
              <button
                onClick={() => fetchQuotes(positions.map(p => p.ticker))}
                disabled={loadingQ}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-xl transition-colors disabled:opacity-50"
                style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
              >
                <RefreshCw className={`w-3 h-3 ${loadingQ ? 'animate-spin' : ''}`} />
                {loadingQ ? 'Actualizando…' : 'Actualizar'}
              </button>
            )}
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all active:scale-[.97]"
              style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 4px 12px var(--shadow)' }}
            >
              <Plus className="w-3.5 h-3.5" /> Agregar
            </button>
          </div>
        </div>

        {/* Error */}
        {quotesError && (
          <div
            className="flex items-center gap-2 px-4 py-3 text-sm"
            style={{ background: 'rgba(255,111,97,0.08)', color: 'var(--coral)' }}
          >
            <AlertCircle className="w-4 h-4 shrink-0" /> {quotesError}
          </div>
        )}

        {/* Add / Edit form */}
        {showForm && (
          <div className="px-4 lg:px-6 py-4 border-b" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--ink-3)' }}>
              {editingId ? 'Editar posición' : 'Nueva posición'}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--ink-3)' }}>Ticker</label>
                <input
                  type="text"
                  value={form.ticker}
                  onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                  placeholder="AAPL"
                  maxLength={10}
                  disabled={!!editingId}
                  className="w-full text-sm font-bold border px-3 py-2 disabled:opacity-50"
                  style={{ ...inputBase, fontFamily: 'ui-monospace, monospace' }}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--ink-3)' }}>N° acciones</label>
                <input
                  type="number"
                  value={form.shares}
                  onChange={e => setForm(f => ({ ...f, shares: e.target.value }))}
                  placeholder="10"
                  min="0.0001"
                  step="any"
                  className="w-full text-sm border px-3 py-2"
                  style={inputBase}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--ink-3)' }}>Precio compra (USD)</label>
                <input
                  type="number"
                  value={form.avgCostUsd}
                  onChange={e => setForm(f => ({ ...f, avgCostUsd: e.target.value }))}
                  placeholder="150.00"
                  min="0.01"
                  step="0.01"
                  className="w-full text-sm border px-3 py-2"
                  style={inputBase}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--ink-3)' }}>Nota (opcional)</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="ej: compra inicial"
                  maxLength={80}
                  className="w-full text-sm border px-3 py-2"
                  style={inputBase}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

            </div>

            {/* Cost preview */}
            {form.shares && form.avgCostUsd && parseFloat(form.shares) > 0 && parseFloat(form.avgCostUsd) > 0 && (
              <p className="text-xs mb-3 font-semibold tabular-nums" style={{ color: 'var(--ink-3)' }}>
                Inversión total: {fmtUSD(parseFloat(form.shares) * parseFloat(form.avgCostUsd))}
              </p>
            )}

            {formError && (
              <p className="text-xs mb-2 font-medium" style={{ color: 'var(--coral)' }}>{formError}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={savePosition}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold transition-all disabled:opacity-50 active:scale-[.98]"
                style={{ background: 'var(--primary)', color: 'var(--primary-ink)', borderRadius: 10, boxShadow: '0 6px 14px var(--shadow)' }}
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                onClick={cancelForm}
                className="px-4 py-2 text-xs font-semibold border transition-colors"
                style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', borderRadius: 10, background: 'var(--surface)' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {positions.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'var(--primary-soft)' }}>
              <TrendingUp className="w-6 h-6" style={{ color: 'var(--primary)' }} />
            </div>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink-2)' }}>Sin posiciones</p>
            <p className="text-xs mb-4" style={{ color: 'var(--ink-3)' }}>Agregá tus acciones para hacer seguimiento de tu portfolio.</p>
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl"
              style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 14px var(--shadow)' }}
            >
              <Plus className="w-4 h-4" /> Agregar primera acción
            </button>
          </div>
        )}

        {/* ── Table ──────────────────────────────────────────────────────── */}
        {positions.length > 0 && (
          <>
            {/* Desktop column headers */}
            <div
              className="hidden lg:grid px-6 py-2 text-[10px] font-bold uppercase tracking-widest"
              style={{
                gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 1fr 72px',
                color: 'var(--ink-3)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span>Empresa</span>
              <span className="text-right">Acciones</span>
              <span className="text-right">Costo prom.</span>
              <span className="text-right">Precio actual</span>
              <span className="text-right">Cambio hoy</span>
              <span className="text-right">Valor</span>
              <span className="text-right">Ganancia</span>
              <span></span>
            </div>

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

                return (
                  <div key={pos.id} className="px-4 lg:px-6 py-3">

                    {/* ── Desktop row ─────────────────────────────────── */}
                    <div
                      className="hidden lg:grid items-center"
                      style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 1fr 72px' }}
                    >
                      {/* Empresa + ticker */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-lg tabular-nums"
                            style={{ background: 'var(--primary-soft)', color: 'var(--primary)', fontFamily: 'ui-monospace, monospace' }}
                          >
                            {pos.ticker}
                          </span>
                          {q && (
                            <span className="text-sm font-medium truncate max-w-[160px]" style={{ color: 'var(--ink)' }}>
                              {q.name}
                            </span>
                          )}
                        </div>
                        {pos.notes && (
                          <p className="text-[10px] mt-0.5 ml-0.5" style={{ color: 'var(--ink-3)' }}>{pos.notes}</p>
                        )}
                      </div>

                      <span className="text-sm tabular-nums text-right font-semibold" style={{ color: 'var(--ink)' }}>
                        {pos.shares}
                      </span>
                      <span className="text-sm tabular-nums text-right" style={{ color: 'var(--ink-2)' }}>
                        {fmtUSD(pos.avg_cost_usd)}
                      </span>
                      <span className="text-sm tabular-nums text-right font-semibold" style={{ color: 'var(--ink)' }}>
                        {currentPrice !== null ? fmtUSD(currentPrice) : (loadingQ ? '…' : '—')}
                      </span>
                      <span
                        className="text-sm tabular-nums text-right font-semibold"
                        style={{ color: changePct !== null ? (todayUp ? 'var(--mint)' : 'var(--coral)') : 'var(--ink-3)' }}
                      >
                        {changePct !== null ? fmtPct(changePct) : '—'}
                      </span>
                      <span className="text-sm tabular-nums text-right font-semibold" style={{ color: 'var(--ink)' }}>
                        {currentValue !== null ? fmtUSD(currentValue) : '—'}
                      </span>

                      {/* Ganancia */}
                      <div className="text-right">
                        {gainUsd !== null ? (
                          <>
                            <p className="text-sm tabular-nums font-bold" style={{ color: isUp ? 'var(--mint)' : 'var(--coral)' }}>
                              {fmtUSD(gainUsd)}
                            </p>
                            {gainPct !== null && (
                              <p className="text-[10px] font-semibold" style={{ color: isUp ? 'var(--mint)' : 'var(--coral)' }}>
                                {fmtPct(gainPct)}
                              </p>
                            )}
                          </>
                        ) : '—'}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(pos)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: 'var(--ink-3)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deletePosition(pos.id)}
                          disabled={deletingId === pos.id}
                          className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                          style={{ color: 'var(--ink-3)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--coral)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* ── Mobile row ──────────────────────────────────── */}
                    <div className="lg:hidden flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-lg shrink-0"
                            style={{ background: 'var(--primary-soft)', color: 'var(--primary)', fontFamily: 'ui-monospace, monospace' }}
                          >
                            {pos.ticker}
                          </span>
                          {q && (
                            <span className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{q.name}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--ink-3)' }}>
                          <span>{pos.shares} acc.</span>
                          {currentPrice !== null && <span style={{ color: 'var(--ink-2)' }}>{fmtUSD(currentPrice)}</span>}
                          {changePct !== null && (
                            <span className="font-semibold" style={{ color: todayUp ? 'var(--mint)' : 'var(--coral)' }}>
                              {fmtPct(changePct)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {gainUsd !== null ? (
                          <>
                            <p className="text-sm font-bold tabular-nums" style={{ color: isUp ? 'var(--mint)' : 'var(--coral)' }}>
                              {fmtUSD(gainUsd)}
                            </p>
                            {gainPct !== null && (
                              <p className="text-[11px] tabular-nums" style={{ color: isUp ? 'var(--mint)' : 'var(--coral)' }}>
                                {fmtPct(gainPct)}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>{fmtUSD(costBasis)}</p>
                        )}
                      </div>

                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => openEdit(pos)} className="p-1.5 rounded-lg" style={{ color: 'var(--ink-3)' }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deletePosition(pos.id)} disabled={deletingId === pos.id} className="p-1.5 rounded-lg disabled:opacity-50" style={{ color: 'var(--ink-3)' }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                  </div>
                )
              })}
            </div>

            {/* Exchange rate footnote */}
            {usdClp && (
              <div
                className="px-4 lg:px-6 py-2.5 border-t text-[10px]"
                style={{ borderColor: 'var(--border)', color: 'var(--ink-3)' }}
              >
                Tipo de cambio: 1 USD = {formatCLP(Math.round(usdClp))} CLP · Precios en tiempo real de Yahoo Finance
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
