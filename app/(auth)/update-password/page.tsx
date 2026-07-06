'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import Image from 'next/image'

export default function UpdatePasswordPage() {
  const router  = useRouter()
  const supabase = createClient()

  const [pass,    setPass]    = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw,  setShowPw]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [done,    setDone]    = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!pass) { setError('Ingresá una contraseña'); return }
    if (pass.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return }
    if (pass !== confirm) { setError('Las contraseñas no coinciden'); return }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: pass })
    setLoading(false)

    if (error) {
      // El token de recuperación expiró o ya fue usado
      setError('No se pudo actualizar la contraseña. Solicitá un nuevo enlace desde el login.')
      return
    }

    setDone(true)
    setTimeout(() => router.push('/inicio'), 2500)
  }

  return (
    <div
      className="min-h-svh flex items-center justify-center px-5 py-10"
      style={{ background: '#2B7CF6' }}
    >
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 relative mb-3">
            <Image src="/camapana.png" alt="Bolsillo Mágico" fill style={{ objectFit: 'contain' }} priority />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Bolsillo Mágico</h1>
          <p className="text-sm text-white/60 font-medium mt-1">Nueva contraseña</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl p-6 shadow-2xl">

          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
            .field {
              display:flex; align-items:center; gap:10px;
              background:#F5F8FF; border:1.5px solid #DAEDF8;
              border-radius:14px; padding:0 14px; height:52px;
            }
            .field:focus-within { border-color:#2B7CF6; box-shadow:0 0 0 3px rgba(43,124,246,.12); }
            .field input {
              flex:1; background:transparent; border:none; outline:none;
              font-size:15px; color:#0D2A3A; font-family:inherit; min-width:0;
            }
          `}</style>

          {done ? (
            /* ── Éxito ── */
            <div className="text-center py-4">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-base font-bold text-gray-800 mb-1">¡Contraseña actualizada!</p>
              <p className="text-sm text-gray-400">Redirigiendo al dashboard…</p>
            </div>
          ) : (
            /* ── Formulario ── */
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-gray-700 pb-1">Elegí tu nueva contraseña</p>

              {/* Nueva contraseña */}
              <div className="field">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#93BAD0" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                  placeholder="Nueva contraseña"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{ color: '#93BAD0', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}
                >
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>

              {/* Confirmar */}
              <div className="field">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#93BAD0" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Confirmar contraseña"
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                  {error}
                </p>
              )}

              <button
                onClick={handleSubmit as any}
                disabled={loading}
                className="w-full rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                style={{
                  height: 52,
                  background: loading ? '#8EBBD8' : '#2B7CF6',
                  boxShadow: loading ? 'none' : '0 6px 20px rgba(43,124,246,.35)',
                  border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}
              >
                {loading
                  ? <div style={{ width: 20, height: 20, border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                  : 'Guardar contraseña →'
                }
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
