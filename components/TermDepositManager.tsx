'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Timer, Trash2, ChevronRight, CalendarDays, CheckCircle2 } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import ServiceLogo from '@/components/ServiceLogo'
import InversionesToggle from '@/components/InversionesToggle'
import type { TermDeposit } from '@/app/(dashboard)/inversiones/page'

// ── Dominio por nombre de banco ───────────────────────────────────────────────
function domainFromBankName(name: string): string | null {
  const n = name.toLowerCase()
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
  if (n.includes('tenpo'))         return 'tenpo.app'
  if (n.includes('mercado pago') || n.includes('mercadopago')) return 'mercadopago.com'
  if (n.includes('fintual'))       return 'fintual.com'
  return null
}

function avatarColor(name: string): string {
  const palette = ['#2B7CF6','#1FBE8D','#FF6F61','#FFC23C','#A78BFA','#F472B6','#34D399','#FB923C']
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return palette[Math.abs(h) % palette.length]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T12:00:00'), db = new Date(b + 'T12:00:00')
  return Math.round((db.getTime() - da.getTime()) / 86_400_000)
}

/** Interés total del período en CLP: interest_rate es % sobre el capital al vencimiento. */
function totalInterest(d: TermDeposit): number {
  return Math.round(d.amount * (d.interest_rate / 100))
}

/** Interés devengado a hoy (lineal por días transcurridos, capped al total). */
function earnedToDate(d: TermDeposit): number {
  const total = daysBetween(d.start_date, d.maturity_date)
  const gone  = Math.min(Math.max(daysBetween(d.start_date, todayStr()), 0), total)
  return total > 0 ? Math.round(totalInterest(d) * (gone / total)) : 0
}

function progressPct(d: TermDeposit): number {
  const total = daysBetween(d.start_date, d.maturity_date)
  const gone  = Math.min(Math.max(daysBetween(d.start_date, todayStr()), 0), total)
  return total > 0 ? Math.round((gone / total) * 100) : 100
}

function daysToMaturity(d: TermDeposit): number {
  return daysBetween(todayStr(), d.maturity_date)
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

// ── Input styles (mismas normas que DepositManager) ──────────────────────────
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
  userId:          string
  initialDeposits: TermDeposit[]
}
interface FormState {
  bank:         string
  amount:       string  // raw digits
  interestRate: string
  startDate:    string
  maturityDate: string
  notes:        string
}
const emptyForm: FormState = {
  bank: '', amount: '', interestRate: '', startDate: todayStr(), maturityDate: '', notes: '',
}

export default function TermDepositManager({ userId, initialDeposits }: Props) {
  const supabase = createClient()

  const [deposits,      setDeposits]      = useState<TermDeposit[]>(initialDeposits)
  const [showForm,      setShowForm]      = useState(false)
  const [editingId,     setEditingId]     = useState<string | null>(null)
  const [form,          setForm]          = useState<FormState>(emptyForm)
  const [saving,        setSaving_]       = useState(false)
  const [formError,     setFormError]     = useState('')
  const [deletingId,    setDeletingId]    = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // ── Computed ──────────────────────────────────────────────────────────────
  const active   = deposits.filter(d => daysToMaturity(d) >= 0)
  const matured  = deposits.filter(d => daysToMaturity(d) < 0)

  const totalInvested = active.reduce((s, d) => s + d.amount, 0)
  const totalAtEnd    = active.reduce((s, d) => s + d.amount + totalInterest(d), 0)
  const totalEarnAll  = active.reduce((s, d) => s + totalInterest(d), 0)
  const totalAccrued  = active.reduce((s, d) => s + earnedToDate(d), 0)

  const nextMaturity = active.length > 0
    ? [...active].sort((a, b) => a.maturity_date.localeCompare(b.maturity_date))[0]
    : null

  // ── Form helpers ──────────────────────────────────────────────────────────
  function openAdd() {
    setForm(emptyForm); setEditingId(null); setFormError(''); setDeleteConfirm(false); setShowForm(true)
  }
  function openEdit(d: TermDeposit) {
    setForm({
      bank:         d.bank,
      amount:       String(d.amount),
      interestRate: String(d.interest_rate),
      startDate:    d.start_date,
      maturityDate: d.maturity_date,
      notes:        d.notes ?? '',
    })
    setEditingId(d.id); setFormError(''); setDeleteConfirm(false); setShowForm(true)
  }
  function cancelForm() {
    setShowForm(false); setEditingId(null); setForm(emptyForm)
    setFormError(''); setDeleteConfirm(false)
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const saveDeposit = useCallback(async () => {
    const bank   = form.bank.trim()
    const amount = parseInt(form.amount.replace(/\D/g, '') || '0')
    const rate   = parseFloat(form.interestRate)

    if (!bank)                        { setFormError('Ingresa el banco o institución'); return }
    if (!amount || amount < 1)        { setFormError('Monto inválido'); return }
    if (isNaN(rate) || rate < 0)      { setFormError('Interés del período inválido'); return }
    if (!form.startDate)              { setFormError('Fecha de inicio requerida'); return }
    if (!form.maturityDate)           { setFormError('Fecha de vencimiento requerida'); return }
    if (form.maturityDate <= form.startDate) { setFormError('El vencimiento debe ser posterior al inicio'); return }

    setSaving_(true); setFormError('')
    const payload = {
      user_id:       userId,
      bank,
      amount,
      interest_rate: rate,
      start_date:    form.startDate,
      maturity_date: form.maturityDate,
      notes:         form.notes.trim() || null,
    }

    if (editingId) {
      const { error } = await supabase.from('term_deposits')
        .update(payload).eq('id', editingId).eq('user_id', userId)
      setSaving_(false)
      if (error) { setFormError(error.message); return }
      setDeposits(prev => prev.map(d => d.id === editingId ? { ...d, ...payload } : d))
    } else {
      const { data, error } = await supabase.from('term_deposits')
        .insert(payload).select().single()
      setSaving_(false)
      if (error) { setFormError(error.message); return }
      setDeposits(prev => [...prev, data as TermDeposit].sort((a, b) => a.maturity_date.localeCompare(b.maturity_date)))
    }
    cancelForm()
  }, [form, editingId, userId, supabase])

  async function deleteDeposit(id: string) {
    setDeletingId(id)
    await supabase.from('term_deposits').delete().eq('id', id).eq('user_id', userId)
    setDeposits(prev => prev.filter(d => d.id !== id))
    setDeletingId(null)
    cancelForm()
  }

  // ── Preview del interés en el formulario ─────────────────────────────────
  const previewAmount   = parseInt(form.amount.replace(/\D/g, '') || '0')
  const previewRate     = parseFloat(form.interestRate) || 0
  const previewInterest = previewAmount > 0 && previewRate > 0
    ? Math.round(previewAmount * (previewRate / 100))
    : null

  // ── Fila de depósito ──────────────────────────────────────────────────────
  function DepositRow({ d, isMatured }: { d: TermDeposit; isMatured: boolean }) {
    const interest = totalInterest(d)
    const accrued  = earnedToDate(d)
    const pct      = progressPct(d)
    const days     = daysToMaturity(d)
    const soon     = !isMatured && days <= 7

    const statusColor = isMatured ? 'var(--mint)' : soon ? 'var(--gold)' : 'var(--primary)'
    const statusText  = isMatured
      ? `Venció el ${fmtDate(d.maturity_date)}`
      : days === 0 ? 'Vence hoy'
      : `Vence en ${days} día${days !== 1 ? 's' : ''} · ${fmtDate(d.maturity_date)}`

    return (
      <button
        onClick={() => openEdit(d)}
        className="w-full text-left group px-4 lg:px-6 py-4 hover:bg-[var(--surface-2)] transition-colors active:opacity-80"
      >
        <div className="flex items-center gap-3">
          <ServiceLogo
            domain={domainFromBankName(d.bank)}
            name={d.bank}
            size={40}
            fallbackColor={avatarColor(d.bank)}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{d.bank}</span>
              <span className="text-[10px] font-semibold shrink-0" style={{ color: 'var(--ink-3)' }}>
                {fmtPct(d.interest_rate)} período
              </span>
              {isMatured && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 uppercase tracking-wide inline-flex items-center gap-1"
                  style={{ background: 'rgba(31,190,141,0.12)', color: 'var(--mint)' }}>
                  <CheckCircle2 className="w-2.5 h-2.5" /> Vencido
                </span>
              )}
            </div>
            <p className="text-[11px] mt-0.5" style={{ color: soon ? 'var(--gold)' : 'var(--ink-3)' }}>
              {statusText}
            </p>
            {/* Barra de progreso al vencimiento */}
            {!isMatured && (
              <div className="mt-2 h-1.5 rounded-full overflow-hidden max-w-[240px]" style={{ background: 'var(--surface-2)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: statusColor }} />
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(d.amount)}</p>
            <p className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--mint)' }}>
              {isMatured ? `+${formatCLP(interest)} ganado` : `+${formatCLP(accrued)} de ${formatCLP(interest)}`}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--ink-3)' }} />
        </div>
      </button>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 text-[11px]">
          {active.length > 0 && nextMaturity && (
            <>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--primary)' }} />
              <span style={{ color: 'var(--ink-2)' }} className="font-semibold truncate">
                Próximo vencimiento: {fmtDate(nextMaturity.maturity_date)}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <InversionesToggle active="depositos" />
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

      {/* ── Modal add/edit ───────────────────────────────────────────────── */}
      {showForm && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={e => { if (e.target === e.currentTarget) cancelForm() }}
        >
          <div
            className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-hidden"
            style={{ background: 'var(--surface)', maxHeight: '92dvh' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

            <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>
                {editingId ? 'Editar depósito' : 'Nuevo depósito a plazo'}
              </h2>
              <button
                onClick={cancelForm}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(92dvh - 120px)' }}>

              {/* Banco */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Banco o institución
                </label>
                <input
                  type="text"
                  value={form.bank}
                  onChange={e => setForm(f => ({ ...f, bank: e.target.value }))}
                  placeholder="ej: BancoEstado, Santander, BCI"
                  maxLength={60}
                  className="w-full text-sm border px-4 py-3"
                  style={inputBase}
                  onFocus={focusOn} onBlur={focusOff}
                  autoFocus
                />
              </div>

              {/* Monto + Interés */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                    Monto (CLP)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={fmtInput(form.amount)}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value.replace(/\D/g, '') }))}
                    placeholder="$0"
                    className="w-full text-sm border px-4 py-3 tabular-nums"
                    style={inputBase}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                    Interés del período (%)
                  </label>
                  <input
                    type="number"
                    value={form.interestRate}
                    onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))}
                    placeholder="1.5"
                    min="0"
                    max="100"
                    step="0.01"
                    className="w-full text-sm border px-4 py-3"
                    style={inputBase}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
              </div>

              {/* Chip preview: recibirás al vencimiento */}
              {previewInterest !== null && previewInterest > 0 && (
                <div
                  className="px-4 py-2.5 rounded-xl flex items-center gap-2"
                  style={{ background: 'rgba(31,190,141,0.08)', border: '1px solid rgba(31,190,141,0.2)' }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--mint)' }}>
                    Al vencimiento recibes
                  </span>
                  <span className="text-sm font-extrabold tabular-nums ml-auto" style={{ color: 'var(--mint)' }}>
                    {formatCLP(previewAmount + previewInterest)}
                  </span>
                </div>
              )}

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                    Fecha de inicio
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
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                    Vencimiento
                  </label>
                  <input
                    type="date"
                    value={form.maturityDate}
                    onChange={e => setForm(f => ({ ...f, maturityDate: e.target.value }))}
                    min={form.startDate || undefined}
                    className="w-full text-sm border px-4 py-3"
                    style={inputBase}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
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
                  placeholder="ej: renovable, tasa fija"
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
                    ¿Eliminar este depósito?
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
                      onClick={() => editingId && deleteDeposit(editingId)}
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
                    onClick={saveDeposit}
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

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {deposits.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-16 text-center px-6">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'var(--primary-soft)' }}
          >
            <Timer className="w-7 h-7" style={{ color: 'var(--primary)' }} />
          </div>
          <p className="text-base font-bold mb-1" style={{ color: 'var(--ink)' }}>Sin depósitos a plazo</p>
          <p className="text-sm mb-5 max-w-xs" style={{ color: 'var(--ink-3)' }}>
            Registra tu depósito para seguir cuánto ganas y cuándo vence.
          </p>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
          >
            <Plus className="w-4 h-4" />
            Agregar depósito
          </button>
        </div>
      )}

      {/* ── Hero + KPIs ──────────────────────────────────────────────────── */}
      {active.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-4">

          {/* Hero card — fondo primario sólido según sistema de diseño */}
          <div
            className="rounded-3xl overflow-hidden"
            style={{ flex: '40 1 0', background: 'var(--primary)', boxShadow: '0 8px 18px var(--shadow)' }}
          >
            <div className="px-5 pt-5 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Total al vencimiento
              </p>
              <p
                className="text-4xl lg:text-5xl font-extrabold tabular-nums leading-none"
                style={{ color: 'white', fontFamily: 'Fredoka, sans-serif' }}
              >
                {formatCLP(totalAtEnd)}
              </p>
              <p className="text-[11px] mt-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {active.length} depósito{active.length !== 1 ? 's' : ''} vigente{active.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="border-t grid grid-cols-2" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
              <div className="px-4 py-3 lg:px-5 lg:py-4">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Invertido</p>
                <p className="text-sm lg:text-base font-bold tabular-nums" style={{ color: 'white' }}>
                  {formatCLP(totalInvested)}
                </p>
              </div>
              <div className="px-4 py-3 lg:px-5 lg:py-4 border-l" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Interés total</p>
                <p className="text-sm lg:text-base font-bold tabular-nums" style={{ color: '#7CF2CB' }}>
                  +{formatCLP(totalEarnAll)}
                </p>
              </div>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 w-full lg:min-w-0" style={{ flex: '60 1 0', alignContent: 'stretch' }}>
            <div className="card p-4 lg:p-5 flex flex-col">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-3)' }}>Devengado a hoy</p>
              <p
                className="text-2xl lg:text-3xl font-extrabold tabular-nums leading-none"
                style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--mint)' }}
              >
                +{formatCLP(totalAccrued)}
              </p>
              <p className="text-[11px] mt-1.5 font-medium" style={{ color: 'var(--ink-3)' }}>
                interés ganado hasta hoy
              </p>
            </div>
            <div className="card p-4 lg:p-5 flex flex-col">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-3)' }}>Próximo vencimiento</p>
              {nextMaturity ? (
                <>
                  <p
                    className="text-2xl lg:text-3xl font-extrabold tabular-nums leading-none"
                    style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
                  >
                    {daysToMaturity(nextMaturity)}d
                  </p>
                  <p className="text-[11px] mt-1.5 font-medium truncate" style={{ color: 'var(--ink-3)' }}>
                    {nextMaturity.bank} · {formatCLP(nextMaturity.amount + totalInterest(nextMaturity))}
                  </p>
                </>
              ) : (
                <p className="text-xl font-semibold" style={{ color: 'var(--ink-3)' }}>—</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Lista de depósitos vigentes ──────────────────────────────────── */}
      {active.length > 0 && (
        <div className="card overflow-hidden">
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {[...active].sort((a, b) => a.maturity_date.localeCompare(b.maturity_date)).map(d => (
              <DepositRow key={d.id} d={d} isMatured={false} />
            ))}
          </div>
          <div
            className="px-4 lg:px-6 py-2.5 border-t flex items-center gap-2 text-[10px]"
            style={{ borderColor: 'var(--border)', color: 'var(--ink-3)' }}
          >
            <CalendarDays className="w-3 h-3 shrink-0" />
            <span>Interés simple del período · devengo lineal por días transcurridos</span>
          </div>
        </div>
      )}

      {/* ── Vencidos ─────────────────────────────────────────────────────── */}
      {matured.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-2 px-1" style={{ color: 'var(--ink-3)' }}>
            Vencidos
          </p>
          <div className="card overflow-hidden divide-y" style={{ borderColor: 'var(--border)' }}>
            {[...matured].sort((a, b) => b.maturity_date.localeCompare(a.maturity_date)).map(d => (
              <DepositRow key={d.id} d={d} isMatured />
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
