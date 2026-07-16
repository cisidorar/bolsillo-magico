'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCLP, monthName } from '@/lib/utils'
import { Plus, Trash2, Pencil, X, RefreshCw, ArrowUp, ArrowDown, DollarSign, Info } from 'lucide-react'
import InversionesToggle from '@/components/InversionesToggle'
import type { StockPurchase, StockSale } from '@/app/(dashboard)/inversiones/page'

// ── Billetera en dólares (Racional u otra) ────────────────────────────────────
// Modelo CLP-first en la entrada, USD-first en la vida posterior:
//   - El aporte se registra en pesos: "pagué X CLP y recibí N USD" — la
//     comisión/spread queda absorbida en la tasa implícita (X/N), igual que
//     el total pagado en acciones.
//   - Después del aporte la plata vive en dólares: el saldo y el rendimiento
//     se muestran en USD (las acciones ya rinden en USD en Acciones). La
//     conversión a CLP es un dato chico — es raro que ese dinero vuelva a Chile.
//   - Al patrimonio global sí entra en CLP (categoría "Dólares"), porque el
//     total necesita una sola moneda.

export interface UsdPurchase {
  id:             string
  usd_amount:     number
  total_paid_clp: number | null   // null en ventas (nunca pasaron por CLP)
  purchase_date:  string          // YYYY-MM-DD
  notes:          string | null
  kind:           'deposit' | 'sell'
}

interface Props {
  userId:           string
  initialPurchases: UsdPurchase[]
  investedUsd:      number   // Σ costo de posiciones abiertas — se descuenta del saldo
  stockPurchases?:  StockPurchase[]   // compras de acciones — para la cartola unificada
  sales?:           StockSale[]      // ventas — para el detalle (ticker, costo base, ganancia) en cada fila
}

interface FormState { date: string; clp: string; usd: string; notes: string }

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
const emptyForm = (): FormState => ({ date: todayStr(), clp: '', usd: '', notes: '' })

function fmtUSD(n: number): string {
  return 'US$' + n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${day} ${MES[m - 1]} ${String(y).slice(2)}`
}
function fmtInputCLP(digits: string): string {
  return digits ? Number(digits).toLocaleString('es-CL') : ''
}
function fmtUSDSigned(n: number): string {
  return (n >= 0 ? '+US$' : '-US$') + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(n: number): string {
  const s = Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return n >= 0 ? `+${s}%` : `-${s}%`
}

export default function UsdWalletManager({ userId, initialPurchases, investedUsd, stockPurchases = [], sales = [] }: Props) {
  const supabase = createClient()
  const [purchases, setPurchases] = useState<UsdPurchase[]>(initialPurchases)
  const [showForm,  setShowForm]  = useState(false)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [form,      setForm]      = useState<FormState>(emptyForm())
  const [formError, setFormError] = useState('')
  const [busy,      setBusy]      = useState(false)
  const [fx,        setFx]        = useState<number | null>(null)

  // FX solo como dato chico (no protagonista) — si falla, la card vive sin él
  useEffect(() => {
    fetch('/api/stock-price?symbols=USDCLP')
      .then(r => r.ok ? r.json() : null)
      .then((d: { quotes?: Record<string, { price: number }> } | null) => {
        const p = d?.quotes?.['USDCLP=X']?.price ?? d?.quotes?.['USDCLP']?.price
        if (p && p > 0) setFx(p)
      })
      .catch(() => { /* opcional */ })
  }, [])

  // ── Agregados (USD primero) ────────────────────────────────────────────────
  // Saldo disponible = aportes + ventas − costo de posiciones abiertas.
  // Comprar acciones lo descuenta solo (la posición ES los USD invertidos);
  // vender agrega una fila kind='sell' y los devuelve.
  const deposits    = purchases.filter(p => p.kind !== 'sell')
  const movementsUsd = purchases.reduce((s, p) => s + Number(p.usd_amount), 0)
  const available   = movementsUsd - investedUsd
  const depositUsd  = deposits.reduce((s, p) => s + Number(p.usd_amount), 0)
  const totalClp    = deposits.reduce((s, p) => s + (p.total_paid_clp ?? 0), 0)
  const avgRate     = depositUsd > 0 ? totalClp / depositUsd : null   // CLP por USD, comisión incluida

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function openAdd() {
    setEditId(null); setForm(emptyForm()); setFormError(''); setShowForm(true)
  }
  function openEdit(p: UsdPurchase) {
    setEditId(p.id)
    setForm({
      date:  p.purchase_date,
      clp:   String(p.total_paid_clp ?? ''),
      usd:   String(p.usd_amount),
      notes: p.notes ?? '',
    })
    setFormError(''); setShowForm(true)
  }

  async function save() {
    const clp = parseInt(form.clp.replace(/\D/g, '') || '0')
    const usd = parseFloat(form.usd.replace(',', '.'))
    if (!clp || clp < 1)                 { setFormError('¿Cuántos pesos pagaste en total? (comisión incluida)'); return }
    if (!Number.isFinite(usd) || usd <= 0) { setFormError('¿Cuántos dólares recibiste?'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) { setFormError('Fecha inválida'); return }

    setBusy(true)
    const row = {
      usd_amount:     Math.round(usd * 100) / 100,
      total_paid_clp: clp,
      purchase_date:  form.date,
      notes:          form.notes.trim() || null,
    }
    if (editId) {
      const { error } = await supabase.from('usd_purchases')
        .update(row).eq('id', editId).eq('user_id', userId)
      setBusy(false)
      if (error) { setFormError(error.message); return }
      setPurchases(prev => prev.map(p => p.id === editId ? { ...p, ...row } : p))
    } else {
      const { data, error } = await supabase.from('usd_purchases')
        .insert({ user_id: userId, kind: 'deposit', ...row })
        .select('id, usd_amount, total_paid_clp, purchase_date, notes, kind')
        .single()
      setBusy(false)
      if (error) { setFormError(error.message); return }
      setPurchases(prev => [data as UsdPurchase, ...prev])
    }
    setShowForm(false)
  }

  async function remove(p: UsdPurchase) {
    setPurchases(prev => prev.filter(x => x.id !== p.id))
    await supabase.from('usd_purchases').delete().eq('id', p.id).eq('user_id', userId)
  }

  // ── Cartola unificada: aportes y ventas ENTRAN, compras de acciones SALEN ──
  // Cada venta se enriquece con su detalle (ticker, acciones, costo base,
  // ganancia/pérdida) uniendo la fila 'sell' de la billetera con stock_sales
  // vía usd_purchase_id — así no hace falta una vista aparte para Ventas.
  type Move = {
    key:   string
    date:  string
    type:  'aporte' | 'venta' | 'compra'
    label: string
    sub:   string | null
    usd:   number                 // con signo
    pnl:   number | null          // ganancia/pérdida realizada (solo ventas con detalle)
    row:   UsdPurchase | null     // solo filas de billetera son editables/eliminables
  }
  const salesByPurchaseId = new Map(sales.map(s => [s.usd_purchase_id, s]))
  const moves: Move[] = [
    ...purchases.map<Move>(p => {
      if (p.kind === 'sell') {
        const sale = salesByPurchaseId.get(p.id)
        if (sale) {
          const pnl    = Number(sale.realized_pnl_usd)
          const costB  = Number(sale.cost_basis_usd)
          const pnlPct = costB > 0 ? (pnl / costB) * 100 : 0
          return {
            key: `w-${p.id}`, date: p.purchase_date, type: 'venta',
            label: `Venta ${sale.ticker}`,
            sub: `${Number(sale.shares_sold).toLocaleString('es-CL', { maximumFractionDigits: 6 })} acc. · ${fmtUSDSigned(pnl)} (${fmtPct(pnlPct)})`,
            usd: Number(p.usd_amount), pnl, row: p,
          }
        }
        return {
          key: `w-${p.id}`, date: p.purchase_date, type: 'venta',
          label: p.notes ?? 'Venta de acciones', sub: null,
          usd: Number(p.usd_amount), pnl: null, row: p,
        }
      }
      return {
        key: `w-${p.id}`, date: p.purchase_date, type: 'aporte',
        label: 'Aporte a la billetera',
        sub: [
          p.total_paid_clp !== null ? `${formatCLP(p.total_paid_clp)} · ${formatCLP(Math.round(p.total_paid_clp / Number(p.usd_amount)))}/USD` : null,
          p.notes,
        ].filter(Boolean).join(' · ') || null,
        usd: Number(p.usd_amount), pnl: null, row: p,
      }
    }),
    ...stockPurchases.map<Move>(sp => ({
      key: `p-${sp.id}`, date: sp.purchase_date, type: 'compra',
      label: `Compra ${sp.ticker}`,
      sub: `${Number(sp.shares).toLocaleString('es-CL', { maximumFractionDigits: 6 })} acc.`,
      usd: -Number(sp.total_paid_usd), pnl: null, row: null,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-end gap-2 shrink-0 mb-3">
        <InversionesToggle active="billetera" />
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all active:scale-[.97] shrink-0"
          style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Aporte
        </button>
      </div>

      {/* ── Modal agregar/editar aporte ──────────────────────────────────── */}
      {showForm && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}
        >
          <div
            className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-hidden"
            style={{ background: 'var(--surface)', maxHeight: '92dvh' }}
          >
            {/* Handle mobile */}
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>
                {editId ? 'Editar aporte' : 'Nuevo aporte'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(92dvh - 120px)' }}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                    Pesos pagados (total)
                  </label>
                  <input
                    type="text" inputMode="numeric" placeholder="950.000"
                    value={fmtInputCLP(form.clp)}
                    onChange={e => setForm(f => ({ ...f, clp: e.target.value.replace(/\D/g, '') }))}
                    className="w-full text-sm border px-4 py-3 tabular-nums outline-none"
                    style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)', borderRadius: 12 }}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                    Dólares recibidos
                  </label>
                  <input
                    type="text" inputMode="decimal" placeholder="1000,00"
                    value={form.usd}
                    onChange={e => setForm(f => ({ ...f, usd: e.target.value.replace(/[^0-9.,]/g, '') }))}
                    className="w-full text-sm border px-4 py-3 tabular-nums outline-none"
                    style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)', borderRadius: 12 }}
                  />
                </div>
              </div>

              {/* Tasa implícita en vivo: hace visible la comisión sin pedirla aparte */}
              {(() => {
                const clp = parseInt(form.clp || '0')
                const usd = parseFloat(form.usd.replace(',', '.'))
                if (!clp || !Number.isFinite(usd) || usd <= 0) return null
                return (
                  <div
                    className="px-4 py-2.5 rounded-xl flex items-center gap-2"
                    style={{ background: 'rgba(31,190,141,0.08)', border: '1px solid rgba(31,190,141,0.2)' }}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--mint)' }}>
                      Tasa implícita
                    </span>
                    <span className="text-sm font-extrabold tabular-nums ml-auto" style={{ color: 'var(--mint)' }}>
                      {formatCLP(Math.round(clp / usd))}/USD
                    </span>
                  </div>
                )
              })()}

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Fecha
                </label>
                <input
                  type="date" value={form.date} max={todayStr()}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full text-sm border px-4 py-3 outline-none"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)', borderRadius: 12 }}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Nota (opcional)
                </label>
                <input
                  type="text" placeholder="Racional" maxLength={60}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full text-sm border px-4 py-3 outline-none"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)', borderRadius: 12 }}
                />
              </div>

              {formError && <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{formError}</p>}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl border transition-colors"
                  style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={save} disabled={busy}
                  className="flex-1 py-2.5 text-sm font-bold rounded-xl disabled:opacity-50 transition-all active:scale-[.98] flex items-center justify-center gap-2"
                  style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 16px var(--shadow)' }}
                >
                  {busy && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {editId ? 'Guardar cambios' : 'Registrar aporte'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {purchases.length === 0 ? (
        <div className="card px-6 py-8 text-center">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Registra tus compras de dólares</p>
          <p className="text-xs mt-1 max-w-md mx-auto leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            Anota cuántos pesos pagaste en total (con comisión incluida) y cuántos dólares recibiste.
            Desde ahí tu plata vive en dólares: el saldo se muestra en USD y entra al patrimonio como &ldquo;Dólares&rdquo;.
          </p>
        </div>
      ) : (
        <div className="space-y-4">

          {/* ── Hero: SOLO lo que importa — cuánto tienes para gastar hoy ──── */}
          <div className="card overflow-hidden hero-gradient w-full">
            <div className="px-5 pt-5 lg:px-6 lg:pt-6 pb-5">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                Disponible para comprar
              </p>
              <p className="text-4xl lg:text-5xl font-bold tabular-nums leading-none" style={{ fontFamily: 'Fredoka, sans-serif', color: 'white' }}>
                {fmtUSD(Math.max(0, available))}
              </p>
              {available < 0 && (
                <p className="text-[11px] font-bold mt-2" style={{ color: 'white' }}>
                  Tienes más invertido en acciones que aportes registrados — te faltan aportes por {fmtUSD(-available)}.
                </p>
              )}
            </div>
          </div>

          {/* ── Cartola de movimientos: aportes + compras/ventas de acciones ── */}
          {moves.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 lg:px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Movimientos</p>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                  {moves.length} operación{moves.length !== 1 ? 'es' : ''}
                </p>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {moves.map(m => (
                  <div key={m.key} className="flex items-center gap-3 px-4 lg:px-5 py-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: m.type === 'compra' ? 'rgba(43,124,246,0.12)' : 'rgba(31,190,141,0.14)' }}>
                      {m.type === 'aporte' && <ArrowUp className="w-4 h-4" style={{ color: 'var(--mint)' }} strokeWidth={2.5} />}
                      {m.type === 'venta'  && <DollarSign className="w-4 h-4" style={{ color: 'var(--mint)' }} strokeWidth={2.5} />}
                      {m.type === 'compra' && <ArrowDown className="w-4 h-4" style={{ color: 'var(--primary)' }} strokeWidth={2.5} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{m.label}</p>
                      <p className="text-[11px] tabular-nums" style={{ color: 'var(--ink-3)' }}>
                        {fmtDate(m.date)}{m.sub && <> · {m.sub}</>}
                      </p>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-right shrink-0"
                      style={{ color: m.pnl !== null ? (m.pnl >= 0 ? 'var(--mint)' : 'var(--coral)') : (m.usd >= 0 ? 'var(--mint)' : 'var(--ink-2)') }}>
                      {fmtUSDSigned(m.usd)}
                    </p>
                    {/* Solo las filas de billetera se editan/eliminan aquí; las compras se gestionan en Acciones */}
                    {m.row !== null ? (
                      <div className="flex items-center gap-1 shrink-0">
                        {m.type === 'aporte' && (
                          <button onClick={() => openEdit(m.row!)} className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-black/5"
                            style={{ color: 'var(--ink-3)' }} aria-label="Editar">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => remove(m.row!)} className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-black/5"
                          style={{ color: 'var(--coral)' }} aria-label="Eliminar">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-8 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contexto chico en una sola línea: tasa promedio, dólar hoy y conversión */}
          {available > 0 && (avgRate !== null || fx !== null) && (
            <p className="text-[11px] tabular-nums text-center" style={{ color: 'var(--ink-3)' }}>
              {avgRate !== null && <>pagaste {formatCLP(Math.round(avgRate))}/USD prom.</>}
              {avgRate !== null && fx !== null && (
                <> · dólar hoy {formatCLP(Math.round(fx))} (<span style={{ color: fx >= avgRate ? 'var(--mint)' : 'var(--coral)' }}>{fx >= avgRate ? '+' : ''}{(((fx - avgRate) / avgRate) * 100).toFixed(1)}%</span>)</>
              )}
              {fx !== null && <> · si lo trajeras ≈ {formatCLP(Math.round(available * fx))}</>}
            </p>
          )}

          {/* ── Cómo funciona ────────────────────────────────────────────────── */}
          <div className="card p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
              <Info className="w-4 h-4" style={{ color: 'var(--primary)' }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold mb-1" style={{ color: 'var(--ink)' }}>Cómo funciona la billetera</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>
                Comprar acciones <strong style={{ color: 'var(--ink-2)' }}>descuenta</strong> del disponible — no puedes invertir
                más de lo aportado. Al vender, los dólares <strong style={{ color: 'var(--ink-2)' }}>vuelven aquí</strong> y la
                fila queda con el ticker, las acciones vendidas y la ganancia o pérdida de esa venta.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
