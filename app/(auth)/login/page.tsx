'use client'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Mail, MailCheck, Lock, Loader2, ShieldCheck, ArrowLeft } from 'lucide-react'
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

const BAD_LINK = 'Este enlace ya se usó o venció. Pide uno nuevo con tu correo, o pídele a quien te invitó que lo reenvíe.'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function LoginForm() {
  const supabase     = createClient()
  const searchParams = useSearchParams()

  const [email,   setEmail]   = useState('')
  const [pass,    setPass]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  // 'forgot' es otra pantalla en la misma tarjeta: el correo escrito pasa de una a otra.
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [resetSent, setResetSent] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetWait, setResetWait] = useState(0)
  const [resetError, setResetError] = useState('')

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

  // Al abrir «Cambia tu clave» el botón que se tocó desaparece: el foco pasa al campo de correo.
  useEffect(() => {
    if (mode === 'forgot' && !resetSent) document.getElementById('reset-email')?.focus()
  }, [mode, resetSent])

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

  function openForgot() {
    setError(''); setResetError(''); setResetSent(false); setMode('forgot')
  }
  function backToLogin() {
    setResetError(''); setResetSent(false); setMode('login')
  }

  async function handleForgotPassword(e?: React.FormEvent) {
    e?.preventDefault()
    setResetError('')
    if (resetBusy || resetWait > 0) return
    const clean = email.trim()
    if (!clean) { setResetError('Escribe tu correo para mandarte el enlace.'); return }
    if (!EMAIL_RE.test(clean)) { setResetError('Ese correo no parece completo. Revisa que tenga la forma nombre@correo.cl.'); return }
    setResetBusy(true)
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(clean, {
      redirectTo: `${window.location.origin}/update-password`,
    })
    setResetBusy(false)
    if (resetErr && (resetErr.status === 429 || /rate limit|too many|security purposes/i.test(resetErr.message))) {
      setResetWait(RESET_COOLDOWN_SECS)
      setResetError('Pediste varios enlaces seguidos. Espera un momento y vuelve a intentar.')
      return
    }
    // Cualquier otro resultado se ve igual a propósito: no confirma si el correo tiene cuenta.
    setResetSent(true); setResetWait(RESET_COOLDOWN_SECS)
  }

  const isLocked = !!lockedUntil
  // El aviso de enlace vencido no es culpa de ningún campo: no se marcan en rojo.
  const hasError = !!error && error !== BAD_LINK

  return (
    <AuthShell
      title={mode === 'forgot' ? (resetSent ? 'Revisa tu correo' : 'Cambia tu clave') : 'Inicia sesión'}
      subtitle={mode === 'forgot' ? (resetSent ? undefined : 'Te mandamos un enlace para elegir una clave nueva.') : 'Qué bueno verte de nuevo.'}
      logoLink={!installed}
      chrome={!installed}
      aside={(
        <>
          <p className="font-semibold leading-[1.05] text-balance" style={{ fontFamily: 'var(--font-fredoka), sans-serif', fontSize: 'clamp(2.3rem, 4.4vw, 3.5rem)', letterSpacing: '-0.02em', color: 'var(--ink)' }}>
            Lo que viene en tu tarjeta, antes de que llegue.
          </p>
          <p className="mt-5 text-lg leading-relaxed max-w-[44ch]" style={{ color: 'var(--ink-2)' }}>
            Entra para ver cuánto viene en tu próximo estado de cuenta y cuánto te queda del sueldo.
          </p>
          <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
            <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: 'var(--primary-text)' }} aria-hidden />
            Sin conectar tu banco ni pedir tu clave.
          </p>
        </>
      )}
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
      {mode === 'forgot' ? (
        <div key="forgot" className="pr-in">
          {resetSent ? (
            <div className="flex flex-col gap-4">
              <span className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: 'color-mix(in srgb, var(--mint) 14%, var(--surface))', color: 'var(--mint-ink)' }}>
                <MailCheck className="w-6 h-6" aria-hidden />
              </span>
              <p role="status" className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                Si <strong className="font-bold break-all" style={{ color: 'var(--ink)' }}>{email.trim()}</strong> tiene una cuenta, te enviamos un enlace para crear o cambiar tu contraseña.
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>
                Puede tardar un par de minutos. Si no lo ves, revisa el correo no deseado.
              </p>
              <button
                type="button" onClick={() => handleForgotPassword()} disabled={resetBusy || resetWait > 0}
                className="cta-primary w-full rounded-2xl font-bold text-base flex items-center justify-center gap-2 tabular-nums transition-transform active:scale-[.99]"
                style={{ minHeight: 52, border: 'none', fontFamily: 'inherit' }}
              >
                {resetBusy ? <><Loader2 className="w-5 h-5 auth-spinner" aria-hidden /> Enviando…</>
                  : resetWait > 0 ? `Reenviar en ${resetWait} s` : 'Reenviar el enlace'}
              </button>
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => { setResetSent(false); setResetError('') }}
                  className="min-h-[44px] text-sm font-bold" style={{ color: 'var(--primary-text)' }}>
                  Usar otro correo
                </button>
                <button type="button" onClick={backToLogin}
                  className="min-h-[44px] text-sm font-bold inline-flex items-center gap-1.5" style={{ color: 'var(--primary-text)' }}>
                  <ArrowLeft className="w-4 h-4" aria-hidden /> Iniciar sesión
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} noValidate className="flex flex-col gap-4">
              <AuthField
                id="reset-email" name="email" label="Correo electrónico" type="email" inputMode="email"
                value={email} onChange={setEmail} autoComplete="username" enterKeyHint="go"
                placeholder="nombre@correo.cl" icon={<Mail className="w-4 h-4" />}
                hint="El mismo con el que te invitaron o creaste tu cuenta."
                invalid={!!resetError} describedBy={resetError ? 'reset-error' : undefined}
              />
              {resetError && (
                <p id="reset-error" role="alert" className="text-xs font-bold rounded-xl px-4 py-3"
                   style={{ color: 'var(--coral-ink)', background: 'color-mix(in srgb, var(--coral) 10%, var(--surface))' }}>
                  {resetError}
                </p>
              )}
              <button
                type="submit" disabled={resetBusy || resetWait > 0}
                className="cta-primary w-full rounded-2xl font-bold text-base flex items-center justify-center gap-2 tabular-nums transition-transform active:scale-[.99]"
                style={{ minHeight: 52, border: 'none', fontFamily: 'inherit' }}
              >
                {resetBusy ? <><Loader2 className="w-5 h-5 auth-spinner" aria-hidden /> Enviando…</>
                  : resetWait > 0 ? `Espera ${resetWait} s` : 'Enviarme el enlace'}
              </button>
              <button type="button" onClick={backToLogin}
                className="self-center min-h-[44px] px-2 text-sm font-bold inline-flex items-center gap-1.5" style={{ color: 'var(--primary-text)' }}>
                <ArrowLeft className="w-4 h-4" aria-hidden /> Volver a iniciar sesión
              </button>
            </form>
          )}
        </div>
      ) : (
        <div key="login" className="pr-fade">
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
              type="button" onClick={openForgot}
              className="mt-1 min-h-[44px] -ml-1 px-1 text-sm font-bold"
              style={{ color: 'var(--primary-text)' }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          }
        />

        {error && (
          <div id="login-error" role="alert" className="rounded-xl px-4 py-3"
               style={{ background: 'color-mix(in srgb, var(--coral) 10%, var(--surface))' }}>
            <p className="text-xs font-bold" style={{ color: 'var(--coral-ink)' }}>{error}</p>
            {error === BAD_LINK && (
              <button type="button" onClick={openForgot}
                className="mt-1 -mb-2 min-h-[44px] text-sm font-bold" style={{ color: 'var(--primary-text)' }}>
                Pedir un enlace nuevo
              </button>
            )}
          </div>
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
        </div>
      )}
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
