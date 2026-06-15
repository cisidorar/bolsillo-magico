'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Eye, EyeOff } from 'lucide-react'

type Mode = 'login' | 'signup'

function Cloud({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 160 60" fill="none" style={style}>
      <ellipse cx="80"  cy="48" rx="76" ry="16" fill="white" opacity=".96" />
      <ellipse cx="50"  cy="36" rx="38" ry="24" fill="white" opacity=".96" />
      <ellipse cx="100" cy="32" rx="34" ry="22" fill="white" opacity=".96" />
      <ellipse cx="72"  cy="28" rx="30" ry="22" fill="white" opacity=".96" />
      <ellipse cx="120" cy="40" rx="22" ry="14" fill="white" opacity=".96" />
    </svg>
  )
}

export default function LoginPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [mode,    setMode]    = useState<Mode>('login')
  const [email,   setEmail]   = useState('')
  const [pass,    setPass]    = useState('')
  const [showPw,  setShowPw]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!email || !pass)  { setError('Completa todos los campos'); return }
    if (pass.length < 6)  { setError('La contraseña debe tener al menos 6 caracteres'); return }
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
    <>
      <style>{`
        @keyframes floatDora {
          0%,100% { transform: translateY(0px) rotate(.3deg); }
          50%      { transform: translateY(-10px) rotate(-.3deg); }
        }
        @keyframes floatBell {
          0%,100% { transform: translateX(-50%) translateY(0); }
          50%      { transform: translateX(-50%) translateY(-6px); }
        }
        @keyframes shimmer {
          0%,100% { opacity:.45; transform: scale(1); }
          50%      { opacity:.95; transform: scale(1.18); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .dora-float { animation: none; }
        .bell-float { animation: none; }
        .ray        { animation: shimmer 2.5s ease-in-out infinite; }
        input { outline:none; transition: border-color .18s, box-shadow .18s; }
        input:focus { border-color:#3B9EE8 !important; box-shadow:0 0 0 3px rgba(59,158,232,.13) !important; }
      `}</style>

      {/*
        ── WRAPPER POSICIONADOR ─────────────────────────────────────────────
        position:relative aquí permite colocar a Doraemon FUERA del
        overflow:hidden del hero, para que cruce el límite hero/card.
        El card NO tiene z-index (no crea stacking context), así que
        el form (z:6) y el badge (z:10) aparecen sobre Doraemon (z:5),
        mientras el fondo blanco del card queda detrás de él.
      */}
      <div style={{ position:'relative', flex:1, display:'flex', flexDirection:'column' }}>

        {/* ══════════ HERO ══════════ */}
        <div
          style={{
            height: '60svh',
            minHeight: 340,
            flexShrink: 0,
            background: 'linear-gradient(180deg,#9DD6EE 0%,#BFE8F8 52%,#D8F2FD 100%)',
            overflow: 'hidden',   /* clips nubes, fondo, puerta — NO a Doraemon (está fuera) */
            position: 'relative',
          }}
        >
          {/* Fondo ciudad */}
          <Image
            src="/background.png"
            alt=""
            fill
            sizes="100vw"
            style={{ objectFit:'cover', objectPosition:'center bottom', opacity:0.45 }}
            priority
          />

          {/* Iconos decorativos sutiles */}
          <span style={{ position:'absolute', top:14, right:14, fontSize:28, opacity:.09, transform:'rotate(18deg)' }}>🧁</span>
          <span style={{ position:'absolute', bottom:130, right:16, fontSize:20, opacity:.07, transform:'rotate(-8deg)' }}>🪄</span>

          {/* Nubes superiores */}
          <Cloud style={{ position:'absolute', top:4,  left:-24, width:200, opacity:1 }} />
          <Cloud style={{ position:'absolute', top:18, right:-20, width:170, opacity:.97 }} />

          {/* Campana arriba-centro */}
          <div style={{
            position:'absolute', top:14, left:'50%',
            transform:'translateX(-50%)',
            width:48, height:48, zIndex:4,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <svg
              className="ray"
              width="48" height="48" viewBox="0 0 48 48"
              style={{ position:'absolute', inset:0 }}
            >
              {[0,45,90,135,180,225,270,315].map((deg, i) => {
                const rad = deg * Math.PI / 180
                return (
                  <line key={i}
                    x1={24 + Math.cos(rad)*10} y1={24 + Math.sin(rad)*10}
                    x2={24 + Math.cos(rad)*19} y2={24 + Math.sin(rad)*19}
                    stroke="#FFCC00" strokeWidth="2" strokeLinecap="round"
                  />
                )
              })}
            </svg>
            <span style={{ fontSize:24, zIndex:1, lineHeight:1 }}>🔔</span>
          </div>

          {/* Texto izquierda */}
          <div style={{ position:'absolute', top:60, left:22, maxWidth:'52%', zIndex:2 }}>
            <h1 style={{
              fontSize: 45, fontWeight: 900, lineHeight: 1.12,
              color: '#091A2E', marginBottom: 10, letterSpacing: -0.5,
            }}>
              {mode === 'login'
                ? <>¡Bienvenido<br /><span style={{ color:'#1560C8' }}>de nuevo!</span></>
                : <>¡Crea tu<br /><span style={{ color:'#1560C8' }}>cuenta!</span></>}
            </h1>
            <p style={{ fontSize:18, color:'#3A6880', lineHeight:1.65, fontWeight:600 }}>
              {mode === 'login'
                ? <>Nos alegra verte otra vez.<br />Inicia sesión para continuar.</>
                : <>Únete y controla tus<br />gastos fácilmente.</>}
            </p>
          </div>

          {/* Nube base — suelo nuboso */}
          <Cloud style={{ position:'absolute', bottom:-10, left:-20, width:'130%', opacity:.95 }} />
        </div>

        {/* ══════════ DORAEMON — fuera del hero, cruza el límite ══════════
            top:'22%' del hero → cabeza en el primer tercio del hero
            height grande → cuerpo cruza hacia el card
            z-index:5 → sobre card bg, bajo form (z:6) y badge (z:10)   */}
        <div
          className="dora-float"
          style={{
            position: 'absolute',
            top: '-300px',
            right: -50,
            width: 468,                   /* 360 * 1.3 */
            height: 'calc(60svh * 1.14 + 338px)', /* altura +30% */
            zIndex: 2,                    /* DETRÁS del card (z:3) */
            pointerEvents: 'none',
          }}
        >
          <Image
            src="/doraemon.png"
            alt="Doraemon"
            fill
            sizes="320px"
            style={{ objectFit:'contain', objectPosition:'bottom right' }}
            priority
          />
        </div>

        {/* ══════════ CARD — z:3 queda encima de Doraemon (z:2) ══════════ */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            zIndex: 3,
            background: '#fff',
            borderRadius: '28px 28px 0 0',
            padding: '42px 20px 0',
            boxShadow: '0 -6px 28px rgba(0,80,170,.08)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Badge campana — z:10 > Doraemon z:5 ✓ */}
          <div
            className="bell-float"
            style={{
              position:'absolute', top:-32, left:'50%',
              transform:'translateX(-50%)',
              width:64, height:64,
              background:'linear-gradient(145deg,#D8EEFF 0%,#BDD9FF 100%)',
              borderRadius:'50%',
              boxShadow:'0 6px 22px rgba(18,80,200,.3), 0 0 0 5px #fff',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:32, zIndex:10,
            }}
          >
            🔔
          </div>

          <form
            onSubmit={handleSubmit}
            style={{ display:'flex', flexDirection:'column', gap:10 }}
          >
            {/* Email */}
            <div style={{
              display:'flex', alignItems:'center', gap:13,
              background:'#F5FAFE', border:'1.5px solid #DAEDF8',
              borderRadius:28, padding:'0 18px', height:56,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#93BAD0" strokeWidth="2" strokeLinecap="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Correo electrónico o usuario" autoComplete="email"
                style={{ flex:1, background:'transparent', border:'none', fontSize:14, fontWeight:500, color:'#0D2A3A', fontFamily:'inherit' }}
              />
            </div>

            {/* Contraseña */}
            <div style={{
              display:'flex', alignItems:'center', gap:13,
              background:'#F5FAFE', border:'1.5px solid #DAEDF8',
              borderRadius:28, padding:'0 18px', height:56,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#93BAD0" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input
                type={showPw ? 'text' : 'password'} value={pass} onChange={e => setPass(e.target.value)}
                placeholder="Contraseña" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                style={{ flex:1, background:'transparent', border:'none', fontSize:14, fontWeight:500, color:'#0D2A3A', fontFamily:'inherit' }}
              />
              <button type="button" onClick={() => setShowPw(!showPw)}
                style={{ color:'#93BAD0', flexShrink:0, background:'none', border:'none', cursor:'pointer', padding:0, display:'flex' }}>
                {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {error && (
              <p style={{ fontSize:12.5, fontWeight:700, color:'#B52020', background:'#FEF0F0', border:'1px solid #FFCFCF', borderRadius:14, padding:'10px 16px', margin:0 }}>
                {error}
              </p>
            )}
            {success && (
              <p style={{ fontSize:12.5, fontWeight:700, color:'#0F6E56', background:'#E8F8F1', border:'1px solid #B2DFCF', borderRadius:14, padding:'10px 16px', margin:0 }}>
                {success}
              </p>
            )}

            {/* Botón */}
            <button
              type="submit" disabled={loading}
              style={{
                width:'100%', height:56, borderRadius:28,
                background: loading ? '#8EBBD8' : '#1B6DD4',
                color:'#fff', fontWeight:800, fontSize:16.5,
                border:'none', cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 8px 24px rgba(27,109,212,.42)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                fontFamily:'inherit', transition:'all .18s', marginTop:3,
              }}
            >
              {loading
                ? <div style={{ width:22, height:22, border:'2.5px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin .7s linear infinite' }} />
                : mode === 'login'
                  ? <><span>Iniciar sesión</span><span style={{ fontSize:20 }}>→</span></>
                  : <><span>Crear cuenta</span><span style={{ fontSize:20 }}>→</span></>
              }
            </button>
          </form>

          <div>
            {mode === 'login' && (
              <p style={{ textAlign:'center', marginTop:13, fontSize:13, color:'#1560C8', fontWeight:700, cursor:'pointer' }}>
                ¿Olvidaste tu contraseña?
              </p>
            )}

            <div style={{ display:'flex', alignItems:'center', gap:10, margin:'12px 0 10px' }}>
              <div style={{ flex:1, height:1, background:'#E4EFF7' }} />
              <span style={{ fontSize:16, opacity:.35 }}>🔔</span>
              <div style={{ flex:1, height:1, background:'#E4EFF7' }} />
            </div>

            {mode === 'login' ? (
              <p style={{ textAlign:'center', fontSize:13.5, color:'#5A8AAA', fontWeight:600 }}>
                ¿No tienes una cuenta?{' '}
                <button onClick={() => switchMode('signup')} style={{ color:'#1560C8', fontWeight:800, background:'none', border:'none', cursor:'pointer', fontSize:13.5, fontFamily:'inherit' }}>
                  Regístrate
                </button>
              </p>
            ) : (
              <p style={{ textAlign:'center', fontSize:13.5, color:'#5A8AAA', fontWeight:600 }}>
                ¿Ya tienes una cuenta?{' '}
                <button onClick={() => switchMode('login')} style={{ color:'#1560C8', fontWeight:800, background:'none', border:'none', cursor:'pointer', fontSize:13.5, fontFamily:'inherit' }}>
                  Inicia sesión
                </button>
              </p>
            )}
          </div>

          <div style={{ flex:1 }} />
        </div>

      </div>
    </>
  )
}
