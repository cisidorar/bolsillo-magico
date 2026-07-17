'use client'

import { useState, useEffect, type Dispatch, type SetStateAction } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Check, DollarSign, Trash2 } from 'lucide-react'
import type { StockPosition, StockSale, StockPurchase } from '@/app/(dashboard)/inversiones/page'
import { positionSizeUsd, type TechnicalAnalysis } from '@/lib/technical'
import { useToast } from '@/components/ToastProvider'

// ── U4 (roadmap UX): modal SOLO transaccional — extraído de
// StockPositionManager.tsx. Ya no es la puerta de entrada a la información
// (eso vive en TechnicalDetail); se invoca desde ahí con un modo explícito.
// Toda la lógica de dinero (tope de billetera, costo promedio ponderado,
// venta parcial, reset del trailing stop, inserts en stock_purchases/
// stock_sales/usd_purchases) se preserva funcionalmente idéntica al original.

export type TransactionMode = 'new' | 'buyMore' | 'sell' | 'edit' | 'delete'

interface Quote { price: number; changePercent?: number; name?: string; domain?: string }

function fmtUSD(n: number): string {
  return '$' + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(n: number, showSign = true): string {
  const s = Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return showSign ? (n >= 0 ? `+${s}%` : `-${s}%`) : `${s}%`
}

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

interface Props {
  userId:        string
  mode:          TransactionMode
  /** Ticker de la posición existente (buyMore/sell/edit/delete). null solo para 'new'. */
  ticker:        string | null
  positions:     StockPosition[]
  setPositions:  Dispatch<SetStateAction<StockPosition[]>>
  purchases:     StockPurchase[]
  setPurchases:  Dispatch<SetStateAction<StockPurchase[]>>
  sales:         StockSale[]
  setSales:      Dispatch<SetStateAction<StockSale[]>>
  /** Σ movimientos USD de la billetera (aportes + ventas). 0 = billetera sin uso → no se valida. */
  walletUsdBase: number
  quotes:        Record<string, Quote>
  posAnalyses:   Record<string, TechnicalAnalysis | 'loading' | 'error'>
  onClose:       () => void
  /** Se llama tras un guardado exitoso — Radar puede refrescar quotes/analysis del ticker. */
  onDone?:       (ticker: string) => void
  /** I1 (roadmap interacción): al abrir desde una sugerencia con monto ("Compra
   *  hasta US$450 de NVDA"), llega pre-lleno — sin esto había que re-tipear a
   *  mano el número que la propia app acababa de calcular. Las acciones se
   *  derivan del precio en vivo; el usuario igual puede editar todo. */
  prefill?:      { totalUsd?: number }
}

export default function TransactionModal({
  userId, mode, ticker, positions, setPositions, purchases, setPurchases, sales, setSales,
  walletUsdBase, quotes, posAnalyses, onClose, onDone, prefill,
}: Props) {
  const supabase = createClient()
  const pos = ticker ? positions.find(p => p.ticker === ticker) ?? null : null
  const { showToast } = useToast()

  const [form,       setForm]       = useState({ ticker: ticker ?? '', shares: '', totalPaid: '', notes: '' })
  const [saving,     setSaving]     = useState(false)
  const [formError,  setFormError]  = useState('')
  const [deleting,   setDeleting]   = useState(false)

  const [sellUsd,    setSellUsd]    = useState('')
  const [sellPrice,  setSellPrice]  = useState('')
  const [sellShares, setSellShares] = useState('')
  const [sellDate,   setSellDate]   = useState('')

  const [buyShares,    setBuyShares]    = useState('')
  const [buyTotalPaid, setBuyTotalPaid] = useState('')
  const [buyDate,      setBuyDate]      = useState('')

  // Prefill según modo, al abrir
  useEffect(() => {
    if (mode === 'edit' && pos) {
      setForm({ ticker: pos.ticker, shares: String(pos.shares), totalPaid: (pos.shares * pos.avg_cost_usd).toFixed(2), notes: pos.notes ?? '' })
    } else if (mode === 'new') {
      const suggestedUsd = prefill?.totalUsd
      const live = ticker ? quotes[ticker]?.price : undefined
      const suggestedShares = suggestedUsd && live ? (suggestedUsd / live).toFixed(6).replace(/\.?0+$/, '') : ''
      setForm({ ticker: ticker ?? '', shares: suggestedShares, totalPaid: suggestedUsd ? suggestedUsd.toFixed(2) : '', notes: '' })
    } else if (mode === 'sell' && pos) {
      const q = quotes[pos.ticker]
      const price = q?.price ?? pos.avg_cost_usd
      setSellShares(String(Number(pos.shares.toFixed(6))))
      setSellPrice(price.toFixed(2))
      setSellUsd((price * pos.shares).toFixed(2))
      setSellDate(new Date().toISOString().slice(0, 10))
    } else if (mode === 'buyMore') {
      const suggestedUsd = prefill?.totalUsd
      const live = pos ? quotes[pos.ticker]?.price : undefined
      const suggestedShares = suggestedUsd && live ? (suggestedUsd / live).toFixed(6).replace(/\.?0+$/, '') : ''
      setBuyShares(suggestedShares)
      setBuyTotalPaid(suggestedUsd ? suggestedUsd.toFixed(2) : '')
      setBuyDate(new Date().toISOString().slice(0, 10))
    }
    setFormError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, ticker])

  // Escape cierra
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Billetera disponible — mismo cálculo que Radar/StockPositionManager ──
  const fundedCostUsd = positions.reduce((s, p) => s + Number(p.wallet_cost_usd ?? 0), 0)
  const walletAvailable = walletUsdBase > 0 ? walletUsdBase - fundedCostUsd : null

  const totalValueUsd = positions.reduce((s, p) => {
    const q = quotes[p.ticker]
    return s + p.shares * (q?.price ?? p.avg_cost_usd)
  }, 0)

  function sizingFor(tk: string): { maxUsd: number; stop: number; distPct: number } | null {
    const pa = posAnalyses[tk]
    if (typeof pa !== 'object') return null
    const live  = quotes[tk]?.price ?? pa.price
    const p     = positions.find(x => x.ticker === tk)
    const trail = p?.trail_stop_usd != null ? Number(p.trail_stop_usd) : null
    const stopRaw = Math.max(pa.alarm ?? -Infinity, trail ?? -Infinity)
    const stop  = Number.isFinite(stopRaw) ? stopRaw : null
    const portfolio = totalValueUsd + Math.max(0, walletAvailable ?? 0)
    const s = positionSizeUsd(portfolio, live, stop)
    return s ? { maxUsd: s.maxUsd, stop: stop as number, distPct: s.stopDistPct } : null
  }

  // ── Guardar (nueva posición o editar campos crudos) ─────────────────────
  async function savePosition() {
    const tk         = form.ticker.trim().toUpperCase()
    const shares     = parseFloat(form.shares)
    const totalPaid  = parseFloat(form.totalPaid)
    if (!tk || !/^[A-Z0-9.\-]{1,10}$/.test(tk)) { setFormError('Ticker inválido (ej: AAPL, BRK.B)'); return }
    if (isNaN(shares)    || shares    <= 0) { setFormError('Número de acciones inválido'); return }
    if (isNaN(totalPaid) || totalPaid <= 0) { setFormError('Total pagado inválido'); return }
    const avgCost = totalPaid / shares

    const isEdit = mode === 'edit' && pos !== null

    // Tope de billetera: no puedes invertir USD que no aportaste.
    // Solo aplica en compras nuevas y si la billetera está en uso (base > 0).
    if (!isEdit && walletAvailable !== null && totalPaid > walletAvailable + 0.01) {
      setFormError(
        `Billetera insuficiente: tienes ${fmtUSD(Math.max(0, walletAvailable))} disponibles y esta compra cuesta ${fmtUSD(totalPaid)}. ` +
        'Registra un aporte en Inversiones → Ahorro → Billetera en dólares, o ajusta el monto.'
      )
      return
    }

    // Bug #3 (preservado): avisar si el ticker nuevo ya existe (evita upsert silencioso)
    if (!isEdit) {
      const duplicate = positions.find(p => p.ticker === tk)
      if (duplicate) {
        setFormError(`Ya tenés ${tk} en el portafolio. Abrí esa posición para editarla.`)
        return
      }
    }

    setSaving(true); setFormError('')
    if (isEdit && pos) {
      const { error } = await supabase.from('stock_positions')
        .update({ ticker: tk, shares, avg_cost_usd: avgCost, notes: form.notes.trim() || null, updated_at: new Date().toISOString() })
        .eq('id', pos.id).eq('user_id', userId)
      setSaving(false)
      if (error) { setFormError('Error al guardar'); return }
      setPositions(prev => prev.map(p => p.id === pos.id
        ? { ...p, ticker: tk, shares, avg_cost_usd: avgCost, notes: form.notes.trim() || null }
        : p
      ))
    } else {
      const { data, error } = await supabase.from('stock_positions')
        .upsert({
          user_id: userId, ticker: tk, shares, avg_cost_usd: avgCost, notes: form.notes.trim() || null,
          // Con billetera activa, la compra nueva sale de ella y descuenta del saldo
          wallet_funded:   walletUsdBase > 0,
          wallet_cost_usd: walletUsdBase > 0 ? Math.round(totalPaid * 100) / 100 : 0,
        }, { onConflict: 'user_id,ticker' })
        .select().single()
      setSaving(false)
      if (error) { setFormError('Error al guardar'); return }
      const newPos = data as StockPosition
      setPositions(prev => {
        const idx = prev.findIndex(p => p.ticker === tk)
        return idx >= 0 ? prev.map(p => p.ticker === tk ? newPos : p) : [newPos, ...prev]
      })

      // Registro histórico de la compra — para el timeline de "Movimientos"
      const { data: purchaseRow, error: purchaseErr } = await supabase.from('stock_purchases')
        .insert({
          user_id: userId, ticker: tk, shares, total_paid_usd: totalPaid,
          purchase_date: new Date().toISOString().slice(0, 10),
          notes: form.notes.trim() || null,
        })
        .select().single()
      if (purchaseErr) console.error('[stock_purchases] insert error:', purchaseErr.message)
      if (purchaseRow) setPurchases(prev => [purchaseRow as StockPurchase, ...prev])
    }
    // I2 (roadmap interacción): confirmar qué se guardó — antes el modal solo
    // se cerraba, sin decir si la compra quedó registrada.
    showToast(isEdit
      ? `Posición editada: ${tk}`
      : `Compra registrada: ${shares.toLocaleString('es-CL', { maximumFractionDigits: 6 })} acc. de ${tk} por ${fmtUSD(totalPaid)}`)
    onDone?.(tk)
    onClose()
  }

  async function deletePosition() {
    if (!pos) return
    setDeleting(true)
    await supabase.from('stock_positions').delete().eq('id', pos.id).eq('user_id', userId)
    setPositions(prev => prev.filter(p => p.id !== pos.id))
    setDeleting(false)
    showToast(`Posición eliminada: ${pos.ticker} (sin registrar venta)`)
    onClose()
  }

  /**
   * Vender: los USD recibidos SIEMPRE van a la billetera (usd_purchases,
   * kind='sell') — se haya comprado o no esa posición desde ahí, porque la
   * plata que obtienes al vender es plata real y disponible desde ahora.
   * En paralelo, registra la ganancia/pérdida realizada en stock_sales,
   * enlazada a esa fila de billetera. Soporta venta parcial: si vendes menos
   * que el total, la posición se reduce en vez de cerrarse.
   */
  async function sellPosition() {
    if (!pos) return

    const sharesSold = parseFloat(sellShares.replace(',', '.'))
    if (!Number.isFinite(sharesSold) || sharesSold <= 0 || sharesSold > pos.shares + 1e-4) {
      setFormError('Cantidad de acciones a vender inválida'); return
    }
    const proceeds = parseFloat(sellUsd.replace(',', '.'))
    if (!Number.isFinite(proceeds) || proceeds <= 0) { setFormError('¿Cuántos USD recibiste por la venta?'); return }
    if (!sellDate) { setFormError('Elegí la fecha de la venta'); return }

    setDeleting(true); setFormError('')

    const costBasis   = sharesSold * pos.avg_cost_usd
    const realizedPnl = Math.round((proceeds - costBasis) * 100) / 100
    const isFullSale  = sharesSold >= pos.shares - 1e-6

    const { data: wp, error: wErr } = await supabase.from('usd_purchases').insert({
      user_id:       userId,
      kind:          'sell',
      usd_amount:    Math.round(proceeds * 100) / 100,
      purchase_date: sellDate,
      notes:         `Venta ${pos.ticker}`,
    }).select().single()
    if (wErr) { console.error('[usd_purchases] insert error:', wErr.message); setDeleting(false); setFormError('No se pudo registrar la venta en la billetera'); return }
    const usdPurchaseId: string | null = wp?.id ?? null

    const { data: saleRow, error: saleErr } = await supabase.from('stock_sales').insert({
      user_id:          userId,
      ticker:           pos.ticker,
      shares_sold:      sharesSold,
      cost_basis_usd:   Math.round(costBasis * 100) / 100,
      proceeds_usd:     Math.round(proceeds * 100) / 100,
      realized_pnl_usd: realizedPnl,
      sale_date:        sellDate,
      notes:            null,
      usd_purchase_id:  usdPurchaseId,
    }).select().single()
    if (saleErr) { console.error('[stock_sales] insert error:', saleErr.message); setDeleting(false); setFormError('No se pudo registrar la ganancia/pérdida de la venta'); return }
    if (saleRow) setSales(prev => [saleRow as StockSale, ...prev])

    if (isFullSale) {
      await supabase.from('stock_positions').delete().eq('id', pos.id).eq('user_id', userId)
      setPositions(prev => prev.filter(p => p.id !== pos.id))
    } else {
      const remainingShares = Math.round((pos.shares - sharesSold) * 10000) / 10000
      // El costo financiado por billetera se reduce en proporción a lo vendido
      const newWalletCost = Math.round(Number(pos.wallet_cost_usd ?? 0) * (remainingShares / pos.shares) * 100) / 100
      await supabase.from('stock_positions')
        .update({
          shares: remainingShares,
          wallet_cost_usd: newWalletCost, wallet_funded: newWalletCost > 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pos.id).eq('user_id', userId)
      setPositions(prev => prev.map(p => p.id === pos.id
        ? { ...p, shares: remainingShares, wallet_cost_usd: newWalletCost, wallet_funded: newWalletCost > 0 }
        : p))
    }

    setDeleting(false)
    showToast(
      `Venta registrada: ${sharesSold.toLocaleString('es-CL', { maximumFractionDigits: 6 })} acc. de ${pos.ticker} · `
      + `${realizedPnl >= 0 ? '+' : '-'}${fmtUSD(Math.abs(realizedPnl))} · ${fmtUSD(proceeds)} volvieron a tu billetera`
    )
    onDone?.(pos.ticker)
    onClose()
  }

  /** Comprar más de un ticker que ya tenés: suma acciones y recalcula el costo promedio ponderado. */
  async function buyMorePosition() {
    if (!pos) return

    const addShares = parseFloat(buyShares.replace(',', '.'))
    if (!Number.isFinite(addShares) || addShares <= 0) { setFormError('Número de acciones inválido'); return }
    const addTotal = parseFloat(buyTotalPaid.replace(',', '.'))
    if (!Number.isFinite(addTotal) || addTotal <= 0) { setFormError('Total pagado inválido'); return }
    if (!buyDate) { setFormError('Elegí la fecha de la compra'); return }

    // Mismo tope de billetera que al agregar una posición nueva.
    if (walletAvailable !== null && addTotal > walletAvailable + 0.01) {
      setFormError(
        `Billetera insuficiente: tienes ${fmtUSD(Math.max(0, walletAvailable))} disponibles y esta compra cuesta ${fmtUSD(addTotal)}. ` +
        'Registra un aporte en Inversiones → Ahorro → Billetera en dólares, o ajusta el monto.'
      )
      return
    }

    setSaving(true); setFormError('')
    const newShares  = pos.shares + addShares
    const newAvgCost = (pos.shares * pos.avg_cost_usd + addTotal) / newShares
    // Fix contable: comprar más con billetera activa SUMA al costo financiado
    // aunque la posición original sea legacy — antes esa plata salía de la
    // billetera sin descontar nunca (saldo inflado)
    const newWalletCost = Math.round((Number(pos.wallet_cost_usd ?? 0) + (walletUsdBase > 0 ? addTotal : 0)) * 100) / 100
    const { error } = await supabase.from('stock_positions')
      .update({
        shares: newShares, avg_cost_usd: newAvgCost,
        wallet_cost_usd: newWalletCost, wallet_funded: newWalletCost > 0,
        // Comprar más cambia el perfil de la posición: el trailing acumulado
        // deja de representarla — se resetea y el cron lo recalcula esa noche
        trail_stop_usd: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pos.id).eq('user_id', userId)
    if (error) { setSaving(false); setFormError('Error al guardar'); return }
    setPositions(prev => prev.map(p => p.id === pos.id
      ? { ...p, shares: newShares, avg_cost_usd: newAvgCost, wallet_cost_usd: newWalletCost, wallet_funded: newWalletCost > 0, trail_stop_usd: null }
      : p))

    // Registro histórico de la compra — para el timeline de "Movimientos"
    const { data: purchaseRow, error: purchaseErr } = await supabase.from('stock_purchases')
      .insert({ user_id: userId, ticker: pos.ticker, shares: addShares, total_paid_usd: addTotal, purchase_date: buyDate })
      .select().single()
    if (purchaseErr) console.error('[stock_purchases] insert error:', purchaseErr.message)
    if (purchaseRow) setPurchases(prev => [purchaseRow as StockPurchase, ...prev])

    setSaving(false)
    showToast(`Compra registrada: +${addShares.toLocaleString('es-CL', { maximumFractionDigits: 6 })} acc. de ${pos.ticker} (ahora ${newShares.toLocaleString('es-CL', { maximumFractionDigits: 6 })} acc.)`)
    onDone?.(pos.ticker)
    onClose()
  }

  const title = mode === 'new' ? 'Nueva posición'
    : mode === 'buyMore' ? `Comprar más ${pos?.ticker ?? ''}`
    : mode === 'sell' ? `Vender ${pos?.ticker ?? ''}`
    : mode === 'delete' ? 'Eliminar posición'
    : `Editar ${pos?.ticker ?? ''}`

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end lg:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{ background: 'var(--surface)', maxHeight: '92dvh' }}
      >
        <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

        <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>{title}</h2>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">

          {/* ── Nueva posición / editar campos crudos ── */}
          {(mode === 'new' || mode === 'edit') && (
            <>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>Ticker</label>
                <input
                  type="text"
                  value={form.ticker}
                  disabled={mode === 'edit' && !!pos}
                  onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                  placeholder="AAPL"
                  maxLength={10}
                  className="w-full text-sm font-bold border px-4 py-3 disabled:opacity-60"
                  style={{ ...inputBase, fontFamily: 'ui-monospace, monospace', fontSize: 15 }}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>N° acciones</label>
                  <input
                    type="number"
                    value={form.shares}
                    onChange={e => setForm(f => ({ ...f, shares: e.target.value }))}
                    placeholder="10"
                    min="0.0001"
                    step="any"
                    className="w-full text-sm border px-4 py-3"
                    style={inputBase}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>Total pagado (USD)</label>
                  <input
                    type="number"
                    value={form.totalPaid}
                    onChange={e => setForm(f => ({ ...f, totalPaid: e.target.value }))}
                    placeholder="896.99"
                    min="0.01"
                    step="0.01"
                    className="w-full text-sm border px-4 py-3"
                    style={inputBase}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
              </div>

              {form.shares && form.totalPaid && parseFloat(form.shares) > 0 && parseFloat(form.totalPaid) > 0 && (
                <div className="px-4 py-2.5 rounded-xl flex items-center gap-2" style={{ background: 'var(--surface-2)' }}>
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Precio por acción</span>
                  <span className="text-sm font-bold tabular-nums ml-auto" style={{ color: 'var(--ink)', fontFamily: 'ui-monospace, monospace' }}>
                    {fmtUSD(parseFloat(form.totalPaid) / parseFloat(form.shares))}
                  </span>
                </div>
              )}

              {mode === 'new' && (() => {
                const s = sizingFor(form.ticker.trim().toUpperCase())
                if (!s) return null
                const total = parseFloat(form.totalPaid)
                const over  = Number.isFinite(total) && total > s.maxUsd * 1.005
                return (
                  <div className="px-4 py-2.5 rounded-xl" style={{ background: over ? 'rgba(255,194,60,0.10)' : 'var(--surface-2)' }}>
                    <p className="text-[11px] leading-relaxed" style={{ color: over ? 'var(--gold)' : 'var(--ink-2)' }}>
                      <span className="font-bold">Sugerido máx {fmtUSD(s.maxUsd)}</span> para arriesgar solo 1% del portafolio
                      {' '}(salida en {fmtUSD(s.stop)}, a −{s.distPct.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%).
                      {over && ' Con este monto arriesgas más que eso — decisión tuya, pero que sea consciente.'}
                    </p>
                  </div>
                )
              })()}

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>Nota (opcional)</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="ej: compra inicial"
                  maxLength={80}
                  className="w-full text-sm border px-4 py-3"
                  style={inputBase}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              {formError && <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{formError}</p>}

              <div className="flex gap-3 pt-1">
                <button onClick={onClose}
                  className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                  style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                  Cancelar
                </button>
                <button onClick={savePosition} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-2xl transition-all disabled:opacity-50 active:scale-[.98]"
                  style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}>
                  <Check className="w-4 h-4" />
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </>
          )}

          {/* ── Comprar más ── */}
          {mode === 'buyMore' && pos && (() => {
            const addShares    = parseFloat(buyShares.replace(',', '.'))
            const validShares  = Number.isFinite(addShares) && addShares > 0
            const addTotal     = parseFloat(buyTotalPaid.replace(',', '.'))
            const validTotal   = Number.isFinite(addTotal) && addTotal > 0
            const newShares    = validShares ? pos.shares + addShares : null
            const newAvgCost   = newShares && validTotal ? (pos.shares * pos.avg_cost_usd + addTotal) / newShares : null

            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(43,124,246,0.10)' }}>
                    <Plus className="w-4 h-4" style={{ color: 'var(--primary)' }} strokeWidth={2.5} />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Comprar más {pos.ticker}</p>
                    <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Suma a tu posición actual</p>
                  </div>
                </div>

                <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(43,124,246,0.06)', border: '1px solid rgba(43,124,246,0.2)' }}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>N° acciones</label>
                      <input type="number" value={buyShares} onChange={e => setBuyShares(e.target.value)}
                        placeholder="5" min="0.0001" step="any"
                        className="w-full text-sm border px-3 py-2.5 rounded-xl outline-none"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>Fecha</label>
                      <input type="date" value={buyDate} onChange={e => setBuyDate(e.target.value)}
                        max={new Date().toISOString().slice(0, 10)}
                        className="w-full text-sm border px-3 py-2.5 rounded-xl outline-none"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>Total pagado (USD)</label>
                    <input type="number" value={buyTotalPaid} onChange={e => setBuyTotalPaid(e.target.value)}
                      placeholder="450.00" min="0.01" step="0.01"
                      className="w-full text-sm border px-4 py-2.5 rounded-xl outline-none"
                      style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }} />
                  </div>
                </div>

                {(() => {
                  const s = sizingFor(pos.ticker)
                  if (!s) return null
                  const live = quotes[pos.ticker]?.price ?? null
                  const currentValue = live !== null ? pos.shares * live : pos.shares * pos.avg_cost_usd
                  const room = s.maxUsd - currentValue
                  const over = Number.isFinite(parseFloat(buyTotalPaid.replace(',', '.')))
                    && parseFloat(buyTotalPaid.replace(',', '.')) > Math.max(0, room) * 1.005
                  return (
                    <div className="px-4 py-2.5 rounded-xl" style={{ background: over || room <= 0 ? 'rgba(255,194,60,0.10)' : 'var(--surface-2)' }}>
                      <p className="text-[11px] leading-relaxed" style={{ color: over || room <= 0 ? 'var(--gold)' : 'var(--ink-2)' }}>
                        {room > 0 ? (
                          <>
                            <span className="font-bold">Margen sugerido {fmtUSD(room)}</span> para que la posición completa
                            arriesgue solo 1% del portafolio (salida en {fmtUSD(s.stop)}).
                            {over && ' Con este monto pasas ese límite — decisión tuya, pero que sea consciente.'}
                          </>
                        ) : (
                          <>Esta posición ya está al tope de la regla del 1% (salida en {fmtUSD(s.stop)}): comprar más concentra el riesgo.</>
                        )}
                      </p>
                    </div>
                  )
                })()}

                {newShares !== null && newAvgCost !== null && (
                  <div className="rounded-2xl p-3 space-y-1.5" style={{ background: 'var(--surface-2)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Acciones totales</span>
                      <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                        {newShares.toLocaleString('es-CL', { maximumFractionDigits: 6 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Nuevo costo promedio</span>
                      <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtUSD(newAvgCost)}</span>
                    </div>
                  </div>
                )}

                {formError && <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{formError}</p>}

                <div className="flex gap-3">
                  <button onClick={onClose}
                    className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                    style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                    Cancelar
                  </button>
                  <button onClick={buyMorePosition} disabled={saving || !validShares || !validTotal}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold rounded-2xl disabled:opacity-50 transition-all active:scale-[.98]"
                    style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
                    {saving ? 'Guardando…' : 'Confirmar compra'}
                  </button>
                </div>
              </div>
            )
          })()}

          {/* ── Vender ── */}
          {mode === 'sell' && pos && (() => {
            const maxShares    = pos.shares
            const sharesNum    = parseFloat(sellShares.replace(',', '.'))
            const validShares  = Number.isFinite(sharesNum) && sharesNum > 0 && sharesNum <= maxShares + 1e-4
            const proceedsNum  = parseFloat(sellUsd.replace(',', '.'))
            const validProceeds= Number.isFinite(proceedsNum) && proceedsNum > 0
            const costBasis    = validShares ? sharesNum * pos.avg_cost_usd : null
            const pnl          = costBasis !== null && validProceeds ? proceedsNum - costBasis : null
            const pnlPct       = pnl !== null && costBasis && costBasis > 0 ? (pnl / costBasis) * 100 : null
            const isPartial    = validShares && sharesNum < maxShares - 1e-6

            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(31,190,141,0.12)' }}>
                    <DollarSign className="w-4 h-4" style={{ color: 'var(--mint)' }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Vender {pos.ticker}</p>
                    <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Registra cuánto ganaste o perdiste</p>
                  </div>
                </div>

                <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(31,190,141,0.06)', border: '1px solid rgba(31,190,141,0.2)' }}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Acciones</label>
                        <button
                          onClick={() => {
                            const q = quotes[pos.ticker]
                            const p = parseFloat(sellPrice.replace(',', '.'))
                            const priceToUse = Number.isFinite(p) && p > 0 ? p : (q?.price ?? pos.avg_cost_usd)
                            setSellShares(String(Number(pos.shares.toFixed(6))))
                            setSellUsd((priceToUse * pos.shares).toFixed(2))
                          }}
                          className="text-[10px] font-bold" style={{ color: 'var(--primary)' }}>
                          Todas
                        </button>
                      </div>
                      <input
                        type="number"
                        value={sellShares}
                        onChange={e => {
                          const val = e.target.value
                          setSellShares(val)
                          const n = parseFloat(val)
                          const p = parseFloat(sellPrice.replace(',', '.'))
                          if (Number.isFinite(n) && n > 0 && Number.isFinite(p) && p > 0) setSellUsd((p * n).toFixed(2))
                        }}
                        max={maxShares} min="0.0001" step="any"
                        className="w-full text-sm border px-3 py-2.5 rounded-xl outline-none"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>Fecha</label>
                      <input type="date" value={sellDate} onChange={e => setSellDate(e.target.value)}
                        max={new Date().toISOString().slice(0, 10)}
                        className="w-full text-sm border px-3 py-2.5 rounded-xl outline-none"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>Precio de venta (USD/acc.)</label>
                      <input
                        type="number"
                        value={sellPrice}
                        onChange={e => {
                          const val = e.target.value
                          setSellPrice(val)
                          const p = parseFloat(val.replace(',', '.'))
                          if (Number.isFinite(p) && p > 0 && Number.isFinite(sharesNum) && sharesNum > 0) setSellUsd((p * sharesNum).toFixed(2))
                        }}
                        placeholder="Precio al que vendiste" min="0.01" step="any"
                        className="w-full text-sm border px-3 py-2.5 rounded-xl outline-none"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>Total recibido</label>
                      <input
                        type="number"
                        value={sellUsd}
                        onChange={e => {
                          const val = e.target.value
                          setSellUsd(val)
                          const u = parseFloat(val.replace(',', '.'))
                          if (Number.isFinite(u) && u > 0 && Number.isFinite(sharesNum) && sharesNum > 0) setSellPrice((u / sharesNum).toFixed(2))
                        }}
                        min="0.01" step="0.01"
                        className="w-full text-sm border px-3 py-2.5 rounded-xl outline-none"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }} />
                    </div>
                  </div>
                  <p className="text-[10px]" style={{ color: 'var(--ink-3)' }}>El total recibido vuelve a tu billetera en dólares</p>
                </div>

                {pnl !== null && (
                  <div className="flex items-center justify-between px-4 py-3 rounded-2xl"
                    style={{ background: pnl >= 0 ? 'rgba(31,190,141,0.1)' : 'rgba(255,111,97,0.1)' }}>
                    <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Ganancia/pérdida</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: pnl >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                      {pnl >= 0 ? '+' : '-'}{fmtUSD(Math.abs(pnl))}{pnlPct !== null && ` (${fmtPct(pnlPct)})`}
                    </span>
                  </div>
                )}

                {formError && <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{formError}</p>}

                <div className="flex gap-3">
                  <button onClick={onClose}
                    className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                    style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                    Cancelar
                  </button>
                  <button onClick={sellPosition} disabled={deleting || !validShares || !validProceeds}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold rounded-2xl disabled:opacity-50 transition-all active:scale-[.98]"
                    style={{ background: 'var(--mint)', color: 'white' }}>
                    {deleting ? 'Registrando…' : isPartial ? 'Confirmar venta parcial' : 'Confirmar venta'}
                  </button>
                </div>
              </div>
            )
          })()}

          {/* ── Eliminar sin registrar venta ── */}
          {mode === 'delete' && pos && (
            <div className="space-y-4">
              <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(255,111,97,0.08)', border: '1px solid rgba(255,111,97,0.25)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                  ¿Eliminar esta posición sin registrar una venta? No va a quedar ningún rastro de cuánto ganaste o perdiste.
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={onClose}
                  className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                  style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                  Cancelar
                </button>
                <button onClick={deletePosition} disabled={deleting}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold rounded-2xl disabled:opacity-50 transition-all active:scale-[.98]"
                  style={{ background: 'var(--coral)', color: 'white' }}>
                  <Trash2 className="w-3.5 h-3.5" />
                  {deleting ? 'Eliminando…' : 'Eliminar'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
