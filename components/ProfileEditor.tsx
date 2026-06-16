'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Upload, Loader2, User } from 'lucide-react'

interface Props {
  userId: string
  displayName: string | null
  email: string
  avatarUrl: string | null
}

export default function ProfileEditor({ userId, displayName, email, avatarUrl }: Props) {
  const router   = useRouter()
  const supabase = createClient()
  const fileRef  = useRef<HTMLInputElement>(null)

  const [editing, setEditing]         = useState(false)
  const [name, setName]               = useState(displayName ?? '')
  const [saving, setSaving]           = useState(false)
  const [nameError, setNameError]     = useState('')
  const [localAvatar, setLocalAvatar] = useState<string | null>(avatarUrl)
  const [uploading, setUploading]     = useState(false)
  const [avatarError, setAvatarError] = useState('')

  const initial = ((displayName ?? email ?? 'U')[0] ?? 'U').toUpperCase()

  async function saveName() {
    const trimmed = name.trim()
    if (!trimmed) { setNameError('Escribe un nombre'); return }
    setSaving(true); setNameError('')
    const { error } = await supabase
      .from('profiles').update({ display_name: trimmed }).eq('id', userId)
    setSaving(false)
    if (error) { setNameError('Error al guardar. Intenta de nuevo.'); return }
    setEditing(false)
    router.refresh()
  }

  function cancelName() {
    setName(displayName ?? ''); setNameError(''); setEditing(false)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { setAvatarError('La imagen debe pesar menos de 3 MB'); return }
    setAvatarError('')
    setLocalAvatar(URL.createObjectURL(file))
    setUploading(true)
    try {
      const ext  = file.name.split('.').pop() ?? 'jpg'
      const path = `${userId}/avatar.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('avatars').upload(path, file, { upsert: true, contentType: file.type })
      if (uploadErr) throw uploadErr
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`
      const { error: updateErr } = await supabase
        .from('profiles').update({ avatar_url: publicUrl }).eq('id', userId)
      if (updateErr) throw updateErr
      setLocalAvatar(publicUrl)
      router.refresh()
    } catch {
      setLocalAvatar(avatarUrl)
      setAvatarError('No se pudo subir la foto. Intenta de nuevo.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="card overflow-hidden">

      {/* ── Header del card ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
        <User className="w-4 h-4 flex-shrink-0" style={{ color: '#1B6DD4' }} />
        <p className="text-sm font-bold text-gray-700">Perfil</p>
      </div>

      {/* ── Fila de perfil ──────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 py-4 flex-wrap gap-y-3">

        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {localAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={localAvatar} alt="avatar" className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #1B6DD4 0%, #0A3F84 100%)' }}
            >
              <span className="text-white font-bold text-2xl select-none">{initial}</span>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            </div>
          )}
        </div>

        {/* Nombre + email */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 truncate">{displayName || '—'}</p>
          <p className="text-sm text-gray-400 truncate">{email}</p>
        </div>

        {/* Botones */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            Subir foto
          </button>
          <button
            onClick={() => setEditing(true)}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#1B6DD4' }}
          >
            <Pencil className="w-3.5 h-3.5" />
            Editar perfil
          </button>
        </div>
      </div>

      {/* ── Formulario de edición (visible cuando editing) ─────────── */}
      {editing && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nombre</label>
            <input
              autoFocus
              value={name}
              onChange={e => { setName(e.target.value); setNameError('') }}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') cancelName() }}
              maxLength={40}
              placeholder="Tu nombre"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-400 focus:bg-white transition-colors"
            />
            {nameError && <p className="text-xs text-red-500 mt-1.5">{nameError}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={cancelName}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
            <button
              onClick={saveName}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-60"
              style={{ backgroundColor: '#1B6DD4' }}
            >
              {saving
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Check className="w-3.5 h-3.5" />
              }
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* Errores de avatar */}
      {avatarError && (
        <p className="text-xs text-red-500 px-5 pb-4">{avatarError}</p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
