'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Upload, Loader2, User, Shield, Eye, EyeOff, ChevronDown, ChevronUp, Mail } from 'lucide-react'

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

  // Perfil
  const [editing, setEditing]         = useState(false)
  const [name, setName]               = useState(displayName ?? '')
  const [saving, setSaving]           = useState(false)
  const [nameError, setNameError]     = useState('')
  const [localAvatar, setLocalAvatar] = useState<string | null>(avatarUrl)
  const [uploading, setUploading]     = useState(false)
  const [avatarError, setAvatarError] = useState('')

  // Seguridad — cambiar email
  const [emailOpen, setEmailOpen]     = useState(false)
  const [newEmail, setNewEmail]       = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailError, setEmailError]   = useState('')
  const [emailDone, setEmailDone]     = useState(false)

  // Seguridad — cambiar contraseña
  const [passOpen, setPassOpen]       = useState(false)
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass]         = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showPw, setShowPw]           = useState(false)
  const [passSaving, setPassSaving]   = useState(false)
  const [passError, setPassError]     = useState('')
  const [passDone, setPassDone]       = useState(false)

  const initial = ((displayName ?? email ?? 'U')[0] ?? 'U').toUpperCase()

  // ── Nombre ──────────────────────────────────────────────────────────────────
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

  // ── Avatar ───────────────────────────────────────────────────────────────────
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

  // ── Cambiar email ────────────────────────────────────────────────────────────
  async function saveEmail() {
    const trimmed = newEmail.trim().toLowerCase()
    if (!trimmed || !trimmed.includes('@')) { setEmailError('Ingresa un correo válido'); return }
    if (trimmed === email.toLowerCase()) { setEmailError('El correo es igual al actual'); return }
    setEmailSaving(true); setEmailError('')
    const { error } = await supabase.auth.updateUser({ email: trimmed })
    setEmailSaving(false)
    if (error) {
      setEmailError(error.message ?? 'Error al actualizar. Intenta de nuevo.')
      return
    }
    setEmailDone(true)
    setNewEmail('')
  }

  // ── Cambiar contraseña ───────────────────────────────────────────────────────
  async function savePassword() {
    if (!currentPass) { setPassError('Ingresa tu contraseña actual'); return }
    if (newPass.length < 8) { setPassError('La nueva contraseña debe tener al menos 8 caracteres'); return }
    if (newPass !== confirmPass) { setPassError('Las contraseñas no coinciden'); return }
    setPassSaving(true); setPassError('')
    // nonce = contraseña actual (requerido con "Require current password" activo en Supabase)
    const { error } = await supabase.auth.updateUser({
      password: newPass,
      nonce: currentPass,
    } as any)
    setPassSaving(false)
    if (error) {
      const msg = error.message?.toLowerCase() ?? ''
      if (msg.includes('nonce') || msg.includes('current') || msg.includes('invalid')) {
        setPassError('La contraseña actual es incorrecta')
      } else {
        setPassError(error.message ?? 'Error al actualizar. Intenta de nuevo.')
      }
      return
    }
    setPassDone(true)
    setCurrentPass(''); setNewPass(''); setConfirmPass('')
  }

  return (
    <>
      {/* ── Card Perfil ─────────────────────────────────────────────────────── */}
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

        {avatarError && <p className="text-xs text-red-500 px-5 pb-4">{avatarError}</p>}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
      </div>

      {/* ── Card Seguridad ───────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
          <Shield className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} />
          <p className="text-sm font-bold text-gray-700">Seguridad</p>
        </div>

        {/* ── Cambiar email ── */}
        <div className="border-b" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => { setEmailOpen(v => !v); setEmailError(''); setEmailDone(false); setNewEmail('') }}
            className="w-full flex items-center gap-3 px-5 py-4 transition-colors hover:bg-black/[0.02]"
          >
            <Mail className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Correo electrónico</p>
              <p className="text-sm truncate" style={{ color: 'var(--ink)' }}>{email}</p>
            </div>
            {emailOpen
              ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
              : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
            }
          </button>

          {emailOpen && (
            <div className="px-5 pb-5 space-y-3">
              {emailDone ? (
                <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.2)' }}>
                  <p className="text-xs font-bold" style={{ color: '#16A34A' }}>Correo de confirmación enviado</p>
                  <p className="text-xs mt-0.5" style={{ color: '#16A34A', opacity: 0.8 }}>
                    Revisa tu bandeja de entrada y haz clic en el enlace para confirmar el cambio.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--ink-3)' }}>
                      Nuevo correo electrónico
                    </label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={e => { setNewEmail(e.target.value); setEmailError('') }}
                      onKeyDown={e => { if (e.key === 'Enter') saveEmail() }}
                      placeholder={email}
                      autoComplete="email"
                      className="w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors"
                      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                    />
                    {emailError && <p className="text-xs text-red-500 mt-1.5">{emailError}</p>}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                    Te enviaremos un enlace al nuevo correo para confirmar el cambio.
                  </p>
                  <button
                    onClick={saveEmail}
                    disabled={emailSaving}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-60"
                    style={{ backgroundColor: 'var(--primary)' }}
                  >
                    {emailSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    {emailSaving ? 'Enviando…' : 'Enviar confirmación'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Cambiar contraseña ── */}
        <div>
          <button
            onClick={() => { setPassOpen(v => !v); setPassError(''); setPassDone(false) }}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/70 transition-colors"
          >
            <p className="text-sm font-semibold text-gray-800">Cambiar contraseña</p>
            {passOpen ? <ChevronUp className="w-4 h-4 text-gray-300" /> : <ChevronDown className="w-4 h-4 text-gray-300" />}
          </button>

          {passOpen && (
            <div className="px-5 pb-5 space-y-3">
              {passDone ? (
                <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                  <p className="text-xs font-bold text-green-700">✅ Contraseña actualizada</p>
                  <p className="text-xs text-green-600 mt-0.5">Tu contraseña se cambió correctamente.</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Contraseña actual</label>
                    <div className="relative">
                      <input
                        type={showPw ? 'text' : 'password'}
                        value={currentPass}
                        onChange={e => { setCurrentPass(e.target.value); setPassError('') }}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 pr-10 text-sm text-gray-800 outline-none focus:border-brand-400 focus:bg-white transition-colors"
                      />
                      <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                      Nueva contraseña <span className="text-gray-300 font-normal">(mín. 8 caracteres)</span>
                    </label>
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={newPass}
                      onChange={e => { setNewPass(e.target.value); setPassError('') }}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-400 focus:bg-white transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Confirmar nueva contraseña</label>
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={confirmPass}
                      onChange={e => { setConfirmPass(e.target.value); setPassError('') }}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-400 focus:bg-white transition-colors"
                    />
                  </div>

                  {passError && <p className="text-xs text-red-500">{passError}</p>}

                  <button
                    onClick={savePassword}
                    disabled={passSaving}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-60"
                    style={{ backgroundColor: 'var(--primary)' }}
                  >
                    {passSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    {passSaving ? 'Guardando…' : 'Actualizar contraseña'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
