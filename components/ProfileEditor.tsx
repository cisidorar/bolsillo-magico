'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Upload, Loader2, User, AtSign } from 'lucide-react'
import { normalizeUsername, usernameError } from '@/lib/username'

interface Props {
  userId: string
  displayName: string | null
  email: string
  avatarUrl: string | null
  username: string | null
  discoverable: boolean
}

/**
 * Solo identidad: avatar + nombre. La sección de acceso (correo, contraseña,
 * cerrar sesión) vive en SecurityCard — antes vivían juntas acá Y el correo
 * se repetía otra vez en una tarjeta "Cuenta" aparte en page.tsx (mismo dato,
 * tres veces en la misma pantalla: SideNav, acá y en "Cuenta"). Separado así,
 * cada columna de /ajustes/perfil trae UNA tarjeta con un propósito propio.
 */
export default function ProfileEditor({ userId, displayName, email, avatarUrl, username, discoverable }: Props) {
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
  // @usuario: lo que otra persona busca para invitarte a un viaje compartido
  const [editingUser, setEditingUser] = useState(false)
  const [userInput, setUserInput]     = useState(username ?? '')
  const [userError, setUserError]     = useState('')
  const [savingUser, setSavingUser]   = useState(false)
  const [canBeFound, setCanBeFound]   = useState(discoverable)

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

  async function saveUsername() {
    const u = normalizeUsername(userInput)
    const err = usernameError(u)
    if (err) { setUserError(err); return }
    if (u === username) { setEditingUser(false); return }
    setSavingUser(true); setUserError('')
    const { error } = await supabase.from('profiles').update({ username: u }).eq('id', userId)
    setSavingUser(false)
    if (error) {
      setUserError(error.code === '23505' ? 'Ese usuario ya está en uso.' : 'No se pudo guardar. Intenta de nuevo.')
      return
    }
    setEditingUser(false)
    router.refresh()
  }

  async function toggleFound() {
    const next = !canBeFound
    setCanBeFound(next)
    const { error } = await supabase.from('profiles').update({ discoverable: next }).eq('id', userId)
    if (error) setCanBeFound(!next)
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
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
        <User className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} />
        <p className="text-sm font-bold text-gray-700">Perfil</p>
      </div>

      <div className="px-5 py-4">
        {/* Fila 1: avatar + nombre */}
        <div className="flex items-center gap-4 mb-3">
          <div className="relative flex-shrink-0">
            {localAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={localAvatar} alt="avatar" className="w-14 h-14 rounded-full object-cover" />
            ) : (
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: 'var(--primary)' }}
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
          <div className="min-w-0">
            <p className="font-bold text-gray-900 truncate">{displayName || '—'}</p>
            <p className="text-sm text-gray-400 truncate">{email}</p>
          </div>
        </div>

        {/* Fila 2: botones */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            Subir foto
          </button>
          <button
            onClick={() => setEditing(true)}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            <Pencil className="w-3.5 h-3.5" />
            Editar
          </button>
        </div>
      </div>

      {/* Formulario nombre */}
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
            <button onClick={cancelName} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
            <button onClick={saveName} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-60" style={{ backgroundColor: 'var(--primary)' }}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* @usuario */}
      <div className="px-5 pb-5 border-t border-gray-100 pt-4">
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tu usuario</label>
        {!editingUser ? (
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-sm font-bold text-gray-900 min-w-0">
              <AtSign className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} />
              <span className="truncate">{username ?? '—'}</span>
            </p>
            <button onClick={() => { setUserInput(username ?? ''); setUserError(''); setEditingUser(true) }}
              className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--primary)' }}>Cambiar</button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              autoFocus value={userInput}
              onChange={e => { setUserInput(e.target.value); setUserError('') }}
              onKeyDown={e => { if (e.key === 'Enter') saveUsername(); if (e.key === 'Escape') setEditingUser(false) }}
              maxLength={21} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="usuario"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-400 focus:bg-white transition-colors"
            />
            {userError && <p className="text-xs text-red-500">{userError}</p>}
            <div className="flex items-center gap-2">
              <button onClick={() => setEditingUser(false)} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                <X className="w-3.5 h-3.5" /> Cancelar
              </button>
              <button onClick={saveUsername} disabled={savingUser} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-60" style={{ backgroundColor: 'var(--primary)' }}>
                {savingUser ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {savingUser ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-2">
          Otra persona te encuentra con este usuario para invitarte a un viaje compartido. Letras, números, "_" y ".".
        </p>
        <button onClick={toggleFound} role="switch" aria-checked={canBeFound}
          className="mt-3 w-full flex items-center justify-between gap-3 text-left">
          <span className="text-sm text-gray-700">Permitir que me encuentren por mi usuario</span>
          <span className="w-10 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0"
            style={{ background: canBeFound ? 'var(--primary)' : 'var(--border)' }}>
            <span className="w-5 h-5 rounded-full bg-white shadow transition-transform"
              style={{ transform: canBeFound ? 'translateX(16px)' : 'translateX(0)' }} />
          </span>
        </button>
      </div>

      {avatarError && <p className="text-xs text-red-500 px-5 pb-4">{avatarError}</p>}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
    </div>
  )
}
