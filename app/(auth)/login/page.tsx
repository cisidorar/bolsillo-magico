'use client'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Mail, Lock, Loader2 } from 'lucide-react'
import AuthShell from '@/components/auth/AuthShell'
import AuthField from '@/components/auth/AuthField'

// El registro está cerrado: se entra por invitación (ver /admin). Eso lo cierra
// Supabase ("Allow new users to sign up" apagado), no esta pantalla.
//
// Nov 2026: el login sigue el tema del dispositivo (script en app/layout.tsx) y
// comparte cáscara y campos con /update-password (components/auth).
//
// Ojo con el bloqueo: es solo fricción en el navegador (se reinicia al
// recargar y cualquiera puede llamar a Supabase directo). El freno real es el
// límite de intentos del propio Supabase, que llega como 429 y acá también
// activa el bloqueo.

const MAX_ATTEMPTS  = 5
const LOCKOUT_SECS  = 60
const RESET_COOLDOWN_SECS = 45

// A dónde volver después de entrar (lo pone el middleware). Solo rutas internas
// de la app: nada de "//otro.sitio", "/\\otro.sitio" ni rutas de acceso.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/inicio'
  if (/^\/(login|update-password|api)(\/|\?|$)/.test(raw)) return '/inicio'
  return raw
}

const BAD_LINK = 'Este enlace ya se usó o venció. Si te invitaron, toca «¿Olvidaste tu contraseña?» con tu correo para recibir uno nuevo, o pídele a quien te invitó que lo reenvíe.'

function LoginForm() {
  const supabase     = createClient()
  const searchParams = useSearchParams()

  const [email,   setEmail]   = useState('')
  const [pass,    setPass]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const [resetSent, setResetSent] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetWait, setResetWait] = useState(0)

  const [attempts,    setAttempts]    = useState(0)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [countdown,   setCountdown]   = useState(0)
  // Lo que anuncian los lectores de pantalla: no cada segundo, solo al empezar,
  // cada 15 s y al terminar.
  const [lockNote, setLockNote] = useState('')
  // En la app instalada no se ofrece la landing: quien la instaló ya tiene cuenta.
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
  }, [])

  useEffect(() => {
    if (!lockedUntil) return
    const id = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000)
      if (remaining <= 0) {
        setLockedUntil(null); setCountdown(0); setError(''); setLockNote('Ya puedes volver a intentar.')
        clearInterval(id)
      } else {
        setCountdown(remaining)
        if (remaining % 15 === 0) setLockNote(`Espera ${remaining} segundos para volver a intentar.`)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [lockedUntil])

  useEffect(() => {
    if (resetWait <= 0) return
    const id = setTimeout(() => setResetWait(w => w - 1), 1000)
    return () => clearTimeout(id)
  }, [resetWait])

  // Viene de /api/auth/confirm o /callback cuando el enlace del correo falló.
  useEffect(() => {
    if (searchParams.get('error')) {
      setError(BAD_LINK)
      // Que no vuelva a salir al recargar.
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [searchParams])

  function lock(message: string) {
    setLockedUntil(Date.now() + LOCKOUT_SECS * 1000)
    setCountdown(LOCKOUT_SECS); setAttempts(0)
    setError(message); setLockNote(`Espera ${LOCKOUT_SECS} segundos para volver a intentar.`)
  }

  function registerFailedAttempt() {
    const next = attempts + 1
    if (next >= MAX_ATTEMPTS) { lock('Demasiados intentos. Espera un momento antes de volver a probar.'); return }
    setAttempts(next)
    setError(next >= 3
      ? 'Correo o contraseña incorrectos. Si no recuerdas tu contraseña, toca «¿Olvidaste tu contraseña?».'
      : 'Correo o contraseña incorrectos.')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setResetSent(false)
    if (lockedUntil && Date.now() < lockedUntil) return
    if (!email.trim() || !pass) { setError('Escribe tu correo y tu contraseña.'); return }
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
    if (authError) {
      setLoading(false)
      const msg = authError.message.toLowerCase()
      if (authError.status === 429 || msg.includes('rate limit') || msg.includes('too many')) {
        lock('Demasiados intentos. Espera un momento antes de volver a probar.'); return
      }
      // "Email not confirmed" y las credenciales malas se muestran igual: así el
      // mensaje no revela si el correo tiene cuenta.
      if (msg.includes('invalid login') || msg.includes('not confirmed')) { registerFailedAttempt(); return }
      setError('No pudimos iniciar sesión. Revisa tu conexión e inténtalo de nuevo.'); return
    }
    setAttempts(0)
    // Navegación completa (no router.push): el <html> lleva la clase del tema
    // que decide el servidor según la persona, y esta pantalla se renderizó sin
    // sesión. Un push suave dejaba el modo claro.
    window.location.assign(safeNext(searchParams.get('next')))
  }

  async function handleForgotPassword() {
    setError(''); setResetSent(false)
    if (!email.trim()) { setError('Escribe tu correo arriba y vuelve a tocar «¿Olvidaste tu contraseña?».'); return }
    setResetBusy(true)
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/update-password`,
    })
    setResetBusy(false)
    // Mensaje genérico a propósito: no confirma si el correo existe o no.
    setResetSent(true); setResetWait(RESET_COOLDOWN_SECS)
  }

  const isLocked = !!lockedUntil
  // El aviso de enlace vencido no es culpa de ningún campo: no se marcan en rojo.
  const hasError = !!error && error !== BAD_LINK

  return (
    <AuthShell
      title="Inicia sesión"
      subtitle="Qué bueno verte de nuevo."
      logoLink={!installed}
      chrome={!installed}
      footer={installed ? undefined : (
        <>
          <p>¿No tienes cuenta? Se entra por invitación.</p>
          <p className="flex items-center justify-center gap-x-4 flex-wrap">
            <Link href="/?landing=1#lista" className="font-bold inline-flex items-center min-h-[44px]" style={{ color: 'var(--primary-text)' }}>Pide acceso</Link>
            <Link href="/demo" className="font-bold inline-flex items-center min-h-[44px]" style={{ color: 'var(--primary-text)' }}>Ver la demo</Link>
          </p>
        </>
      )}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <AuthField
          id="email" name="email" label="Correo electrónico" type="email" inputMode="email"
          value={email} onChange={setEmail} autoComplete="username" enterKeyHint="next"
          placeholder="nombre@correo.cl" icon={<Mail className="w-4 h-4" />}
          invalid={hasError} describedBy={hasError ? 'login-error' : undefined}
        />

        <AuthField
          id="password" name="password" label="Contraseña" type="password" revealable
          value={pass} onChange={setPass} autoComplete="current-password" enterKeyHint="go"
          icon={<Lock className="w-4 h-4" />}
          invalid={hasError} describedBy={hasError ? 'login-error' : undefined}
          below={
            <button
              type="button" onClick={handleForgotPassword} disabled={resetBusy || resetWait > 0}
              className="mt-1 min-h-[44px] -ml-1 px-1 text-xs font-bold tabular-nums disabled:opacity-60"
              style={{ color: 'var(--primary-text)' }}
            >
              {resetBusy ? 'Enviando…' : resetWait > 0 ? `Reenviar en ${resetWait} s` : '¿Olvidaste tu contraseña?'}
            </button>
          }
        />

        {resetSent && (
          <p role="status" className="text-xs font-semibold rounded-xl px-4 py-3" style={{ color: 'var(--ink)', background: 'var(--primary-soft)' }}>
            Si ese correo tiene una cuenta, te enviamos un enlace para crear o cambiar tu contraseña. Revisa también el correo no deseado.
          </p>
        )}

        {error && (
          <p id="login-error" role="alert" className="text-xs font-bold rounded-xl px-4 py-3"
             style={{ color: 'var(--coral-ink)', background: 'color-mix(in srgb, var(--coral) 10%, var(--surface))' }}>
            {error}
          </p>
        )}

        <button
          type="submit" disabled={loading || isLocked}
          className="cta-primary w-full rounded-2xl font-bold text-base flex items-center justify-center gap-2 tabular-nums transition-transform active:scale-[.99]"
          style={{ minHeight: 52, border: 'none', fontFamily: 'inherit' }}
        >
          {loading ? <><Loader2 className="w-5 h-5 auth-spinner" aria-hidden /> Entrando…</>
            : isLocked ? `Espera ${countdown} s`
            : 'Iniciar sesión'}
        </button>
        <p className="sr-only" role="status" aria-live="polite">{lockNote}</p>
      </form>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
