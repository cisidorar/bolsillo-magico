'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCLP, monthName } from '@/lib/utils'
import { Wallet, Plus, Trash2, Pencil, X, RefreshCw, ArrowUp, Info } from 'lucide-react'
import InversionesToggle from '@/components/InversionesToggle'

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
  showVentas?:      boolean
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

export default function UsdWalletManager({ userId, initialPurchases, investedUsd, showVentas = false }: Props) {
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
  const investedPct = depositUsd > 0 ? (investedUsd / depositUsd) * 100 : 0
  const nowD     = new Date()
  const monthKey = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}`
  const monthClp = deposits
    .filter(p => p.purchase_date.startsWith(monthKey))
    .reduce((s, p) => s + (p.total_paid_clp ?? 0), 0)

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

  // Solo aportes acá — el detalle de cada venta (ticker, costo base, ganancia)
  // vive en Inversiones → Ventas, esta lista no lo duplica.
  const sortedDeposits = [...deposits].sort((a, b) => b.purchase_date.localeCompare(a.purchase_date))

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(31,190,141,0.14)' }}>
            <Wallet className="w-4 h-4" style={{ color: 'var(--mint)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Billetera en dólares</p>
            <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>El fondo desde el que compras acciones</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <InversionesToggle active="billetera" showVentas={showVentas} />
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all active:scale-[.97] shrink-0"
          style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Aporte
        </button>
        </div>
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

          {/* ── Hero verde + stats 2x2 (lado a lado en desktop) ─────────────── */}
          <div className="flex flex-col lg:flex-row gap-4 lg:items-stretch">

            {/* Hero: disponible en billetera */}
            <div className="card overflow-hidden w-full lg:min-w-0" style={{ background: 'var(--mint)', flex: '55 1 0' }}>
              <div className="px-5 pt-5 lg:px-6 lg:pt-6 pb-4">
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Disponible en billetera
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
              <div className="border-t grid grid-cols-2" style={{ borderColor: 'rgba(255,255,255,0.25)' }}>
                <div className="px-4 py-3 lg:px-5 lg:py-4">
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>Aportado</p>
                  <p className="text-base lg:text-lg font-bold tabular-nums" style={{ color: 'white' }}>{fmtUSD(depositUsd)}</p>
                </div>
                <div className="px-4 py-3 lg:px-5 lg:py-4 border-l" style={{ borderColor: 'rgba(255,255,255,0.25)' }}>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>En acciones</p>
                  <p className="text-base lg:text-lg font-bold tabular-nums" style={{ color: 'white' }}>{fmtUSD(investedUsd)}</p>
                </div>
              </div>
            </div>

            {/* 2x2 stats */}
            <div className="grid grid-cols-2 gap-3 w-full lg:min-w-0" style={{ flex: '45 1 0' }}>
              <div className="card p-4">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--ink-3)' }}>Invertido</p>
                <p className="text-xl font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>{Math.round(investedPct)}%</p>
                <p className="text-[10px] font-semibold mt-0.5" style={{ color: 'var(--ink-3)' }}>de lo aportado</p>
              </div>
              <div className="card p-4">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--ink-3)' }}>Tipo de cambio</p>
                <p className="text-xl font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {avgRate !== null ? formatCLP(Math.round(avgRate)) : '—'}
                </p>
                <p className="text-[10px] font-semibold mt-0.5" style={{ color: 'var(--ink-3)' }}>prom. por USD · comisión incl.</p>
              </div>
              <div className="card p-4">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--ink-3)' }}>Este mes</p>
                <p className="text-xl font-extrabold tabular-nums" style={{ color: monthClp > 0 ? 'var(--mint)' : 'var(--ink)' }}>
                  {monthClp > 0 ? `+${formatCLP(monthClp)}` : '—'}
                </p>
                <p className="text-[10px] font-semibold mt-0.5" style={{ color: 'var(--ink-3)' }}>aportado en {monthName(nowD.getMonth() + 1)}</p>
              </div>
              <div className="card p-4">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--ink-3)' }}>Aportes</p>
                <p className="text-xl font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>{deposits.length}</p>
                <p className="text-[10px] font-semibold mt-0.5" style={{ color: 'var(--ink-3)' }}>
                  operación{deposits.length !== 1 ? 'es' : ''} registrada{deposits.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </div>

          {/* ── Lista de aportes ─────────────────────────────────────────────── */}
          {sortedDeposits.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 lg:px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Aportes</p>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                  {sortedDeposits.length} operación{sortedDeposits.length !== 1 ? 'es' : ''}
                </p>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {sortedDeposits.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-4 lg:px-5 py-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(31,190,141,0.14)' }}>
                      <ArrowUp className="w-4 h-4" style={{ color: 'var(--mint)' }} strokeWidth={2.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Aporte a la billetera</p>
                      <p className="text-[11px] tabular-nums" style={{ color: 'var(--ink-3)' }}>
                        {fmtDate(p.purchase_date)}
                        {p.total_paid_clp !== null && (
                          <> · {formatCLP(Math.round(p.total_paid_clp / Number(p.usd_amount)))}/USD</>
                        )}
                        {p.notes && <> · {p.notes}</>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--mint)' }}>
                        {fmtUSDSigned(Number(p.usd_amount))}
                      </p>
                      {p.total_paid_clp !== null && (
                        <p className="text-[11px] tabular-nums" style={{ color: 'var(--ink-3)' }}>{formatCLP(p.total_paid_clp)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEdit(p)} className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-black/5"
                        style={{ color: 'var(--ink-3)' }} aria-label="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(p)} className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-black/5"
                        style={{ color: 'var(--coral)' }} aria-label="Eliminar">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conversión de vuelta: dato chico a propósito — esta plata vive en USD */}
          {fx !== null && available > 0 && (
            <p className="text-[11px] tabular-nums text-center" style={{ color: 'var(--ink-3)' }}>
              Si lo trajeras hoy ≈ {formatCLP(Math.round(available * fx))} (dólar {formatCLP(Math.round(fx))})
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
                más de lo aportado. Al vender, los dólares <strong style={{ color: 'var(--ink-2)' }}>vuelven aquí</strong>. El
                detalle de cada venta (ticker, costo base, ganancia) queda en{' '}
                <Link href="/inversiones?view=ventas" className="font-semibold" style={{ color: 'var(--primary)' }}>
                  Inversiones → Ventas
                </Link>.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
