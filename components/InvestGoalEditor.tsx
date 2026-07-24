'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X } from 'lucide-react'
import { formatCLP } from '@/lib/utils'

interface Props {
  userId: string
  goal:   number | null
  /** Estilo compacto para usar dentro de una card chica (mobile) */
  compact?: boolean
}

function fmt(raw: string): string {
  const n = raw.replace(/\D/g, '')
  if (!n) return ''
  return parseInt(n).toLocaleString('es-CL')
}

/** Editor inline de la meta mensual de aporte a inversión (profiles.monthly_invest_goal). */
export default function InvestGoalEditor({ userId, goal, compact }: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [editing, setEditing] = useState(false)
  const [raw, setRaw]         = useState(goal ? String(goal) : '')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.focus(), 50)
  }, [editing])

  function open() {
    setRaw(goal ? String(goal) : '')
    setError('')
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
    setError('')
  }

  async function save() {
    const parsed = parseInt(raw.replace(/\D/g, ''))
    if (!parsed || parsed < 1) { setError('Ingresa un monto válido'); return }

    setSaving(true)
    setError('')
    const { error: err } = await supabase
      .from('profiles')
      .update({ monthly_invest_goal: parsed })
      .eq('id', userId)
    setSaving(false)

    if (err) { setError('Error al guardar'); return }
    setEditing(false)
    router.refresh()
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={fmt(raw)}
          onChange={e => setRaw(e.target.value.replace(/\D/g, ''))}
          placeholder="ej: 1.000.000"
          className={compact ? 'w-24 text-[11px] font-semibold border px-2 py-1 outline-none tabular-nums' : 'w-32 text-xs font-semibold border px-2.5 py-1.5 outline-none tabular-nums'}
          style={{ color: 'var(--ink)', borderColor: 'var(--primary)', background: 'var(--surface)', borderRadius: 10, boxShadow: '0 0 0 3px var(--primary-soft)' }}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
        />
        <button
          onClick={save} disabled={saving}
          className="px-2.5 py-1 text-[11px] font-bold transition-all disabled:opacity-60 active:scale-[.97]"
          style={{ background: 'var(--primary)', color: 'var(--primary-ink)', borderRadius: 8 }}
        >
          {saving ? '…' : 'OK'}
        </button>
        <button onClick={cancel} className="p-1 rounded-lg" style={{ color: 'var(--ink-3)' }}>
          <X className="w-3.5 h-3.5" />
        </button>
        {error && <p className="text-[9px]" style={{ color: 'var(--coral)' }}>{error}</p>}
      </div>
    )
  }

  return (
    <button onClick={open} className="inline-flex items-center gap-1 group">
      <span className="text-[11px] font-semibold" style={{ color: 'var(--primary)' }}>
        {goal ? `Meta: ${formatCLP(goal)}` : 'Definir meta de aporte'}
      </span>
      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: 'var(--ink-3)' }} />
    </button>
  )
}
