'use client'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Lock, CheckCircle2, Loader2, LinkIcon, User, AtSign } from 'lucide-react'
import AuthShell from '@/components/auth/AuthShell'
import AuthField from '@/components/auth/AuthField'
import AvatarPicker from '@/components/auth/AvatarPicker'
import { AVATARS, avatarUrl } from '@/lib/avatars'
import { normalizeUsername, usernameError } from '@/lib/username'

// Dos caminos llegan acá con una sesión temporal creada por el enlace del
// correo: quien fue INVITADO (primera contraseña, ?welcome=1) y quien pidió
// "¿Olvidaste tu contraseña?". Es la primera pantalla que ve un amigo invitado,
// así que habla de bienvenida y no de "nueva contraseña".

type Phase = 'checking' | 'ready' | 'expired' | 'done'
const MIN_LEN = 8

function UpdatePasswordForm() {
  const supabase = createClient()
  const welcome  = useSearchParams().get('welcome') === '1'

  const [phase,   setPhase]   = useState<Phase>('checking')
  const [pass,    setPass]    = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  // Registro por invitación (?welcome=1): además de la contraseña se pide cómo te ven los demás.
  const [name,    setName]    = useState('')
  const [handle,  setHandle]  = useState('')
  const [avatar,  setAvatar]  = useState<string>(() => avatarUrl(AVATARS[Math.floor(Math.random() * AVATARS.length)].id))
  const [editHandle, setEditHandle] = useState(false)
  const findable = true   // se cambia en Ajustes; marcado por defecto
  const [pwSaved, setPwSaved] = useState(false)   // si el perfil falla, no se vuelve a pedir la contraseña

  // El enlace del correo deja una sesión; si no hay (enlace usado, vencido o
  // alguien que entró directo), se avisa de entrada en vez de dejarlo escribir
  // una contraseña que no se va a poder guardar. La sesión puede tardar un
  // instante en establecerse, por eso se espera antes de dar el enlace por malo.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setPhase(p => (p === 'checking' ? 'ready' : p))
    })
    supabase.auth.getSession().then(({ data }) => { if (data.session) setPhase(p => (p === 'checking' ? 'ready' : p)) })
    const t = setTimeout(() => setPhase(p => (p === 'checking' ? 'expired' : p)), 3000)
    return () => { sub.subscription.unsubscribe(); clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!welcome || phase !== 'ready') return
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
      const raw = (prof?.display_name as string | null) ?? ''
      const { data: u } = await supabase.rpc('ensure_my_username')
      if (cancelled) return
      setName(n => n || (raw.includes('@') ? raw.split('@')[0] : raw))
      setHandle(h => h || ((u as string | null) ?? ''))
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [welcome, phase])

  useEffect(() => {
    if (phase !== 'done') return
    const t = setTimeout(() => window.location.assign('/inicio'), 4000)
    return () => clearTimeout(t)
  }, [phase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (welcome) {
      const n = name.trim()
      if (n.length < 2) { setError('Escribe cómo quieres que te llamemos.'); return }
      if (n.length > 40 || n.includes('@')) { setError('Usa solo tu nombre, hasta 40 letras y sin correo.'); return }
      const uErr = usernameError(handle)
      if (uErr) { setError(uErr); return }
    }
    if (!pwSaved) {
      if (pass.length < MIN_LEN) { setError(`La contraseña necesita al menos ${MIN_LEN} caracteres.`); return }
      if (!welcome && pass !== confirm) { setError('Las contraseñas no coinciden.'); return }
    }

    setLoading(true)
    if (!pwSaved) {
      const { error: upErr } = await supabase.auth.updateUser({ password: pass })
      if (upErr) {
        setLoading(false)
        const msg = upErr.message.toLowerCase()
        if (msg.includes('session')) { setPhase('expired'); return }
        if (msg.includes('same') || msg.includes('different')) setError('Elige una contraseña distinta de la anterior.')
        else if (msg.includes('weak') || msg.includes('password should')) setError('Esa contraseña es muy débil. Prueba con una más larga o con más variedad.')
        else setError('No pudimos guardar tu contraseña. Revisa tu conexión e inténtalo de nuevo.')
        return
      }
      setPwSaved(true)
    }

    if (welcome) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); setPhase('expired'); return }
      const { error: profErr } = await supabase.from('profiles').update({
        display_name: name.trim(), username: normalizeUsername(handle), discoverable: findable,
        avatar_url: avatar, onboarded_at: new Date().toISOString(),
      }).eq('id', user.id)
      if (profErr) {
        setLoading(false)
        setError(profErr.code === '23505'
          ? 'Tu contraseña ya quedó guardada. Ese @usuario ya existe: prueba con otro.'
          : 'Tu contraseña ya quedó guardada, pero no pudimos guardar tu perfil. Inténtalo de nuevo.')
        return
      }
    }
    setLoading(false)

    // Si alguien más tenía una sesión abierta con la contraseña anterior, se cierra.
    try { await supabase.auth.signOut({ scope: 'others' }) } catch { /* no bloquea */ }
    if (welcome) { window.location.assign('/inicio'); return }
    setPhase('done')
  }

  if (phase === 'checking') {
    return (
      <AuthShell title={welcome ? 'Crea tu cuenta' : 'Tu contraseña'}>
        <p role="status" className="flex items-center justify-center gap-2 py-6 text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
          <Loader2 className="w-5 h-5 auth-spinner" aria-hidden /> Verificando tu enlace…
        </p>
      </AuthShell>
    )
  }

  if (phase === 'expired') {
    return (
      <AuthShell title="Este enlace ya no sirve" back={{ href: '/', label: 'Volver al inicio' }}>
        <div className="flex flex-col items-center text-center gap-3">
          <span className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
            <LinkIcon className="w-5 h-5" aria-hidden />
          </span>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            Los enlaces del correo se pueden usar una sola vez y vencen. Ve a iniciar sesión y toca «¿Olvidaste tu contraseña?» con tu correo para recibir uno nuevo. Si te invitaron y no te funciona, pídele a quien te invitó que lo reenvíe.
          </p>
          <Link href="/login" className="cta-primary w-full rounded-2xl font-bold text-base flex items-center justify-center mt-2" style={{ minHeight: 52 }}>
            Ir a iniciar sesión
          </Link>
        </div>
      </AuthShell>
    )
  }

  if (phase === 'done') {
    return (
      <AuthShell title="Listo">
        <div className="flex flex-col items-center text-center gap-3" role="status">
          <span className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--mint) 14%, var(--surface))', color: 'var(--mint-ink)' }}>
            <CheckCircle2 className="w-6 h-6" aria-hidden />
          </span>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {welcome ? '¡Listo! Tu cuenta quedó creada. Ya puedes usar Bolsillo Mágico.' : 'Tu contraseña quedó actualizada.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.assign('/inicio')}
            className="cta-primary w-full rounded-2xl font-bold text-base mt-2"
            style={{ minHeight: 52, border: 'none', fontFamily: 'inherit' }}
          >
            Entrar a Inicio
          </button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={welcome ? 'Crea tu cuenta' : 'Nueva contraseña'}
      subtitle={welcome
        ? 'Te invitaron a Bolsillo Mágico. Cuéntanos cómo te llamas y elige una contraseña.'
        : 'Elige una contraseña nueva para tu cuenta.'}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {welcome && (
          <>
            <AvatarPicker value={avatar} onChange={setAvatar} />
            <AuthField id="name" name="name" label="Tu nombre" value={name} onChange={setName}
              autoComplete="given-name" enterKeyHint="next" icon={<User className="w-4 h-4" />}
              hint="Como te dicen tus amigos. Es el que verán en los viajes compartidos."
              invalid={!!error} />
            {editHandle ? (
              <AuthField id="handle" name="handle" label="Tu @usuario" value={handle} onChange={v => setHandle(v.toLowerCase())}
                autoComplete="off" enterKeyHint="next" icon={<AtSign className="w-4 h-4" />}
                hint="Con él te invitan a viajes y gastos compartidos." invalid={!!error} />
            ) : (
              <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                Tu usuario será <span className="font-bold" style={{ color: 'var(--ink-2)' }}>@{handle || '…'}</span>.{' '}
                <button type="button" onClick={() => setEditHandle(true)} className="font-bold underline" style={{ color: 'var(--primary)' }}>Cambiar</button>
              </p>
            )}
          </>
        )}
        {!pwSaved && (<>
        <AuthField
          id="new-password" name="new-password" label="Contraseña" type="password" revealable
          value={pass} onChange={setPass} autoComplete="new-password" enterKeyHint="next"
          hint={`Mínimo ${MIN_LEN} caracteres`} icon={<Lock className="w-4 h-4" />}
          invalid={!!error} describedBy={error ? 'pw-error' : undefined}
        />
 {!welcome && <AuthField
          id="confirm-password" name="confirm-password" label="Repite la contraseña" type="password" revealable
          value={confirm} onChange={setConfirm} autoComplete="new-password" enterKeyHint="go"
          icon={<Lock className="w-4 h-4" />}
          invalid={!!error} describedBy={error ? 'pw-error' : undefined}
        />}
        </>)}

        {error && (
          <p id="pw-error" role="alert" className="text-xs font-bold rounded-xl px-4 py-3"
             style={{ color: 'var(--coral-ink)', background: 'color-mix(in srgb, var(--coral) 10%, var(--surface))' }}>
            {error}
          </p>
        )}

        <button
          type="submit" disabled={loading}
          className="cta-primary w-full rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-transform active:scale-[.99]"
          style={{ minHeight: 52, border: 'none', fontFamily: 'inherit' }}
        >
          {loading ? <><Loader2 className="w-5 h-5 auth-spinner" aria-hidden /> Guardando…</> : welcome ? 'Crear mi cuenta' : 'Guardar contraseña'}
        </button>
      </form>
    </AuthShell>
  )
}

export default function UpdatePasswordPage() {
  return (
    <Suspense>
      <UpdatePasswordForm />
    </Suspense>
  )
}
