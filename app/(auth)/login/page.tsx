'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, CheckCircle } from 'lucide-react'
import Image from 'next/image'

type Mode = 'login' | 'signup'

const MAX_ATTEMPTS  = 5
const LOCKOUT_SECS  = 60

const FEATURES = [
  'Registra tus gastos al instante',
  'Analiza en qué gastas cada mes',
  'Controla suscripciones y pagos fijos',
]

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

  const [mode,      setMode]      = useState<Mode>('login')
  const [email,     setEmail]     = useState('')
  const [pass,      setPass]      = useState('')
  const [nameField, setNameField] = useState('')
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

  function switchMode(m: Mode) {
    setMode(m); setError(''); setEmail(''); setPass(''); setNameField('')
  }

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
    if (mode === 'signup' && !nameField.trim()) { setError('Ingresa tu nombre'); return }
    if (mode === 'signup' && pass.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return }
    setLoading(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
      if (error) {
        setLoading(false)
        if (error.message === 'Invalid login credentials') { registerFailedAttempt(); return }
        setError(error.message); return
      }
      setAttempts(0)
      fetch('/api/seed', { method: 'POST' }).catch(() => {})
      router.push('/inicio'); router.refresh()

    } else {
      // Signup — confirmación de email desactivada en Supabase
      const { error: signUpError } = await supabase.auth.signUp({
        email, password: pass,
        options: { data: { display_name: nameField.trim() } },
      })
      if (signUpError) {
        setError(signUpError.message === 'User already registered' ? 'Ya existe una cuenta con ese email' : signUpError.message)
        setLoading(false); return
      }
      // Auto-login directo tras registro
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password: pass })
      if (loginError) {
        setError('Cuenta creada. Inicia sesión para continuar.')
        setLoading(false); switchMode('login'); return
      }
      fetch('/api/seed', { method: 'POST' }).catch(() => {})
      router.push('/inicio'); router.refresh()
    }
  }

  const isLocked    = !!lockedUntil && Date.now() < lockedUntil
  const btnDisabled = loading || isLocked

  const desktopTitle    = mode === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta'
  const desktopSubtitle = mode === 'login' ? 'Inicia sesión para continuar' : 'Regístrate gratis, sin tarjeta'
  const mobileSubtitle  = mode === 'login' ? 'Inicia sesión para continuar' : 'Crea tu cuenta gratis'

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
          <p className="text-base text-white/70 font-medium text-center mb-12">Tu dinero bajo control, siempre.</p>
          <div className="space-y-5 w-full max-w-xs">
            {FEATURES.map(f => (
              <div key={f} className="flex items-center gap-3.5">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.15)' }}>
                  <CheckCircle className="w-4 h-4 text-white" />
                </div>
                <p className="text-sm font-semibold text-white/85">{f}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Panel derecho — formulario */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-svh lg:min-h-screen px-5 py-10 lg:px-16 lg:py-16 lg:bg-white">

          {/* Logo — solo mobile */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <div className="w-16 h-16 relative mb-3">
              <Image src="/bolsillo-magico-icono-invertido.png" alt="Bolsillo Mágico" fill style={{ objectFit: 'contain' }} priority />
            </div>
            <h1 className="text-2xl font-semibold text-white tracking-tight">Bolsillo Mágico</h1>
            <p className="text-sm text-white/60 font-medium mt-1">{mobileSubtitle}</p>
          </div>

          <div className="w-full max-w-sm">

            {/* Header — solo desktop */}
            <div className="hidden lg:block mb-8">
              <p className="text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: '#2B7CF6' }}>Bolsillo Mágico</p>
              <h2 className="text-[26px] font-semibold" style={{ color: '#0E2A52' }}>{desktopTitle}</h2>
              <p className="text-sm mt-1" style={{ color: '#94A3B8' }}>{desktopSubtitle}</p>
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

                {mode === 'signup' && (
                  <div className="field">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0 }}>
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                    <input type="text" value={nameField} onChange={e => setNameField(e.target.value)}
                      placeholder="Tu nombre" autoComplete="name" maxLength={40} />
                  </div>
                )}

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
                    placeholder={mode === 'signup' ? 'Contraseña (mín. 8 caracteres)' : 'Contraseña'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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
                    : mode === 'login' ? 'Iniciar sesión →' : 'Crear cuenta →'}
                </button>

              </div>
            </div>

            {/* Switch login ↔ signup */}
            <p className="mt-6 text-sm font-medium text-center text-white/60 lg:text-gray-400">
              {mode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
              <button onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                className="font-bold underline underline-offset-2 text-white lg:text-brand-600"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>
                {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
              </button>
            </p>
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
