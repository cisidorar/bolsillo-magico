'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

type Mode = 'login' | 'signup'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [mode, setMode]       = useState<Mode>('login')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSuccess('')

    if (!email || !password) { setError('Completa todos los campos'); return }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }

    setLoading(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message === 'Invalid login credentials'
          ? 'Email o contraseña incorrectos'
          : error.message)
        setLoading(false)
        return
      }
      router.push('/')
      router.refresh()
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
      })
      if (error) {
        setError(error.message === 'User already registered'
          ? 'Ya existe una cuenta con ese email'
          : error.message)
        setLoading(false)
        return
      }
      setSuccess('Cuenta creada. Revisa tu email para confirmar (o inicia sesión si la confirmación está desactivada).')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-100 px-6">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-600 rounded-2xl mx-auto mb-4 flex items-center justify-center">
            <span className="text-white text-2xl font-semibold">G$</span>
          </div>
          <h1 className="text-2xl font-bold text-brand-900">Gstos</h1>
          <p className="text-brand-400 mt-1 text-sm">Registra tus gastos en segundos</p>
        </div>

        {/* Toggle */}
        <div className="flex bg-brand-200 rounded-xl p-1 mb-6">
          <button
            onClick={() => { setMode('login'); setError(''); setSuccess('') }}
            className={cn('flex-1 py-2 text-sm font-medium rounded-lg transition-all',
              mode === 'login' ? 'bg-white text-brand-900 shadow-sm font-bold' : 'text-brand-600')}
          >
            Iniciar sesión
          </button>
          <button
            onClick={() => { setMode('signup'); setError(''); setSuccess('') }}
            className={cn('flex-1 py-2 text-sm font-medium rounded-lg transition-all',
              mode === 'signup' ? 'bg-white text-brand-900 shadow-sm font-bold' : 'text-brand-600')}
          >
            Crear cuenta
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-brand-200 p-6 shadow-sm flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-brand-600 block mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              autoComplete="email"
              className="w-full bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-brand-300 outline-none focus:border-brand-600 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-brand-600 block mb-1.5">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-brand-300 outline-none focus:border-brand-600 transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {success && (
            <p className="text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-60 text-sm mt-1"
          >
            {loading
              ? 'Cargando...'
              : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>

        <p className="text-center text-xs text-brand-400 mt-5">
          Tus datos están protegidos con Row Level Security.
          <br />Nadie más puede ver tu información.
        </p>
      </div>
    </div>
  )
}
