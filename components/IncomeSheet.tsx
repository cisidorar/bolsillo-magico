'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, X, Check, Copy, Trash2, Pencil } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import type { BreakdownItem, IncomeData } from '@/components/IncomeMonthEditor'

interface Props {
  userId:     string
  month:      number
  year:       number
  current:    IncomeData | null
  prevIncome: IncomeData | null
  monthName:  string
}

const ITEM_COLORS = [
  'var(--primary)', 'var(--mint)', 'var(--gold)', 'var(--coral)',
  '#A78BFA', '#F472B6', '#34D399',
]

const inputBase: React.CSSProperties = {
  color:        'var(--ink)',
  background:   'var(--surface-2)',
  borderColor:  'var(--border)',
  borderRadius: 12,
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

function fmt(raw: string): string {
  const n = raw.replace(/\D/g, '')
  return n ? parseInt(n).toLocaleString('es-CL') : ''
}
function parseAmt(raw: string): number {
  return parseInt(raw.replace(/\D/g, '')) || 0
}

export default function IncomeSheet({ userId, month, year, current, prevIncome, monthName }: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [showForm,     setShowForm]     = useState(false)
  const [mainAmt,      setMainAmt]      = useState('')
  const [desc,         setDesc]         = useState('')
  const [items,        setItems]        = useState<BreakdownItem[]>([])
  const [saving,       setSaving]       = useState(false)
  const [formError,    setFormError]    = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting,     setDeleting]     = useState(false)

  const total      = parseAmt(mainAmt)
  const itemsTotal = items.reduce((s, i) => s + i.amount, 0)
  const validItems = items.filter(it => it.label.trim() && it.amount > 0)
  const calza      = validItems.length > 0 && total > 0 && itemsTotal === total
  const noCalza    = validItems.length > 0 && total > 0 && itemsTotal !== total

  // Escape key
  useEffect(() => {
    if (!showForm) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') cancelForm() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [showForm])

  function openForm() {
    setMainAmt(current?.amount ? String(current.amount) : '')
    setDesc(current?.description ?? '')
    setItems(current?.breakdown ?? [])
    setFormError('')
    setDeleteConfirm(false)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setFormError('')
    setDeleteConfirm(false)
  }

  function addItem() {
    setItems(prev => [...prev, { label: '', amount: 0 }])
  }
  function updateItem(idx: number, field: 'label' | 'amount', val: string) {
    setItems(prev => prev.map((it, i) =>
      i === idx ? { ...it, [field]: field === 'amount' ? parseAmt(val) : val } : it
    ))
  }
  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }
  function copyPrev() {
    if (!prevIncome) return
    setMainAmt(String(prevIncome.amount))
    setDesc(prevIncome.description ?? '')
    setItems(prevIncome.breakdown ?? [])
  }

  async function save() {
    if (!total || total < 1) { setFormError('Ingresa un monto válido'); return }
    setSaving(true)
    setFormError('')
    const { error: err } = await supabase
      .from('incomes')
      .upsert(
        { user_id: userId, month, year, amount: total, description: desc.trim() || null, breakdown: validItems },
        { onConflict: 'user_id,month,year' }
      )
    setSaving(false)
    if (err) { setFormError('Error al guardar'); return }
    cancelForm()
    router.refresh()
  }

  async function deleteIncome() {
    setDeleting(true)
    await supabase.from('incomes').delete()
      .eq('user_id', userId).eq('month', month).eq('year', year)
    setDeleting(false)
    cancelForm()
    router.refresh()
  }

  return (
    <>
      {/* ── Trigger ─────────────────────────────────────────────────────────── */}
      <button
        onClick={openForm}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all active:scale-[.97] shrink-0"
        style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
      >
        {current ? <Pencil className="w-4 h-4" strokeWidth={2.5} /> : <Plus className="w-4 h-4" strokeWidth={2.5} />}
        {current ? 'Editar' : 'Registrar'}
      </button>

      {/* ── Modal ───────────────────────────────────────────────────────────── */}
      {showForm && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={e => { if (e.target === e.currentTarget) cancelForm() }}
        >
          <div
            className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-y-auto"
            style={{ background: 'var(--surface)', maxHeight: '92dvh' }}
          >
            {/* Handle — mobile */}
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>
                {current ? 'Editar ingreso' : 'Registrar ingreso'} — {monthName} {year}
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
            <div className="px-5 py-5 space-y-4">

              {/* Total */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Total ingreso del mes
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={fmt(mainAmt)}
                  onChange={e => setMainAmt(e.target.value.replace(/\D/g, ''))}
                  placeholder="$0"
                  autoFocus
                  className="w-full text-2xl font-extrabold border px-4 py-3 tabular-nums"
                  style={{ ...inputBase, fontFamily: 'Fredoka, sans-serif' }}
                  onFocus={focusOn}
                  onBlur={focusOff}
                />
                {total > 0 && (
                  <p className="text-[11px] mt-1 font-semibold tabular-nums" style={{ color: 'var(--primary)' }}>
                    {formatCLP(total)}
                  </p>
                )}
              </div>

              {/* Nota */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Nota (opcional)
                </label>
                <input
                  type="text"
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="ej: Sueldo + horas extras"
                  maxLength={80}
                  className="w-full text-sm border px-4 py-3"
                  style={inputBase}
                  onFocus={focusOn}
                  onBlur={focusOff}
                />
              </div>

              {/* Desglose */}
              <div className="rounded-2xl p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>
                      ¿De dónde viene?
                    </span>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: 'var(--surface)', color: 'var(--ink-3)', border: '1px solid var(--border)' }}
                    >
                      opcional
                    </span>
                  </div>
                  {calza && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                      style={{ background: 'rgba(31,190,141,0.12)', color: 'var(--mint)' }}>
                      <Check className="w-3 h-3" /> calza
                    </span>
                  )}
                  {noCalza && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(255,194,60,0.15)', color: 'var(--gold)' }}>
                      {formatCLP(Math.abs(total - itemsTotal))} {itemsTotal > total ? 'de más' : 'faltan'}
                    </span>
                  )}
                </div>

                {items.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {items.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: ITEM_COLORS[idx % ITEM_COLORS.length] }} />
                        <input
                          type="text"
                          value={it.label}
                          onChange={e => updateItem(idx, 'label', e.target.value)}
                          placeholder="ej: Sueldo base"
                          className="flex-1 text-sm border px-3 py-2"
                          style={{ ...inputBase, background: 'var(--surface)' }}
                          onFocus={focusOn}
                          onBlur={focusOff}
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          value={it.amount ? fmt(String(it.amount)) : ''}
                          onChange={e => updateItem(idx, 'amount', e.target.value)}
                          placeholder="$0"
                          className="w-28 text-sm font-semibold border px-3 py-2 text-right tabular-nums"
                          style={{ ...inputBase, background: 'var(--surface)' }}
                          onFocus={focusOn}
                          onBlur={focusOff}
                        />
                        <button
                          onClick={() => removeItem(idx)}
                          className="p-1 rounded-lg shrink-0 transition-colors"
                          style={{ color: 'var(--ink-3)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--coral)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {validItems.length > 1 && (
                      <div
                        className="flex items-center justify-between pt-2 text-xs font-semibold tabular-nums"
                        style={{ borderTop: '1px solid var(--border)', color: 'var(--ink-2)' }}
                      >
                        <span>Subtotal</span>
                        <span style={{ color: calza ? 'var(--mint)' : noCalza ? 'var(--gold)' : 'var(--ink-2)' }}>
                          {formatCLP(itemsTotal)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={addItem}
                  className="flex items-center gap-1.5 text-sm font-semibold"
                  style={{ color: 'var(--primary)' }}
                >
                  <Plus className="w-4 h-4" />
                  Agregar fuente
                </button>
              </div>

              {formError && (
                <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{formError}</p>
              )}

              {/* Confirmación de eliminación */}
              {deleteConfirm && current && (
                <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,111,97,0.08)', border: '1px solid rgba(255,111,97,0.25)' }}>
                  <p className="text-sm text-center font-medium" style={{ color: 'var(--ink-2)' }}>
                    ¿Eliminar el ingreso de {monthName}?
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
                      onClick={deleteIncome}
                      disabled={deleting}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold rounded-xl disabled:opacity-50 transition-colors"
                      style={{ background: 'var(--coral)', color: 'white' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                    </button>
                  </div>
                </div>
              )}

              {/* Actions */}
              {!deleteConfirm && (
                <div className="flex gap-3 pt-1">
                  {current && (
                    <button
                      onClick={() => setDeleteConfirm(true)}
                      className="flex items-center gap-1.5 px-4 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                      style={{ color: 'var(--coral)', borderColor: 'rgba(255,111,97,0.3)', background: 'var(--surface-2)' }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {prevIncome && !current && (
                    <button
                      onClick={copyPrev}
                      className="flex items-center gap-1.5 px-4 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                      style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                      title="Copiar mes anterior"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={cancelForm}
                    className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                    style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-2xl transition-all disabled:opacity-50 active:scale-[.98]"
                    style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
                  >
                    <Check className="w-4 h-4" />
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              )}

              {/* safe-area bottom */}
              <div className="h-2 lg:h-0" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
