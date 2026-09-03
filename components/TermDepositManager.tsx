'use client'

import { useState, useCallback } from 'react'
import { useBackdropClose } from '@/components/useBackdropClose'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Timer, Trash2, ChevronRight, CheckCircle2 } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import ServiceLogo from '@/components/ServiceLogo'
import StatHeroRow from '@/components/StatHeroRow'
import {
  daysBetween, addDaysStr, totalInterest, earnedToDate, progressPct, daysToMaturity,
} from '@/lib/term-deposits'
import { CL_INSTITUTIONS, domainFromBankName } from '@/lib/cl-banks'
import type { TermDeposit } from '@/app/(dashboard)/inversiones/page'

// El mapa de dominios y la lista de instituciones viven juntos en
// lib/cl-banks.ts (sep 2026) — antes el mapa estaba acá suelto y el campo era
// texto libre sin sugerencias, así que había dos cosas que mantener a mano.

function avatarColor(name: string): string {
  const palette = ['#2B7CF6','#1FBE8D','#FF6F61','#FFC23C','#A78BFA','#F472B6','#34D399','#FB923C']
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return palette[Math.abs(h) % palette.length]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr(): string {
  // Chile time (UTC-3 / UTC-4 según horario de verano). No usar toISOString()
  // porque es UTC — después de las ~21-22h en Santiago ya dice "mañana" y la
  // barra de progreso avanza un día de más.
  const cl = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }))
  return `${cl.getFullYear()}-${String(cl.getMonth() + 1).padStart(2, '0')}-${String(cl.getDate()).padStart(2, '0')}`
}

function fmtPct(n: number): string {
  return n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + '%'
}

function fmtDateShort(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-CL', {
    day: 'numeric', month: 'short',
  })
}

function fmtDateFull(dateStr: string): string {
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
  termDays:     string  // plazo en días — al completarlo, calcula el vencimiento por defecto
  maturityDate: string
  renewable:    boolean
  notes:        string
}
const emptyForm: FormState = {
  bank: '', amount: '', interestRate: '', startDate: todayStr(), termDays: '', maturityDate: '', renewable: false, notes: '',
}

// Estado del mini-form de renovación (solo lo que cambia entre ciclos)
interface RenewState {
  newRate:       string   // nueva tasa del período
  compoundCapital: boolean  // true = capital + interés; false = solo capital
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
  // Detalle de un depósito (pedido de Cas, ago 2026): antes tocar la fila iba
  // directo al formulario de edición — no había forma de solo MIRAR el
  // detalle (nota completa, fechas, progreso) sin entrar en modo editar.
  // Ahora la fila abre este detalle de solo lectura; "Editar" es un botón
  // explícito ahí adentro.
  const [detailId,      setDetailId]      = useState<string | null>(null)
  // Flujo de renovación: se abre desde el detalle de un depósito vencido
  const [renewId,       setRenewId]       = useState<string | null>(null)
  const [renewState,    setRenewState]    = useState<RenewState>({ newRate: '', compoundCapital: true })
  const [renewSaving,   setRenewSaving]   = useState(false)
  const [renewError,    setRenewError]    = useState('')

  // ── Computed ──────────────────────────────────────────────────────────────
  const today    = todayStr()
  const active   = deposits.filter(d => daysToMaturity(d, today) >= 0)
  const matured  = deposits.filter(d => daysToMaturity(d, today) < 0)

  const totalInvested = active.reduce((s, d) => s + d.amount, 0)
  const totalAtEnd    = active.reduce((s, d) => s + d.amount + totalInterest(d), 0)
  const totalEarnAll  = active.reduce((s, d) => s + totalInterest(d), 0)
  const totalAccrued  = active.reduce((s, d) => s + earnedToDate(d, today), 0)

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
      termDays:     String(daysBetween(d.start_date, d.maturity_date)),
      maturityDate: d.maturity_date,
      renewable:    d.renewable ?? false,
      notes:        d.notes ?? '',
    })
    setEditingId(d.id); setFormError(''); setDeleteConfirm(false); setShowForm(true)
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
      renewable:     form.renewable,
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

  // ── Renovación: nuevo ciclo con la tasa nueva ─────────────────────────────
  function openRenew(d: TermDeposit) {
    setRenewId(d.id)
    setRenewState({ newRate: '', compoundCapital: true })
    setRenewError('')
    setDetailId(null)
  }
  function closeRenew() { setRenewId(null); setRenewError('') }

  const renewBackdropClose = useBackdropClose(closeRenew)

  const saveRenewal = useCallback(async () => {
    const d = renewId ? deposits.find(x => x.id === renewId) ?? null : null
    if (!d) return

    const rate = parseFloat(renewState.newRate)
    if (isNaN(rate) || rate <= 0) { setRenewError('Ingresa la nueva tasa del período'); return }

    const prevInterest   = totalInterest(d)
    const newAmount      = renewState.compoundCapital ? d.amount + prevInterest : d.amount
    const prevDays       = daysBetween(d.start_date, d.maturity_date)
    const newStartDate   = d.maturity_date
    const newMaturityDate = addDaysStr(newStartDate, prevDays)

    setRenewSaving(true); setRenewError('')
    const payload = {
      user_id:       userId,
      bank:          d.bank,
      amount:        newAmount,
      interest_rate: rate,
      start_date:    newStartDate,
      maturity_date: newMaturityDate,
      renewable:     d.renewable ?? false,
      notes:         d.notes ?? null,
    }
    const { data, error } = await supabase.from('term_deposits').insert(payload).select().single()
    setRenewSaving(false)
    if (error) { setRenewError(error.message); return }
    setDeposits(prev => [...prev, data as TermDeposit].sort((a, b) => a.maturity_date.localeCompare(b.maturity_date)))
    closeRenew()
  }, [renewId, renewState, deposits, userId, supabase])

  // ── Preview del interés en el formulario ─────────────────────────────────
  const previewAmount   = parseInt(form.amount.replace(/\D/g, '') || '0')
  const previewRate     = parseFloat(form.interestRate) || 0
  const previewInterest = previewAmount > 0 && previewRate > 0
    ? Math.round(previewAmount * (previewRate / 100))
    : null

  // ── Fila de depósito ──────────────────────────────────────────────────────
  function DepositRow({ d, isMatured }: { d: TermDeposit; isMatured: boolean }) {
    const interest = totalInterest(d)
    const accrued  = earnedToDate(d, today)
    const pct      = progressPct(d, today)
    const days     = daysToMaturity(d, today)
    const soon     = !isMatured && days <= 7
    // P6 — plata ociosa: cuánto tiempo lleva vencido sin reinvertir. A los 30
    // días el tono pasa a gold para que no quede invisible entre los "sanos".
    const daysIdle = isMatured ? -days : 0
    const idleLong = isMatured && daysIdle >= 30

    const statusColor = isMatured ? (idleLong ? 'var(--gold)' : 'var(--mint)') : soon ? 'var(--gold)' : 'var(--primary)'
    // Subtitulo (mockup de Cas, ago 2026): tasa + vencimiento en una sola línea
    // — antes la tasa vivía junto al nombre del banco en la línea 1.
    const venceText  = isMatured
      ? daysIdle <= 0 ? 'venció hoy' : `venció hace ${daysIdle} día${daysIdle !== 1 ? 's' : ''}`
      : days === 0 ? 'vence hoy'
      : `vence ${fmtDateShort(d.maturity_date)} · en ${days} día${days !== 1 ? 's' : ''}`
    const statusText = `${fmtPct(d.interest_rate)} período · ${venceText}`

    return (
      <button
        onClick={() => setDetailId(d.id)}
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
              {isMatured && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 uppercase tracking-wide inline-flex items-center gap-1"
                  style={idleLong
                    ? { background: 'rgba(255,194,60,0.18)', color: 'var(--gold)' }
                    : { background: 'rgba(31,190,141,0.12)', color: 'var(--mint)' }}>
                  <CheckCircle2 className="w-2.5 h-2.5" /> {idleLong ? 'Reinvierte' : 'Vencido'}
                </span>
              )}
              {!isMatured && d.renewable && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 uppercase tracking-wide"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                  Renovable
                </span>
              )}
            </div>
            <p className="text-[11px] mt-0.5" style={{ color: soon ? 'var(--gold)' : 'var(--ink-3)' }}>
              {statusText}
            </p>
            {/* Para qué es (pedido de Cas, ago 2026): la nota quedaba solo
                adentro del formulario de edición — ahora se ve directo en la
                fila, mismo patrón que ya usa DepositManager para Ahorro. */}
            {d.notes && (
              <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--ink-3)' }}>{d.notes}</p>
            )}
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
    <div id="depositos" className="space-y-4 scroll-mt-20">

      {/* ── Header de sección (A1, roadmap ahorro+depósitos: el toggle de tabs
          ahora vive una sola vez en page.tsx — este manager ya no dibuja el
          suyo propio, para poder convivir con DepositManager en la misma
          pantalla sin duplicar tabs ni botones "Agregar") ─────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Depósitos a plazo</h2>
          {active.length > 0 && nextMaturity && (
            <div className="flex items-center gap-2 min-w-0 text-[11px] mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--primary)' }} />
              <span style={{ color: 'var(--ink-2)' }} className="font-semibold truncate">
                {(() => {
                  const d = daysToMaturity(nextMaturity, today)
                  return d === 0 ? 'Próx. vencimiento hoy' : `Próx. vencimiento en ${d} día${d !== 1 ? 's' : ''}`
                })()}
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
                {/* sep 2026 (Cas: "aquí en banco debería desplegar y mostrar
                    los bancos de chile"): datalist en vez de un <select>
                    porque el campo tiene que seguir aceptando cualquier cosa
                    — cooperativas chicas, una caja, "el colchón". La lista
                    sugiere mientras escribes y filtra sola; elegir una opción
                    garantiza además que el logo salga bien (mismo archivo
                    resuelve nombre → dominio). */}
                <input
                  type="text"
                  list="cl-institutions"
                  value={form.bank}
                  onChange={e => setForm(f => ({ ...f, bank: e.target.value }))}
                  placeholder="Elige o escribe — ej: Banco de Chile, Coopeuch"
                  maxLength={60}
                  className="w-full text-sm border px-4 py-3"
                  style={inputBase}
                  onFocus={focusOn} onBlur={focusOff}
                  autoFocus
                />
                <datalist id="cl-institutions">
                  {CL_INSTITUTIONS.map(i => <option key={i.domain} value={i.name} />)}
                </datalist>
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

              {/* Fecha de inicio + Plazo (días) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                    Fecha de inicio
                  </label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={e => {
                      const startDate = e.target.value
                      setForm(f => {
                        const days = parseInt(f.termDays)
                        const maturityDate = startDate && !isNaN(days) && days > 0 ? addDaysStr(startDate, days) : f.maturityDate
                        return { ...f, startDate, maturityDate }
                      })
                    }}
                    max={todayStr()}
                    className="w-full text-sm border px-4 py-3"
                    style={inputBase}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                    Plazo (días)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={form.termDays}
                    onChange={e => {
                      const termDays = e.target.value
                      setForm(f => {
                        const days = parseInt(termDays)
                        const maturityDate = f.startDate && !isNaN(days) && days > 0 ? addDaysStr(f.startDate, days) : f.maturityDate
                        return { ...f, termDays, maturityDate }
                      })
                    }}
                    placeholder="35"
                    min="1"
                    className="w-full text-sm border px-4 py-3 tabular-nums"
                    style={inputBase}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
              </div>

              {/* Vencimiento — se autocompleta desde Fecha de inicio + Plazo, pero se puede ajustar */}
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
                <p className="text-[10px] mt-1" style={{ color: 'var(--ink-3)' }}>
                  Calculado desde el plazo — ajústalo si tu banco cuenta los días distinto.
                </p>
              </div>

              {/* Tipo de depósito */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Tipo de depósito
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {([{ value: false, label: 'Fijo' }, { value: true, label: 'Renovable' }] as const).map(opt => {
                    const active = form.renewable === opt.value
                    return (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, renewable: opt.value }))}
                        className="px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all"
                        style={{
                          background:  active ? 'var(--primary-soft)' : 'var(--surface-2)',
                          borderColor: active ? 'var(--primary)' : 'var(--border)',
                          color:       active ? 'var(--primary)' : 'var(--ink-2)',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Nota */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  ¿Para qué es este ahorro? (opcional)
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="ej: fondo de emergencia, viaje, pie de depto"
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

      {/* ── Detalle de solo lectura (pedido de Cas, ago 2026) ─────────────── */}
      {(() => {
        const d = detailId ? deposits.find(x => x.id === detailId) ?? null : null
        if (!d) return null
        const isMatured = daysToMaturity(d, today) < 0
        const interest  = totalInterest(d)
        const accrued   = earnedToDate(d, today)
        const pct       = progressPct(d, today)
        const days      = daysToMaturity(d, today)
        const daysIdle  = isMatured ? -days : 0

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
                <ServiceLogo domain={domainFromBankName(d.bank)} name={d.bank} size={40} fallbackColor={avatarColor(d.bank)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>{d.bank}</h2>
                    {isMatured ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 uppercase tracking-wide inline-flex items-center gap-1"
                        style={daysIdle >= 30
                          ? { background: 'rgba(255,194,60,0.18)', color: 'var(--gold)' }
                          : { background: 'rgba(31,190,141,0.12)', color: 'var(--mint)' }}>
                        <CheckCircle2 className="w-2.5 h-2.5" /> {daysIdle >= 30 ? 'Reinvierte' : 'Vencido'}
                      </span>
                    ) : d.renewable ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 uppercase tracking-wide"
                        style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                        Renovable
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{fmtPct(d.interest_rate)} período</p>
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
                {/* Progreso al vencimiento */}
                {!isMatured && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                        Vence {fmtDateFull(d.maturity_date)}
                      </span>
                      <span className="text-[11px] font-bold" style={{ color: days <= 7 ? 'var(--gold)' : 'var(--ink-2)' }}>
                        {days === 0 ? 'hoy' : `en ${days} día${days !== 1 ? 's' : ''}`}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
                    </div>
                  </div>
                )}
                {isMatured && (
                  <p className="text-[11px] font-semibold" style={{ color: daysIdle >= 30 ? 'var(--gold)' : 'var(--mint)' }}>
                    Venció {fmtDateFull(d.maturity_date)} — hace {daysIdle} día{daysIdle !== 1 ? 's' : ''}
                  </p>
                )}

                {/* Cifras clave */}
                <div className="rounded-2xl overflow-hidden divide-y" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Monto invertido</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(d.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Fecha de inicio</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtDateFull(d.start_date)}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
                      {isMatured ? 'Interés ganado' : 'Devengado a hoy'}
                    </span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--mint)' }}>
                      +{formatCLP(isMatured ? interest : accrued)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Interés total del período</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--mint)' }}>+{formatCLP(interest)}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Total al vencimiento</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(d.amount + interest)}</span>
                  </div>
                </div>

                {/* Para qué es (pedido de Cas, ago 2026): acá se ve completa,
                    sin truncar — en la fila de la lista solo cabe una línea. */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>
                    ¿Para qué es este ahorro?
                  </p>
                  <p className="text-sm" style={{ color: d.notes ? 'var(--ink-2)' : 'var(--ink-3)' }}>
                    {d.notes || 'Sin nota — agrégala al editar.'}
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
                {isMatured ? (
                  <button
                    onClick={() => openRenew(d)}
                    className="flex-1 py-2.5 text-sm font-bold rounded-xl transition-all active:scale-[.98]"
                    style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 16px var(--shadow)' }}
                  >
                    Renovar
                  </button>
                ) : (
                  <button
                    onClick={() => { setDetailId(null); openEdit(d) }}
                    className="flex-1 py-2.5 text-sm font-bold rounded-xl transition-all active:scale-[.98]"
                    style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 16px var(--shadow)' }}
                  >
                    Editar
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

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

      {/* ── Mini-hero (mockup de Cas, ago 2026): una sola fila compacta en vez
          del hero-gradient 40% + grid de 2 KPI cards de antes — la fecha del
          próximo vencimiento ya vive en el chip del header de arriba. */}
      {active.length > 0 && (
        <StatHeroRow
          variant="surface"
          label="Total al vencimiento"
          value={formatCLP(totalAtEnd)}
          caption={`${active.length} depósito${active.length !== 1 ? 's' : ''} vigente${active.length !== 1 ? 's' : ''}`}
          stats={[
            { label: 'Invertido',       value: formatCLP(totalInvested) },
            { label: 'Interés total',   value: `+${formatCLP(totalEarnAll)}`, color: 'var(--mint)' },
            { label: 'Devengado hoy',   value: `+${formatCLP(totalAccrued)}`, color: 'var(--mint)' },
          ]}
        />
      )}

      {/* ── Lista de depósitos vigentes ──────────────────────────────────── */}
      {active.length > 0 && (
        <div className="card overflow-hidden">
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {[...active].sort((a, b) => a.maturity_date.localeCompare(b.maturity_date)).map(d => (
              <DepositRow key={d.id} d={d} isMatured={false} />
            ))}
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

      {/* ── Modal de renovación ──────────────────────────────────────────── */}
      {(() => {
        const d = renewId ? deposits.find(x => x.id === renewId) ?? null : null
        if (!d) return null
        const prevInterest    = totalInterest(d)
        const prevDays        = daysBetween(d.start_date, d.maturity_date)
        const newRate         = parseFloat(renewState.newRate) || 0
        const newAmount       = renewState.compoundCapital ? d.amount + prevInterest : d.amount
        const newMaturityDate = addDaysStr(d.maturity_date, prevDays)
        const previewNewInterest = newRate > 0 ? Math.round(newAmount * (newRate / 100)) : null

        return (
          <div
            className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.65)' }}
            {...renewBackdropClose}
          >
            <div
              className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-hidden"
              style={{ background: 'var(--surface)', maxHeight: '92dvh' }}
            >
              <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

              <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Renovar depósito</h2>
                  <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{d.bank} · {prevDays} días · venció {fmtDateShort(d.maturity_date)}</p>
                </div>
                <button
                  onClick={closeRenew}
                  className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-5 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(92dvh - 120px)' }}>

                {/* Capital del nuevo ciclo */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                    Capital del nuevo ciclo
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      { value: true,  label: `Capital + interés`,  sub: formatCLP(d.amount + prevInterest) },
                      { value: false, label: 'Solo capital',        sub: formatCLP(d.amount) },
                    ] as const).map(opt => {
                      const sel = renewState.compoundCapital === opt.value
                      return (
                        <button
                          key={String(opt.value)}
                          type="button"
                          onClick={() => setRenewState(s => ({ ...s, compoundCapital: opt.value }))}
                          className="px-3 py-2.5 rounded-xl border text-left transition-all"
                          style={{
                            background:  sel ? 'var(--primary-soft)' : 'var(--surface-2)',
                            borderColor: sel ? 'var(--primary)' : 'var(--border)',
                          }}
                        >
                          <p className="text-xs font-semibold" style={{ color: sel ? 'var(--primary)' : 'var(--ink-2)' }}>{opt.label}</p>
                          <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color: sel ? 'var(--primary)' : 'var(--ink)' }}>{opt.sub}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Nueva tasa */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                    Nueva tasa del período (%)
                  </label>
                  <input
                    type="number"
                    value={renewState.newRate}
                    onChange={e => setRenewState(s => ({ ...s, newRate: e.target.value }))}
                    placeholder={`Anterior: ${fmtPct(d.interest_rate)}`}
                    min="0"
                    max="100"
                    step="0.01"
                    className="w-full text-sm border px-4 py-3"
                    style={inputBase}
                    onFocus={focusOn} onBlur={focusOff}
                    autoFocus
                  />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--ink-3)' }}>
                    Tasa del ciclo anterior: {fmtPct(d.interest_rate)}
                  </p>
                </div>

                {/* Preview nuevo ciclo */}
                {previewNewInterest !== null && previewNewInterest > 0 && (
                  <div className="rounded-2xl overflow-hidden divide-y" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Capital renovado</span>
                      <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(newAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Nuevo interés ({prevDays} días)</span>
                      <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--mint)' }}>+{formatCLP(previewNewInterest)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Total al vencimiento</span>
                      <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(newAmount + previewNewInterest)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Vence</span>
                      <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{fmtDateFull(newMaturityDate)}</span>
                    </div>
                  </div>
                )}

                {renewError && (
                  <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{renewError}</p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={closeRenew}
                    className="flex-1 py-2.5 text-sm font-semibold rounded-xl border transition-colors"
                    style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveRenewal}
                    disabled={renewSaving}
                    className="flex-1 py-2.5 text-sm font-bold rounded-xl disabled:opacity-50 transition-all active:scale-[.98]"
                    style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 16px var(--shadow)' }}
                  >
                    {renewSaving ? 'Renovando…' : 'Confirmar renovación'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
