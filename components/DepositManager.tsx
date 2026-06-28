'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Pencil, Trash2, Check, Landmark, Clock } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import type { TermDeposit } from '@/app/(dashboard)/inversiones/page'

interface Props {
  userId:          string
  initialDeposits: TermDeposit[]
}

interface FormState {
  bank:         string
  amount:       string
  interestRate: string
  startDate:    string
  maturityDate: string
  notes:        string
}

const todayStr = new Date().toISOString().split('T')[0]
const emptyForm: FormState = {
  bank:         '',
  amount:       '',
  interestRate: '',
  startDate:    todayStr,
  maturityDate: '',
  notes:        '',
}

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

function fmtInput(raw: string): string {
  const n = raw.replace(/\D/g, '')
  if (!n) return ''
  return parseInt(n).toLocaleString('es-CL')
}

function daysUntil(dateStr: string): number {
  const d   = new Date(dateStr + 'T12:00:00')
  const now = new Date()
  return Math.ceil((d.getTime() - now.getTime()) / 86_400_000)
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end   + 'T12:00:00')
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86_400_000))
}

function calcReturn(amount: number, rate: number, days: number): number {
  return Math.round(amount * (rate / 100) * (days / 365))
}

export default function DepositManager({ userId, initialDeposits }: Props) {
  const supabase = createClient()

  const [deposits,   setDeposits]   = useState<TermDeposit[]>(initialDeposits)
  const [showForm,   setShowForm]   = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [form,       setForm]       = useState<FormState>(emptyForm)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function openAdd() {
    setForm(emptyForm); setEditingId(null); setError(''); setShowForm(true)
  }
  function openEdit(dep: TermDeposit) {
    setForm({
      bank:         dep.bank,
      amount:       String(dep.amount),
      interestRate: String(dep.interest_rate),
      startDate:    dep.start_date,
      maturityDate: dep.maturity_date,
      notes:        dep.notes ?? '',
    })
    setEditingId(dep.id); setError(''); setShowForm(true)
  }
  function cancelForm() {
    setShowForm(false); setEditingId(null); setForm(emptyForm); setError('')
  }

  async function saveDeposit() {
    const bank   = form.bank.trim()
    const amount = parseInt(form.amount.replace(/\D/g, ''))
    const rate   = parseFloat(form.interestRate)

    if (!bank)                                            { setError('Ingresa el banco o institución'); return }
    if (!amount || amount < 1)                            { setError('Monto inválido'); return }
    if (isNaN(rate) || rate < 0 || rate > 100)            { setError('Tasa inválida (0–100%)'); return }
    if (!form.startDate)                                  { setError('Fecha de inicio requerida'); return }
    if (!form.maturityDate || form.maturityDate <= form.startDate) { setError('La fecha de vencimiento debe ser posterior al inicio'); return }

    setSaving(true); setError('')

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
      const { error: err } = await supabase
        .from('term_deposits')
        .update(payload)
        .eq('id', editingId)
        .eq('user_id', userId)

      setSaving(false)
      if (err) { setError('Error al guardar'); return }
      setDeposits(prev =>
        prev
          .map(d => d.id === editingId ? { ...d, ...payload } : d)
          .sort((a, b) => a.maturity_date.localeCompare(b.maturity_date))
      )
    } else {
      const { data, error: err } = await supabase
        .from('term_deposits')
        .insert(payload)
        .select()
        .single()

      setSaving(false)
      if (err) { setError('Error al guardar'); return }
      setDeposits(prev =>
        [...prev, data as TermDeposit]
          .sort((a, b) => a.maturity_date.localeCompare(b.maturity_date))
      )
    }
    cancelForm()
  }

  async function deleteDeposit(id: string) {
    setDeletingId(id)
    await supabase.from('term_deposits').delete().eq('id', id).eq('user_id', userId)
    setDeposits(prev => prev.filter(d => d.id !== id))
    setDeletingId(null)
  }

  // Summary totals
  const totalDeposited = deposits.reduce((s, d) => s + d.amount, 0)
  const totalReturn    = deposits.reduce((s, d) =>
    s + calcReturn(d.amount, d.interest_rate, daysBetween(d.start_date, d.maturity_date)), 0)
  const nextMaturity   = deposits.find(d => daysUntil(d.maturity_date) > 0)

  // Preview for form
  const previewReturn =
    form.amount && form.interestRate && form.startDate && form.maturityDate &&
    form.maturityDate > form.startDate
      ? calcReturn(
          parseInt(form.amount) || 0,
          parseFloat(form.interestRate) || 0,
          daysBetween(form.startDate, form.maturityDate)
        )
      : null

  return (
    <div className="space-y-4">

      {/* ── KPI summary ───────────────────────────────────────────────────── */}
      {deposits.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Total depositado</p>
            <p className="text-xl font-extrabold tabular-nums leading-tight" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>
              {formatCLP(totalDeposited)}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Retorno esperado</p>
            <p className="text-xl font-extrabold tabular-nums leading-tight" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--mint)' }}>
              +{formatCLP(totalReturn)}
            </p>
          </div>
          {nextMaturity && (
            <div className="card p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Próximo vencimiento</p>
              <p className="text-xl font-extrabold tabular-nums leading-tight" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--gold)' }}>
                {daysUntil(nextMaturity.maturity_date)} días
              </p>
              <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--ink-3)' }}>{nextMaturity.bank}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Main card ──────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">

        {/* Header */}
        <div
          className="flex items-center justify-between px-4 lg:px-6 py-3 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
            {deposits.length} {deposits.length === 1 ? 'depósito' : 'depósitos'}
          </p>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all active:scale-[.97]"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 4px 12px var(--shadow)' }}
          >
            <Plus className="w-3.5 h-3.5" /> Agregar
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="px-4 lg:px-6 py-4 border-b" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--ink-3)' }}>
              {editingId ? 'Editar depósito' : 'Nuevo depósito'}
            </p>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">

              <div className="col-span-2 lg:col-span-1">
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--ink-3)' }}>Banco / Institución</label>
                <input
                  type="text"
                  value={form.bank}
                  onChange={e => setForm(f => ({ ...f, bank: e.target.value }))}
                  placeholder="ej: Banco Estado"
                  maxLength={60}
                  className="w-full text-sm border px-3 py-2"
                  style={inputBase}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--ink-3)' }}>Monto (CLP)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={fmtInput(form.amount)}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value.replace(/\D/g, '') }))}
                  placeholder="$0"
                  className="w-full text-sm border px-3 py-2 tabular-nums"
                  style={inputBase}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--ink-3)' }}>Tasa anual (%)</label>
                <input
                  type="number"
                  value={form.interestRate}
                  onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))}
                  placeholder="4.5"
                  min="0"
                  max="100"
                  step="0.01"
                  className="w-full text-sm border px-3 py-2"
                  style={inputBase}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--ink-3)' }}>Fecha inicio</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full text-sm border px-3 py-2"
                  style={inputBase}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--ink-3)' }}>Fecha vencimiento</label>
                <input
                  type="date"
                  value={form.maturityDate}
                  onChange={e => setForm(f => ({ ...f, maturityDate: e.target.value }))}
                  min={form.startDate}
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
                  placeholder="ej: renovación automática"
                  maxLength={80}
                  className="w-full text-sm border px-3 py-2"
                  style={inputBase}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

            </div>

            {/* Return preview */}
            {previewReturn !== null && previewReturn > 0 && (
              <div
                className="rounded-xl px-3 py-2 mb-3 text-xs font-semibold"
                style={{ background: 'rgba(31,190,141,0.08)', color: 'var(--mint)' }}
              >
                Retorno esperado: +{formatCLP(previewReturn)} en {daysBetween(form.startDate, form.maturityDate)} días
              </div>
            )}

            {error && <p className="text-xs mb-2 font-medium" style={{ color: 'var(--coral)' }}>{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={saveDeposit}
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
        {deposits.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'rgba(251,191,36,0.12)' }}>
              <Landmark className="w-6 h-6" style={{ color: 'var(--gold)' }} />
            </div>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink-2)' }}>Sin depósitos</p>
            <p className="text-xs mb-4" style={{ color: 'var(--ink-3)' }}>Registrá tus depósitos a plazo para ver el retorno esperado.</p>
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl"
              style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 14px var(--shadow)' }}
            >
              <Plus className="w-4 h-4" /> Agregar depósito
            </button>
          </div>
        )}

        {/* Deposit list */}
        {deposits.length > 0 && (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {deposits.map(dep => {
              const days           = daysBetween(dep.start_date, dep.maturity_date)
              const remaining      = daysUntil(dep.maturity_date)
              const isExpired      = remaining <= 0
              const expectedReturn = calcReturn(dep.amount, dep.interest_rate, days)
              const maturityFmt    = new Date(dep.maturity_date + 'T12:00:00').toLocaleDateString('es-CL', {
                day: 'numeric', month: 'short', year: 'numeric',
              })

              return (
                <div key={dep.id} className="px-4 lg:px-6 py-4 flex items-start gap-4">

                  {/* Icon */}
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(251,191,36,0.12)' }}
                  >
                    <Landmark className="w-4 h-4" style={{ color: 'var(--gold)' }} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{dep.bank}</p>
                        {dep.notes && (
                          <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{dep.notes}</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => openEdit(dep)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: 'var(--ink-3)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteDeposit(dep.id)}
                          disabled={deletingId === dep.id}
                          className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                          style={{ color: 'var(--ink-3)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--coral)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Amounts row */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(dep.amount)}</span>
                      <span style={{ color: 'var(--ink-3)' }}>{dep.interest_rate}% anual</span>
                      <span className="font-semibold tabular-nums" style={{ color: 'var(--mint)' }}>
                        +{formatCLP(expectedReturn)}
                      </span>
                    </div>

                    {/* Maturity row */}
                    <div className="mt-1.5 flex items-center gap-2">
                      <Clock className="w-3 h-3 shrink-0" style={{ color: 'var(--ink-3)' }} />
                      <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Vence {maturityFmt}</span>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={
                          isExpired
                            ? { background: 'rgba(255,111,97,0.12)', color: 'var(--coral)' }
                            : remaining <= 30
                            ? { background: 'rgba(255,194,60,0.15)', color: 'var(--gold)' }
                            : { background: 'rgba(31,190,141,0.12)', color: 'var(--mint)' }
                        }
                      >
                        {isExpired
                          ? 'Vencido'
                          : remaining <= 60
                          ? `${remaining} días`
                          : `${Math.round(remaining / 30)} meses`}
                      </span>
                    </div>
                  </div>

                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
