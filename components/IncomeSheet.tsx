'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, X, Check, Copy, Pencil, Trash2, TrendingUp } from 'lucide-react'
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
  'var(--primary)',
  'var(--mint)',
  'var(--gold)',
  'var(--coral)',
  '#A78BFA',
  '#F472B6',
  '#34D399',
]

function fmt(raw: string): string {
  const n = raw.replace(/\D/g, '')
  if (!n) return ''
  return parseInt(n).toLocaleString('es-CL')
}

function parseAmt(raw: string): number {
  return parseInt(raw.replace(/\D/g, '')) || 0
}

const inputBase: React.CSSProperties = {
  color:       'var(--ink)',
  background:  'var(--surface-2)',
  borderColor: 'var(--border)',
  borderRadius: 14,
  transition:  'border-color 150ms, box-shadow 150ms',
  outline:     'none',
}

function focusOn(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'var(--primary)'
  e.currentTarget.style.boxShadow   = '0 0 0 3px var(--primary-soft)'
}
function focusOff(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'var(--border)'
  e.currentTarget.style.boxShadow   = 'none'
}

export default function IncomeSheet({ userId, month, year, current, prevIncome, monthName }: Props) {
  const router   = useRouter()
  const supabase = createClient()
  const sheetRef = useRef<HTMLDivElement>(null)

  const [open,    setOpen]    = useState(false)
  const [mainAmt, setMainAmt] = useState(current?.amount ? String(current.amount) : '')
  const [desc,    setDesc]    = useState(current?.description ?? '')
  const [items,   setItems]   = useState<BreakdownItem[]>(current?.breakdown ?? [])
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [deleting, setDeleting] = useState(false)

  const total      = parseAmt(mainAmt)
  const itemsTotal = items.reduce((s, i) => s + i.amount, 0)
  const validItems = items.filter(it => it.label.trim() && it.amount > 0)
  const calza      = validItems.length > 0 && total > 0 && itemsTotal === total
  const noCalza    = validItems.length > 0 && total > 0 && itemsTotal !== total

  // Sync state when current changes (after router.refresh)
  useEffect(() => {
    if (!open) {
      setMainAmt(current?.amount ? String(current.amount) : '')
      setDesc(current?.description ?? '')
      setItems(current?.breakdown ?? [])
    }
  }, [current, open])

  // Close on backdrop click / Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  function openSheet() {
    setMainAmt(current?.amount ? String(current.amount) : '')
    setDesc(current?.description ?? '')
    setItems(current?.breakdown ?? [])
    setError('')
    setOpen(true)
  }

  function closeSheet() {
    setOpen(false)
    setError('')
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
    if (!total || total < 1) { setError('Ingresa un monto válido'); return }
    setSaving(true)
    setError('')

    const { error: err } = await supabase
      .from('incomes')
      .upsert(
        {
          user_id:     userId,
          month,
          year,
          amount:      total,
          description: desc.trim() || null,
          breakdown:   validItems,
        },
        { onConflict: 'user_id,month,year' }
      )

    setSaving(false)
    if (err) { setError('Error al guardar'); return }

    setOpen(false)
    router.refresh()
  }

  async function deleteIncome() {
    setDeleting(true)
    await supabase
      .from('incomes')
      .delete()
      .eq('user_id', userId)
      .eq('month', month)
      .eq('year', year)
    setDeleting(false)
    setMainAmt('')
    setDesc('')
    setItems([])
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      {/* ── Trigger button ──────────────────────────────────────────────────── */}
      <button
        onClick={openSheet}
        className="flex items-center gap-2 px-4 py-2 text-sm font-bold transition-all active:scale-[.97]"
        style={{
          background:   current ? 'var(--surface-2)' : 'var(--primary)',
          color:        current ? 'var(--ink-2)'      : 'var(--primary-ink)',
          borderRadius: 14,
          border:       current ? '1.5px solid var(--border)' : 'none',
          boxShadow:    current ? 'none' : '0 6px 16px var(--shadow)',
        }}
      >
        {current ? (
          <>
            <Pencil className="w-4 h-4" />
            <span className="hidden sm:inline">Editar ingreso</span>
            <span className="sm:hidden">Editar</span>
          </>
        ) : (
          <>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Registrar ingreso</span>
            <span className="sm:hidden">Registrar</span>
          </>
        )}
      </button>

      {/* ── Backdrop + Sheet ────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center"
          style={{ background: 'rgba(10,31,68,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) closeSheet() }}
        >
          <div
            ref={sheetRef}
            className="w-full lg:w-[480px] lg:rounded-3xl rounded-t-3xl overflow-y-auto"
            style={{
              background:  'var(--surface)',
              maxHeight:   '92dvh',
              boxShadow:   '0 -8px 40px rgba(10,31,68,0.18)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-4 sticky top-0 z-10"
              style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'var(--ink-3)' }}>
                  Ingreso
                </p>
                <h2
                  className="text-lg font-semibold leading-none"
                  style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
                >
                  {monthName} {year}
                </h2>
              </div>
              <button
                onClick={closeSheet}
                className="p-2 rounded-full transition-colors"
                style={{ color: 'var(--ink-3)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5">

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
                  className="w-full text-2xl font-extrabold border px-4 py-3 tabular-nums"
                  style={{ ...inputBase, fontFamily: 'Fredoka, sans-serif' }}
                  onFocus={focusOn}
                  onBlur={focusOff}
                  autoFocus
                />
                {total > 0 && (
                  <p className="text-[11px] mt-1.5 font-semibold tabular-nums" style={{ color: 'var(--primary)' }}>
                    {formatCLP(total)}
                  </p>
                )}
              </div>

              {/* Nota */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Nota <span style={{ textTransform: 'none', fontWeight: 400, letterSpacing: 0 }}>(opcional)</span>
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
              <div
                className="rounded-2xl p-4"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
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
                          style={{ ...inputBase, background: 'var(--surface)', borderRadius: 12 }}
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
                          style={{ ...inputBase, background: 'var(--surface)', borderRadius: 12 }}
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
                        className="flex items-center justify-between pt-2 mt-1 text-xs font-semibold tabular-nums"
                        style={{ borderTop: '1px solid var(--border)', color: 'var(--ink-2)' }}
                      >
                        <span>Subtotal ítems</span>
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

              {error && <p className="text-sm font-medium" style={{ color: 'var(--coral)' }}>{error}</p>}

              {/* Botones */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={save}
                  disabled={saving || total === 0}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold transition-all disabled:opacity-50 active:scale-[.98]"
                  style={{
                    background:   'var(--primary)',
                    color:        'var(--primary-ink)',
                    borderRadius:  12,
                    boxShadow:    '0 8px 18px var(--shadow)',
                  }}
                >
                  {saving ? 'Guardando…' : 'Guardar ingreso'}
                </button>

                {prevIncome && (
                  <button
                    onClick={copyPrev}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border transition-colors"
                    style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', borderRadius: 12, background: 'var(--surface)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar mes anterior
                  </button>
                )}
              </div>

              {/* Eliminar */}
              {current && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <button
                    onClick={deleteIncome}
                    disabled={deleting}
                    className="flex items-center gap-1.5 text-sm font-semibold transition-colors disabled:opacity-60"
                    style={{ color: 'var(--coral)' }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  >
                    <Trash2 className="w-4 h-4" />
                    {deleting ? 'Eliminando…' : 'Eliminar ingreso'}
                  </button>
                </div>
              )}

              {/* Safe-area bottom padding */}
              <div className="h-4 lg:h-0" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
