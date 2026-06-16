'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import Image from 'next/image'

type Mode = 'login' | 'signup'

export default function LoginPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()

  const [mode,    setMode]    = useState<Mode>('login')
  const [email,   setEmail]   = useState('')
  const [pass,    setPass]    = useState('')
  const [showPw,  setShowPw]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')

  // Mostrar error si el callback de auth falló (ej: link expirado)
  useEffect(() => {
    if (searchParams.get('error')) {
      setError('El enlace de autenticación expiró o no es válido. Intenta de nuevo.')
    }
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!email || !pass) { setError('Completa todos los campos'); return }
    if (pass.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    setLoading(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
      if (error) {
        setError(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message)
        setLoading(false); return
      }
      router.push('/inicio'); router.refresh()
    } else {
      const { error } = await supabase.auth.signUp({
        email, password: pass,
        options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
      })
      if (error) {
        setError(error.message === 'User already registered' ? 'Ya existe una cuenta con ese email' : error.message)
        setLoading(false); return
      }
      setSuccess('¡Cuenta creada! Revisa tu email para confirmar.')
      setLoading(false)
    }
  }

  function switchMode(m: Mode) {
    setMode(m); setError(''); setSuccess(''); setEmail(''); setPass('')
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center px-5 py-10"
      style={{ background: 'linear-gradient(160deg, #0F4489 0%, #1B6DD4 100%)' }}>

      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-20 h-20 relative mb-3">
          <Image src="/camapana.png" alt="Bolsillo Mágico" fill style={{ objectFit: 'contain' }} priority />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">Bolsillo Mágico</h1>
        <p className="text-sm text-white/60 font-medium mt-1">
          {mode === 'login' ? 'Inicia sesión para continuar' : 'Crea tu cuenta gratis'}
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl">

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          .field { display:flex; align-items:center; gap:10px; background:#F5F8FF;
            border:1.5px solid #DAEDF8; border-radius:14px; padding:0 14px; height:52px; }
          .field:focus-within { border-color:#4D8FFF; box-shadow:0 0 0 3px rgba(77,143,255,.15); }
          .field input { flex:1; background:transparent; border:none; outline:none;
            font-size:15px; color:#0D2A3A; font-family:inherit; min-width:0; }
        `}</style>

        <div className="flex flex-col gap-3">

          {/* Email */}
          <div className="field">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#93BAD0" strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0 }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Correo electrónico" autoComplete="email"
            />
          </div>

          {/* Contraseña */}
          <div className="field">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#93BAD0" strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0 }}>
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <input
              type={showPw ? 'text' : 'password'} value={pass} onChange={e => setPass(e.target.value)}
              placeholder="Contraseña" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            <button type="button" onClick={() => setShowPw(!showPw)}
              style={{ color:'#93BAD0', background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', flexShrink:0 }}>
              {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          {/* Error / success */}
          {error && (
            <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}
          {success && (
            <p className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
              {success}
            </p>
          )}

          {/* Botón */}
          <button
            onClick={handleSubmit as any}
            disabled={loading}
            className="w-full h-13 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-60"
            style={{
              height: 52,
              background: loading ? '#8EBBD8' : '#1B6DD4',
              boxShadow: loading ? 'none' : '0 6px 20px rgba(27,109,212,.4)',
              border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}
          >
            {loading
              ? <div style={{ width:20, height:20, border:'2.5px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin .7s linear infinite' }} />
              : mode === 'login' ? 'Iniciar sesión →' : 'Crear cuenta →'
            }
          </button>

          {/* Olvidaste */}
          {mode === 'login' && (
            <p className="text-center text-sm font-semibold" style={{ color: '#1B6DD4', cursor: 'pointer' }}>
              ¿Olvidaste tu contraseña?
            </p>
          )}
        </div>
      </div>

      {/* Switch mode */}
      <p className="mt-6 text-sm text-white/60 font-medium">
        {mode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
        <button
          onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
          className="text-white font-bold underline underline-offset-2"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
        >
          {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
        </button>
      </p>
    </div>
  )
}
