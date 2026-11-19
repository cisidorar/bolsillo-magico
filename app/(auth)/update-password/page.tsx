'use client'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Lock, CheckCircle2, Loader2, LinkIcon } from 'lucide-react'
import AuthShell from '@/components/auth/AuthShell'
import AuthField from '@/components/auth/AuthField'

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
    if (phase !== 'done') return
    const t = setTimeout(() => window.location.assign('/inicio'), 4000)
    return () => clearTimeout(t)
  }, [phase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (pass.length < MIN_LEN) { setError(`La contraseña necesita al menos ${MIN_LEN} caracteres.`); return }
    if (pass !== confirm) { setError('Las contraseñas no coinciden.'); return }

    setLoading(true)
    const { error: upErr } = await supabase.auth.updateUser({ password: pass })
    setLoading(false)

    if (upErr) {
      const msg = upErr.message.toLowerCase()
      if (msg.includes('session')) { setPhase('expired'); return }
      if (msg.includes('same') || msg.includes('different')) setError('Elige una contraseña distinta de la anterior.')
      else if (msg.includes('weak') || msg.includes('password should')) setError('Esa contraseña es muy débil. Prueba con una más larga o con más variedad.')
      else setError('No pudimos guardar tu contraseña. Revisa tu conexión e inténtalo de nuevo.')
      return
    }
    // Si alguien más tenía una sesión abierta con la contraseña anterior, se cierra.
    try { await supabase.auth.signOut({ scope: 'others' }) } catch { /* no bloquea */ }
    setPhase('done')
  }

  if (phase === 'checking') {
    return (
      <AuthShell title={welcome ? 'Crea tu contraseña' : 'Tu contraseña'}>
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
            {welcome ? 'Tu contraseña quedó guardada. Ya puedes usar Bolsillo Mágico.' : 'Tu contraseña quedó actualizada.'}
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
      title={welcome ? 'Crea tu contraseña' : 'Nueva contraseña'}
      subtitle={welcome
        ? 'Te invitaron a Bolsillo Mágico. Elige una contraseña para entrar.'
        : 'Elige una contraseña nueva para tu cuenta.'}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <AuthField
          id="new-password" name="new-password" label="Contraseña" type="password" revealable
          value={pass} onChange={setPass} autoComplete="new-password" enterKeyHint="next"
          hint={`Mínimo ${MIN_LEN} caracteres`} icon={<Lock className="w-4 h-4" />}
          invalid={!!error} describedBy={error ? 'pw-error' : undefined}
        />
        <AuthField
          id="confirm-password" name="confirm-password" label="Repite la contraseña" type="password" revealable
          value={confirm} onChange={setConfirm} autoComplete="new-password" enterKeyHint="go"
          icon={<Lock className="w-4 h-4" />}
          invalid={!!error} describedBy={error ? 'pw-error' : undefined}
        />

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
          {loading ? <><Loader2 className="w-5 h-5 auth-spinner" aria-hidden /> Guardando…</> : 'Guardar contraseña'}
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
