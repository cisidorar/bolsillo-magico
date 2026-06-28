'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X } from 'lucide-react'
import { formatCLP } from '@/lib/utils'

interface Props {
  userId:       string
  month:        number
  year:         number
  amount:       number | null
  description:  string | null
  /** Estilos compactos para mobile */
  compact?:     boolean
  /** Modo historial: muestra solo botón Editar/Registrar que abre editor inline */
  historyMode?: boolean
}

function fmt(raw: string): string {
  const n = raw.replace(/\D/g, '')
  if (!n) return ''
  return parseInt(n).toLocaleString('es-CL')
}

export default function IncomeEditor({ userId, month, year, amount, description, compact, historyMode }: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [editing, setEditing] = useState(false)
  const [amtRaw,  setAmtRaw]  = useState(amount ? String(amount) : '')
  const [desc,    setDesc]    = useState(description ?? '')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const inputRef  = useRef<HTMLInputElement>(null)

  // Focus el input al abrir
  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.focus(), 50)
  }, [editing])

  function openEditor() {
    setAmtRaw(amount ? String(amount) : '')
    setDesc(description ?? '')
    setError('')
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
    setError('')
  }

  async function save() {
    const parsed = parseInt(amtRaw.replace(/\D/g, ''))
    if (!parsed || parsed < 1) { setError('Ingresa un monto válido'); return }

    setSaving(true)
    setError('')

    const { error: err } = await supabase
      .from('incomes')
      .upsert(
        { user_id: userId, month, year, amount: parsed, description: desc.trim() || null },
        { onConflict: 'user_id,month,year' }
      )

    setSaving(false)
    if (err) { setError('Error al guardar'); return }

    setEditing(false)
    router.refresh()
  }

  async function clear() {
    if (!amount) { cancel(); return }
    setSaving(true)
    await supabase
      .from('incomes')
      .delete()
      .eq('user_id', userId)
      .eq('month', month)
      .eq('year', year)
    setSaving(false)
    setEditing(false)
    router.refresh()
  }

  // ── Modo historial: botón simple Editar/Registrar ─────────────────────────
  if (historyMode) {
    return editing ? (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={fmt(amtRaw)}
          onChange={e => setAmtRaw(e.target.value.replace(/\D/g, ''))}
          placeholder="Monto"
          className="w-28 text-sm font-semibold border rounded-xl px-3 py-1.5 outline-none transition-colors tabular-nums"
          style={{ color: 'var(--ink)', borderColor: 'var(--primary)', background: 'var(--surface)' }}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
        />
        <button
          onClick={save} disabled={saving}
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-colors disabled:opacity-60"
          style={{ background: 'var(--primary)' }}
        >
          {saving ? '…' : 'OK'}
        </button>
        <button onClick={cancel} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <X className="w-3.5 h-3.5" style={{ color: 'var(--ink-3)' }} />
        </button>
      </div>
    ) : (
      <button
        onClick={openEditor}
        className="text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors"
        style={amount
          ? { color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }
          : { color: 'var(--primary)', borderColor: 'var(--primary)', background: 'var(--primary-soft)' }
        }
      >
        {amount ? 'Editar' : 'Registrar'}
      </button>
    )
  }

  // ── Vista compacta (tarjeta KPI mobile) ────────────────────────────────────
  if (compact) {
    return editing ? (
      <div className="flex flex-col gap-1.5">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={fmt(amtRaw)}
          onChange={e => setAmtRaw(e.target.value.replace(/\D/g, ''))}
          placeholder="Monto"
          className="w-full text-[13px] font-bold border rounded-lg px-2 py-1 outline-none focus:border-brand-400"
          style={{ color: 'var(--ink)', borderColor: 'var(--border)', background: 'var(--surface)' }}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
        />
        <input
          type="text"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="Descripción (opcional)"
          className="w-full text-[10px] border rounded-lg px-2 py-1 outline-none focus:border-brand-400"
          style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface)' }}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
        />
        {error && <p className="text-[9px] text-red-500">{error}</p>}
        <div className="flex gap-1">
          <button
            onClick={save} disabled={saving}
            className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-60"
          >
            <Check className="w-3 h-3" /> Guardar
          </button>
          {amount && (
            <button
              onClick={clear} disabled={saving}
              className="px-2 py-1 rounded-lg text-[10px] font-semibold text-red-500 hover:bg-red-50 transition-colors"
            >
              Borrar
            </button>
          )}
          <button
            onClick={cancel}
            className="px-2 py-1 rounded-lg text-[10px] font-semibold hover:bg-gray-100 transition-colors"
            style={{ color: 'var(--ink-3)' }}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    ) : (
      <button
        onClick={openEditor}
        className="w-full text-left flex items-start gap-1 group"
      >
        <div className="flex-1 min-w-0">
          {amount
            ? <p className="text-[15px] font-extrabold tabular-nums leading-tight" style={{ color: 'var(--ink)' }}>{formatCLP(amount)}</p>
            : <p className="text-[12px] font-semibold" style={{ color: 'var(--ink-3)' }}>Toca para registrar</p>
          }
          {description && <p className="text-[9px] mt-0.5 truncate" style={{ color: 'var(--ink-3)' }}>{description}</p>}
        </div>
        <Pencil className="w-3 h-3 mt-0.5 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: 'var(--ink-3)' }} />
      </button>
    )
  }

  // ── Vista desktop (tarjeta KPI grande) ─────────────────────────────────────
  return editing ? (
    <div className="flex flex-col gap-2">
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide mb-1 block" style={{ color: 'var(--ink-3)' }}>
          Monto
        </label>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={fmt(amtRaw)}
          onChange={e => setAmtRaw(e.target.value.replace(/\D/g, ''))}
          placeholder="ej: 1.500.000"
          className="w-full text-sm font-semibold border rounded-xl px-3 py-2 outline-none focus:border-brand-400 transition-colors"
          style={{ color: 'var(--ink)', borderColor: 'var(--border)', background: 'var(--surface)' }}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
        />
        {amtRaw && <p className="text-[10px] mt-1" style={{ color: 'var(--ink-3)' }}>{formatCLP(parseInt(amtRaw.replace(/\D/g, '')) || 0)}</p>}
      </div>
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-wide mb-1 block" style={{ color: 'var(--ink-3)' }}>
          Descripción (opcional)
        </label>
        <input
          type="text"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="ej: Sueldo + bono"
          maxLength={80}
          className="w-full text-sm border rounded-xl px-3 py-2 outline-none focus:border-brand-400 transition-colors"
          style={{ color: 'var(--ink)', borderColor: 'var(--border)', background: 'var(--surface)' }}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-60"
        >
          <Check className="w-3.5 h-3.5" />
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        {amount && (
          <button
            onClick={clear} disabled={saving}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
          >
            Borrar
          </button>
        )}
        <button
          onClick={cancel}
          className="px-3 py-2 rounded-xl text-xs font-semibold hover:bg-gray-100 transition-colors"
          style={{ color: 'var(--ink-3)' }}
        >
          Cancelar
        </button>
      </div>
    </div>
  ) : (
    <button
      onClick={openEditor}
      className="w-full text-left flex items-start gap-2 group"
    >
      <div className="flex-1 min-w-0">
        {amount
          ? <p className="text-2xl font-extrabold tabular-nums leading-tight" style={{ color: 'var(--ink)' }}>{formatCLP(amount)}</p>
          : <p className="text-lg font-semibold" style={{ color: 'var(--ink-3)' }}>Sin registrar</p>
        }
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
          {description ?? (amount ? 'Ingresos del mes' : 'Clic para registrar')}
        </p>
      </div>
      <Pencil
        className="w-3.5 h-3.5 mt-1 shrink-0 opacity-0 group-hover:opacity-50 transition-opacity"
        style={{ color: 'var(--ink-3)' }}
      />
    </button>
  )
}
