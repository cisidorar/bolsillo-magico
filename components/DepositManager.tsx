'use client'

import { useState, useCallback } from 'react'
import { useBackdropClose } from '@/components/useBackdropClose'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Landmark, Trash2, ChevronRight } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import ServiceLogo from '@/components/ServiceLogo'
import StatHeroRow from '@/components/StatHeroRow'
import { daysElapsed, earnedSoFar, dailyInterest, projectedInterest } from '@/lib/savings-accounts'
import type { SavingsAccount } from '@/app/(dashboard)/inversiones/page'

// ── Dominio por nombre de banco/fintech ───────────────────────────────────────
function domainFromSavingsName(name: string): string | null {
  const n = name.toLowerCase()
  // Fintechs Chile
  if (n.includes('copec'))         return 'copec.cl'
  if (n.includes('mercado pago') || n.includes('mercadopago')) return 'mercadopago.com'
  if (n.includes('fintual'))       return 'fintual.com'
  if (n.includes('tenpo'))         return 'tenpo.app'
  if (n.includes('mach'))          return 'somosmach.com'
  if (n.includes('lana'))          return 'lana.cl'
  if (n.includes('chek'))          return 'chek.cl'
  if (n.includes('tapp'))          return 'tapp.cl'
  if (n.includes('fpay') || n.includes('falabella pay')) return 'falabella.com'
  if (n.includes('flow'))          return 'flow.cl'
  // Bancos Chile
  if (n.includes('banco estado') || n.includes('bancoestado')) return 'bancoestado.cl'
  if (n.includes('santander'))     return 'santander.cl'
  if (n.includes('bci'))           return 'bci.cl'
  if (n.includes('falabella'))     return 'falabella.com'
  if (n.includes('ripley'))        return 'ripley.cl'
  if (n.includes('scotiabank'))    return 'scotiabank.cl'
  if (n.includes('bice'))          return 'bice.cl'
  if (n.includes('itaú') || n.includes('itau')) return 'itau.cl'
  if (n.includes('chile'))         return 'bancochile.cl'
  if (n.includes('security'))      return 'bancosecurity.cl'
  if (n.includes('coopeuch'))      return 'coopeuch.cl'
  if (n.includes('consorcio'))     return 'bancoconsorcio.cl'
  if (n.includes('internacional')) return 'bancointernacional.cl'
  // Internacional
  if (n.includes('nubank') || n.includes(' nu ') || n === 'nu') return 'nu.com.br'
  if (n.includes('paypal'))        return 'paypal.com'
  if (n.includes('wise'))          return 'wise.com'
  if (n.includes('revolut'))       return 'revolut.com'
  return null
}

function avatarColor(name: string): string {
  const palette = ['#2B7CF6','#1FBE8D','#FF6F61','#FBC23C','#A78BFA','#F472B6','#34D399','#FB923C']
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return palette[Math.abs(h) % palette.length]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  // Chile time — toISOString() es UTC y después de las ~21h ya dice "mañana".
  const cl = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }))
  return `${cl.getFullYear()}-${String(cl.getMonth() + 1).padStart(2, '0')}-${String(cl.getDate()).padStart(2, '0')}`
}

function fmtCLP(n: number, showSign = false): string {
  const sign = showSign && n >= 0 ? '+' : ''
  return sign + formatCLP(Math.abs(n))
}

function fmtPct(n: number): string {
  return n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + '%'
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-CL', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtInput(raw: string): string {
  const n = raw.replace(/\D/g, '')
  if (!n) return ''
  return parseInt(n).toLocaleString('es-CL')
}

// ── Input styles ──────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  userId:         string
  initialSavings: SavingsAccount[]
}
interface FormState {
  name:       string
  balance:    string   // raw digits only
  annualRate: string
  startDate:  string
  notes:      string
}
const emptyForm: FormState = {
  name:       '',
  balance:    '',
  annualRate: '',
  startDate:  todayStr(),
  notes:      '',
}

export default function DepositManager({ userId, initialSavings }: Props) {
  const supabase = createClient()

  const [savings,       setSavings]       = useState<SavingsAccount[]>(initialSavings)
  const [showForm,      setShowForm]      = useState(false)
  const [editingId,     setEditingId]     = useState<string | null>(null)
  const [form,          setForm]          = useState<FormState>(emptyForm)
  const [saving,        setSaving_]       = useState(false)
  const [formError,     setFormError]     = useState('')
  const [deletingId,    setDeletingId]    = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  // Detalle de solo lectura (pedido de Cas, ago 2026 — mismo patrón que
  // TermDepositManager): tocar la fila ya no va directo al formulario de
  // edición, muestra un detalle primero; "Editar" es un botón explícito ahí.
  const [detailId,      setDetailId]      = useState<string | null>(null)

  // ── Computed totals ───────────────────────────────────────────────────────
  const totalBalance      = savings.reduce((s, a) => s + a.balance, 0)
  const totalEarned       = savings.reduce((s, a) => s + earnedSoFar(a.balance, a.annual_rate, a.start_date), 0)
  const totalCurrentValue = totalBalance + totalEarned
  const totalDaily        = savings.reduce((s, a) => s + dailyInterest(a.balance, a.annual_rate), 0)
  const totalAnnual       = savings.reduce((s, a) => s + projectedInterest(a.balance, a.annual_rate, 365), 0)

  const avgRate = savings.length > 0
    ? savings.reduce((s, a) => s + a.annual_rate * a.balance, 0) / (totalBalance || 1)
    : 0

  // ── Form helpers ──────────────────────────────────────────────────────────
  function openAdd() {
    setForm(emptyForm); setEditingId(null); setFormError(''); setDeleteConfirm(false); setShowForm(true)
  }
  function openEdit(acc: SavingsAccount) {
    setForm({
      name:       acc.name,
      balance:    String(acc.balance),
      annualRate: String(acc.annual_rate),
      startDate:  acc.start_date,
      notes:      acc.notes ?? '',
    })
    setEditingId(acc.id); setFormError(''); setDeleteConfirm(false); setShowForm(true)
  }
  function cancelForm() {
    setShowForm(false); setEditingId(null); setForm(emptyForm)
    setFormError(''); setDeleteConfirm(false)
  }
  // Hook llamado siempre — el modal es condicional (`{showForm && ...}`) más
  // abajo, pero el hook no puede serlo sin romper el orden de hooks (bug
  // real: crasheaba al abrir el modal, reportado por Cas).
  const backdropClose = useBackdropClose(cancelForm)

  function closeDetail() { setDetailId(null) }
  // Mismo motivo que backdropClose arriba: hook llamado siempre, el modal
  // de detalle es condicional más abajo.
  const detailBackdropClose = useBackdropClose(closeDetail)

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const saveAccount = useCallback(async () => {
    const name       = form.name.trim()
    const balance    = parseInt(form.balance.replace(/\D/g, '') || '0')
    const annualRate = parseFloat(form.annualRate)

    if (!name)                                  { setFormError('Ingresa el nombre de la cuenta'); return }
    if (!balance || balance < 1)                { setFormError('Monto inválido'); return }
    if (isNaN(annualRate) || annualRate <= 0)   { setFormError('Tasa anual inválida'); return }
    if (!form.startDate)                        { setFormError('Fecha de inicio requerida'); return }

    setSaving_(true); setFormError('')
    const payload = {
      user_id:     userId,
      name,
      balance,
      annual_rate: annualRate,
      start_date:  form.startDate,
      notes:       form.notes.trim() || null,
      updated_at:  new Date().toISOString(),
    }

    if (editingId) {
      const { error } = await supabase.from('savings_accounts')
        .update(payload).eq('id', editingId).eq('user_id', userId)
      setSaving_(false)
      if (error) { setFormError(error.message); return }
      setSavings(prev => prev.map(a => a.id === editingId ? { ...a, ...payload } : a))
    } else {
      const { data, error } = await supabase.from('savings_accounts')
        .insert(payload).select().single()
      setSaving_(false)
      if (error) { setFormError(error.message); return }
      setSavings(prev => [...prev, data as SavingsAccount].sort((a, b) => a.start_date.localeCompare(b.start_date)))
    }
    cancelForm()
  }, [form, editingId, userId, supabase])

  async function deleteAccount(id: string) {
    setDeletingId(id)
    await supabase.from('savings_accounts').delete().eq('id', id).eq('user_id', userId)
    setSavings(prev => prev.filter(a => a.id !== id))
    setDeletingId(null)
    cancelForm()
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  const previewBalance = parseInt(form.balance.replace(/\D/g, '') || '0')
  const previewRate    = parseFloat(form.annualRate) || 0
  const previewDaily   = previewBalance > 0 && previewRate > 0
    ? dailyInterest(previewBalance, previewRate)
    : null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div id="ahorro" className="space-y-4 scroll-mt-20">

      {/* ── Header de sección (A1, roadmap ahorro+depósitos: el toggle de tabs
          ahora vive una sola vez en page.tsx — este manager ya no dibuja el
          suyo propio, para poder convivir con TermDepositManager en la misma
          pantalla sin duplicar tabs ni botones "Agregar") ─────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Cuentas de ahorro</h2>
          {savings.length > 0 && (
            <div className="flex items-center gap-2 min-w-0 text-[11px] mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--mint)' }} />
              <span style={{ color: 'var(--mint)' }} className="font-semibold">
                {fmtPct(avgRate)} TAE · +{formatCLP(totalDaily)}/día
              </span>
            </div>
          )}
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

      {/* ── Modal add/edit ───────────────────────────────────────────────── */}
      {showForm && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          {...backdropClose}
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
                {editingId ? 'Editar cuenta' : 'Nueva cuenta de ahorro'}
              </h2>
              <button
                onClick={cancelForm}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(92dvh - 120px)' }}>

              {/* Nombre */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Nombre de la cuenta
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ej: Mercado Pago, Fintual, BancoEstado"
                  maxLength={60}
                  className="w-full text-sm border px-4 py-3"
                  style={inputBase}
                  onFocus={focusOn} onBlur={focusOff}
                  autoFocus
                />
              </div>

              {/* Saldo + Tasa */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                    Saldo actual (CLP)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={fmtInput(form.balance)}
                    onChange={e => setForm(f => ({ ...f, balance: e.target.value.replace(/\D/g, '') }))}
                    placeholder="$0"
                    className="w-full text-sm border px-4 py-3 tabular-nums"
                    style={inputBase}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                    Tasa anual (% TAE)
                  </label>
                  <input
                    type="number"
                    value={form.annualRate}
                    onChange={e => setForm(f => ({ ...f, annualRate: e.target.value }))}
                    placeholder="12.5"
                    min="0.01"
                    max="100"
                    step="0.01"
                    className="w-full text-sm border px-4 py-3"
                    style={inputBase}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
              </div>

              {/* Chip de preview diario */}
              {previewDaily !== null && previewDaily > 0 && (
                <div
                  className="px-4 py-2.5 rounded-xl flex items-center gap-2"
                  style={{ background: 'rgba(31,190,141,0.08)', border: '1px solid rgba(31,190,141,0.2)' }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--mint)' }}>
                    Ganas por día
                  </span>
                  <span className="text-sm font-extrabold tabular-nums ml-auto" style={{ color: 'var(--mint)' }}>
                    +{fmtCLP(previewDaily)}
                  </span>
                </div>
              )}

              {/* Fecha del saldo */}
              {/* sep 2026 (Cas cuadró su Copec Pay contra la cartola real y no
                  daba): decía "Fecha de inicio", que se lee como "cuándo abrí
                  la cuenta" — pero la app la usa como "desde cuándo vale el
                  saldo que escribiste" para devengar el interés. Cas puso el
                  1 de julio cuando el saldo era del 7: seis días de interés de
                  más, $1.734 inflados. La etiqueta ahora pregunta lo que de
                  verdad necesita saber. */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  ¿De qué día es ese saldo?
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  max={todayStr()}
                  className="w-full text-sm border px-4 py-3"
                  style={inputBase}
                  onFocus={focusOn} onBlur={focusOff}
                />
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-3)' }}>
                  El día en que viste ese monto en la app del banco — desde ahí se calcula el interés.
                </p>
              </div>

              {/* Nota */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Nota (opcional)
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="ej: tasa variable, cuenta remunerada"
                  maxLength={80}
                  className="w-full text-sm border px-4 py-3"
                  style={inputBase}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              {formError && (
                <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{formError}</p>
              )}

              {/* Confirmación de eliminación */}
              {deleteConfirm && editingId && (
                <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,111,97,0.08)', border: '1px solid rgba(255,111,97,0.25)' }}>
                  <p className="text-sm text-center font-medium" style={{ color: 'var(--ink-2)' }}>
                    ¿Eliminar esta cuenta?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDeleteConfirm(false)}
                      className="flex-1 py-2.5 text-sm font-semibold rounded-xl border transition-colors"
                      style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => editingId && deleteAccount(editingId)}
                      disabled={!!deletingId}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold rounded-xl disabled:opacity-50"
                      style={{ background: 'var(--coral)', color: 'white' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </button>
                  </div>
                </div>
              )}

              {/* Footer buttons */}
              {!deleteConfirm && (
                <div className="flex items-center gap-2 pt-1">
                  {editingId && (
                    <button
                      onClick={() => setDeleteConfirm(true)}
                      className="w-10 h-10 flex items-center justify-center rounded-xl border shrink-0 transition-colors"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink-3)', background: 'var(--surface-2)' }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={cancelForm}
                    className="flex-1 py-2.5 text-sm font-semibold rounded-xl border transition-colors"
                    style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveAccount}
                    disabled={saving}
                    className="flex-1 py-2.5 text-sm font-bold rounded-xl disabled:opacity-50 transition-all active:scale-[.98]"
                    style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 16px var(--shadow)' }}
                  >
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Detalle de solo lectura (pedido de Cas, ago 2026) ─────────────── */}
      {(() => {
        const acc = detailId ? savings.find(a => a.id === detailId) ?? null : null
        if (!acc) return null
        const earned  = earnedSoFar(acc.balance, acc.annual_rate, acc.start_date)
        const days    = daysElapsed(acc.start_date)
        const daily   = dailyInterest(acc.balance, acc.annual_rate)
        const annual  = projectedInterest(acc.balance, acc.annual_rate, 365)

        return (
          <div
            className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.65)' }}
            {...detailBackdropClose}
          >
            <div
              className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-hidden"
              style={{ background: 'var(--surface)', maxHeight: '92dvh' }}
            >
              <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

              <div className="flex items-center gap-3 px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <ServiceLogo domain={domainFromSavingsName(acc.name)} name={acc.name} size={40} fallbackColor={avatarColor(acc.name)} />
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold truncate" style={{ color: 'var(--ink)' }}>{acc.name}</h2>
                  <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{fmtPct(acc.annual_rate)} TAE</p>
                </div>
                <button
                  onClick={closeDetail}
                  className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(92dvh - 190px)' }}>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                  Desde {fmtDate(acc.start_date)} · {days} día{days !== 1 ? 's' : ''}
                </p>

                {/* Cifras clave */}
                <div className="rounded-2xl overflow-hidden divide-y" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Saldo depositado</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(acc.balance)}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Interés ganado a hoy</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--mint)' }}>+{formatCLP(earned)}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Ganas por día</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--mint)' }}>+{formatCLP(daily)}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Proyección 12 meses</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--mint)' }}>+{formatCLP(annual)}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Valor actual</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(acc.balance + earned)}</span>
                  </div>
                </div>

                {/* Nota completa, sin truncar — en la fila de la lista solo cabe una línea */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>
                    Nota
                  </p>
                  <p className="text-sm" style={{ color: acc.notes ? 'var(--ink-2)' : 'var(--ink-3)' }}>
                    {acc.notes || 'Sin nota — agrégala al editar.'}
                  </p>
                </div>
              </div>

              <div className="border-t px-5 py-3 flex items-center gap-2 flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                <button
                  onClick={closeDetail}
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl border transition-colors"
                  style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                >
                  Cerrar
                </button>
                <button
                  onClick={() => { setDetailId(null); openEdit(acc) }}
                  className="flex-1 py-2.5 text-sm font-bold rounded-xl transition-all active:scale-[.98]"
                  style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 16px var(--shadow)' }}
                >
                  Editar
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {savings.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-16 text-center px-6">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(31,190,141,0.1)' }}
          >
            <Landmark className="w-7 h-7" style={{ color: 'var(--mint)' }} />
          </div>
          <p className="text-base font-bold mb-1" style={{ color: 'var(--ink)' }}>Sin cuentas de ahorro</p>
          <p className="text-sm mb-5 max-w-xs" style={{ color: 'var(--ink-3)' }}>
            Registra tu cuenta para ver cuánto estás ganando cada día.
          </p>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
          >
            <Plus className="w-4 h-4" />
            Agregar cuenta
          </button>
        </div>
      )}

      {/* ── Mini-hero (mockup de Cas, ago 2026): una sola fila compacta en vez
          del hero-gradient 40% + grid de 3 KPI cards + fila Hoy/30d/12m de
          antes — el detalle diario ya vive en el chip del header de arriba. */}
      {savings.length > 0 && (
        <StatHeroRow
          variant="surface"
          label="Total en ahorro"
          value={formatCLP(totalCurrentValue)}
          stats={[
            { label: 'Depositado',      value: formatCLP(totalBalance) },
            { label: 'Interés',         value: `+${formatCLP(totalEarned)}`, color: 'var(--mint)' },
            { label: 'Proyección 12m',  value: `+${formatCLP(totalAnnual)}`, color: 'var(--mint)' },
          ]}
        />
      )}

      {/* ── Tabla de cuentas ─────────────────────────────────────────────── */}
      {savings.length > 0 && (
        <div className="card overflow-hidden">

          {/* Fila única (mockup de Cas): antes había una tabla ancha para
              desktop y otra fila compacta para mobile — se unificaron en
              una sola, más legible y sin duplicar markup. */}
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {savings.map(acc => {
              const earned = earnedSoFar(acc.balance, acc.annual_rate, acc.start_date)
              const days   = daysElapsed(acc.start_date)

              return (
                <button
                  key={acc.id}
                  onClick={() => setDetailId(acc.id)}
                  className="w-full text-left group px-4 lg:px-6 py-3.5 hover:bg-[var(--surface-2)] transition-colors active:opacity-80 flex items-center gap-3"
                >
                  <ServiceLogo
                    domain={domainFromSavingsName(acc.name)}
                    name={acc.name}
                    size={40}
                    fallbackColor={avatarColor(acc.name)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{acc.name}</p>
                    <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>
                      {fmtPct(acc.annual_rate)} TAE · desde {fmtDate(acc.start_date)} · {days} día{days !== 1 ? 's' : ''}
                    </p>
                    {acc.notes && (
                      <p className="text-[10px] truncate" style={{ color: 'var(--ink-3)' }}>{acc.notes}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Saldo</p>
                    <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {formatCLP(acc.balance)}
                    </p>
                    <p className="text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--ink-3)' }}>Ganado</p>
                    <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--mint)' }}>
                      +{formatCLP(earned)}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--ink-3)' }} />
                </button>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}
