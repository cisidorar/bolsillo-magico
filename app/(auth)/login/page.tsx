'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import Image from 'next/image'

// A1/A4 (roadmap uso personal, jul 2026): la app dejó de tener registro
// abierto — Cas decidió que es de uso personal. El modo signup se quita del
// FORM acá, pero el cierre real es server-side: Supabase Dashboard →
// Authentication → Sign In / Up → desactivar "Allow new users to sign up".
// Sin ese toggle, supabase.auth.signUp() sigue siendo llamable por cualquiera
// con la anon key (que es pública en el bundle) — este archivo por sí solo
// no cierra la puerta.

const MAX_ATTEMPTS  = 5
const LOCKOUT_SECS  = 60

const SPINNER = (
  <div style={{ width: 20, height: 20, border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
)

const BTN_STYLE = (disabled: boolean) => ({
  height: 52,
  background: disabled ? '#A9C4EE' : '#2B7CF6',
  boxShadow: disabled ? 'none' : '0 6px 20px rgba(43,124,246,.35)',
  border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
})

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()

  const [email,     setEmail]     = useState('')
  const [pass,      setPass]      = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

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
    // Login page is always light mode — remove dark class if present from prior navigation
    document.documentElement.classList.remove('dark')
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
    setError('')

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

  const isLocked    = !!lockedUntil && Date.now() < lockedUntil
  const btnDisabled = loading || isLocked

  return (
    <div className="min-h-svh" style={{ background: '#2B7CF6' }}>
      <div className="min-h-svh lg:flex">

        {/* Panel izquierdo — solo desktop */}
        <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center px-14 py-16 relative overflow-hidden">
          <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full opacity-10" style={{ background: '#fff' }} />
          <div className="absolute -bottom-16 -right-16 w-64 h-64 rounded-full opacity-10" style={{ background: '#fff' }} />
          <div className="absolute top-1/2 left-1/4 w-40 h-40 rounded-full opacity-5" style={{ background: '#fff' }} />
          <div className="relative w-20 h-20 mb-5">
            <Image src="/bolsillo-magico-icono-invertido.png" alt="Bolsillo Mágico" fill style={{ objectFit: 'contain' }} priority />
          </div>
          <h1 className="text-3xl font-semibold text-white tracking-tight text-center mb-2">Bolsillo Mágico</h1>
          <p className="text-base text-white/70 font-medium text-center">Tu dinero bajo control, siempre.</p>
        </div>

        {/* Panel derecho — formulario */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-svh lg:min-h-screen px-5 py-10 lg:px-16 lg:py-16 lg:bg-white">

          {/* Logo — solo mobile */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <div className="w-16 h-16 relative mb-3">
              <Image src="/bolsillo-magico-icono-invertido.png" alt="Bolsillo Mágico" fill style={{ objectFit: 'contain' }} priority />
            </div>
            <h1 className="text-2xl font-semibold text-white tracking-tight">Bolsillo Mágico</h1>
            <p className="text-sm text-white/60 font-medium mt-1">Hola de nuevo 👋</p>
          </div>

          <div className="w-full max-w-sm">

            {/* Header — solo desktop */}
            <div className="hidden lg:block mb-8">
              <h2 className="text-[26px] font-semibold" style={{ color: '#0E2A52' }}>Hola de nuevo 👋</h2>
              <p className="text-sm mt-1" style={{ color: '#94A3B8' }}>Inicia sesión para continuar</p>
            </div>

            <div className="bg-white lg:bg-transparent rounded-3xl p-6 lg:p-0 shadow-2xl lg:shadow-none">
              <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                .field {
                  display:flex; align-items:center; gap:10px;
                  background:#F4F7FB; border:1.5px solid #E4EAF1;
                  border-radius:14px; padding:0 14px; height:52px;
                }
                .field:focus-within { border-color:#4D93FF; box-shadow:0 0 0 3px rgba(77,147,255,.15); }
                .field input {
                  flex:1; background:transparent; border:none; outline:none;
                  font-size:15px; color:#0E2A52; font-family:inherit; min-width:0;
                }
                .field input::placeholder { color:#94A3B8; }
              `}</style>

              <div className="flex flex-col gap-3">

                <div className="field">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0 }}>
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="Correo electrónico" autoComplete="email" disabled={isLocked} />
                </div>

                <div className="field">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0 }}>
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <input type={showPw ? 'text' : 'password'} value={pass} onChange={e => setPass(e.target.value)}
                    placeholder="Contraseña"
                    autoComplete="current-password"
                    disabled={isLocked} />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    style={{ color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}>
                    {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>

                {error && (
                  <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">{error}</p>
                )}

                <button onClick={handleSubmit as any} disabled={btnDisabled}
                  className="w-full rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 transition-all"
                  style={BTN_STYLE(btnDisabled)}>
                  {loading ? SPINNER
                    : isLocked ? `Bloqueado · ${countdown}s`
                    : 'Iniciar sesión →'}
                </button>

              </div>
            </div>
          </div>
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
