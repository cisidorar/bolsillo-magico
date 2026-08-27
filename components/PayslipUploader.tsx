'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useBackdropClose } from '@/components/useBackdropClose'
import { formatCLP } from '@/lib/utils'
import { extractPayslipDraft, savePayslip, type SavePayslipInput } from '@/app/actions/payslips'
import type { BreakdownLine } from '@/lib/payslip-parser'
import { Upload, X, Check, Plus, Trash2, FileText, Loader2, AlertTriangle } from 'lucide-react'

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

type Step = 'pick' | 'loading' | 'review' | 'saving' | 'error'

const inputBase: React.CSSProperties = {
  color:        'var(--ink)',
  background:   'var(--surface-2)',
  borderColor:  'var(--border)',
  borderRadius: 12,
  outline:      'none',
  transition:   'border-color 150ms, box-shadow 150ms',
}
function focusOn(e: React.FocusEvent<HTMLElement>) {
  e.currentTarget.style.borderColor = 'var(--primary)'
  e.currentTarget.style.boxShadow   = '0 0 0 3px var(--primary-soft)'
}
function focusOff(e: React.FocusEvent<HTMLElement>) {
  e.currentTarget.style.borderColor = 'var(--border)'
  e.currentTarget.style.boxShadow   = 'none'
}
function fmtInput(n: number): string {
  return n ? n.toLocaleString('es-CL') : ''
}
function parseAmt(raw: string): number {
  return parseInt(raw.replace(/\D/g, '')) || 0
}

interface FormState {
  month: number
  year: number
  employerName: string
  employerRut: string
  position: string
  contractType: string
  contractStart: string | null
  daysWorked: number | null
  ufValue: number | null
  previsionLabel: string
  saludLabel: string
  haberesImponibles: BreakdownLine[]
  haberesNoImponibles: BreakdownLine[]
  descuentosLegales: BreakdownLine[]
  otrosDescuentos: BreakdownLine[]
  totalHaberes: number
  totalDescuentos: number
  liquido: number
}

function emptyForm(month: number, year: number): FormState {
  return {
    month, year,
    employerName: '', employerRut: '', position: '', contractType: '',
    contractStart: null, daysWorked: null, ufValue: null,
    previsionLabel: '', saludLabel: '',
    haberesImponibles: [], haberesNoImponibles: [], descuentosLegales: [], otrosDescuentos: [],
    totalHaberes: 0, totalDescuentos: 0, liquido: 0,
  }
}

function LineGroup({
  title, items, onChange,
}: {
  title: string
  items: BreakdownLine[]
  onChange: (items: BreakdownLine[]) => void
}) {
  const subtotal = items.reduce((s, it) => s + it.amount, 0)
  return (
    <div className="rounded-2xl p-3.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>{title}</span>
        {items.length > 0 && (
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>{formatCLP(subtotal)}</span>
        )}
      </div>
      <div className="space-y-1.5">
        {items.map((it, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <input
              type="text"
              value={it.label}
              onChange={e => onChange(items.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))}
              placeholder="Concepto"
              className="flex-1 text-[13px] border px-2.5 py-1.5"
              style={{ ...inputBase, background: 'var(--surface)' }}
              onFocus={focusOn} onBlur={focusOff}
            />
            <input
              type="text"
              inputMode="numeric"
              value={fmtInput(it.amount)}
              onChange={e => onChange(items.map((x, i) => i === idx ? { ...x, amount: parseAmt(e.target.value) } : x))}
              placeholder="$0"
              className="w-24 text-[13px] font-semibold border px-2.5 py-1.5 text-right tabular-nums"
              style={{ ...inputBase, background: 'var(--surface)' }}
              onFocus={focusOn} onBlur={focusOff}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              className="p-1 rounded-lg shrink-0"
              style={{ color: 'var(--ink-3)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...items, { label: '', amount: 0 }])}
        className="flex items-center gap-1 text-xs font-semibold mt-2"
        style={{ color: 'var(--primary)' }}
      >
        <Plus className="w-3.5 h-3.5" /> Agregar línea
      </button>
    </div>
  )
}

export default function PayslipUploader() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('pick')
  const [error, setError] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function close() {
    setOpen(false)
    setStep('pick')
    setError('')
    setFile(null)
    setForm(null)
  }
  const backdropClose = useBackdropClose(close)

  async function handleFile(f: File) {
    setFile(f)
    setStep('loading')
    setError('')

    const fd = new FormData()
    fd.set('file', f)
    const result = await extractPayslipDraft(fd)

    if (!result.ok) {
      setError(result.error)
      setStep('error')
      return
    }

    const now = new Date()
    const d = result.draft
    setForm({
      month: d.month ?? now.getMonth() + 1,
      year:  d.year ?? now.getFullYear(),
      employerName: d.employerName ?? '',
      employerRut:  d.employerRut ?? '',
      position:     d.position ?? '',
      contractType: d.contractType ?? '',
      contractStart: d.contractStart,
      daysWorked:    d.daysWorked,
      ufValue:       d.ufValue,
      previsionLabel: d.previsionLabel ?? '',
      saludLabel:     d.saludLabel ?? '',
      haberesImponibles:   d.haberesImponibles,
      haberesNoImponibles: d.haberesNoImponibles,
      descuentosLegales:   d.descuentosLegales,
      otrosDescuentos:     d.otrosDescuentos,
      totalHaberes:    d.totalHaberes ?? (d.haberesImponibles.reduce((s, i) => s + i.amount, 0) + d.haberesNoImponibles.reduce((s, i) => s + i.amount, 0)),
      totalDescuentos: d.totalDescuentos ?? (d.descuentosLegales.reduce((s, i) => s + i.amount, 0) + d.otrosDescuentos.reduce((s, i) => s + i.amount, 0)),
      liquido:         d.liquido ?? 0,
    })
    setStep('review')
  }

  async function confirmSave() {
    if (!file || !form) return
    if (!form.liquido || form.liquido <= 0) { setError('Revisa el líquido a recibir — falta o es $0'); return }
    setStep('saving')
    setError('')

    const input: SavePayslipInput = {
      month: form.month, year: form.year,
      employerName: form.employerName || null,
      employerRut:  form.employerRut || null,
      employeeName: null, employeeRut: null,
      position:     form.position || null,
      contractType: form.contractType || null,
      contractStart: form.contractStart,
      daysWorked:    form.daysWorked,
      ufValue:       form.ufValue,
      previsionLabel: form.previsionLabel || null,
      saludLabel:     form.saludLabel || null,
      haberesImponibles:   form.haberesImponibles.filter(i => i.label.trim() && i.amount > 0),
      haberesNoImponibles: form.haberesNoImponibles.filter(i => i.label.trim() && i.amount > 0),
      descuentosLegales:   form.descuentosLegales.filter(i => i.label.trim() && i.amount > 0),
      otrosDescuentos:     form.otrosDescuentos.filter(i => i.label.trim() && i.amount > 0),
      totalHaberes: form.totalHaberes,
      totalDescuentos: form.totalDescuentos,
      liquido: form.liquido,
    }

    const fd = new FormData()
    fd.set('file', file)
    fd.set('data', JSON.stringify(input))
    const result = await savePayslip(fd)

    if (!result.ok) {
      setError(result.error)
      setStep('review')
      return
    }

    close()
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl border transition-all active:scale-[.97] shrink-0"
        style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <Upload className="w-4 h-4" strokeWidth={2.5} />
        Subir liquidación
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          {...backdropClose}
        >
          <div
            className="w-full lg:max-w-lg rounded-t-3xl lg:rounded-3xl overflow-y-auto"
            style={{ background: 'var(--surface)', maxHeight: '92dvh' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

            <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Subir liquidación</h2>
              <button
                onClick={close}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">

              {/* ── Paso 1: elegir archivo ── */}
              {step === 'pick' && (
                <div className="text-center py-6">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex flex-col items-center gap-3 py-10 rounded-2xl border-2 border-dashed transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink-3)' }}
                  >
                    <FileText className="w-8 h-8" style={{ color: 'var(--primary)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>Toca para elegir el PDF</span>
                    <span className="text-xs">Liquidación de sueldo · máx. 8MB</span>
                  </button>
                </div>
              )}

              {/* ── Cargando / parseando ── */}
              {step === 'loading' && (
                <div className="flex flex-col items-center gap-3 py-10">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--primary)' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>Leyendo la liquidación…</p>
                </div>
              )}

              {/* ── Error ── */}
              {step === 'error' && (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <AlertTriangle className="w-7 h-7" style={{ color: 'var(--coral)' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{error}</p>
                  <button
                    onClick={() => setStep('pick')}
                    className="mt-2 px-4 py-2 text-sm font-semibold rounded-xl border"
                    style={{ color: 'var(--ink-2)', borderColor: 'var(--border)' }}
                  >
                    Intentar de nuevo
                  </button>
                </div>
              )}

              {/* ── Revisión / confirmación ── */}
              {(step === 'review' || step === 'saving') && form && (
                <>
                  <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                    Revisa que los montos estén correctos antes de guardar — puedes editar cualquier campo.
                  </p>

                  {/* Mes / Año */}
                  <div className="flex gap-2">
                    <select
                      value={form.month}
                      onChange={e => setForm({ ...form, month: parseInt(e.target.value) })}
                      className="flex-1 text-sm border px-3 py-2.5"
                      style={inputBase}
                    >
                      {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.year}
                      onChange={e => setForm({ ...form, year: parseInt(e.target.value.replace(/\D/g, '')) || form.year })}
                      className="w-24 text-sm border px-3 py-2.5 tabular-nums"
                      style={inputBase}
                      onFocus={focusOn} onBlur={focusOff}
                    />
                  </div>

                  {/* Empleador / cargo */}
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text" value={form.employerName}
                      onChange={e => setForm({ ...form, employerName: e.target.value })}
                      placeholder="Empleador" className="text-sm border px-3 py-2.5"
                      style={inputBase} onFocus={focusOn} onBlur={focusOff}
                    />
                    <input
                      type="text" value={form.position}
                      onChange={e => setForm({ ...form, position: e.target.value })}
                      placeholder="Cargo" className="text-sm border px-3 py-2.5"
                      style={inputBase} onFocus={focusOn} onBlur={focusOff}
                    />
                  </div>

                  {/* Desglose */}
                  <LineGroup title="Haberes imponibles" items={form.haberesImponibles}
                    onChange={items => setForm({ ...form, haberesImponibles: items })} />
                  <LineGroup title="Haberes no imponibles" items={form.haberesNoImponibles}
                    onChange={items => setForm({ ...form, haberesNoImponibles: items })} />
                  <LineGroup title="Descuentos legales" items={form.descuentosLegales}
                    onChange={items => setForm({ ...form, descuentosLegales: items })} />
                  <LineGroup title="Otros descuentos" items={form.otrosDescuentos}
                    onChange={items => setForm({ ...form, otrosDescuentos: items })} />

                  {/* Totales */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--ink-3)' }}>Total haberes</label>
                      <input
                        type="text" inputMode="numeric" value={fmtInput(form.totalHaberes)}
                        onChange={e => setForm({ ...form, totalHaberes: parseAmt(e.target.value) })}
                        className="w-full text-sm font-semibold border px-3 py-2.5 tabular-nums"
                        style={inputBase} onFocus={focusOn} onBlur={focusOff}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--ink-3)' }}>Total descuentos</label>
                      <input
                        type="text" inputMode="numeric" value={fmtInput(form.totalDescuentos)}
                        onChange={e => setForm({ ...form, totalDescuentos: parseAmt(e.target.value) })}
                        className="w-full text-sm font-semibold border px-3 py-2.5 tabular-nums"
                        style={inputBase} onFocus={focusOn} onBlur={focusOff}
                      />
                    </div>
                  </div>

                  {/* Líquido — lo más importante, va a Ingresos */}
                  <div className="rounded-2xl p-4" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)' }}>
                    <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--primary)' }}>
                      Líquido a recibir — se registra en Ingresos
                    </label>
                    <input
                      type="text" inputMode="numeric" value={fmtInput(form.liquido)}
                      onChange={e => setForm({ ...form, liquido: parseAmt(e.target.value) })}
                      className="w-full text-2xl font-extrabold border px-4 py-3 tabular-nums"
                      style={{ ...inputBase, background: 'var(--surface)', fontFamily: 'Fredoka, sans-serif' }}
                      onFocus={focusOn} onBlur={focusOff}
                    />
                  </div>

                  {error && <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{error}</p>}

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={close}
                      className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                      style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={confirmSave}
                      disabled={step === 'saving'}
                      className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-2xl transition-all disabled:opacity-50 active:scale-[.98]"
                      style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
                    >
                      <Check className="w-4 h-4" />
                      {step === 'saving' ? 'Guardando…' : 'Guardar liquidación'}
                    </button>
                  </div>
                </>
              )}

              <div className="h-2 lg:h-0" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
