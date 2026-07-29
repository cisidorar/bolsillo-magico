'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Mail, Lock } from 'lucide-react'

// A1/A4 (roadmap uso personal, jul 2026): la app dejó de tener registro
// abierto — Cas decidió que es de uso personal. El modo signup se quita del
// FORM acá, pero el cierre real es server-side: Supabase Dashboard →
// Authentication → Sign In / Up → desactivar "Allow new users to sign up".
// Sin ese toggle, supabase.auth.signUp() sigue siendo llamable por cualquiera
// con la anon key (que es pública en el bundle) — este archivo por sí solo
// no cierra la puerta.
//
// Rediseño (jul 2026, sobre mockup de referencia de Cas): layout de una sola
// columna centrada, tema oscuro con los tokens de la app (no hardcode — así
// queda consistente si algún día cambian --primary/--surface). Se dejó
// explícitamente afuera el login social (Google/Apple) del mockup — a
// pedido de Cas: no está configurado en Supabase, y no vale la pena abrir
// esa puerta justo después de cerrar el registro.

const MAX_ATTEMPTS  = 5
const LOCKOUT_SECS  = 60

const SPINNER = (
  <div style={{ width: 20, height: 20, border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
)

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()

  const [email,     setEmail]     = useState('')
  const [pass,      setPass]      = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  // "¿Olvidaste?" — el mockup lo pedía; no existía ningún trigger para el
  // flujo de reset (solo /update-password, que recibe el link del correo).
  const [resetSent, setResetSent] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)

  // Rate limiting
  const [attempts,    setAttempts]    = useState(0)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [countdown,   setCountdown]   = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!lockedUntil) return
    timerRef.current = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000)
      if (remaining <= 0) {
        setLockedUntil(null); setCountdown(0); setError('')
        if (timerRef.current) clearInterval(timerRef.current)
      } else {
        setCountdown(remaining)
      }
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [lockedUntil])

  useEffect(() => {
    // Login page is always dark mode — el resto de la app respeta la
    // preferencia guardada, pero acá siempre coincide con el mockup.
    document.documentElement.classList.add('dark')
    return () => { document.documentElement.classList.remove('dark') }
  }, [])

  useEffect(() => {
    if (searchParams.get('error')) {
      setError('El enlace de autenticación expiró o no es válido. Intenta de nuevo.')
    }
  }, [searchParams])

  function registerFailedAttempt() {
    const next = attempts + 1
    if (next >= MAX_ATTEMPTS) {
      const until = Date.now() + LOCKOUT_SECS * 1000
      setLockedUntil(until); setCountdown(LOCKOUT_SECS); setAttempts(0)
      setError(`Demasiados intentos fallidos. Esperá ${LOCKOUT_SECS} segundos.`)
    } else {
      setAttempts(next)
      setError(`Email o contraseña incorrectos. ${MAX_ATTEMPTS - next} intento${MAX_ATTEMPTS - next === 1 ? '' : 's'} restante${MAX_ATTEMPTS - next === 1 ? '' : 's'}.`)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setResetSent(false)

    if (lockedUntil && Date.now() < lockedUntil) {
      setError(`Demasiados intentos. Esperá ${countdown} segundos.`)
      return
    }

    if (!email || !pass) { setError('Completa todos los campos'); return }
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
    if (error) {
      setLoading(false)
      if (error.message === 'Invalid login credentials') { registerFailedAttempt(); return }
      setError(error.message); return
    }
    setAttempts(0)
    router.push('/inicio'); router.refresh()
  }

  async function handleForgotPassword() {
    setError(''); setResetSent(false)
    if (!email) { setError('Escribe tu correo arriba y toca "¿Olvidaste?" de nuevo.'); return }
    setResetBusy(true)
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    })
    setResetBusy(false)
    // Mensaje genérico a propósito: no confirma si el correo existe o no.
    setResetSent(true)
  }

  const isLocked    = !!lockedUntil && Date.now() < lockedUntil
  const btnDisabled = loading || isLocked

  return (
    <div className="min-h-svh flex flex-col items-center justify-center px-5 py-12" style={{ background: 'var(--bg)' }}>

      {/* Logo + wordmark — <img> plano (no next/image): mismo patrón que
          SideNav.tsx para este SVG, que si no requiere dangerouslyAllowSVG
          en next.config. */}
      <div className="flex flex-col items-center mb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bolsillo-magico-icono.svg" alt="Bolsillo Mágico" width={64} height={64} className="mb-4 rounded-2xl" />
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>
          Bolsillo <span style={{ color: 'var(--primary)' }}>Mágico</span>
        </h1>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm rounded-3xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          .field {
            display:flex; align-items:center; gap:10px;
            background: var(--bg); border:1.5px solid var(--border);
            border-radius:14px; padding:0 14px; height:52px;
          }
          .field:focus-within { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
          .field input {
            flex:1; background:transparent; border:none; outline:none;
            font-size:15px; color: var(--ink); font-family:inherit; min-width:0;
          }
          .field input::placeholder { color: var(--ink-3); }
        `}</style>

        <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Inicia sesión</h2>
        <p className="text-sm mt-1 mb-6" style={{ color: 'var(--ink-3)' }}>Bienvenida de vuelta a tu bolsillo.</p>

        <div className="flex flex-col gap-4">

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--ink-3)' }}>Correo electrónico</label>
            <div className="field">
              <Mail className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="tucorreo@gmail.com" autoComplete="email" disabled={isLocked} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Contraseña</label>
              <button type="button" onClick={handleForgotPassword} disabled={resetBusy}
                className="text-xs font-bold disabled:opacity-60" style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                {resetBusy ? 'Enviando…' : '¿Olvidaste?'}
              </button>
            </div>
            <div className="field">
              <Lock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
              <input type={showPw ? 'text' : 'password'} value={pass} onChange={e => setPass(e.target.value)}
                placeholder="Contraseña"
                autoComplete="current-password"
                disabled={isLocked} />
              <button type="button" onClick={() => setShowPw(!showPw)}
                style={{ color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}>
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {resetSent && (
            <p className="text-xs font-semibold rounded-xl px-4 py-2.5" style={{ color: 'var(--mint)', background: 'var(--primary-soft)' }}>
              Si ese correo tiene una cuenta, te enviamos un enlace para restablecer la contraseña.
            </p>
          )}

          {error && (
            <p className="text-xs font-bold rounded-xl px-4 py-2.5" style={{ color: 'var(--coral)', background: 'rgba(255,111,97,0.1)', border: '1px solid rgba(255,111,97,0.25)' }}>
              {error}
            </p>
          )}

          <button onClick={handleSubmit as any} disabled={btnDisabled}
            className="w-full rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all"
            style={{
              height: 52,
              background: btnDisabled ? 'var(--border)' : 'var(--primary)',
              color: 'var(--primary-ink)',
              boxShadow: btnDisabled ? 'none' : '0 6px 20px rgba(43,124,246,.35)',
              border: 'none', cursor: btnDisabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}>
            {loading ? SPINNER
              : isLocked ? `Bloqueado · ${countdown}s`
              : 'Iniciar sesión'}
          </button>

        </div>
      </div>

    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
