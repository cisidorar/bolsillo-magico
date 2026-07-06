'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

/* ─────────────────────────────────────────────────────────
   Phone mockup — mini preview del dashboard
───────────────────────────────────────────────────────── */
function AppPreview() {
  const [active, setActive] = useState(0)
  const screens = ['Inicio', 'Análisis', 'Recurrentes']

  useEffect(() => {
    const id = setInterval(() => setActive(p => (p + 1) % screens.length), 2800)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ position:'relative', width:240, margin:'0 auto' }}>
      {/* Glow behind phone */}
      <div style={{
        position:'absolute', inset:-40, borderRadius:'50%',
        background:'radial-gradient(ellipse, rgba(43,124,246,.35) 0%, transparent 70%)',
        pointerEvents:'none',
      }} />

      {/* Phone frame */}
      <div style={{
        background:'#070F1E',
        borderRadius:44,
        padding:12,
        boxShadow:'0 40px 100px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.08), inset 0 1px 0 rgba(255,255,255,.1)',
        position:'relative',
      }}>
        {/* Side buttons */}
        <div style={{ position:'absolute', left:-3, top:80, width:3, height:32, background:'#1a2540', borderRadius:'2px 0 0 2px' }} />
        <div style={{ position:'absolute', left:-3, top:124, width:3, height:56, background:'#1a2540', borderRadius:'2px 0 0 2px' }} />
        <div style={{ position:'absolute', right:-3, top:96, width:3, height:48, background:'#1a2540', borderRadius:'0 2px 2px 0' }} />

        <div style={{ background:'#EEF4FF', borderRadius:34, overflow:'hidden', minHeight:440 }}>
          {/* Notch */}
          <div style={{ display:'flex', justifyContent:'center', paddingTop:10, paddingBottom:6, background:'#EEF4FF' }}>
            <div style={{ width:80, height:22, borderRadius:12, background:'#0a0f1e' }} />
          </div>

          {/* ── Pantalla 1: Inicio ────────────── */}
          <div style={{
            opacity: active === 0 ? 1 : 0,
            transform: active === 0 ? 'translateX(0)' : 'translateX(-20px)',
            transition:'all .5s ease',
            position: active === 0 ? 'static' : 'absolute',
            padding:'8px 12px 12px',
          }}>
            {/* Hero card */}
            <div style={{
              background:'linear-gradient(140deg,#0F3D8C,#2B7CF6)',
              borderRadius:20,
              padding:'14px 14px 12px',
              color:'#fff',
              marginBottom:10,
            }}>
              <p style={{ fontSize:9, opacity:.6, fontWeight:700, marginBottom:2 }}>Hola, Catalina 👋</p>
              <p style={{ fontSize:10, opacity:.7, fontWeight:600 }}>Junio 2025</p>
              <p style={{ fontSize:24, fontWeight:900, letterSpacing:'-0.02em', margin:'4px 0 2px' }}>$487.320</p>
              <div style={{ height:5, background:'rgba(255,255,255,.2)', borderRadius:4, overflow:'hidden', marginBottom:4 }}>
                <div style={{ height:'100%', width:'81%', background:'rgba(255,255,255,.8)', borderRadius:4 }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <p style={{ fontSize:9, opacity:.55 }}>Gastado este mes</p>
                <p style={{ fontSize:9, opacity:.7, fontWeight:700 }}>$112.680 restante</p>
              </div>
            </div>

            {/* Category grid */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7, marginBottom:10 }}>
              {[
                { icon:'🍽️', name:'Comida',    amt:'$228.500', pct:91, c:'#E03C31', bg:'#FDEDEC' },
                { icon:'🚗', name:'Transporte', amt:'$54.000',  pct:43, c:'#2B7CF6', bg:'#EEF4FF' },
              ].map(c => (
                <div key={c.name} style={{ background:'#fff', borderRadius:14, padding:'10px 10px 8px', border:'.5px solid #D5E6FF' }}>
                  <div style={{ width:28, height:28, borderRadius:9, background:c.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, marginBottom:6 }}>{c.icon}</div>
                  <p style={{ fontSize:8, color:'#8AACBC', fontWeight:700 }}>{c.name}</p>
                  <p style={{ fontSize:11, fontWeight:900, color:'#0a2a38' }}>{c.amt}</p>
                  <div style={{ height:3, background:'#F0F6FF', borderRadius:3, overflow:'hidden', marginTop:4 }}>
                    <div style={{ height:'100%', width:`${c.pct}%`, background:c.c, borderRadius:3 }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Recent expenses */}
            <div style={{ background:'#fff', borderRadius:14, overflow:'hidden', border:'.5px solid #D5E6FF' }}>
              {[
                { icon:'🍽️', name:'Almuerzo',    amt:'$8.900',  bg:'#FDEDEC' },
                { icon:'🎵', name:'Spotify',      amt:'$5.990',  bg:'#E1F5EE' },
                { icon:'🚗', name:'Uber',         amt:'$4.500',  bg:'#EEF4FF' },
              ].map((e, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderBottom:i<2?'.5px solid #F4F9FF':'none' }}>
                  <div style={{ width:28, height:28, borderRadius:9, background:e.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, flexShrink:0 }}>{e.icon}</div>
                  <p style={{ flex:1, fontSize:10, fontWeight:700, color:'#0a2a38' }}>{e.name}</p>
                  <p style={{ fontSize:10, fontWeight:900, color:'#0a2a38' }}>{e.amt}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Pantalla 2: Análisis ─────────── */}
          {active === 1 && (
            <div style={{ padding:'8px 12px 12px', animation:'fadeIn .5s ease' }}>
              <p style={{ fontSize:12, fontWeight:800, color:'#0a2a38', marginBottom:12 }}>Análisis · Junio</p>

              {/* Donut */}
              <div style={{ display:'flex', justifyContent:'center', marginBottom:14 }}>
                <svg viewBox="0 0 100 100" width={110} height={110}>
                  {[
                    { pct:46.8, color:'#E03C31', offset:0 },
                    { pct:11.1, color:'#2B7CF6', offset:46.8 },
                    { pct:15.8, color:'#0D9488', offset:57.9 },
                    { pct:26.3, color:'#7C3AED', offset:73.7 },
                  ].map((s, i) => {
                    const r = 38, c = 2*Math.PI*r
                    return (
                      <circle key={i} cx="50" cy="50" r={r}
                        fill="none" stroke={s.color} strokeWidth="18"
                        strokeDasharray={`${(s.pct/100)*c} ${c}`}
                        strokeDashoffset={-((s.offset/100)*c)}
                        style={{ transform:'rotate(-90deg)', transformOrigin:'50% 50%' }}
                      />
                    )
                  })}
                  <text x="50" y="47" textAnchor="middle" style={{ fontSize:9, fontWeight:900, fill:'#0a2a38' }}>$487k</text>
                  <text x="50" y="58" textAnchor="middle" style={{ fontSize:7, fill:'#8AACBC', fontWeight:600 }}>total</text>
                </svg>
              </div>

              {[
                { icon:'🍽️', name:'Comida',      pct:46.8, color:'#E03C31', bg:'#FDEDEC' },
                { icon:'🎮', name:'Ocio',         pct:15.8, color:'#0D9488', bg:'#CCFBF1' },
                { icon:'🚗', name:'Transporte',   pct:11.1, color:'#2B7CF6', bg:'#EEF4FF' },
              ].map(c => (
                <div key={c.name} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <div style={{ width:28, height:28, borderRadius:9, background:c.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, flexShrink:0 }}>{c.icon}</div>
                  <p style={{ flex:1, fontSize:10, fontWeight:700, color:'#0a2a38' }}>{c.name}</p>
                  <div style={{ width:60, height:4, background:'#F0F6FF', borderRadius:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${c.pct}%`, background:c.color, borderRadius:4 }} />
                  </div>
                  <p style={{ fontSize:10, fontWeight:800, color:'#0a2a38', minWidth:32, textAlign:'right' }}>{c.pct}%</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Pantalla 3: Recurrentes ──────── */}
          {active === 2 && (
            <div style={{ padding:'8px 12px 12px', animation:'fadeIn .5s ease' }}>
              <p style={{ fontSize:12, fontWeight:800, color:'#0a2a38', marginBottom:4 }}>Recurrentes</p>
              <p style={{ fontSize:9, color:'#8AACBC', fontWeight:700, marginBottom:12 }}>Carga mensual · $342.990</p>
              {[
                { icon:'🎬', name:'Netflix',  next:'15 jun', amt:'$9.990',   done:true,  bg:'#FDEDEC' },
                { icon:'🎵', name:'Spotify',  next:'22 jun', amt:'$5.990',   done:false, bg:'#E1F5EE' },
                { icon:'🏠', name:'Arriendo', next:'1 jul',  amt:'$280.000', done:true,  bg:'#FAEEDA' },
                { icon:'💳', name:'Crédito',  next:'28 jun', amt:'$47.010',  done:false, bg:'#EEF4FF' },
              ].map((r, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderBottom:'.5px solid #F4F9FF' }}>
                  <div style={{ width:32, height:32, borderRadius:10, background:r.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, flexShrink:0 }}>{r.icon}</div>
                  <div style={{ flex:1 }}>
                    <p style={{ fontSize:11, fontWeight:800, color:'#0a2a38' }}>{r.name}</p>
                    <p style={{ fontSize:9, color:'#8AACBC', fontWeight:600 }}>{r.next}</p>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <p style={{ fontSize:10, fontWeight:900, color:'#0a2a38' }}>{r.amt}</p>
                    <span style={{
                      fontSize:8, fontWeight:700, padding:'2px 6px', borderRadius:100,
                      background:r.done?'#E1F5EE':'#FEF3C7',
                      color:r.done?'#0F6E56':'#92400E',
                    }}>{r.done ? '✓' : '⏳'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tab bar */}
          <div style={{
            display:'flex', justifyContent:'space-around', padding:'6px 0 8px',
            background:'#fff', borderTop:'.5px solid #D5E6FF', marginTop:4,
          }}>
            {['🏠','📊','🔄','📋'].map((icon, i) => (
              <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                <div style={{
                  width:28, height:28, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center',
                  background: [0,1,2].indexOf(active) === i ? '#EEF4FF' : 'transparent',
                  fontSize:14,
                }}>{icon}</div>
                <div style={{ width:4, height:4, borderRadius:2, background: [0,1,2].indexOf(active)===i?'#2B7CF6':'transparent' }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Screen label pills */}
      <div style={{ display:'flex', justifyContent:'center', gap:6, marginTop:20 }}>
        {screens.map((s, i) => (
          <button key={i} onClick={() => setActive(i)} style={{
            fontSize:10, fontWeight:700, padding:'4px 12px', borderRadius:100, border:'none', cursor:'pointer',
            background: active===i ? '#2B7CF6' : 'rgba(255,255,255,.2)',
            color: active===i ? '#fff' : 'rgba(255,255,255,.6)',
            transition:'all .3s',
          }}>{s}</button>
        ))}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   Main landing page
───────────────────────────────────────────────────────── */
export default function LandingPage() {
  useEffect(() => {
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('revealed')
      }),
      { threshold: 0.12 }
    )
    document.querySelectorAll('[data-reveal]').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <>
      <style>{`
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family: var(--font-nunito, 'Nunito', system-ui, sans-serif); }
        @keyframes fadeIn  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
        @keyframes float   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(50px)} to{opacity:1;transform:none} }
        .hero-in   { animation: slideUp .8s cubic-bezier(.22,1,.36,1) both; }
        .hero-in-2 { animation: slideUp .8s .15s cubic-bezier(.22,1,.36,1) both; }
        .hero-in-3 { animation: slideUp .8s .3s  cubic-bezier(.22,1,.36,1) both; }
        .hero-in-4 { animation: slideUp .8s .45s cubic-bezier(.22,1,.36,1) both; }
        .float     { animation: float 4s ease-in-out infinite; }

        [data-reveal] {
          opacity:0; transform:translateY(40px);
          transition: opacity .7s ease, transform .7s ease;
        }
        [data-reveal].revealed { opacity:1; transform:none; }
        [data-delay="1"] { transition-delay:.1s }
        [data-delay="2"] { transition-delay:.2s }
        [data-delay="3"] { transition-delay:.3s }
        [data-delay="4"] { transition-delay:.4s }

        .btn-primary {
          display:inline-flex; align-items:center; justify-content:center; gap:8px;
          background:#fff; color:#2B7CF6; font-weight:800; font-size:16px;
          padding:16px 36px; border-radius:100px; text-decoration:none;
          box-shadow:0 12px 40px rgba(0,0,0,.22);
          transition:transform .2s, box-shadow .2s;
          font-family:inherit;
        }
        .btn-primary:hover { transform:translateY(-2px); box-shadow:0 18px 48px rgba(0,0,0,.28); }
        .btn-ghost {
          display:inline-flex; align-items:center; justify-content:center;
          color:rgba(255,255,255,.7); font-weight:700; font-size:14px;
          padding:12px 24px; border-radius:100px; text-decoration:none;
          border:1px solid rgba(255,255,255,.25);
          transition:all .2s; font-family:inherit;
        }
        .btn-ghost:hover { background:rgba(255,255,255,.1); color:#fff; }
        .feature-card:hover { transform:translateY(-4px) scale(1.01); }

        /* Desktop overrides */
        @media(min-width:1024px) {
          .hero-layout { flex-direction:row !important; text-align:left !important; padding:100px 80px !important; gap:80px !important; }
          .hero-text { max-width:520px; }
          .hero-subtitle { margin-left:0 !important; margin-right:0 !important; }
          .hero-ctas { justify-content:flex-start !important; }
          .hero-trust { justify-content:flex-start !important; }
          .features-grid { grid-template-columns:repeat(3,1fr) !important; max-width:960px !important; }
          .section-inner { max-width:960px; margin:0 auto; }
          .how-grid { grid-template-columns:repeat(3,1fr) !important; }
        }
        @media(max-width:1023px) {
          .nav-links { display:none !important; }
        }
      `}</style>

      {/* ══════════ NAVBAR ══════════ */}
      <nav style={{
        position:'fixed', top:0, left:0, right:0, zIndex:100,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 24px', height:60,
        background:'rgba(15,68,137,.88)',
        backdropFilter:'blur(20px) saturate(1.5)',
        borderBottom:'1px solid rgba(255,255,255,.08)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, position:'relative', flexShrink:0 }}>
            <Image src="/bolsillo-magico-icono-invertido.svg" alt="logo" fill style={{ objectFit:'contain' }} />
          </div>
          <span style={{ fontWeight:900, fontSize:16, color:'#fff', letterSpacing:'-0.01em' }}>Bolsillo Mágico</span>
        </div>

        <div className="nav-links" style={{ display:'flex', alignItems:'center', gap:32 }}>
          {['Funciones','Cómo funciona'].map(l => (
            <span key={l} style={{ color:'rgba(255,255,255,.65)', fontSize:14, fontWeight:600, cursor:'pointer' }}>{l}</span>
          ))}
        </div>

        <Link href="/login" style={{
          background:'rgba(255,255,255,.12)', color:'#fff', fontWeight:700,
          fontSize:13, padding:'8px 20px', borderRadius:100, textDecoration:'none',
          border:'1px solid rgba(255,255,255,.2)',
        }}>
          Iniciar sesión
        </Link>
      </nav>

      <main style={{ overflow:'hidden' }}>

        {/* ══════════ HERO ══════════ */}
        <section style={{
          background:'linear-gradient(160deg,#0F4489 0%,#2B7CF6 100%)',
          minHeight:'100svh',
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          padding:'90px 24px 60px',
          textAlign:'center',
          position:'relative',
          overflow:'hidden',
        }} className="hero-layout">

          {/* Background orbs */}
          <div style={{ position:'absolute', top:'10%', right:'-10%', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(43,124,246,.25),transparent 70%)', pointerEvents:'none' }} />
          <div style={{ position:'absolute', bottom:'-5%', left:'-10%', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle,rgba(10,64,140,.4),transparent 70%)', pointerEvents:'none' }} />

          {/* Text side */}
          <div className="hero-text">
            <div className="hero-in" style={{
              display:'inline-flex', alignItems:'center', gap:8,
              background:'rgba(255,255,255,.1)',
              border:'1px solid rgba(255,255,255,.2)', borderRadius:100,
              padding:'6px 16px 6px 10px', fontSize:11, fontWeight:800,
              color:'rgba(255,255,255,.85)', letterSpacing:'.06em',
              textTransform:'uppercase', marginBottom:24,
            }}>
              <div style={{ width:20, height:20, position:'relative', flexShrink:0 }}>
                <Image src="/bolsillo-magico-icono-invertido.svg" alt="" fill style={{ objectFit:'contain' }} />
              </div>
              Control de gastos personales
            </div>

            <h1 className="hero-in-2" style={{
              fontSize:'clamp(36px,8vw,58px)', fontWeight:900,
              color:'#fff', lineHeight:1.08, letterSpacing:'-0.03em',
              marginBottom:20,
            }}>
              Tu plata,<br />
              <span style={{ color:'#D5E6FF' }}>
                bajo control.
              </span>
            </h1>

            <p className="hero-in-3 hero-subtitle" style={{
              fontSize:17, color:'rgba(255,255,255,.65)', lineHeight:1.7,
              maxWidth:420, margin:'0 auto 36px',
            }}>
              Registra tus gastos en segundos. Analiza en qué va tu plata. Controla suscripciones y cuotas. Todo en un solo lugar.
            </p>

            <div className="hero-in-4 hero-ctas" style={{ display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center', marginBottom:32 }}>
              <Link href="/login" className="btn-primary">
                Empezar gratis →
              </Link>
              <Link href="/login" className="btn-ghost">
                Ya tengo cuenta
              </Link>
            </div>

            {/* Trust badges */}
            <div className="hero-in-4 hero-trust" style={{ display:'flex', gap:20, justifyContent:'center', flexWrap:'wrap' }}>
              {['✓ Gratis para siempre', '✓ Sin tarjeta', '✓ Datos seguros'].map(t => (
                <span key={t} style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,.45)' }}>{t}</span>
              ))}
            </div>
          </div>

          {/* Phone mockup */}
          <div className="float hero-in-4" style={{ flexShrink:0, marginTop:48 }}>
            <AppPreview />
          </div>
        </section>

        {/* ══════════ CÓMO FUNCIONA ══════════ */}
        <section style={{ background:'#fff', padding:'96px 24px' }}>
          <div className="section-inner">
            <div data-reveal style={{ textAlign:'center', marginBottom:56 }}>
              <p style={{ fontSize:11, fontWeight:800, letterSpacing:'.1em', color:'#2B7CF6', textTransform:'uppercase', marginBottom:12 }}>
                tan fácil como parece
              </p>
              <h2 style={{ fontSize:'clamp(28px,5vw,42px)', fontWeight:900, color:'#0a1f44', lineHeight:1.1, letterSpacing:'-0.02em' }}>
                En 3 pasos y ya
              </h2>
            </div>

            <div className="how-grid" style={{ display:'grid', gridTemplateColumns:'1fr', gap:24 }}>
              {[
                {
                  n:'01', icon:'✉️',
                  title:'Crea tu cuenta',
                  desc:'Solo tu email. Sin tarjeta, sin trucos. En 30 segundos ya estás adentro.',
                  color:'#2B7CF6', bg:'#EEF4FF',
                },
                {
                  n:'02', icon:'⚡',
                  title:'Registra un gasto',
                  desc:'Monto, categoría, listo. Más rápido que sacar la billetera.',
                  color:'#0D9488', bg:'#CCFBF1',
                },
                {
                  n:'03', icon:'📊',
                  title:'Entiende tu plata',
                  desc:'Gráficos, análisis por categoría y comparación mensual automática.',
                  color:'#7C3AED', bg:'#EDE9FE',
                },
              ].map((step, i) => (
                <div
                  key={i}
                  data-reveal data-delay={String(i + 1)}
                  className="feature-card"
                  style={{
                    background:'#F7FAFF', border:'1px solid #D5E6FF',
                    borderRadius:24, padding:'28px 24px',
                    transition:'transform .25s, box-shadow .25s',
                  }}
                >
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                    <div style={{ width:48, height:48, borderRadius:16, background:step.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>
                      {step.icon}
                    </div>
                    <span style={{ fontSize:13, fontWeight:900, color:step.color, letterSpacing:'.04em' }}>{step.n}</span>
                  </div>
                  <h3 style={{ fontSize:18, fontWeight:900, color:'#0a1f44', marginBottom:8 }}>{step.title}</h3>
                  <p style={{ fontSize:14, color:'#4b6a7a', lineHeight:1.65 }}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════ FEATURES ══════════ */}
        <section style={{ background:'#EEF4FF', padding:'96px 24px' }}>
          <div className="section-inner">
            <div data-reveal style={{ textAlign:'center', marginBottom:56 }}>
              <p style={{ fontSize:11, fontWeight:800, letterSpacing:'.1em', color:'#2B7CF6', textTransform:'uppercase', marginBottom:12 }}>
                todo lo que necesitas
              </p>
              <h2 style={{ fontSize:'clamp(28px,5vw,42px)', fontWeight:900, color:'#0a1f44', lineHeight:1.1, letterSpacing:'-0.02em' }}>
                Diseñado para<br />la vida real
              </h2>
            </div>

            <div className="features-grid" style={{ display:'grid', gridTemplateColumns:'1fr', gap:16, maxWidth:480, margin:'0 auto' }}>
              {[
                { icon:'⚡', title:'Registro instantáneo',  desc:'Agrega cualquier gasto en segundos. Sin complicaciones.',     bg:'#DBEAFE', delay:'1' },
                { icon:'📊', title:'Análisis visual',        desc:'Entiende tus hábitos con gráficos claros por categoría.',      bg:'#D1FAE5', delay:'2' },
                { icon:'🔄', title:'Gastos recurrentes',     desc:'Suscripciones y cuotas con registro automático.',              bg:'#FEF3C7', delay:'3' },
                { icon:'🎯', title:'Presupuesto mensual',    desc:'Define límites y recibe alertas cuando te acercas al tope.',   bg:'#FCE7F3', delay:'4' },
                { icon:'💳', title:'Múltiples métodos',      desc:'Débito, crédito, efectivo y digital. Todo separado.',          bg:'#E0E7FF', delay:'1' },
                { icon:'📤', title:'Exporta tus datos',      desc:'Descarga tus gastos en CSV cuando quieras. Tus datos, tuyos.', bg:'#D1FAE5', delay:'2' },
              ].map(f => (
                <div
                  key={f.title}
                  data-reveal data-delay={f.delay}
                  className="feature-card"
                  style={{
                    background:'#fff', border:'1px solid #D5E6FF', borderRadius:20,
                    padding:'20px', display:'flex', alignItems:'flex-start', gap:14,
                    transition:'transform .25s, box-shadow .25s',
                  }}
                >
                  <div style={{ width:44, height:44, borderRadius:14, background:f.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                    {f.icon}
                  </div>
                  <div>
                    <p style={{ fontSize:15, fontWeight:800, color:'#0a1f44', marginBottom:4 }}>{f.title}</p>
                    <p style={{ fontSize:13, color:'#4b6a7a', lineHeight:1.55 }}>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════ CTA FINAL ══════════ */}
        <section style={{
          background:'linear-gradient(160deg,#0F4489 0%,#2B7CF6 100%)',
          padding:'100px 24px',
          textAlign:'center',
          position:'relative',
          overflow:'hidden',
        }}>
          <div style={{ position:'absolute', top:'-20%', left:'50%', transform:'translateX(-50%)', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle,rgba(43,124,246,.3),transparent 65%)', pointerEvents:'none' }} />

          <div data-reveal style={{ position:'relative' }}>
            <div style={{ width:80, height:80, position:'relative', margin:'0 auto 24px' }}>
              <Image
                src="/bolsillo-magico-icono-invertido.svg"
                alt="Bolsillo Mágico"
                fill
                style={{ objectFit:'contain', filter:'drop-shadow(0 8px 24px rgba(0,0,0,.35))' }}
              />
            </div>
            <h2 style={{
              fontSize:'clamp(32px,7vw,52px)', fontWeight:900, color:'#fff',
              lineHeight:1.08, letterSpacing:'-0.03em', marginBottom:16,
            }}>
              Empieza hoy.<br />
              <span style={{ color:'rgba(255,255,255,.5)' }}>Es gratis.</span>
            </h2>
            <p style={{ fontSize:16, color:'rgba(255,255,255,.6)', marginBottom:40, lineHeight:1.7 }}>
              Sin tarjeta. Sin compromisos.<br />Solo tú y tu plata, finalmente bajo control.
            </p>

            <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', marginBottom:20 }}>
              <Link href="/login" className="btn-primary" style={{ fontSize:17, padding:'18px 44px' }}>
                Crear cuenta gratis →
              </Link>
            </div>
            <Link href="/login" style={{ fontSize:13, color:'rgba(255,255,255,.45)', fontWeight:600, textDecoration:'none' }}>
              ¿Ya tienes cuenta? Inicia sesión
            </Link>
          </div>
        </section>

        {/* ══════════ FOOTER ══════════ */}
        <footer style={{
          background:'#0F4489', padding:'28px 24px',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          flexWrap:'wrap', gap:12,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:24, height:24, position:'relative' }}>
              <Image src="/bolsillo-magico-icono-invertido.svg" alt="logo" fill style={{ objectFit:'contain' }} />
            </div>
            <span style={{ fontWeight:800, fontSize:13, color:'rgba(255,255,255,.5)' }}>Bolsillo Mágico</span>
          </div>
          <p style={{ fontSize:12, color:'rgba(255,255,255,.25)', fontWeight:600 }}>
            © {new Date().getFullYear()} · Hecho con ❤️
          </p>
        </footer>

      </main>
    </>
  )
}
