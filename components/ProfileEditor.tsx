'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Camera, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

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

  const initial  = ((displayName ?? email ?? 'U')[0] ?? 'U').toUpperCase()
  const hasName  = !!displayName?.trim()
  const hasPhoto = !!localAvatar

  // ── Name ──────────────────────────────────────────────────────
  async function saveName() {
    const trimmed = name.trim()
    if (!trimmed) { setNameError('Escribe un nombre'); return }
    setSaving(true); setNameError('')
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: trimmed })
      .eq('id', userId)
    setSaving(false)
    if (error) { setNameError('Error al guardar. Intenta de nuevo.'); return }
    setEditing(false)
    router.refresh()
  }

  function cancelName() {
    setName(displayName ?? '')
    setNameError('')
    setEditing(false)
  }

  // ── Avatar ────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 3 * 1024 * 1024) {
      setAvatarError('La imagen debe pesar menos de 3 MB')
      return
    }

    setAvatarError('')
    setLocalAvatar(URL.createObjectURL(file)) // instant preview
    setUploading(true)

    try {
      const ext  = file.name.split('.').pop() ?? 'jpg'
      const path = `${userId}/avatar.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadErr) throw uploadErr

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId)
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

  async function removeAvatar() {
    setUploading(true)
    setAvatarError('')
    try {
      await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId)
      setLocalAvatar(null)
      router.refresh()
    } catch {
      setAvatarError('No se pudo eliminar la foto.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="card p-5 space-y-4">

      {/* ── Avatar ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">

        {/* Clickable avatar */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="relative block group focus:outline-none"
            title="Cambiar foto"
          >
            {localAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={localAvatar}
                alt="avatar"
                className="w-16 h-16 rounded-2xl object-cover"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #1B6DD4 0%, #0A3F84 100%)' }}
              >
                <span className="text-white font-bold text-2xl select-none">{initial}</span>
              </div>
            )}
            {/* Hover / loading overlay */}
            <div className={cn(
              'absolute inset-0 rounded-2xl flex items-center justify-center transition-all duration-150',
              uploading ? 'bg-black/40' : 'bg-black/0 group-hover:bg-black/35'
            )}>
              {uploading
                ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                : <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              }
            </div>
          </button>

          {/* Remove photo button */}
          {hasPhoto && !uploading && (
            <button
              onClick={removeAvatar}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-red-50 hover:border-red-200 transition-colors"
              title="Quitar foto"
            >
              <X className="w-3 h-3 text-gray-400" />
            </button>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Upload hint */}
        <div className="flex-1 min-w-0">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors disabled:opacity-50"
          >
            {uploading ? 'Subiendo…' : hasPhoto ? 'Cambiar foto' : 'Subir foto'}
          </button>
          <p className="text-xs text-gray-400 mt-0.5">JPG, PNG o WebP · máx. 3 MB</p>
          {avatarError && <p className="text-xs text-red-500 mt-1">{avatarError}</p>}
        </div>
      </div>

      {/* ── Divider ───────────────────────────────────────────────── */}
      <div className="border-t border-gray-100" />

      {/* ── Name ──────────────────────────────────────────────────── */}
      {editing ? (
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            Nombre
          </label>
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
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={cancelName}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
            <button
              onClick={saveName}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-600 rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-60"
            >
              {saving
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Check className="w-3.5 h-3.5" />
              }
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Nombre</p>
            {hasName ? (
              <p className="text-sm font-bold text-gray-900 truncate">{displayName}</p>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors"
              >
                + Agregar nombre
              </button>
            )}
            <p className="text-xs text-gray-400 mt-0.5 truncate">{email}</p>
          </div>
          {hasName && (
            <button
              onClick={() => setEditing(true)}
              className="p-2 text-gray-300 hover:text-brand-600 rounded-lg hover:bg-brand-50 transition-colors flex-shrink-0"
              title="Editar nombre"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
