'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'

/* ─── Doraemon SVG ─────────────────────────────────────────────────────────── */
function Doraemon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 280 260"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Shadow */}
      <ellipse cx="140" cy="256" rx="85" ry="10" fill="rgba(0,0,0,.1)" />

      {/* Body */}
      <ellipse cx="140" cy="222" rx="92" ry="56" fill="#1B6DD4" />
      {/* Belly white */}
      <ellipse cx="140" cy="228" rx="65" ry="42" fill="#fff" />
      {/* Pocket arc */}
      <path d="M 102 248 Q 140 272 178 248" stroke="#ddd" strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* Arms left */}
      <ellipse cx="48" cy="205" rx="28" ry="16" fill="#1B6DD4" transform="rotate(-30 48 205)" />
      <circle cx="34" cy="215" r="14" fill="#1B6DD4" />
      {/* Arms right */}
      <ellipse cx="232" cy="205" rx="28" ry="16" fill="#1B6DD4" transform="rotate(30 232 205)" />
      <circle cx="246" cy="215" r="14" fill="#1B6DD4" />

      {/* Head */}
      <circle cx="140" cy="108" r="100" fill="#1B6DD4" />

      {/* Face white area */}
      <ellipse cx="140" cy="130" rx="78" ry="72" fill="#fff" />

      {/* Eye whites left */}
      <ellipse cx="108" cy="92" rx="22" ry="27" fill="#fff" />
      {/* Eye whites right */}
      <ellipse cx="172" cy="92" rx="22" ry="27" fill="#fff" />

      {/* Pupils left */}
      <circle cx="114" cy="99" r="13" fill="#1a1a1a" />
      <circle cx="119" cy="94" r="5" fill="#fff" />
      {/* Pupils right */}
      <circle cx="166" cy="99" r="13" fill="#1a1a1a" />
      <circle cx="171" cy="94" r="5" fill="#fff" />

      {/* Nose — red */}
      <circle cx="140" cy="120" r="14" fill="#E03C31" />
      <circle cx="135" cy="115" r="4" fill="rgba(255,255,255,.35)" />

      {/* Mouth */}
      <path d="M 105 142 Q 140 175 175 142" stroke="#1a1a1a" strokeWidth="3" fill="none" strokeLinecap="round" />

      {/* Whiskers left */}
      <line x1="28" y1="128" x2="116" y2="134" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />
      <line x1="28" y1="142" x2="116" y2="142" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />
      <line x1="28" y1="156" x2="116" y2="150" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />
      {/* Whiskers right */}
      <line x1="164" y1="134" x2="252" y2="128" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />
      <line x1="164" y1="142" x2="252" y2="142" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />
      <line x1="164" y1="150" x2="252" y2="156" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />

      {/* Collar */}
      <rect x="60" y="198" width="160" height="20" rx="10" fill="#E03C31" />
      {/* Bell */}
      <circle cx="140" cy="220" r="17" fill="#F5C518" />
      <line x1="132" y1="212" x2="148" y2="212" stroke="#c9a000" strokeWidth="2" />
      <circle cx="140" cy="224" r="5" fill="#c9a000" />
    </svg>
  )
}

/* ─── Phone Mockup ──────────────────────────────────────────────────────────── */
function PhoneMockup() {
  return (
    <div className="relative mx-auto" style={{ width: 220 }}>
      {/* Phone frame */}
      <div
        className="rounded-[36px] overflow-hidden"
        style={{
          background: '#0a1628',
          padding: '14px',
          boxShadow: '0 32px 80px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.06)',
        }}
      >
        <div className="rounded-[26px] overflow-hidden" style={{ background: '#EEF4FF' }}>
          {/* Status bar notch */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-20 h-5 rounded-full bg-black" />
          </div>

          {/* Hero card */}
          <div
            className="mx-3 rounded-2xl p-4 text-white mb-3"
            style={{ background: 'linear-gradient(135deg,#155BB0,#1B6DD4)' }}
          >
            <p className="text-[9px] opacity-70 font-bold mb-1">Junio 2025</p>
            <p className="text-[10px] opacity-80 font-semibold">Gastado este mes</p>
            <p className="text-2xl font-black leading-tight">$487.320</p>
            <div className="mt-2 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full w-3/4 bg-white/70 rounded-full" />
            </div>
            <p className="text-[9px] opacity-60 mt-1">Quedan $112.680</p>
          </div>

          {/* Category cards */}
          <div className="grid grid-cols-2 gap-2 mx-3 mb-3">
            {[
              { name: 'Comida', icon: '🍽️', amount: '$228.500', color: '#0F6E56', bg: '#E1F5EE', pct: 91 },
              { name: 'Transporte', icon: '🚗', amount: '$54.000', color: '#185FA5', bg: '#E6F1FB', pct: 43 },
            ].map(c => (
              <div key={c.name} className="rounded-xl p-2.5" style={{ background: '#fff', border: '.5px solid #D5E6FF' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm mb-1.5" style={{ background: c.bg }}>
                  {c.icon}
                </div>
                <p className="text-[9px] font-semibold text-gray-400">{c.name}</p>
                <p className="text-[11px] font-black text-gray-900">{c.amount}</p>
                <div className="h-1 rounded-full mt-1 overflow-hidden" style={{ background: `${c.color}20` }}>
                  <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: c.color }} />
                </div>
              </div>
            ))}
          </div>

          {/* Expense rows */}
          <div className="mx-3 mb-3 rounded-xl overflow-hidden" style={{ background: '#fff', border: '.5px solid #D5E6FF' }}>
            {[
              { name: 'Almuerzo', cat: 'Comida', amt: '$8.900', color: '#E1F5EE', icon: '🍽️' },
              { name: 'Metro', cat: 'Transporte', amt: '$1.000', color: '#E6F1FB', icon: '🚗' },
              { name: 'Netflix', cat: 'Ocio', amt: '$9.990', color: '#FBEAF0', icon: '🎮' },
            ].map((e, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: i < 2 ? '.5px solid #F0F6FF' : 'none' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: e.color }}>
                  {e.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-gray-900 truncate">{e.name}</p>
                  <p className="text-[8px] text-gray-400 font-medium">{e.cat}</p>
                </div>
                <p className="text-[10px] font-black text-gray-900">{e.amt}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating badge */}
      <div
        className="absolute -right-4 top-20 rounded-2xl px-3 py-2 text-white text-xs font-bold"
        style={{
          background: 'linear-gradient(135deg,#155BB0,#1B6DD4)',
          boxShadow: '0 8px 24px rgba(0,110,180,.4)',
          whiteSpace: 'nowrap',
        }}
      >
        +$8.900 ✓
      </div>
    </div>
  )
}

/* ─── Main Page ─────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
          }
        })
      },
      { threshold: 0.12 }
    )

    document.querySelectorAll('[data-reveal]').forEach((el) => {
      observerRef.current?.observe(el)
    })

    return () => observerRef.current?.disconnect()
  }, [])

  return (
    <>
      <style>{`
        [data-reveal] {
          opacity: 0;
          transform: translateY(40px);
          transition: opacity .75s ease, transform .75s ease;
        }
        [data-reveal="left"] {
          transform: translateX(-40px);
        }
        [data-reveal="right"] {
          transform: translateX(40px);
        }
        [data-reveal="scale"] {
          transform: scale(.92) translateY(20px);
          transition: opacity .8s ease, transform .8s ease;
        }
        [data-reveal].is-visible {
          opacity: 1;
          transform: none;
        }
        [data-delay="1"] { transition-delay: .1s; }
        [data-delay="2"] { transition-delay: .2s; }
        [data-delay="3"] { transition-delay: .3s; }
        [data-delay="4"] { transition-delay: .4s; }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-12px); }
        }
        @keyframes fadeDown {
          from { opacity:0; transform:translateY(-24px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .doraemon-float {
          animation: float 4s ease-in-out infinite;
        }
        .hero-animate {
          animation: fadeDown .8s ease forwards;
        }
        .hero-animate-delay1 { animation: fadeDown .8s .15s ease both; }
        .hero-animate-delay2 { animation: fadeDown .8s .3s ease both; }
        .hero-animate-delay3 { animation: fadeDown .8s .45s ease both; }

        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .badge-pill {
          display: inline-block;
          padding: 6px 14px;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .06em;
          text-transform: uppercase;
          color: #1B6DD4;
          background: rgba(255,255,255,.2);
          border: 1px solid rgba(255,255,255,.35);
          backdrop-filter: blur(8px);
        }
      `}</style>

      <main className="overflow-x-hidden">

        {/* ══════════════════════ HERO ══════════════════════ */}
        <section
          style={{
            background: 'linear-gradient(160deg, #0A1F44 0%, #0F4489 45%, #1B6DD4 100%)',
            minHeight: '100svh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 24px 40px',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Decorative circles */}
          <div style={{ position:'absolute', top:-80, right:-80, width:320, height:320, borderRadius:'50%', background:'rgba(255,255,255,.04)', pointerEvents:'none' }} />
          <div style={{ position:'absolute', bottom:-60, left:-60, width:240, height:240, borderRadius:'50%', background:'rgba(255,255,255,.04)', pointerEvents:'none' }} />

          <div className="badge-pill hero-animate mb-6">bolsillo mágico</div>

          <h1
            className="hero-animate-delay1"
            style={{
              fontSize: 'clamp(32px, 8vw, 52px)',
              fontWeight: 900,
              color: '#fff',
              lineHeight: 1.1,
              marginBottom: 18,
              letterSpacing: '-0.02em',
            }}
          >
            Controla tu plata.<br />
            <span style={{ color: 'rgba(255,255,255,.65)' }}>Sin complicaciones.</span>
          </h1>

          <p
            className="hero-animate-delay2"
            style={{
              fontSize: 17,
              color: 'rgba(255,255,255,.72)',
              maxWidth: 340,
              margin: '0 auto 36px',
              lineHeight: 1.65,
            }}
          >
            Registra tus gastos en 3 segundos. Visualiza a dónde va cada peso. Gratis, siempre.
          </p>

          <div className="hero-animate-delay3" style={{ display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center', marginBottom:56 }}>
            <Link
              href="/login"
              style={{
                display: 'inline-block',
                background: '#fff',
                color: '#1B6DD4',
                fontWeight: 800,
                fontSize: 15,
                padding: '14px 32px',
                borderRadius: 100,
                textDecoration: 'none',
                boxShadow: '0 8px 32px rgba(0,0,0,.2)',
              }}
            >
              Empieza gratis →
            </Link>
          </div>

          {/* Doraemon */}
          <div className="doraemon-float hero-animate-delay3" style={{ marginTop: -8 }}>
            <Doraemon style={{ width: 'clamp(200px, 50vw, 280px)', height: 'auto', filter: 'drop-shadow(0 16px 32px rgba(0,0,0,.25))' }} />
          </div>
        </section>

        {/* ══════════════════════ FEATURE 1: Registro rápido ══════════════════════ */}
        <section
          style={{
            background: '#EEF4FF',
            padding: '88px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 48,
          }}
        >
          <div data-reveal style={{ maxWidth: 380 }}>
            <p style={{ fontSize:11, fontWeight:800, letterSpacing:'.1em', color:'#1B6DD4', textTransform:'uppercase', marginBottom:12 }}>
              rápido como la magia
            </p>
            <h2 style={{ fontSize:'clamp(26px,6vw,38px)', fontWeight:900, color:'#0a2a38', lineHeight:1.15, marginBottom:16, letterSpacing:'-0.01em' }}>
              Registra un gasto<br />en 3 segundos
            </h2>
            <p style={{ fontSize:16, color:'#4b6a7a', lineHeight:1.65 }}>
              Sin formularios interminables. Escribe el monto, elige categoría y listo. Tu bolsillo siempre al día.
            </p>
          </div>

          <div data-reveal="scale" data-delay="2">
            <PhoneMockup />
          </div>
        </section>

        {/* ══════════════════════ FEATURE 2: Presupuesto ══════════════════════ */}
        <section
          style={{
            background: '#fff',
            padding: '88px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 48,
          }}
        >
          <div data-reveal style={{ maxWidth: 380 }}>
            <p style={{ fontSize:11, fontWeight:800, letterSpacing:'.1em', color:'#1B6DD4', textTransform:'uppercase', marginBottom:12 }}>
              sin sorpresas
            </p>
            <h2 style={{ fontSize:'clamp(26px,6vw,38px)', fontWeight:900, color:'#0a2a38', lineHeight:1.15, marginBottom:16, letterSpacing:'-0.01em' }}>
              Sabe cuánto<br />te queda del mes
            </h2>
            <p style={{ fontSize:16, color:'#4b6a7a', lineHeight:1.65 }}>
              Presupuesto mensual, límites por categoría y proyección de gasto al fin de mes. Siempre un paso adelante.
            </p>
          </div>

          {/* Budget visual */}
          <div data-reveal="scale" data-delay="2" style={{ width:'100%', maxWidth:340 }}>
            <div
              style={{
                background:'#0a2a38',
                borderRadius:28,
                padding:14,
                boxShadow:'0 32px 80px rgba(0,0,0,.25)',
                margin:'0 auto',
              }}
            >
              <div style={{ background:'#EEF4FF', borderRadius:20, overflow:'hidden', padding:'20px 16px' }}>
                {/* Header */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                  <div>
                    <p style={{ fontSize:10, color:'#6b8a9a', fontWeight:700 }}>Presupuesto junio</p>
                    <p style={{ fontSize:22, fontWeight:900, color:'#0a2a38', letterSpacing:'-0.01em' }}>$600.000</p>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <p style={{ fontSize:10, color:'#6b8a9a', fontWeight:700 }}>Gastado</p>
                    <p style={{ fontSize:22, fontWeight:900, color:'#1B6DD4' }}>81%</p>
                  </div>
                </div>

                {/* Progress */}
                <div style={{ height:8, background:'#D5E6FF', borderRadius:8, overflow:'hidden', marginBottom:6 }}>
                  <div style={{ height:'100%', width:'81%', background:'linear-gradient(90deg,#155BB0,#1B6DD4)', borderRadius:8 }} />
                </div>
                <p style={{ fontSize:10, color:'#6b8a9a', fontWeight:700, marginBottom:20 }}>Quedan $113.680</p>

                {/* Category limits */}
                {[
                  { name:'Comida', pct:91, color:'#E03C31', bg:'#E1F5EE', icon:'🍽️' },
                  { name:'Transporte', pct:43, color:'#185FA5', bg:'#E6F1FB', icon:'🚗' },
                  { name:'Ocio', pct:36, color:'#993556', bg:'#FBEAF0', icon:'🎮' },
                ].map(c => (
                  <div key={c.name} style={{ marginBottom:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:12 }}>{c.icon}</span>
                        <span style={{ fontSize:11, fontWeight:700, color:'#0a2a38' }}>{c.name}</span>
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, color: c.pct >= 80 ? '#E03C31' : '#6b8a9a' }}>{c.pct}%</span>
                    </div>
                    <div style={{ height:5, background:'#e8f5fc', borderRadius:4, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${c.pct}%`, background:c.pct>=80?'#E03C31':c.color, borderRadius:4 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════ FEATURE 3: Recurrentes ══════════════════════ */}
        <section
          style={{
            background: '#EEF4FF',
            padding: '88px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 48,
          }}
        >
          <div data-reveal style={{ maxWidth: 380 }}>
            <p style={{ fontSize:11, fontWeight:800, letterSpacing:'.1em', color:'#1B6DD4', textTransform:'uppercase', marginBottom:12 }}>
              cero olvidos
            </p>
            <h2 style={{ fontSize:'clamp(26px,6vw,38px)', fontWeight:900, color:'#0a2a38', lineHeight:1.15, marginBottom:16, letterSpacing:'-0.01em' }}>
              Nunca más una<br />suscripción olvidada
            </h2>
            <p style={{ fontSize:16, color:'#4b6a7a', lineHeight:1.65 }}>
              Netflix, Spotify, arriendo, cuotas del auto. Todo en un lugar, con recordatorios automáticos.
            </p>
          </div>

          {/* Recurring list visual */}
          <div data-reveal="scale" data-delay="2" style={{ width:'100%', maxWidth:340 }}>
            <div style={{ background:'#fff', borderRadius:24, padding:20, boxShadow:'0 16px 48px rgba(0,110,180,.1)', border:'.5px solid #D5E6FF' }}>
              <p style={{ fontSize:12, fontWeight:700, color:'#6b8a9a', marginBottom:16 }}>Compromisos del mes · $342.990</p>
              {[
                { name:'Netflix', next:'15', amount:'$9.990', done:true,  icon:'🎬', color:'#E03C31', bg:'#FCEBEB' },
                { name:'Spotify', next:'22', amount:'$5.990', done:false, icon:'🎵', color:'#0F6E56', bg:'#E1F5EE' },
                { name:'Arriendo', next:'1',  amount:'$280.000', done:true,  icon:'🏠', color:'#854F0B', bg:'#FAEEDA' },
                { name:'Crédito', next:'28', amount:'$47.010', done:false, icon:'💳', color:'#185FA5', bg:'#E6F1FB' },
              ].map(r => (
                <div
                  key={r.name}
                  style={{
                    display:'flex', alignItems:'center', gap:12,
                    padding:'10px 0',
                    borderBottom:'.5px solid #F0F6FF',
                  }}
                >
                  <div style={{ width:38, height:38, borderRadius:12, background:r.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                    {r.icon}
                  </div>
                  <div style={{ flex:1, textAlign:'left' }}>
                    <p style={{ fontSize:13, fontWeight:800, color:'#0a2a38' }}>{r.name}</p>
                    <p style={{ fontSize:11, color:'#6b8a9a', fontWeight:600 }}>Día {r.next} del mes</p>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <p style={{ fontSize:13, fontWeight:900, color:'#0a2a38' }}>{r.amount}</p>
                    <span style={{
                      fontSize:10, fontWeight:700, borderRadius:100, padding:'2px 8px',
                      background: r.done ? '#E1F5EE' : '#FEF3C7',
                      color: r.done ? '#0F6E56' : '#92400E',
                    }}>
                      {r.done ? '✓ Pagado' : 'Pendiente'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════ FEATURES GRID ══════════════════════ */}
        <section style={{ background:'#fff', padding:'88px 24px' }}>
          <div data-reveal style={{ textAlign:'center', marginBottom:48 }}>
            <p style={{ fontSize:11, fontWeight:800, letterSpacing:'.1em', color:'#1B6DD4', textTransform:'uppercase', marginBottom:12 }}>
              todo en uno
            </p>
            <h2 style={{ fontSize:'clamp(26px,6vw,38px)', fontWeight:900, color:'#0a2a38', lineHeight:1.15, letterSpacing:'-0.01em' }}>
              Diseñado para<br />la vida real
            </h2>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, maxWidth:420, margin:'0 auto' }}>
            {[
              { icon:'⚡', title:'Registro rápido', desc:'3 segundos y ya está anotado. Sin formularios largos.', bg:'#EEF4FF', delay:1 },
              { icon:'📊', title:'Análisis visual', desc:'Gráficos por categoría. Entiende tu plata de un vistazo.', bg:'#E1F5EE', delay:2 },
              { icon:'🔄', title:'Recurrentes', desc:'Cuotas y suscripciones con registro automático.', bg:'#FAEEDA', delay:3 },
              { icon:'🎯', title:'Presupuesto', desc:'Límites por categoría y alertas cuando te pasas.', bg:'#FCEBEB', delay:4 },
            ].map(f => (
              <div
                key={f.title}
                data-reveal="scale"
                data-delay={String(f.delay)}
                style={{
                  background:'#F5F8FF',
                  border:'.5px solid #D5E6FF',
                  borderRadius:20,
                  padding:'20px 16px',
                }}
              >
                <div style={{ width:44, height:44, borderRadius:14, background:f.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, marginBottom:12 }}>
                  {f.icon}
                </div>
                <p style={{ fontSize:13, fontWeight:800, color:'#0a2a38', marginBottom:4 }}>{f.title}</p>
                <p style={{ fontSize:12, color:'#4b6a7a', lineHeight:1.5 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════ CTA FINAL ══════════════════════ */}
        <section
          style={{
            background: 'linear-gradient(160deg, #0A1F44, #1B6DD4)',
            padding: '100px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div data-reveal style={{ marginBottom:40 }}>
            <Doraemon style={{ width:120, height:'auto', opacity:.9, marginBottom:24, filter:'drop-shadow(0 8px 20px rgba(0,0,0,.3))' }} />
            <h2 style={{ fontSize:'clamp(28px,7vw,44px)', fontWeight:900, color:'#fff', lineHeight:1.1, marginBottom:16, letterSpacing:'-0.02em' }}>
              Tu plata,<br />bajo control.
            </h2>
            <p style={{ fontSize:16, color:'rgba(255,255,255,.7)', marginBottom:36, lineHeight:1.6 }}>
              Gratis, sin tarjeta. Solo tu email y listo.
            </p>
            <Link
              href="/login"
              style={{
                display: 'inline-block',
                background: '#fff',
                color: '#1B6DD4',
                fontWeight: 800,
                fontSize: 16,
                padding: '16px 40px',
                borderRadius: 100,
                textDecoration: 'none',
                boxShadow: '0 12px 40px rgba(0,0,0,.25)',
              }}
            >
              Crear cuenta gratis →
            </Link>
            <br />
            <Link
              href="/login"
              style={{ display:'inline-block', marginTop:16, fontSize:13, color:'rgba(255,255,255,.55)', fontWeight:600, textDecoration:'none' }}
            >
              ¿Ya tienes cuenta? Inicia sesión
            </Link>
          </div>
        </section>

      </main>
    </>
  )
}
