'use client'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Lock, CheckCircle2, Loader2, LinkIcon, User, AtSign, Mail, Check } from 'lucide-react'
import AuthShell from '@/components/auth/AuthShell'
import AuthField from '@/components/auth/AuthField'
import AvatarPicker from '@/components/auth/AvatarPicker'
import { AVATARS, avatarUrl } from '@/lib/avatars'
import { normalizeUsername, usernameError } from '@/lib/username'
import { checkPassword, PASSWORD_MIN } from '@/lib/password'

// Dos caminos llegan acá con una sesión temporal creada por el enlace del
// correo: quien fue INVITADO (primera contraseña, ?welcome=1) y quien pidió
// "¿Olvidaste tu contraseña?". Es la primera pantalla que ve un amigo invitado,
// así que habla de bienvenida y no de "nueva contraseña".

type Phase = 'checking' | 'ready' | 'expired' | 'done'
const MIN_LEN = PASSWORD_MIN

// Día de sueldo: lo que la app usa para la cuenta regresiva y el ciclo de sueldo. Opcional.
type PayChoice = number | 'lbd' | 'none' | null
const PAY_OPTIONS: { v: PayChoice; label: string }[] = [
  { v: 1, label: 'Día 1' }, { v: 5, label: 'Día 5' }, { v: 15, label: 'Día 15' }, { v: 25, label: 'Día 25' },
  { v: 30, label: 'Día 30' }, { v: 'lbd', label: 'Último día hábil' }, { v: 'none', label: 'Sin fecha fija' },
]

/** Medidor y requisitos de la contraseña, en vivo. */
function PasswordMeter({ pass, check }: { pass: string; check: ReturnType<typeof checkPassword> }) {
  if (pass.length === 0) {
    return <p id="pw-hint" className="text-xs mt-1.5" style={{ color: 'var(--ink-3)' }}>Mínimo {MIN_LEN} caracteres. Una frase larga funciona mejor que símbolos raros.</p>
  }
  const color = check.score === 0 ? 'var(--coral)' : check.score === 1 ? 'var(--gold)' : 'var(--mint)'
  const text  = check.score === 0 ? 'var(--coral-ink)' : check.score === 1 ? 'var(--gold-ink)' : 'var(--mint-ink)'
  return (
    <div id="pw-hint" className="mt-2" aria-live="polite">
      <div className="flex items-center gap-1.5" aria-hidden>
        {[1, 2, 3].map(i => (
          <span key={i} className="h-1.5 flex-1 rounded-full transition-colors duration-200"
                style={{ background: check.score >= i || (check.score === 0 && i === 1) ? color : 'var(--surface-2)' }} />
        ))}
      </div>
      <p className="text-xs font-semibold mt-1.5 flex items-center gap-1" style={{ color: text }}>
        {check.ok && <Check className="w-3.5 h-3.5" aria-hidden />}{check.label}
      </p>
      {check.issues.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {check.issues.map(i => <li key={i} className="text-xs" style={{ color: 'var(--ink-2)' }}>· {i}</li>)}
        </ul>
      )}
    </div>
  )
}

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
  // Parte con el primero y, al conocer la cuenta, pasa a uno fijo por cuenta (Math.random daba otro en servidor y navegador).
  const [avatar,  setAvatar]  = useState<string>(() => avatarUrl(AVATARS[0].id))
  const [editHandle, setEditHandle] = useState(false)
  const [email,   setEmail]   = useState('')
  const [pay,     setPay]     = useState<PayChoice>(null)
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
    if (phase !== 'ready') return
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      setEmail(user.email ?? '')
      if (welcome) {
        let h = 0
        for (const c of user.id) h = (h * 31 + c.charCodeAt(0)) >>> 0
        const mine = avatarUrl(AVATARS[h % AVATARS.length].id)
        setAvatar(a => (a === avatarUrl(AVATARS[0].id) ? mine : a))
      }
      if (!welcome) return
      const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
      const raw = (prof?.display_name as string | null) ?? ''
      const { data: u } = await supabase.rpc('ensure_my_username')
      if (cancelled) return
      // Si el nombre guardado es solo lo que sale del correo, el campo empieza vacío: que lo escriba la persona.
      const fromEmail = (user.email ?? '').split('@')[0].toLowerCase()
      const realName = !raw.trim() || raw.includes('@') || raw.trim().toLowerCase() === fromEmail ? '' : raw.trim()
      setName(n => n || realName)
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

  const pwCheck = checkPassword(pass, { email, name, username: handle })

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
      if (!pwCheck.ok) { setError(pwCheck.issues[0] ?? `La contraseña necesita al menos ${MIN_LEN} caracteres.`); return }
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
        ...(pay === 'lbd' ? { payday_last_business_day: true } : typeof pay === 'number' ? { payday: pay, payday_last_business_day: false } : {}),
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
            Los enlaces del correo se pueden usar una sola vez y vencen. Pide uno nuevo con tu correo. Si te invitaron y no te funciona, pídele a quien te invitó que lo reenvíe.
          </p>
          <Link href="/login?forgot=1" className="cta-primary w-full rounded-2xl font-bold text-base flex items-center justify-center mt-2" style={{ minHeight: 52 }}>
            Pedir un enlace nuevo
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
      wide={welcome}
      title={welcome ? 'Crea tu cuenta' : 'Nueva contraseña'}
      subtitle={welcome
        ? 'Te invitaron a Bolsillo Mágico. Cuéntanos cómo te llamas y elige una contraseña.'
        : 'Elige una contraseña nueva para tu cuenta.'}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
        {email && (
          <AuthField id="email" name="username" label="Tu correo" type="email" value={email} onChange={() => {}} readOnly
            autoComplete="username" icon={<Mail className="w-4 h-4" />}
            hint={welcome ? 'Con este correo vas a entrar siempre.' : undefined} />
        )}
        </div>
        {welcome && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-semibold mb-2.5" style={{ color: 'var(--ink-2)' }}>Elige tu foto</p>
              <AvatarPicker value={avatar} onChange={setAvatar} />
            </div>
            <AuthField id="name" name="name" label="Tu nombre" value={name} onChange={setName}
              autoComplete="given-name" enterKeyHint="next" icon={<User className="w-4 h-4" />}
              placeholder="Por ejemplo, Camila"
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
          </div>
        )}
        {!pwSaved && (<div className="flex flex-col gap-4">
        <div>
        <AuthField
          id="new-password" name="new-password" label="Contraseña" type="password" revealable
          value={pass} onChange={setPass} autoComplete="new-password" enterKeyHint="next"
          icon={<Lock className="w-4 h-4" />}
          invalid={!!error} describedBy={[error ? 'pw-error' : '', 'pw-hint'].filter(Boolean).join(' ')}
        />
        <PasswordMeter pass={pass} check={pwCheck} />
        </div>
 {!welcome && <AuthField
          id="confirm-password" name="confirm-password" label="Repite la contraseña" type="password" revealable
          value={confirm} onChange={setConfirm} autoComplete="new-password" enterKeyHint="go"
          icon={<Lock className="w-4 h-4" />}
          invalid={!!error} describedBy={error ? 'pw-error' : undefined}
        />}
        </div>)}

        {welcome && (
          <fieldset>
            <legend className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--ink-2)' }}>
              ¿Qué día te llega el sueldo? <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>(opcional)</span>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {PAY_OPTIONS.map(o => {
                const on = pay === o.v
                return (
                  <button key={String(o.v)} type="button" aria-pressed={on} onClick={() => setPay(on ? null : o.v)}
                    className="min-h-[44px] px-3.5 rounded-xl text-xs font-semibold transition-colors"
                    style={on ? { background: 'var(--primary-soft)', color: 'var(--primary)' } : { background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
                    {o.label}
                  </button>
                )
              })}
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--ink-3)' }}>Para avisarte cuánto falta y calcular tu ciclo de sueldo. Puedes cambiarlo después en Ajustes.</p>
          </fieldset>
        )}
        {error && (
          <p id="pw-error" role="alert" className="text-xs font-bold rounded-xl px-4 py-3"
             style={{ color: 'var(--coral-ink)', background: 'color-mix(in srgb, var(--coral) 10%, var(--surface))' }}>
            {error}
          </p>
        )}

        {welcome && (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            Al crear tu cuenta aceptas que guardemos tus datos como se explica en{' '}
            <Link href="/seguridad" target="_blank" className="font-bold underline" style={{ color: 'var(--primary)' }}>Cómo cuidamos tus datos</Link>.
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
