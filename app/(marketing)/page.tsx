'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Zap, BarChart3, RefreshCw, Target, CreditCard, Download,
  Mail, Home, PieChart, ClipboardList, Wallet, TrendingUp,
  UtensilsCrossed, Car, Music, Film, Gamepad2,
  Check, Clock, CheckCircle2, ArrowRight,
} from 'lucide-react'

/* ─────────────────────────────────────────────────────────
   Tokens del sistema de diseño (globals.css / docs)
───────────────────────────────────────────────────────── */
const T = {
  ink:    '#0E2A52',
  ink2:   '#5B6B82',
  ink3:   '#94A3B8',
  bg:     '#F4F7FB',
  surface2: '#EDF2F8',
  border: '#E4EAF1',
  brand:  '#2B7CF6',
  brand700: '#1E69D8',
  brand800: '#1553B0',
  primary: '#4D93FF',
  primarySoft: '#E8EFFE',
  mint:   '#1FBE8D',
  mintSoft: '#E7F7F0',
  gold:   '#F59E0B',
  goldSoft: '#FFF8E8',
  coral:  '#EF5B52',
  coralSoft: '#FFF4F3',
  violet: '#A78BFA',
  violetSoft: '#F3EFFE',
  navy:   '#0E2A52',
}

const NUM = { fontVariantNumeric: 'tabular-nums' } as const

/* ─────────────────────────────────────────────────────────
   Phone mockup — mini preview del dashboard
───────────────────────────────────────────────────────── */
function MiniIcon({ icon: Icon, color, bg, size = 28, iconSize = 13 }: {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
  color: string; bg: string; size?: number; iconSize?: number
}) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.32, background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <Icon size={iconSize} color={color} strokeWidth={2.2} />
    </div>
  )
}

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
        background:'radial-gradient(ellipse, rgba(77,147,255,.35) 0%, transparent 70%)',
        pointerEvents:'none',
      }} />

      {/* Phone frame */}
      <div style={{
        background:'#0B1220',
        borderRadius:44,
        padding:12,
        boxShadow:'0 40px 100px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.08), inset 0 1px 0 rgba(255,255,255,.1)',
        position:'relative',
      }}>
        {/* Side buttons */}
        <div style={{ position:'absolute', left:-3, top:80, width:3, height:32, background:'#1B2740', borderRadius:'2px 0 0 2px' }} />
        <div style={{ position:'absolute', left:-3, top:124, width:3, height:56, background:'#1B2740', borderRadius:'2px 0 0 2px' }} />
        <div style={{ position:'absolute', right:-3, top:96, width:3, height:48, background:'#1B2740', borderRadius:'0 2px 2px 0' }} />

        <div style={{ background:T.bg, borderRadius:34, overflow:'hidden', height:440, display:'flex', flexDirection:'column' }}>
          {/* Notch */}
          <div style={{ flexShrink:0, display:'flex', justifyContent:'center', paddingTop:10, paddingBottom:6, background:T.bg }}>
            <div style={{ width:80, height:22, borderRadius:12, background:'#0B1220' }} />
          </div>

          {/* Screens */}
          <div style={{ position:'relative', flex:1, overflow:'hidden' }}>

          {/* ── Pantalla 1: Inicio ────────────── */}
          <div style={{
            opacity: active === 0 ? 1 : 0,
            pointerEvents: active === 0 ? 'auto' : 'none',
            transform: active === 0 ? 'translateX(0)' : 'translateX(-20px)',
            transition:'all .5s ease',
            position:'absolute', inset:0, overflowY:'auto',
            padding:'8px 12px 12px',
          }}>
            {/* Hero card */}
            <div style={{
              background:T.primary,
              borderRadius:18,
              padding:'14px 14px 12px',
              color:'#fff',
              marginBottom:10,
            }}>
              <p style={{ fontSize:9, opacity:.7, fontWeight:700, marginBottom:2 }}>Hola, Catalina</p>
              <p style={{ fontSize:10, opacity:.75, fontWeight:600 }}>Julio 2026</p>
              <p style={{ fontSize:24, fontWeight:800, letterSpacing:'-0.02em', margin:'4px 0 2px', ...NUM }}>$487.320</p>
              <div style={{ height:5, background:'rgba(255,255,255,.25)', borderRadius:4, overflow:'hidden', marginBottom:4 }}>
                <div style={{ height:'100%', width:'81%', background:'rgba(255,255,255,.85)', borderRadius:4 }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <p style={{ fontSize:9, opacity:.65 }}>Gastado este mes</p>
                <p style={{ fontSize:9, opacity:.8, fontWeight:700, ...NUM }}>$112.680 restante</p>
              </div>
            </div>

            {/* Category grid */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7, marginBottom:10 }}>
              {[
                { icon:UtensilsCrossed, name:'Comida',     amt:'$228.500', pct:91, c:T.coral,   bg:T.coralSoft },
                { icon:Car,             name:'Transporte', amt:'$54.000',  pct:43, c:T.primary, bg:T.primarySoft },
              ].map(c => (
                <div key={c.name} style={{ background:'#fff', borderRadius:14, padding:'10px 10px 8px', border:`1px solid ${T.border}` }}>
                  <div style={{ marginBottom:6 }}>
                    <MiniIcon icon={c.icon} color={c.c} bg={c.bg} />
                  </div>
                  <p style={{ fontSize:8, color:T.ink3, fontWeight:700 }}>{c.name}</p>
                  <p style={{ fontSize:11, fontWeight:800, color:T.ink, ...NUM }}>{c.amt}</p>
                  <div style={{ height:3, background:T.surface2, borderRadius:3, overflow:'hidden', marginTop:4 }}>
                    <div style={{ height:'100%', width:`${c.pct}%`, background:c.c, borderRadius:3 }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Recent expenses */}
            <div style={{ background:'#fff', borderRadius:14, overflow:'hidden', border:`1px solid ${T.border}` }}>
              {[
                { icon:UtensilsCrossed, name:'Almuerzo', amt:'$8.900', c:T.coral,   bg:T.coralSoft },
                { icon:Music,           name:'Spotify',  amt:'$5.990', c:T.mint,    bg:T.mintSoft },
                { icon:Car,             name:'Uber',     amt:'$4.500', c:T.primary, bg:T.primarySoft },
              ].map((e, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderBottom:i<2?`1px solid ${T.surface2}`:'none' }}>
                  <MiniIcon icon={e.icon} color={e.c} bg={e.bg} />
                  <p style={{ flex:1, fontSize:10, fontWeight:700, color:T.ink }}>{e.name}</p>
                  <p style={{ fontSize:10, fontWeight:800, color:T.ink, ...NUM }}>{e.amt}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Pantalla 2: Análisis ─────────── */}
          <div style={{
            opacity: active === 1 ? 1 : 0,
            pointerEvents: active === 1 ? 'auto' : 'none',
            transition:'opacity .5s ease',
            position:'absolute', inset:0, overflowY:'auto',
            padding:'8px 12px 12px',
          }}>
              <p style={{ fontSize:12, fontWeight:800, color:T.ink, marginBottom:12 }}>Análisis · Julio</p>

              {/* Donut */}
              <div style={{ display:'flex', justifyContent:'center', marginBottom:14 }}>
                <svg viewBox="0 0 100 100" width={110} height={110}>
                  {[
                    { pct:46.8, color:T.coral,   offset:0 },
                    { pct:11.1, color:T.primary, offset:46.8 },
                    { pct:15.8, color:T.mint,    offset:57.9 },
                    { pct:26.3, color:T.violet,  offset:73.7 },
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
                  <text x="50" y="47" textAnchor="middle" style={{ fontSize:9, fontWeight:800, fill:T.ink }}>$487k</text>
                  <text x="50" y="58" textAnchor="middle" style={{ fontSize:7, fill:T.ink3, fontWeight:600 }}>total</text>
                </svg>
              </div>

              {[
                { icon:UtensilsCrossed, name:'Comida',     pct:46.8, color:T.coral,   bg:T.coralSoft },
                { icon:Gamepad2,        name:'Ocio',       pct:15.8, color:T.mint,    bg:T.mintSoft },
                { icon:Car,             name:'Transporte', pct:11.1, color:T.primary, bg:T.primarySoft },
              ].map(c => (
                <div key={c.name} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <MiniIcon icon={c.icon} color={c.color} bg={c.bg} />
                  <p style={{ flex:1, fontSize:10, fontWeight:700, color:T.ink }}>{c.name}</p>
                  <div style={{ width:60, height:4, background:T.surface2, borderRadius:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${c.pct}%`, background:c.color, borderRadius:4 }} />
                  </div>
                  <p style={{ fontSize:10, fontWeight:800, color:T.ink, minWidth:32, textAlign:'right', ...NUM }}>{c.pct}%</p>
                </div>
              ))}
          </div>

          {/* ── Pantalla 3: Recurrentes ──────── */}
          <div style={{
            opacity: active === 2 ? 1 : 0,
            pointerEvents: active === 2 ? 'auto' : 'none',
            transition:'opacity .5s ease',
            position:'absolute', inset:0, overflowY:'auto',
            padding:'8px 12px 12px',
          }}>
              <p style={{ fontSize:12, fontWeight:800, color:T.ink, marginBottom:4 }}>Recurrentes</p>
              <p style={{ fontSize:9, color:T.ink3, fontWeight:700, marginBottom:12, ...NUM }}>Carga mensual · $342.990</p>
              {[
                { icon:Film,       name:'Netflix',  next:'15 jul', amt:'$9.990',   done:true,  c:T.coral,   bg:T.coralSoft },
                { icon:Music,      name:'Spotify',  next:'22 jul', amt:'$5.990',   done:false, c:T.mint,    bg:T.mintSoft },
                { icon:Home,       name:'Arriendo', next:'1 ago',  amt:'$280.000', done:true,  c:T.gold,    bg:T.goldSoft },
                { icon:CreditCard, name:'Crédito',  next:'28 jul', amt:'$47.010',  done:false, c:T.primary, bg:T.primarySoft },
              ].map((r, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderBottom:`1px solid ${T.surface2}` }}>
                  <MiniIcon icon={r.icon} color={r.c} bg={r.bg} size={32} iconSize={15} />
                  <div style={{ flex:1 }}>
                    <p style={{ fontSize:11, fontWeight:800, color:T.ink }}>{r.name}</p>
                    <p style={{ fontSize:9, color:T.ink3, fontWeight:600 }}>{r.next}</p>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2 }}>
                    <p style={{ fontSize:10, fontWeight:800, color:T.ink, ...NUM }}>{r.amt}</p>
                    <span style={{
                      display:'inline-flex', alignItems:'center', padding:'2px 6px', borderRadius:100,
                      background: r.done ? T.mintSoft : T.goldSoft,
                    }}>
                      {r.done
                        ? <Check size={9} color="#14806B" strokeWidth={3} />
                        : <Clock size={9} color={T.gold} strokeWidth={2.5} />}
                    </span>
                  </div>
                </div>
              ))}
          </div>

          </div>

          {/* Tab bar */}
          <div style={{
            flexShrink:0,
            display:'flex', justifyContent:'space-around', padding:'6px 0 8px',
            background:'#fff', borderTop:`1px solid ${T.border}`,
          }}>
            {[Home, PieChart, RefreshCw, ClipboardList].map((Icon, i) => (
              <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                <div style={{
                  width:28, height:28, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center',
                  background: active === i ? T.primarySoft : 'transparent',
                }}>
                  <Icon size={14} color={active === i ? T.brand : T.ink3} strokeWidth={2.2} />
                </div>
                <div style={{ width:4, height:4, borderRadius:2, background: active===i ? T.brand : 'transparent' }} />
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
            background: active===i ? '#fff' : 'rgba(255,255,255,.18)',
            color: active===i ? T.brand700 : 'rgba(255,255,255,.7)',
            transition:'all .3s', fontFamily:'inherit',
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
    // Solo ocultar los [data-reveal] cuando JS está activo — sin JS (bots, reader mode) todo queda visible
    document.documentElement.classList.add('lp-js')
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Bolsillo Mágico',
            url: 'https://bolsillomagico.com',
            applicationCategory: 'FinanceApplication',
            operatingSystem: 'Web',
            description: 'App gratuita para controlar tus gastos personales, definir presupuestos, gestionar gastos recurrentes y seguir tus inversiones en dólares.',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'CLP' },
            inLanguage: 'es-CL',
          }),
        }}
      />
      <style>{`
        @keyframes fadeIn  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
        @keyframes slideUp { from{opacity:0;transform:translateY(50px)} to{opacity:1;transform:none} }
        .hero-in   { animation: slideUp .8s cubic-bezier(.22,1,.36,1) both; }
        .hero-in-2 { animation: slideUp .8s .15s cubic-bezier(.22,1,.36,1) both; }
        .hero-in-3 { animation: slideUp .8s .3s  cubic-bezier(.22,1,.36,1) both; }
        .hero-in-4 { animation: slideUp .8s .45s cubic-bezier(.22,1,.36,1) both; }

        .lp-js [data-reveal] {
          opacity:0; transform:translateY(40px);
          transition: opacity .7s ease, transform .7s ease;
        }
        .lp-js [data-reveal].revealed { opacity:1; transform:none; }
        [data-delay="1"] { transition-delay:.1s }
        [data-delay="2"] { transition-delay:.2s }
        [data-delay="3"] { transition-delay:.3s }
        [data-delay="4"] { transition-delay:.4s }

        .btn-primary {
          display:inline-flex; align-items:center; justify-content:center; gap:8px;
          background:#fff; color:${T.brand700}; font-weight:800; font-size:16px;
          padding:16px 36px; border-radius:100px; text-decoration:none;
          box-shadow:0 12px 40px rgba(14,42,82,.25);
          transition:transform .2s, box-shadow .2s;
          font-family:inherit;
        }
        .btn-primary:hover { transform:translateY(-2px); box-shadow:0 18px 48px rgba(14,42,82,.3); }
        .btn-ghost {
          display:inline-flex; align-items:center; justify-content:center;
          color:rgba(255,255,255,.8); font-weight:700; font-size:14px;
          padding:12px 24px; border-radius:100px; text-decoration:none;
          border:1px solid rgba(255,255,255,.3);
          transition:all .2s; font-family:inherit;
        }
        .btn-ghost:hover { background:rgba(255,255,255,.1); color:#fff; }
        .feature-card { box-shadow: 0 8px 18px rgba(14,42,82,.06); }
        .feature-card:hover { transform:translateY(-4px) scale(1.01); }

        /* Desktop overrides */
        @media(min-width:1024px) {
          .hero-layout { flex-direction:row !important; text-align:left !important; padding:100px 80px !important; gap:80px !important; }
          .hero-text { max-width:520px; }
          .hero-subtitle { margin-left:0 !important; margin-right:0 !important; }
          .hero-ctas { justify-content:flex-start !important; }
          .hero-trust { justify-content:flex-start !important; }
          .features-grid { grid-template-columns:repeat(4,1fr) !important; max-width:960px !important; }
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
        background:'rgba(21,83,176,.88)',
        backdropFilter:'blur(20px) saturate(1.5)',
        borderBottom:'1px solid rgba(255,255,255,.08)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, position:'relative', flexShrink:0 }}>
            <Image src="/bolsillo-magico-icono-invertido.svg" alt="logo" fill style={{ objectFit:'contain' }} />
          </div>
          <span className="font-display" style={{ fontWeight:600, fontSize:17, color:'#fff', letterSpacing:'-0.01em' }}>Bolsillo Mágico</span>
        </div>

        <div className="nav-links" style={{ display:'flex', alignItems:'center', gap:32 }}>
          {['Funciones','Cómo funciona'].map(l => (
            <span key={l} style={{ color:'rgba(255,255,255,.7)', fontSize:14, fontWeight:600, cursor:'pointer' }}>{l}</span>
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
          background:T.brand,
          minHeight:'100svh',
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          padding:'90px 24px 60px',
          textAlign:'center',
          position:'relative',
          overflow:'hidden',
        }} className="hero-layout">

          {/* Background orbs */}
          <div style={{ position:'absolute', top:'10%', right:'-10%', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(77,147,255,.4),transparent 70%)', pointerEvents:'none' }} />
          <div style={{ position:'absolute', bottom:'-5%', left:'-10%', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle,rgba(21,83,176,.5),transparent 70%)', pointerEvents:'none' }} />

          {/* Text side */}
          <div className="hero-text">
            <div className="hero-in" style={{
              display:'inline-flex', alignItems:'center', gap:8,
              background:'rgba(255,255,255,.1)',
              border:'1px solid rgba(255,255,255,.2)', borderRadius:100,
              padding:'6px 16px 6px 10px', fontSize:11, fontWeight:800,
              color:'rgba(255,255,255,.9)', letterSpacing:'.06em',
              textTransform:'uppercase', marginBottom:24,
            }}>
              <div style={{ width:20, height:20, position:'relative', flexShrink:0 }}>
                <Image src="/bolsillo-magico-icono-invertido.svg" alt="" fill style={{ objectFit:'contain' }} />
              </div>
              Control de gastos personales
            </div>

            <h1 className="hero-in-2" style={{
              fontSize:'clamp(38px,8vw,60px)', fontWeight:600,
              color:'#fff', lineHeight:1.08, letterSpacing:'-0.02em',
              marginBottom:20,
            }}>
              Tu plata,<br />
              <span style={{ color:'#BDDAFD' }}>
                bajo control.
              </span>
            </h1>

            <p className="hero-in-3 hero-subtitle" style={{
              fontSize:17, color:'rgba(255,255,255,.78)', lineHeight:1.7,
              maxWidth:420, margin:'0 auto 36px', fontWeight:500,
            }}>
              Registra tus gastos en segundos. Analiza en qué va tu plata. Controla suscripciones y cuotas. Todo en un solo lugar.
            </p>

            <div className="hero-in-4 hero-ctas" style={{ display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center', marginBottom:32 }}>
              <Link href="/login" className="btn-primary">
                Empezar gratis <ArrowRight size={17} strokeWidth={2.5} />
              </Link>
              <Link href="/login" className="btn-ghost">
                Ya tengo cuenta
              </Link>
            </div>

            {/* Trust badges */}
            <div className="hero-in-4 hero-trust" style={{ display:'flex', gap:18, justifyContent:'center', flexWrap:'wrap' }}>
              {['Gratis para siempre', 'Sin tarjeta', 'Datos seguros'].map(t => (
                <span key={t} style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, fontWeight:700, color:'rgba(255,255,255,.6)' }}>
                  <CheckCircle2 size={13} strokeWidth={2.5} style={{ flexShrink:0 }} />
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Phone mockup */}
          <div className="hero-in-4" style={{ flexShrink:0, marginTop:48 }}>
            <AppPreview />
          </div>
        </section>

        {/* ══════════ CÓMO FUNCIONA ══════════ */}
        <section style={{ background:'#fff', padding:'96px 24px' }}>
          <div className="section-inner">
            <div data-reveal style={{ textAlign:'center', marginBottom:56 }}>
              <p style={{ fontSize:11, fontWeight:800, letterSpacing:'.1em', color:T.brand, textTransform:'uppercase', marginBottom:12 }}>
                tan fácil como parece
              </p>
              <h2 style={{ fontSize:'clamp(28px,5vw,42px)', fontWeight:600, color:T.ink, lineHeight:1.1, letterSpacing:'-0.02em' }}>
                En 3 pasos y ya
              </h2>
            </div>

            <div className="how-grid" style={{ display:'grid', gridTemplateColumns:'1fr', gap:24 }}>
              {[
                {
                  n:'01', icon:Mail,
                  title:'Crea tu cuenta',
                  desc:'Solo tu email. Sin tarjeta, sin trucos. En 30 segundos ya estás adentro.',
                  color:T.brand, bg:T.primarySoft,
                },
                {
                  n:'02', icon:Zap,
                  title:'Registra un gasto',
                  desc:'Monto, categoría, listo. Más rápido que sacar la billetera.',
                  color:T.mint, bg:T.mintSoft,
                },
                {
                  n:'03', icon:BarChart3,
                  title:'Entiende tu plata',
                  desc:'Gráficos, análisis por categoría y comparación mensual automática.',
                  color:T.violet, bg:T.violetSoft,
                },
              ].map((step, i) => (
                <div
                  key={i}
                  data-reveal data-delay={String(i + 1)}
                  className="feature-card"
                  style={{
                    background:T.bg, border:`1.5px solid ${T.border}`,
                    borderRadius:18, padding:'28px 24px',
                    transition:'transform .25s, box-shadow .25s',
                  }}
                >
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                    <div style={{ width:48, height:48, borderRadius:14, background:step.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <step.icon size={22} color={step.color} strokeWidth={2} />
                    </div>
                    <span style={{ fontSize:13, fontWeight:800, color:step.color, letterSpacing:'.04em', ...NUM }}>{step.n}</span>
                  </div>
                  <h3 style={{ fontSize:19, fontWeight:600, color:T.ink, marginBottom:8 }}>{step.title}</h3>
                  <p style={{ fontSize:14, color:T.ink2, lineHeight:1.65 }}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════ FEATURES ══════════ */}
        <section style={{ background:T.bg, padding:'96px 24px' }}>
          <div className="section-inner">
            <div data-reveal style={{ textAlign:'center', marginBottom:56 }}>
              <p style={{ fontSize:11, fontWeight:800, letterSpacing:'.1em', color:T.brand, textTransform:'uppercase', marginBottom:12 }}>
                todo lo que necesitas
              </p>
              <h2 style={{ fontSize:'clamp(28px,5vw,42px)', fontWeight:600, color:T.ink, lineHeight:1.1, letterSpacing:'-0.02em' }}>
                Diseñado para<br />la vida real
              </h2>
            </div>

            <div className="features-grid" style={{ display:'grid', gridTemplateColumns:'1fr', gap:16, maxWidth:960, margin:'0 auto' }}>
              {[
                { icon:Zap,        title:'Registro instantáneo', desc:'Agrega cualquier gasto en segundos. Sin complicaciones.',     color:T.brand,  bg:T.primarySoft, delay:'1' },
                { icon:BarChart3,  title:'Análisis visual',      desc:'Entiende tus hábitos con gráficos claros por categoría.',      color:T.mint,   bg:T.mintSoft,    delay:'2' },
                { icon:RefreshCw,  title:'Gastos recurrentes',   desc:'Suscripciones y cuotas con registro automático.',              color:T.gold,   bg:T.goldSoft,    delay:'3' },
                { icon:Target,     title:'Presupuesto mensual',  desc:'Define límites y recibe alertas cuando te acercas al tope.',   color:T.coral,  bg:T.coralSoft,   delay:'4' },
                { icon:CreditCard, title:'Múltiples métodos',    desc:'Débito, crédito, efectivo y digital. Todo separado.',          color:T.violet, bg:T.violetSoft,  delay:'1' },
                { icon:TrendingUp, title:'Seguimiento de ingresos', desc:'Registra tus ingresos y compáralos con tus gastos mes a mes.', color:T.mint,   bg:T.mintSoft,    delay:'2' },
                { icon:Wallet,     title:'Inversiones en dólares', desc:'Billetera USD y acciones: saldo, rendimiento y ganancias realizadas.', color:T.gold, bg:T.goldSoft, delay:'3' },
                { icon:Download,   title:'Exporta tus datos',    desc:'Descarga tus gastos en CSV cuando quieras. Tus datos, tuyos.', color:T.brand,  bg:T.primarySoft, delay:'4' },
              ].map(f => (
                <div
                  key={f.title}
                  data-reveal data-delay={f.delay}
                  className="feature-card"
                  style={{
                    background:'#fff', border:`1.5px solid ${T.border}`, borderRadius:18,
                    padding:'20px', display:'flex', alignItems:'flex-start', gap:14,
                    transition:'transform .25s, box-shadow .25s',
                  }}
                >
                  <div style={{ width:44, height:44, borderRadius:13, background:f.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <f.icon size={20} color={f.color} strokeWidth={2} />
                  </div>
                  <div>
                    <p style={{ fontSize:15, fontWeight:800, color:T.ink, marginBottom:4 }}>{f.title}</p>
                    <p style={{ fontSize:13, color:T.ink2, lineHeight:1.55 }}>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════ CTA FINAL ══════════ */}
        <section style={{
          background:T.brand,
          padding:'100px 24px',
          textAlign:'center',
          position:'relative',
          overflow:'hidden',
        }}>
          <div style={{ position:'absolute', top:'-20%', left:'50%', transform:'translateX(-50%)', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle,rgba(77,147,255,.35),transparent 65%)', pointerEvents:'none' }} />

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
              fontSize:'clamp(32px,7vw,52px)', fontWeight:600, color:'#fff',
              lineHeight:1.08, letterSpacing:'-0.02em', marginBottom:16,
            }}>
              Empieza hoy.<br />
              <span style={{ color:'rgba(255,255,255,.55)' }}>Es gratis.</span>
            </h2>
            <p style={{ fontSize:16, color:'rgba(255,255,255,.7)', marginBottom:40, lineHeight:1.7, fontWeight:500 }}>
              Sin tarjeta. Sin compromisos.<br />Solo tú y tu plata, finalmente bajo control.
            </p>

            <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', marginBottom:20 }}>
              <Link href="/login" className="btn-primary" style={{ fontSize:17, padding:'18px 44px' }}>
                Crear cuenta gratis <ArrowRight size={18} strokeWidth={2.5} />
              </Link>
            </div>
            <Link href="/login" style={{ fontSize:13, color:'rgba(255,255,255,.55)', fontWeight:600, textDecoration:'none' }}>
              ¿Ya tienes cuenta? Inicia sesión
            </Link>
          </div>
        </section>

        {/* ══════════ FOOTER ══════════ */}
        <footer style={{
          background:T.navy, padding:'28px 24px',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          flexWrap:'wrap', gap:12,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:24, height:24, position:'relative' }}>
              <Image src="/bolsillo-magico-icono-invertido.svg" alt="logo" fill style={{ objectFit:'contain' }} />
            </div>
            <span className="font-display" style={{ fontWeight:600, fontSize:14, color:'rgba(255,255,255,.6)' }}>Bolsillo Mágico</span>
          </div>
          <p style={{ fontSize:12, color:'rgba(255,255,255,.3)', fontWeight:600 }}>
            © {new Date().getFullYear()} · Hecho con cariño en Chile
          </p>
        </footer>

      </main>
    </>
  )
}
