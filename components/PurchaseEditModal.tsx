'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Check, Trash2 } from 'lucide-react'
import type { StockPosition, StockPurchase } from '@/app/(dashboard)/inversiones/page'
import { applyPurchaseChange } from '@/lib/purchase-edit'
import { useToast } from '@/components/ToastProvider'
import { useBackdropClose } from '@/components/useBackdropClose'

// oct 2026 (Cas, viendo KO con la compra del 02/10 repetida: "quiero editar
// una de esas compras, quedó mal registrada"): edita o elimina UNA compra del
// historial y propaga el cambio al agregado de la posición (acciones, costo
// promedio, costo financiado por billetera). La matemática vive en
// lib/purchase-edit.ts (con tests); acá solo el formulario y los writes.

function fmtUSD(n: number): string {
  return '$' + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function maxFutureStr(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

const label = 'text-[10px] font-bold uppercase tracking-widest block mb-1.5'
const input = 'w-full text-sm border px-3 py-2.5 rounded-xl outline-none'
const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)' }

export default function PurchaseEditModal({
  userId, purchase, positions, setPositions, setPurchases, onClose, onDone,
}: {
  userId:       string
  purchase:     StockPurchase
  positions:    StockPosition[]
  setPositions: Dispatch<SetStateAction<StockPosition[]>>
  setPurchases: Dispatch<SetStateAction<StockPurchase[]>>
  onClose:      () => void
  onDone?:      (ticker: string) => void
}) {
  const supabase = createClient()
  const { showToast } = useToast()
  const pos = positions.find(p => p.ticker === purchase.ticker) ?? null

  const [shares,  setShares]  = useState(String(Number(purchase.shares)))
  const [total,   setTotal]   = useState(String(Number(purchase.total_paid_usd)))
  const [date,    setDate]    = useState(purchase.purchase_date)
  const [saving,  setSaving]  = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error,   setError]   = useState('')

  const oldAmounts = { shares: Number(purchase.shares), total: Number(purchase.total_paid_usd) }
  const nShares = parseFloat(shares.replace(',', '.'))
  const nTotal  = parseFloat(total.replace(',', '.'))
  const validNew = Number.isFinite(nShares) && nShares > 0 && Number.isFinite(nTotal) && nTotal > 0

  /** Escribe el agregado de la posición; devuelve false si falló. */
  async function writePosition(next: { shares: number; avg_cost_usd: number; wallet_cost_usd: number }): Promise<boolean> {
    if (!pos) return true
    const { error: err } = await supabase.from('stock_positions')
      .update({
        shares: next.shares, avg_cost_usd: next.avg_cost_usd,
        wallet_cost_usd: next.wallet_cost_usd, wallet_funded: next.wallet_cost_usd > 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pos.id).eq('user_id', userId)
    if (err) { console.error('[purchase-edit] stock_positions update:', err.message); return false }
    setPositions(prev => prev.map(p => p.id === pos.id
      ? { ...p, shares: next.shares, avg_cost_usd: next.avg_cost_usd, wallet_cost_usd: next.wallet_cost_usd, wallet_funded: next.wallet_cost_usd > 0 }
      : p))
    return true
  }

  async function save() {
    if (!validNew) { setError('Revisa las acciones y el total pagado.'); return }
    if (!date)     { setError('Elige la fecha de la compra.'); return }
    let next: { shares: number; avg_cost_usd: number; wallet_cost_usd: number } | null = null
    if (pos) {
      const r = applyPurchaseChange(
        { shares: Number(pos.shares), avg_cost_usd: Number(pos.avg_cost_usd), wallet_cost_usd: Number(pos.wallet_cost_usd ?? 0) },
        oldAmounts, { shares: nShares, total: nTotal },
      )
      if (!r.ok) { setError(r.error); return }
      next = r.position
    }

    setSaving(true); setError('')
    const patch = { shares: nShares, total_paid_usd: nTotal, purchase_date: date }
    const { error: upErr } = await supabase.from('stock_purchases').update(patch)
      .eq('id', purchase.id).eq('user_id', userId)
    if (upErr) { setSaving(false); setError('No se pudo guardar la compra.'); return }

    if (next && !(await writePosition(next))) {
      // Revertir la compra para que historial y posición no queden desalineados
      await supabase.from('stock_purchases').update({
        shares: oldAmounts.shares, total_paid_usd: oldAmounts.total, purchase_date: purchase.purchase_date,
      }).eq('id', purchase.id).eq('user_id', userId)
      setSaving(false); setError('No se pudo actualizar la posición; no se guardó nada.'); return
    }

    setPurchases(prev => prev.map(p => p.id === purchase.id ? { ...p, ...patch } : p))
    setSaving(false)
    showToast(`Compra de ${purchase.ticker} corregida`)
    onDone?.(purchase.ticker)
    onClose()
  }

  async function remove() {
    let next: { shares: number; avg_cost_usd: number; wallet_cost_usd: number } | null = null
    if (pos) {
      const r = applyPurchaseChange(
        { shares: Number(pos.shares), avg_cost_usd: Number(pos.avg_cost_usd), wallet_cost_usd: Number(pos.wallet_cost_usd ?? 0) },
        oldAmounts, null,
      )
      if (!r.ok) { setError(r.error); setConfirmDelete(false); return }
      next = r.position
    }

    setSaving(true); setError('')
    if (next && !(await writePosition(next))) {
      setSaving(false); setError('No se pudo actualizar la posición; no se eliminó nada.'); return
    }
    const { error: delErr } = await supabase.from('stock_purchases').delete()
      .eq('id', purchase.id).eq('user_id', userId)
    if (delErr) {
      // Devolver la posición a como estaba
      if (pos) await writePosition({ shares: Number(pos.shares), avg_cost_usd: Number(pos.avg_cost_usd), wallet_cost_usd: Number(pos.wallet_cost_usd ?? 0) })
      setSaving(false); setError('No se pudo eliminar la compra.'); return
    }

    setPurchases(prev => prev.filter(p => p.id !== purchase.id))
    setSaving(false)
    showToast(`Compra de ${purchase.ticker} eliminada`)
    onDone?.(purchase.ticker)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end lg:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      {...useBackdropClose(onClose)}
    >
      <div className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-y-auto overscroll-contain"
        style={{ background: 'var(--surface)', maxHeight: '92dvh' }}>
        <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

        <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Editar compra · {purchase.ticker}</h2>
            <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Corrige acciones, monto o fecha — la posición se ajusta sola.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} style={{ color: 'var(--ink-3)' }}>N° acciones</label>
              <input type="number" value={shares} onChange={e => setShares(e.target.value)}
                min="0.0001" step="any" className={input} style={inputStyle} />
            </div>
            <div>
              <label className={label} style={{ color: 'var(--ink-3)' }}>Fecha</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                max={maxFutureStr()} className={input} style={inputStyle} />
            </div>
          </div>
          <div>
            <label className={label} style={{ color: 'var(--ink-3)' }}>Total pagado (USD)</label>
            <input type="number" value={total} onChange={e => setTotal(e.target.value)}
              min="0.01" step="0.01" className={input} style={inputStyle} />
          </div>

          {validNew && (
            <div className="px-4 py-2.5 rounded-xl flex items-center gap-2" style={{ background: 'var(--surface-2)' }}>
              <span className="text-[11px] font-bold" style={{ color: 'var(--ink-3)' }}>Precio por acción</span>
              <span className="text-sm font-bold tabular-nums ml-auto" style={{ color: 'var(--ink)' }}>
                {fmtUSD(nTotal / nShares)}
              </span>
            </div>
          )}

          {error && <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{error}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-3 text-sm font-semibold rounded-2xl border"
              style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
              Cancelar
            </button>
            <button onClick={save} disabled={saving || !validNew}
              className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-2xl disabled:opacity-50 active:scale-[.98]"
              style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}>
              <Check className="w-4 h-4" />
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>

          {/* Eliminar — dos pasos para no borrar por un toque */}
          <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-2xl border disabled:opacity-50"
                style={{ color: 'var(--coral)', borderColor: 'rgba(255,111,97,0.3)', background: 'rgba(255,111,97,0.06)' }}>
                <Trash2 className="w-3.5 h-3.5" /> Eliminar esta compra (duplicada o errónea)
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                  Se quitan {oldAmounts.shares.toLocaleString('es-CL', { maximumFractionDigits: 8 })} acc. y {fmtUSD(oldAmounts.total)} de la posición
                  {pos && Number(pos.wallet_cost_usd) > 0 ? ' (y ese monto vuelve a tu billetera USD)' : ''}. No registra una venta.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDelete(false)} disabled={saving}
                    className="flex-1 py-2.5 text-xs font-semibold rounded-2xl border"
                    style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                    No, volver
                  </button>
                  <button onClick={remove} disabled={saving}
                    className="flex-1 py-2.5 text-xs font-bold rounded-2xl disabled:opacity-50"
                    style={{ background: 'var(--coral)', color: '#fff' }}>
                    {saving ? 'Eliminando…' : 'Sí, eliminar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
