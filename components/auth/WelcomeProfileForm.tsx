'use client'

import { useState } from 'react'
import { User, AtSign, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import AuthShell from '@/components/auth/AuthShell'
import AuthField from '@/components/auth/AuthField'
import { normalizeUsername, usernameError } from '@/lib/username'
import AvatarPicker from '@/components/auth/AvatarPicker'
import { AVATARS, avatarUrl } from '@/lib/avatars'

/** "Tu perfil": nombre con el que te ven los demás y @usuario. Lo demás se completa en Ajustes cuando haga falta. */
export default function WelcomeProfileForm({ userId, initialName, initialUsername }: {
  userId: string; initialName: string; initialUsername: string
}) {
  const supabase = createClient()
  const [name, setName] = useState(initialName)
  const [user, setUser] = useState(initialUsername)
  const [discoverable, setDiscoverable] = useState(true)
  // Uno por cuenta, siempre el mismo: con Math.random el servidor y el navegador elegían distinto.
  const [avatar, setAvatar] = useState<string>(() => {
    let h = 0
    for (const c of userId) h = (h * 31 + c.charCodeAt(0)) >>> 0
    return avatarUrl(AVATARS[h % AVATARS.length].id)
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const n = name.trim()
    if (n.length < 2) { setError('Escribe cómo quieres que te llamemos.'); return }
    if (n.length > 40 || n.includes('@')) { setError('Usa solo tu nombre, hasta 40 letras y sin correo.'); return }
    const uErr = usernameError(user)
    if (uErr) { setError(uErr); return }

    setLoading(true)
    const { error: upErr } = await supabase.from('profiles').update({
      display_name: n, username: normalizeUsername(user), discoverable, avatar_url: avatar, onboarded_at: new Date().toISOString(),
    }).eq('id', userId)
    setLoading(false)

    if (upErr) {
      setError(upErr.code === '23505' ? 'Ese usuario ya existe. Prueba con otro.' : 'No pudimos guardar tu perfil. Inténtalo de nuevo.')
      return
    }
    window.location.assign('/inicio')
  }

  return (
    <AuthShell title="Tu perfil" subtitle="Así te van a ver las personas con las que compartas gastos o viajes.">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold mb-2.5" style={{ color: 'var(--ink-2)' }}>Elige tu foto</p>
          <AvatarPicker value={avatar} onChange={setAvatar} />
        </div>
        <AuthField id="name" name="name" label="Tu nombre" value={name} onChange={setName}
           autoComplete="given-name" enterKeyHint="next" icon={<User className="w-4 h-4" />}
          placeholder="Por ejemplo, Camila"
          hint="Como te dicen tus amigos. No el correo." invalid={!!error} />
        <AuthField id="username" name="username" label="Tu @usuario" value={user} onChange={v => setUser(v.toLowerCase())}
           autoComplete="off" enterKeyHint="go" icon={<AtSign className="w-4 h-4" />}
          hint="Te lo sugerimos nosotros; puedes cambiarlo. Con él te invitan a viajes y gastos compartidos." invalid={!!error} />

        <label className="flex items-start gap-3 text-sm cursor-pointer" style={{ color: 'var(--ink-2)' }}>
          <input type="checkbox" checked={discoverable} onChange={e => setDiscoverable(e.target.checked)} className="mt-1 w-4 h-4" />
          <span>Que mis amigos me encuentren por mi @usuario. <span style={{ color: 'var(--ink-3)' }}>Si lo desmarcas, nadie puede invitarte a un viaje.</span></span>
        </label>

        {error && (
          <p role="alert" className="text-xs font-bold rounded-xl px-4 py-3"
             style={{ color: 'var(--coral-ink)', background: 'color-mix(in srgb, var(--coral) 10%, var(--surface))' }}>{error}</p>
        )}

        <button type="submit" disabled={loading}
          className="cta-primary w-full rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-transform active:scale-[.99]"
          style={{ minHeight: 52, border: 'none', fontFamily: 'inherit' }}>
          {loading ? <><Loader2 className="w-5 h-5 auth-spinner" aria-hidden /> Guardando…</> : 'Empezar'}
        </button>
      </form>
    </AuthShell>
  )
}
