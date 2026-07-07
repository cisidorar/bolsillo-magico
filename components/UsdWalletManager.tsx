'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCLP } from '@/lib/utils'
import { DollarSign, Plus, Trash2, Pencil, X, RefreshCw } from 'lucide-react'

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
  total_paid_clp: number
  purchase_date:  string   // YYYY-MM-DD
  notes:          string | null
}

interface Props {
  userId:           string
  initialPurchases: UsdPurchase[]
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

export default function UsdWalletManager({ userId, initialPurchases }: Props) {
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
  const totalUsd = purchases.reduce((s, p) => s + Number(p.usd_amount), 0)
  const totalClp = purchases.reduce((s, p) => s + p.total_paid_clp, 0)
  const avgRate  = totalUsd > 0 ? totalClp / totalUsd : null   // CLP por USD, comisión incluida
  const nowD     = new Date()
  const monthKey = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}`
  const monthClp = purchases
    .filter(p => p.purchase_date.startsWith(monthKey))
    .reduce((s, p) => s + p.total_paid_clp, 0)

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function openAdd() {
    setEditId(null); setForm(emptyForm()); setFormError(''); setShowForm(true)
  }
  function openEdit(p: UsdPurchase) {
    setEditId(p.id)
    setForm({
      date:  p.purchase_date,
      clp:   String(p.total_paid_clp),
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
        .insert({ user_id: userId, ...row })
        .select('id, usd_amount, total_paid_clp, purchase_date, notes')
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

  const sorted = [...purchases].sort((a, b) => b.purchase_date.localeCompare(a.purchase_date))

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <DollarSign className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--mint)' }} />
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Billetera en dólares</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all active:scale-[.97] shrink-0"
          style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Aporte
        </button>
      </div>

      {purchases.length === 0 && !showForm ? (
        <div className="card px-6 py-8 text-center">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Registra tus compras de dólares</p>
          <p className="text-xs mt-1 max-w-md mx-auto leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            Anota cuántos pesos pagaste en total (con comisión incluida) y cuántos dólares recibiste.
            Desde ahí tu plata vive en dólares: el saldo se muestra en USD y entra al patrimonio como &ldquo;Dólares&rdquo;.
          </p>
        </div>
      ) : (
        <div className="card p-4 lg:p-5">
          {/* Resumen — USD como protagonista */}
          {purchases.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Saldo aportado</p>
              <p className="text-2xl font-extrabold tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>{fmtUSD(totalUsd)}</p>
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-[10px] font-bold px-2 py-1 rounded-full tabular-nums" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
                  {formatCLP(totalClp)} aportados
                </span>
                {avgRate !== null && (
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full tabular-nums" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
                    pagaste {formatCLP(Math.round(avgRate))}/USD prom. (comisión incl.)
                  </span>
                )}
                {monthClp > 0 && (
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full tabular-nums" style={{ background: 'rgba(31,190,141,0.12)', color: 'var(--mint)' }}>
                    {formatCLP(monthClp)} este mes
                  </span>
                )}
              </div>
              {/* Conversión de vuelta: dato chico a propósito — esta plata vive en USD */}
              {fx !== null && totalUsd > 0 && (
                <p className="text-[10px] mt-2 tabular-nums" style={{ color: 'var(--ink-3)' }}>
                  Si lo trajeras hoy ≈ {formatCLP(Math.round(totalUsd * fx))} (dólar {formatCLP(Math.round(fx))})
                </p>
              )}
            </div>
          )}

          {/* Form agregar/editar */}
          {showForm && (
            <div className="rounded-2xl p-3.5 mb-3" style={{ background: 'var(--surface-2)' }}>
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>
                  {editId ? 'Editar aporte' : 'Nuevo aporte'}
                </p>
                <button onClick={() => setShowForm(false)} className="w-7 h-7 flex items-center justify-center rounded-full"
                  style={{ background: 'var(--surface)', color: 'var(--ink-3)' }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>Pesos pagados (total)</span>
                  <input
                    type="text" inputMode="numeric" placeholder="950.000"
                    value={fmtInputCLP(form.clp)}
                    onChange={e => setForm(f => ({ ...f, clp: e.target.value.replace(/\D/g, '') }))}
                    className="w-full mt-1 text-sm font-semibold rounded-xl border px-3 py-2 outline-none"
                    style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>Dólares recibidos</span>
                  <input
                    type="text" inputMode="decimal" placeholder="1000,00"
                    value={form.usd}
                    onChange={e => setForm(f => ({ ...f, usd: e.target.value.replace(/[^0-9.,]/g, '') }))}
                    className="w-full mt-1 text-sm font-semibold rounded-xl border px-3 py-2 outline-none"
                    style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>Fecha</span>
                  <input
                    type="date" value={form.date} max={todayStr()}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full mt-1 text-sm font-semibold rounded-xl border px-3 py-2 outline-none"
                    style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>Nota (opcional)</span>
                  <input
                    type="text" placeholder="Racional" maxLength={60}
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full mt-1 text-sm font-semibold rounded-xl border px-3 py-2 outline-none"
                    style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                  />
                </label>
              </div>
              {/* Tasa implícita en vivo: hace visible la comisión sin pedirla aparte */}
              {(() => {
                const clp = parseInt(form.clp || '0')
                const usd = parseFloat(form.usd.replace(',', '.'))
                if (!clp || !Number.isFinite(usd) || usd <= 0) return null
                return (
                  <p className="text-[10px] mt-2 tabular-nums" style={{ color: 'var(--ink-3)' }}>
                    Tasa implícita: {formatCLP(Math.round(clp / usd))} por dólar — la comisión ya queda dentro.
                  </p>
                )
              })()}
              {formError && <p className="text-xs font-medium mt-2" style={{ color: 'var(--coral)' }}>{formError}</p>}
              <button
                onClick={save} disabled={busy}
                className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[.98] disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
              >
                {busy && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                {editId ? 'Guardar cambios' : 'Registrar aporte'}
              </button>
            </div>
          )}

          {/* Lista de aportes */}
          {sorted.length > 0 && (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {sorted.map(p => (
                <div key={p.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {fmtUSD(Number(p.usd_amount))}
                      <span className="font-semibold text-xs" style={{ color: 'var(--ink-3)' }}> · {formatCLP(p.total_paid_clp)}</span>
                    </p>
                    <p className="text-[11px] tabular-nums" style={{ color: 'var(--ink-3)' }}>
                      {fmtDate(p.purchase_date)} · {formatCLP(Math.round(p.total_paid_clp / Number(p.usd_amount)))}/USD
                      {p.notes && <> · {p.notes}</>}
                    </p>
                  </div>
                  <button onClick={() => openEdit(p)} className="w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0 transition-colors hover:bg-black/5"
                    style={{ color: 'var(--ink-3)' }} aria-label="Editar">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remove(p)} className="w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0 transition-colors hover:bg-black/5"
                    style={{ color: 'var(--coral)' }} aria-label="Eliminar">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] mt-3 leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            Cuando compres acciones con estos dólares, registra la posición en Acciones (rinde en USD)
            y descuenta el monto usado editando el aporte — así el patrimonio no cuenta la plata dos veces.
          </p>
        </div>
      )}
    </div>
  )
}
