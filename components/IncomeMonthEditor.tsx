'use client'

import { useState, useCallback } from 'react'
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
  prevIncome:  IncomeData | null   // mes anterior para "Copiar"
}

const ITEM_COLORS = ['#4D93FF','#FF8A4C','#FFC23C','#1FBE8D','#A78BFA','#F472B6','#34D399']

function fmt(raw: string): string {
  const n = raw.replace(/\D/g, '')
  if (!n) return ''
  return parseInt(n).toLocaleString('es-CL')
}

function parseAmt(raw: string): number {
  return parseInt(raw.replace(/\D/g, '')) || 0
}

export default function IncomeMonthEditor({ userId, month, year, current, prevIncome }: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [mainAmt,   setMainAmt]   = useState(current?.amount ? String(current.amount) : '')
  const [desc,      setDesc]      = useState(current?.description ?? '')
  const [items,     setItems]     = useState<BreakdownItem[]>(current?.breakdown ?? [])
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [error,     setError]     = useState('')

  // Total: si hay items, suma de ellos; si no, monto manual
  const itemsTotal = items.reduce((s, i) => s + i.amount, 0)
  const total      = items.length > 0 ? itemsTotal : parseAmt(mainAmt)

  function addItem() {
    setItems(prev => [...prev, { label: '', amount: 0 }])
  }

  function updateItem(idx: number, field: 'label' | 'amount', val: string) {
    setItems(prev => prev.map((it, i) =>
      i === idx
        ? { ...it, [field]: field === 'amount' ? parseAmt(val) : val }
        : it
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
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">

      {/* ── Columna izquierda: monto + desglose ───────────────────── */}
      <div className="space-y-4">

        {/* Monto principal */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide block mb-1.5" style={{ color: 'var(--ink-3)' }}>
            Monto principal
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={fmt(mainAmt)}
            onChange={e => { setMainAmt(e.target.value.replace(/\D/g, '')); if (items.length > 0) setItems([]) }}
            placeholder="$0"
            className="w-full text-lg font-bold border rounded-2xl px-4 py-3 outline-none transition-colors"
            style={{
              color: 'var(--ink)', borderColor: 'var(--border)',
              background: 'var(--surface-2)',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
        </div>

        {/* Descripción */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide block mb-1.5" style={{ color: 'var(--ink-3)' }}>
            Descripción <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>(opcional)</span>
          </label>
          <input
            type="text"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="ej: Sueldo + bono"
            maxLength={80}
            className="w-full text-sm border rounded-2xl px-4 py-3 outline-none transition-colors"
            style={{
              color: 'var(--ink)', borderColor: 'var(--border)',
              background: 'var(--surface-2)',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
        </div>

        {/* Desglose opcional */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
              Desglose opcional
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
              ?
            </span>
          </div>

          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="flex items-center gap-2">
                {/* Dot de color */}
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: ITEM_COLORS[idx % ITEM_COLORS.length] }}
                />
                {/* Nombre */}
                <input
                  type="text"
                  value={it.label}
                  onChange={e => updateItem(idx, 'label', e.target.value)}
                  placeholder="Concepto"
                  className="flex-1 text-sm border rounded-xl px-3 py-2 outline-none transition-colors"
                  style={{ color: 'var(--ink)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
                {/* Monto */}
                <input
                  type="text"
                  inputMode="numeric"
                  value={it.amount ? fmt(String(it.amount)) : ''}
                  onChange={e => updateItem(idx, 'amount', e.target.value)}
                  placeholder="$ 0"
                  className="w-32 text-sm font-semibold border rounded-xl px-3 py-2 outline-none text-right transition-colors tabular-nums"
                  style={{ color: 'var(--ink)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                  onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
                {/* Eliminar */}
                <button
                  onClick={() => removeItem(idx)}
                  className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
                >
                  <X className="w-3.5 h-3.5" style={{ color: 'var(--ink-3)' }} />
                </button>
              </div>
            ))}
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

        {/* Error */}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* Botones */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={save}
            disabled={saving || total === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60 active:scale-[.98]"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
          >
            {saved ? <Check className="w-4 h-4" /> : null}
            {saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar'}
          </button>

          {prevIncome && (
            <button
              onClick={copyPrev}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors hover:bg-gray-50"
              style={{ color: 'var(--ink-2)', borderColor: 'var(--border)' }}
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar mes anterior
            </button>
          )}
        </div>
      </div>

      {/* ── Columna derecha: total ─────────────────────────────────── */}
      <div
        className="card p-6 flex flex-col justify-between"
        style={{ background: 'var(--surface-2)' }}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--ink-3)' }}>
            Total ingreso mensual
          </p>
          <p
            className="text-3xl font-extrabold tabular-nums leading-tight mb-1"
            style={{ color: total > 0 ? 'var(--primary)' : 'var(--ink-3)' }}
          >
            {total > 0 ? formatCLP(total) : '$0'}
          </p>
          {items.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {items.filter(it => it.label && it.amount > 0).map((it, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: ITEM_COLORS[idx % ITEM_COLORS.length] }} />
                    <span style={{ color: 'var(--ink-2)' }}>{it.label}</span>
                  </div>
                  <span className="tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>{formatCLP(it.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs mt-4" style={{ color: 'var(--ink-3)' }}>
          Este monto se usará en tus cálculos y reportes.
        </p>
      </div>

    </div>
  )
}
