'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X } from 'lucide-react'

interface Props {
  userId: string
  displayName: string | null
  email: string
  avatarUrl: string | null
}

export default function ProfileEditor({ userId, displayName, email, avatarUrl }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(displayName ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const initial = (displayName ?? email ?? 'U')[0].toUpperCase()

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) { setError('Escribe un nombre'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase
      .from('profiles')
      .update({ display_name: trimmed })
      .eq('id', userId)
    setSaving(false)
    if (err) { setError('Error al guardar'); return }
    setEditing(false)
    router.refresh()
  }

  function cancel() {
    setName(displayName ?? '')
    setError('')
    setEditing(false)
  }

  return (
    <div className="card p-4 flex items-center gap-3">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="avatar" className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className="w-11 h-11 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
          <span className="text-brand-700 font-bold text-lg">{initial}</span>
        </div>
      )}

      {editing ? (
        <div className="flex-1 min-w-0">
          <input
            autoFocus
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
            maxLength={40}
            placeholder="Tu nombre"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-brand-400 transition-colors"
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          <div className="flex items-center gap-1.5 mt-2">
            <button
              onClick={cancel}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <X className="w-3 h-3" /> Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-60"
            >
              {saving
                ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <><Check className="w-3 h-3" /> Guardar</>
              }
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate">{displayName ?? 'Usuario'}</p>
            <p className="text-sm text-gray-400 truncate">{email}</p>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="p-2 text-gray-400 hover:text-brand-600 transition-colors flex-shrink-0"
            title="Editar nombre"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  )
}
