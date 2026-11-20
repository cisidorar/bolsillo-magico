import Link from 'next/link'
import { ArrowRight, ShieldCheck, Download, Landmark, ChevronDown } from 'lucide-react'
import { formatCLP, getNowChile, nextPaydayDate } from '@/lib/utils'
import PayDateDemo from '@/components/landing/PayDateDemo'
import SueldoDemo from '@/components/landing/SueldoDemo'
import FijosDemo from '@/components/landing/FijosDemo'
import PorCobrarDemo from '@/components/landing/PorCobrarDemo'
import MobileCta from '@/components/landing/MobileCta'
import WaitlistForm from '@/components/landing/WaitlistForm'

// ── Landing pública (nov 2026) ──────────────────────────────────────────────
// Vuelve a ser pública, con el registro todavía cerrado: el objetivo es que se
// entienda qué hace distinto a Bolsillo Mágico, dejar probarlo ahí mismo y
// juntar solicitudes de acceso. Nada de cuentas gratis prometidas.
//
// Cada pilar trae un pedazo de interfaz real (mismos tokens y .card que la
// app) con datos ficticios — nunca nombres ni montos reales — y los tres que
// se pueden tocar (hero, sueldo, fijos) responden. Server Component: solo las
// demos, la barra móvil y el formulario son clientes.

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/bolsillo-magico-icono.svg" alt="" width={32} height={32} className="rounded-xl" />
      <span className="text-lg" style={{ fontFamily: 'var(--font-fredoka), sans-serif', color: 'var(--ink)' }}>
        <span style={{ fontWeight: 500 }}>Bolsillo </span><span style={{ fontWeight: 600, color: 'var(--primary-text)' }}>Mágico</span>
      </span>
    </span>
  )
}

function Pillar({ id, title, children, visual, flip }: {
  id: string; title: string; children: React.ReactNode; visual: React.ReactNode; flip?: boolean
}) {
  return (
    <section id={id} className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center scroll-mt-24">
      <div className={flip ? 'lg:order-2' : ''}>
        <h2 className="text-3xl lg:text-4xl font-semibold leading-tight text-balance" style={{ color: 'var(--ink)' }}>{title}</h2>
        <div className="mt-4 space-y-3 text-base leading-relaxed max-w-[60ch]" style={{ color: 'var(--ink-2)' }}>
          {children}
        </div>
      </div>
      <div className={flip ? 'lg:order-1' : ''}>{visual}</div>
    </section>
  )
}

export default function LandingPage() {
  // El ciclo de sueldo se dibuja con fechas de verdad (último día hábil), para
  // que no envejezca; los montos son ficticios.
  const { dateStr: today, year, month } = getNowChile()
  const prevY = month === 1 ? year - 1 : year
  const prevM = month === 1 ? 12 : month - 1
  const lastPay = nextPaydayDate(`${prevY}-${String(prevM).padStart(2, '0')}-01`, null, true)!
  const nextPay = nextPaydayDate(today, null, true)
  const daysToPay = nextPay
    ? Math.round((new Date(nextPay + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86_400_000)
    : null
  const paidMonth = MONTHS[Number(lastPay.slice(5, 7)) - 1]

  const cycle = { lastPay, nextPay, today, payslipDone: true, paidMonthName: paidMonth, daysToPay }

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-3 focus:rounded-xl"
         style={{ background: 'var(--surface)', color: 'var(--ink)' }}>
        Saltar al contenido
      </a>

      {/* ── Nav ── */}
      <header className="sticky top-0 z-40" style={{ background: 'color-mix(in srgb, var(--bg) 88%, transparent)', backdropFilter: 'blur(14px)' }}>
        <nav className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4" aria-label="Principal">
          <Link href="/" aria-label="Bolsillo Mágico, inicio" className="min-h-[44px] inline-flex items-center"><Wordmark /></Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <a href="#pilares" className="hidden sm:inline-flex items-center min-h-[44px] px-3 text-sm font-semibold rounded-xl" style={{ color: 'var(--ink-2)' }}>Qué hace</a>
            <Link href="/demo" className="hidden sm:inline-flex items-center min-h-[44px] px-3 text-sm font-semibold rounded-xl" style={{ color: 'var(--ink-2)' }}>Demo</Link>
            {/* Quien llega desde Google o un link no tiene cuenta: el botón
                destacado es pedir acceso. Entrar queda como enlace (en teléfono
                vive en el pie, no cabe junto al botón). */}
            <Link href="/login" className="hidden sm:inline-flex items-center min-h-[44px] px-3 text-sm font-semibold rounded-xl" style={{ color: 'var(--ink-2)' }}>
              Iniciar sesión
            </Link>
            <a href="#lista" className="cta-primary inline-flex items-center min-h-[44px] px-4 rounded-xl text-sm font-bold transition-transform active:scale-[.98]">
              Pedir acceso
            </a>
          </div>
        </nav>
      </header>

      <main id="contenido">
        {/* ── Hero ──
            En teléfono el orden es título → demo → botones: así lo primero que
            se ve después del título es la fecha de pago, no dos botones. En
            escritorio la demo ocupa la columna derecha. */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 pb-16 lg:pt-20 lg:pb-24 grid lg:grid-cols-[0.85fr_1.15fr] gap-x-14 gap-y-8 lg:items-center">
          <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:self-end">
            <h1 className="lp-hero-in font-semibold leading-[1.05] text-balance" style={{ fontSize: 'clamp(2.3rem, 5.6vw, 3.75rem)', letterSpacing: '-0.02em', color: 'var(--ink)' }}>
              Cada compra con tarjeta, con su fecha de pago.
            </h1>
            <p className="lp-hero-in mt-5 text-lg leading-relaxed max-w-[50ch]" style={{ color: 'var(--ink-2)', ['--i' as string]: 1 }}>
              Tu tarjeta, tus cuotas y tu sueldo, como funcionan en Chile: ves cuándo pagas cada compra y cuánto te queda del mes.
            </p>
            <p className="lp-hero-in mt-4 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--ink-2)', ['--i' as string]: 2 }}>
              <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: 'var(--primary-text)' }} aria-hidden />
              Sin conectar tu banco ni pedir tu clave.
            </p>
          </div>
          <div className="lp-hero-in min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-2" style={{ ['--i' as string]: 2 }}>
            <PayDateDemo />
          </div>
          <div className="lp-hero-in min-w-0 lg:col-start-1 lg:row-start-2 lg:self-start" style={{ ['--i' as string]: 3 }}>
            <div id="hero-actions" className="flex flex-col sm:flex-row gap-3">
              <a href="#lista" className="cta-primary inline-flex items-center justify-center gap-2 min-h-[52px] px-6 rounded-2xl text-base font-bold transition-transform active:scale-[.98]">
                Pedir acceso <ArrowRight className="w-4 h-4" aria-hidden />
              </a>
              <Link href="/demo" className="inline-flex items-center justify-center min-h-[52px] px-6 rounded-2xl text-base font-bold border transition-transform active:scale-[.98]"
                 style={{ color: 'var(--primary-text)', background: 'var(--surface)', borderColor: 'var(--primary-text)', borderWidth: 1.5 }}>
                Probar la demo
              </Link>
            </div>
            <p className="mt-4 text-sm" style={{ color: 'var(--ink-2)' }}>
              Por ahora se entra por invitación, entre amigos. La demo funciona sin cuenta y con datos de ejemplo.
            </p>
          </div>
        </section>

        {/* ── Lo de siempre vs. esto ── */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-20 lg:pb-28">
          <h2 className="text-3xl lg:text-4xl font-semibold leading-tight text-balance max-w-[22ch]" style={{ color: 'var(--ink)' }}>
            Saber cuánto gastaste no alcanza.
          </h2>
          <div className="mt-8 grid lg:grid-cols-[1fr_1.35fr] gap-4 lg:gap-6 items-stretch">
            <div className="rounded-3xl p-6 lg:p-8" style={{ background: 'var(--surface-2)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>Una app de gastos cualquiera</p>
              <p className="text-2xl lg:text-3xl font-semibold mt-3 leading-snug" style={{ color: 'var(--ink-2)' }}>
                Gastaste <span className="tabular-nums">{formatCLP(831800)}</span> este mes.
              </p>
            </div>
            <div className="card p-6 lg:p-8" style={{ boxShadow: '0 18px 40px var(--shadow)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--primary-text)' }}>Bolsillo Mágico</p>
              <p className="text-2xl lg:text-3xl font-semibold mt-3 leading-snug" style={{ color: 'var(--ink)' }}>
                Tu estado cierra en 2 días con <span className="tabular-nums">{formatCLP(412380)}</span>. Del sueldo de {paidMonth} te quedan <span className="tabular-nums">{formatCLP(618200)}</span>.
              </p>
            </div>
          </div>
        </section>

        {/* ── Pilares ── */}
        <div id="pilares" className="mx-auto max-w-6xl px-4 sm:px-6 pb-20 space-y-20 lg:space-y-28 scroll-mt-20">

          <Pillar
            id="tarjeta"
            title="Tu tarjeta, como la ve tu banco."
            visual={
              <div className="card p-5 lg:p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Visa · Cupo usado</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Estado en curso · día 28 de 30</p>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                        style={{ color: 'var(--gold-ink)', background: 'color-mix(in srgb, var(--gold) 16%, var(--surface))' }}>
                    Cierra en 2 días
                  </span>
                </div>
                <p className="text-3xl font-extrabold tabular-nums" style={{ fontFamily: 'var(--font-fredoka), sans-serif', color: 'var(--ink)' }}>{formatCLP(412380)}</p>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                  <div className="lp-fill h-full rounded-full" style={{ width: '60%', background: 'var(--primary)' }} />
                </div>
                <ul className="space-y-2.5 pt-1">
                  {[
                    ['Notebook', 'cuota 3 de 6', 89990],
                    ['Supermercado', 'día 12', 64320],
                    ['Uber', 'día 14', 7840],
                  ].map(([name, sub, amt]) => (
                    <li key={name as string} className="flex items-center justify-between gap-3">
                      <span>
                        <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{name}</span>
                        <span className="text-xs ml-2" style={{ color: 'var(--ink-3)' }}>{sub}</span>
                      </span>
                      <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(amt as number)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            }
          >
            <p>Cada gasto se puede ver en el mes en que compraste o en el estado de cuenta donde va a caer. Las cuotas aparecen en el mes que las pagas, no todas de golpe.</p>
            <p>Sabes cuánto llevas del cupo y cuántos días faltan para el cierre, por tarjeta.</p>
          </Pillar>

          <Pillar
            id="registrar"
            flip
            title="Anotar un gasto toma segundos."
            visual={
              <div className="card p-5 lg:p-6 space-y-4">
                <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Nuevo gasto</p>
                <p className="text-4xl font-extrabold tabular-nums" style={{ fontFamily: 'var(--font-fredoka), sans-serif', color: 'var(--ink)' }}>{formatCLP(18500)}</p>
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>Categoría</p>
                  <div className="flex flex-wrap gap-2">
                    {['Comida', 'Transporte', 'Salud', 'Compras'].map((c, i) => (
                      <span key={c} className="px-3.5 py-2 rounded-xl text-sm font-semibold"
                            style={i === 0 ? { background: 'var(--primary-soft)', color: 'var(--primary-text)' } : { background: 'var(--surface-2)', color: 'var(--ink-2)' }}>{c}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>Pagaste con</p>
                  <div className="flex flex-wrap gap-2">
                    {['Visa', 'Débito', 'Efectivo'].map((c, i) => (
                      <span key={c} className="px-3.5 py-2 rounded-xl text-sm font-semibold"
                            style={i === 0 ? { background: 'var(--primary-soft)', color: 'var(--primary-text)' } : { background: 'var(--surface-2)', color: 'var(--ink-2)' }}>{c}</span>
                    ))}
                  </div>
                </div>
                <p className="text-sm rounded-2xl p-3.5" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
                  La fecha ya viene en hoy, y la app calcula en qué estado de la Visa cae.
                </p>
              </div>
            }
          >
            <p>Un gasto es el monto, la categoría y con qué pagaste. Lo demás lo calcula la app: en qué estado cae y cuándo lo pagas.</p>
            <p>Lo fijo se registra solo, y si ya llevas tus gastos en una planilla, los importas en CSV. Nunca pedimos tu clave del banco.</p>
          </Pillar>

          <Pillar
            id="sueldo"
            title="Tu sueldo, y lo que te queda de él."
            visual={<SueldoDemo cycle={cycle} />}
          >
            <p>Si te pagan a fin de mes, con ese sueldo vives el mes siguiente. Bolsillo Mágico lo cuenta así: te muestra cuánto queda, cuándo llega el próximo pago y qué ya está comprometido con cuotas y cobros fijos.</p>
            <p>Sube tu liquidación en PDF y el ingreso del mes se registra solo.</p>
          </Pillar>

          <Pillar
            id="fijos"
            flip
            title="Lo fijo que se te olvida."
            visual={<FijosDemo />}
          >
            <p>Suscripciones, cuotas y cuentas que se registran solas el día que corresponde. Si un cobro sube de precio, te enteras.</p>
            <p>Y si algo se repite cada mes sin que lo hayas marcado como fijo, la app te lo sugiere.</p>
          </Pillar>

          <Pillar
            id="deben"
            title="Cuando pagas por otros, sabes quién te debe."
            visual={<PorCobrarDemo />}
          >
            <p>Pagas la cena de cuatro con tu tarjeta. Bolsillo Mágico divide el gasto: en tus gastos queda solo tu parte, y tu estado de cuenta sigue mostrando el total que cobra el banco.</p>
            <p>Ves quién te debe, desde cuándo y cuánto, y puedes recordárselo por WhatsApp.</p>
          </Pillar>

          <p className="text-base max-w-[60ch]" style={{ color: 'var(--ink-2)' }}>
            Y si inviertes o arriendas una propiedad, hay módulos opcionales para eso. Es una herramienta de seguimiento, no asesoría financiera.
          </p>
        </div>

        {/* ── Confianza: lo verificable, sin testimonios inventados ── */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-20">
          <div className="card p-6 lg:p-10">
            <h2 className="text-2xl lg:text-3xl font-semibold" style={{ color: 'var(--ink)' }}>Tus datos son tuyos.</h2>
            <ul className="mt-8 grid sm:grid-cols-3 gap-x-10 gap-y-8">
              {[
                [Landmark, 'No se conecta a tu banco', 'Registras tú, o importas un CSV. No pedimos claves bancarias.'],
                [ShieldCheck, 'Cada dato es solo tuyo', 'La base de datos separa a cada persona: nadie más puede leer tus gastos.'],
                [Download, 'Te lo llevas cuando quieras', 'Exporta todos tus gastos en CSV en cualquier momento.'],
              ].map(([Icon, t, d]) => {
                const I = Icon as typeof Landmark
                return (
                  <li key={t as string} className="flex gap-3.5">
                    <I className="w-6 h-6 mt-0.5 shrink-0" style={{ color: 'var(--primary-text)' }} aria-hidden />
                    <span>
                      <span className="block text-lg font-semibold leading-snug" style={{ color: 'var(--ink)' }}>{t as string}</span>
                      <span className="block text-base mt-1.5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>{d as string}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        {/* ── Preguntas: las objeciones de siempre, con respuestas que no maquillan ── */}
        <section className="mx-auto max-w-3xl px-4 sm:px-6 pb-20 lg:pb-28">
          <h2 className="text-3xl lg:text-4xl font-semibold leading-tight text-balance" style={{ color: 'var(--ink)' }}>
            Lo que quizás te estás preguntando.
          </h2>
          <div className="mt-8 space-y-3">
            {[
              ['¿Tengo que anotar todos mis gastos a mano?',
                'Sí: un gasto es el monto, la categoría y con qué pagaste. A cambio, lo fijo se registra solo el día que corresponde, y si ya llevas una planilla la importas en CSV.'],
              ['¿Por qué no se conecta a mi banco?',
                'Para no pedirte nunca tu clave ni depender de una conexión que puede romperse. El costo es que registras tú; lo que ganas es saber, antes de que llegue el estado, cuánto viene y cuándo lo pagas.'],
              ['¿Funciona con mi tarjeta?',
                'Con cualquier tarjeta de crédito: indicas el día en que factura y el día en que vence, y la app calcula en qué estado cae cada compra. También sirve para débito y efectivo.'],
              ['¿Quién puede ver mis datos?',
                'Solo tú. La base de datos separa a cada persona, y puedes exportar todos tus gastos en CSV cuando quieras.'],
              ['¿Es asesoría financiera?',
                'No. Es una herramienta de seguimiento: te muestra lo que ya pasó y lo que viene, no te dice qué hacer con tu plata.'],
              ['¿Cómo entro?',
                'Por invitación, de a poco. Deja tu correo en el formulario de abajo y te escribimos si hay un lugar para ti.'],
            ].map(([q, a]) => (
              <details key={q} className="lp-faq group rounded-2xl" style={{ background: 'var(--surface)' }}>
                <summary className="flex items-center justify-between gap-4 min-h-[56px] px-5 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden text-base font-semibold rounded-2xl"
                  style={{ color: 'var(--ink)' }}>
                  {q}
                  <ChevronDown className="w-5 h-5 shrink-0 transition-transform duration-200 group-open:rotate-180" style={{ color: 'var(--ink-3)' }} aria-hidden />
                </summary>
                <p className="lp-faq-a px-5 pb-5 text-base leading-relaxed max-w-[60ch]" style={{ color: 'var(--ink-2)' }}>{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Pedir acceso ── */}
        <section id="lista" className="hero-gradient scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 lg:py-24 grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-3xl lg:text-4xl font-semibold leading-tight text-balance" style={{ color: '#FFFFFF' }}>
                Pide acceso.
              </h2>
              <p className="mt-4 text-lg leading-relaxed max-w-[48ch]" style={{ color: 'rgba(255,255,255,0.92)' }}>
                Bolsillo Mágico es nuevo y se comparte por invitación, de a poco. Deja tu correo y te escribimos si hay un lugar para ti; lo que nos cuentes cambia lo que sigue.
              </p>
            </div>
            <WaitlistForm />
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 sm:px-6 py-10 pb-28 sm:pb-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <Wordmark />
        <div className="flex items-center gap-4 text-sm">
          <Link href="/demo" className="min-h-[44px] inline-flex items-center font-semibold" style={{ color: 'var(--ink-2)' }}>Demo</Link>
          <Link href="/login" className="min-h-[44px] inline-flex items-center font-semibold" style={{ color: 'var(--ink-2)' }}>Iniciar sesión</Link>
          <span style={{ color: 'var(--ink-3)' }}>Hecho en Chile · {year}</span>
        </div>
      </footer>

      <MobileCta />
    </div>
  )
}
