'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, X, Check, Copy } from 'lucide-react'
import { formatCLP } from '@/lib/utils'

export interface BreakdownItem {
  label:  string
  amount: number
}

export interface IncomeData {
  amount:      number
  description: string | null
  breakdown:   BreakdownItem[]
}

interface Props {
  userId:      string
  month:       number
  year:        number
  current:     IncomeData | null
  prevIncome:  IncomeData | null
}

// Colores semánticos de accent (no brand) — sólo para los dots del desglose
const ITEM_COLORS = [
  'var(--primary)',
  'var(--coral)',
  'var(--gold)',
  'var(--mint)',
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

// Estilos de input reutilizables
const inputStyle = (focused: boolean): React.CSSProperties => ({
  color:           'var(--ink)',
  borderColor:     focused ? 'var(--primary)' : 'var(--border)',
  background:      'var(--surface-2)',
  borderRadius:    14,
  boxShadow:       focused ? '0 0 0 3px var(--primary-soft)' : 'none',
  transition:      'border-color 150ms, box-shadow 150ms',
})

export default function IncomeMonthEditor({ userId, month, year, current, prevIncome }: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [mainAmt,   setMainAmt]   = useState(current?.amount ? String(current.amount) : '')
  const [desc,      setDesc]      = useState(current?.description ?? '')
  const [items,     setItems]     = useState<BreakdownItem[]>(current?.breakdown ?? [])
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [error,     setError]     = useState('')

  // Focus tracking per field
  const [focusMain,   setFocusMain]   = useState(false)
  const [focusDesc,   setFocusDesc]   = useState(false)
  const [focusItems,  setFocusItems]  = useState<Record<string, boolean>>({})

  const itemsTotal = items.reduce((s, i) => s + i.amount, 0)
  const total      = items.length > 0 ? itemsTotal : parseAmt(mainAmt)

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
    const amount = total
    if (!amount || amount < 1) { setError('Ingresa un monto válido'); return }

    setSaving(true)
    setError('')

    const { error: err } = await supabase
      .from('incomes')
      .upsert(
        {
          user_id:     userId,
          month,
          year,
          amount,
          description: desc.trim() || null,
          breakdown:   items.filter(it => it.label.trim() && it.amount > 0),
        },
        { onConflict: 'user_id,month,year' }
      )

    setSaving(false)
    if (err) { setError('Error al guardar'); return }

    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    router.refresh()
  }

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-5 lg:gap-6">

      {/* ── Columna izquierda: inputs ───────────────────────────────── */}
      <div className="space-y-4">

        {/* Monto principal */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
            Monto principal
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={fmt(mainAmt)}
            onChange={e => { setMainAmt(e.target.value.replace(/\D/g, '')); if (items.length > 0) setItems([]) }}
            placeholder="$0"
            className="w-full text-lg font-bold border px-4 py-3 outline-none"
            style={inputStyle(focusMain)}
            onFocus={() => setFocusMain(true)}
            onBlur={() => setFocusMain(false)}
          />
        </div>

        {/* Descripción */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
            Descripción{' '}
            <span style={{ textTransform: 'none', fontWeight: 400, letterSpacing: 0 }}>(opcional)</span>
          </label>
          <input
            type="text"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="ej: Sueldo + bono"
            maxLength={80}
            className="w-full text-sm border px-4 py-3 outline-none"
            style={inputStyle(focusDesc)}
            onFocus={() => setFocusDesc(true)}
            onBlur={() => setFocusDesc(false)}
          />
        </div>

        {/* Desglose opcional */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>
              Desglose por concepto
            </span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
              style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
            >
              opcional
            </span>
          </div>

          <div className="space-y-2">
            {items.map((it, idx) => {
              const fkLabel = !!focusItems[`l${idx}`]
              const fkAmt   = !!focusItems[`a${idx}`]
              return (
                <div key={idx} className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: ITEM_COLORS[idx % ITEM_COLORS.length] }}
                  />
                  <input
                    type="text"
                    value={it.label}
                    onChange={e => updateItem(idx, 'label', e.target.value)}
                    placeholder="Concepto"
                    className="flex-1 text-sm border px-3 py-2 outline-none"
                    style={inputStyle(fkLabel)}
                    onFocus={() => setFocusItems(f => ({ ...f, [`l${idx}`]: true }))}
                    onBlur={() => setFocusItems(f => ({ ...f, [`l${idx}`]: false }))}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={it.amount ? fmt(String(it.amount)) : ''}
                    onChange={e => updateItem(idx, 'amount', e.target.value)}
                    placeholder="$ 0"
                    className="w-28 text-sm font-semibold border px-3 py-2 outline-none text-right tabular-nums"
                    style={inputStyle(fkAmt)}
                    onFocus={() => setFocusItems(f => ({ ...f, [`a${idx}`]: true }))}
                    onBlur={() => setFocusItems(f => ({ ...f, [`a${idx}`]: false }))}
                  />
                  <button
                    onClick={() => removeItem(idx)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: 'var(--ink-3)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,111,97,0.1)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>

          <button
            onClick={addItem}
            className="flex items-center gap-1.5 mt-3 text-sm font-semibold transition-colors"
            style={{ color: 'var(--primary)' }}
          >
            <Plus className="w-4 h-4" />
            Agregar concepto
          </button>
        </div>

        {error && <p className="text-sm" style={{ color: 'var(--coral)' }}>{error}</p>}

        {/* Botones */}
        <div className="flex flex-wrap gap-3 pt-1">
          <button
            onClick={save}
            disabled={saving || total === 0}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold transition-all disabled:opacity-60 active:scale-[.98]"
            style={{
              background:    'var(--primary)',
              color:         'var(--primary-ink)',
              borderRadius:  12,
              boxShadow:     '0 8px 18px var(--shadow)',
            }}
          >
            {saved ? <Check className="w-4 h-4" /> : null}
            {saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar ingreso'}
          </button>

          {prevIncome && (
            <button
              onClick={copyPrev}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border transition-colors"
              style={{
                color:        'var(--ink-2)',
                borderColor:  'var(--border)',
                borderRadius:  12,
                background:   'var(--surface)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar mes anterior
            </button>
          )}
        </div>
      </div>

      {/* ── Columna derecha: resumen ─────────────────────────────────── */}
      <div
        className="rounded-[18px] p-5 flex flex-col justify-between gap-4"
        style={{
          background:  'var(--surface-2)',
          border:      '1.5px solid var(--border)',
        }}
      >
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-widest mb-2"
            style={{ color: 'var(--ink-3)' }}
          >
            Total ingreso mensual
          </p>
          <p
            className="text-3xl font-extrabold tabular-nums leading-tight"
            style={{
              fontFamily: 'Fredoka, sans-serif',
              color:      total > 0 ? 'var(--primary)' : 'var(--ink-3)',
            }}
          >
            {total > 0 ? formatCLP(total) : '$0'}
          </p>

          {items.length > 0 && (
            <div className="mt-4 space-y-2">
              {items.filter(it => it.label && it.amount > 0).map((it, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: ITEM_COLORS[idx % ITEM_COLORS.length] }}
                    />
                    <span className="truncate" style={{ color: 'var(--ink-2)' }}>{it.label}</span>
                  </div>
                  <span className="tabular-nums font-semibold shrink-0" style={{ color: 'var(--ink)' }}>
                    {formatCLP(it.amount)}
                  </span>
                </div>
              ))}
              {/* Separador + total si hay items */}
              <div
                className="flex items-center justify-between text-xs pt-2 mt-2 font-bold"
                style={{ borderTop: '1px solid var(--border)', color: 'var(--ink)' }}
              >
                <span>Total</span>
                <span className="tabular-nums">{formatCLP(itemsTotal)}</span>
              </div>
            </div>
          )}
        </div>

        <p className="text-[10px]" style={{ color: 'var(--ink-3)' }}>
          Este monto se usará en tus análisis y comparaciones mensuales.
        </p>
      </div>

    </div>
  )
}
