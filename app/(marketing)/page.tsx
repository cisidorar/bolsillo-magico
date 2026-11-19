import Link from 'next/link'
import { ArrowRight, Sparkles, ShieldCheck, Download, Landmark } from 'lucide-react'
import { formatCLP, getNowChile, nextPaydayDate } from '@/lib/utils'
import StatementDemo from '@/components/landing/StatementDemo'
import WaitlistForm from '@/components/landing/WaitlistForm'
import PayCycleTimeline from '@/components/PayCycleTimeline'

// ── Landing pública (nov 2026) ──────────────────────────────────────────────
// Vuelve a ser pública, con el registro todavía cerrado: el objetivo es que se
// entienda qué hace distinto a Bolsillo Mágico, dejar probarlo en /demo y
// juntar correos en la lista de espera. Nada de cuentas gratis prometidas.
//
// Cuatro pilares, cada uno con un pedazo de interfaz real (mismos tokens y
// .card que la app) y datos ficticios — nunca nombres ni montos reales.
// Server Component: solo la mini-demo y el formulario son clientes.

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/bolsillo-magico-icono.svg" alt="" width={32} height={32} className="rounded-xl" />
      <span className="text-lg font-semibold" style={{ fontFamily: 'var(--font-fredoka), sans-serif', color: 'var(--ink)' }}>
        Bolsillo <span style={{ color: 'var(--primary)' }}>Mágico</span>
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
      <div className={flip ? 'lg:order-1' : ''} aria-hidden={false}>
        {visual}
      </div>
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

  const sueldo = 1450000
  const gastado = 831800

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
            <Link href="/login" className="inline-flex items-center min-h-[44px] px-4 text-sm font-bold rounded-xl" style={{ color: 'var(--primary-text)', background: 'var(--primary-soft)' }}>
              Iniciar sesión
            </Link>
          </div>
        </nav>
      </header>

      <main id="contenido">
        {/* ── Hero ── */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-16 lg:pt-20 lg:pb-24 grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-16 items-center">
          <div>
            <h1 className="font-semibold leading-[1.05] text-balance" style={{ fontSize: 'clamp(2.4rem, 6vw, 4rem)', letterSpacing: '-0.02em', color: 'var(--ink)' }}>
              Sabe cuánto vas a pagar en tu próximo estado de cuenta.
            </h1>
            <p className="mt-5 text-lg leading-relaxed max-w-[52ch]" style={{ color: 'var(--ink-2)' }}>
              Bolsillo Mágico entiende el ciclo de tu tarjeta, tu sueldo de fin de mes y los cobros fijos que se te olvidan. En pesos chilenos, sin redondeos.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/demo" className="cta-primary inline-flex items-center justify-center gap-2 min-h-[52px] px-6 rounded-2xl text-base font-bold transition-transform active:scale-[.98]">
                Probar la demo <ArrowRight className="w-4 h-4" aria-hidden />
              </Link>
              <a href="#lista" className="inline-flex items-center justify-center min-h-[52px] px-6 rounded-2xl text-base font-bold"
                 style={{ color: 'var(--ink)', background: 'var(--surface)' }}>
                Pedir acceso
              </a>
            </div>
            <p className="mt-5 text-sm" style={{ color: 'var(--ink-3)' }}>
              Por ahora se entra por invitación, entre amigos. La demo funciona sin cuenta y con datos de ejemplo.
            </p>
          </div>
          <StatementDemo />
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
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Estado en curso · día 18 de 30</p>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                        style={{ color: 'var(--gold-ink)', background: 'color-mix(in srgb, var(--gold) 16%, var(--surface))' }}>
                    Cierra mañana
                  </span>
                </div>
                <p className="text-3xl font-extrabold tabular-nums" style={{ fontFamily: 'var(--font-fredoka), sans-serif', color: 'var(--ink)' }}>{formatCLP(412380)}</p>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                  <div className="h-full rounded-full" style={{ width: '60%', background: 'var(--primary)' }} />
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
            id="sueldo"
            flip
            title="Tu sueldo, y lo que te queda de él."
            visual={
              <div className="space-y-4">
                <div className="card p-5 lg:p-6">
                  <p className="text-xs font-bold" style={{ color: 'var(--ink-3)' }}>Lo que queda de tu sueldo de {paidMonth}</p>
                  <p className="text-4xl font-extrabold tabular-nums mt-1" style={{ fontFamily: 'var(--font-fredoka), sans-serif', color: 'var(--ink)' }}>
                    {formatCLP(sueldo - gastado)}
                  </p>
                  <div className="h-2 rounded-full overflow-hidden mt-3" style={{ background: 'var(--surface-2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.round((gastado / sueldo) * 100)}%`, background: 'var(--primary)' }} />
                  </div>
                  <p className="text-xs mt-1.5 tabular-nums" style={{ color: 'var(--ink-3)' }}>
                    Llevas gastado {formatCLP(gastado)} de {formatCLP(sueldo)}
                  </p>
                </div>
                <PayCycleTimeline lastPay={lastPay} nextPay={nextPay} today={today} payslipDone paidMonthName={paidMonth} daysToPay={daysToPay} />
              </div>
            }
          >
            <p>Si te pagan a fin de mes, con ese sueldo vives el mes siguiente. Bolsillo Mágico lo cuenta así: te muestra cuánto queda, cuándo llega el próximo pago y qué ya está comprometido con cuotas y cobros fijos.</p>
            <p>Sube tu liquidación en PDF y el ingreso del mes se registra solo.</p>
          </Pillar>

          <Pillar
            id="fijos"
            title="Lo fijo que se te olvida."
            visual={
              <div className="card p-5 lg:p-6">
                <p className="text-sm font-bold mb-3" style={{ color: 'var(--ink)' }}>Recurrentes</p>
                <ul className="space-y-3">
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Spotify</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                            style={{ color: 'var(--gold-ink)', background: 'color-mix(in srgb, var(--gold) 16%, var(--surface))' }}>
                        subió {formatCLP(1000)}
                      </span>
                      <span className="text-sm font-bold tabular-nums">{formatCLP(7390)}</span>
                    </span>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">Plan celular</span>
                    <span className="text-sm font-bold tabular-nums">{formatCLP(15990)}</span>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span>
                      <span className="text-sm font-semibold">Dentista</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--ink-3)' }}>cuota 2 de 4</span>
                    </span>
                    <span className="text-sm font-bold tabular-nums">{formatCLP(45000)}</span>
                  </li>
                </ul>
                <div className="mt-4 rounded-2xl p-3.5 flex items-center gap-3" style={{ background: 'var(--primary-soft)' }}>
                  <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--primary)' }} aria-hidden />
                  <p className="text-sm flex-1" style={{ color: 'var(--ink)' }}>
                    <span className="font-bold">Gimnasio</span> se repite cada mes, cerca del día 5.
                  </p>
                  <span className="text-xs font-bold whitespace-nowrap" style={{ color: 'var(--primary-text)' }}>Crear recurrente</span>
                </div>
              </div>
            }
          >
            <p>Suscripciones, cuotas y cuentas que se registran solas el día que corresponde. Si un cobro sube de precio, te enteras.</p>
            <p>Y si algo se repite cada mes sin que lo hayas marcado como fijo, la app te lo sugiere.</p>
          </Pillar>

          <Pillar
            id="inversiones"
            flip
            title="Tu plata que crece, en simple."
            visual={
              <div className="card p-5 lg:p-6">
                <p className="text-xs font-bold" style={{ color: 'var(--ink-3)' }}>Hoy, en tu lista</p>
                <p className="text-2xl font-semibold mt-1" style={{ color: 'var(--ink)' }}>Hoy no compres nada de tu lista.</p>
                <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                  Ninguna se ve como una buena entrada hoy. Tu meta del mes puede esperar en la billetera.
                </p>
                <div className="grid grid-cols-2 gap-3 mt-5">
                  <div className="rounded-2xl p-3.5" style={{ background: 'var(--surface-2)' }}>
                    <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Billetera</p>
                    <p className="text-base font-bold tabular-nums mt-1">US$1.240,50</p>
                  </div>
                  <div className="rounded-2xl p-3.5" style={{ background: 'var(--surface-2)' }}>
                    <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Depósito a plazo</p>
                    <p className="text-base font-bold tabular-nums mt-1">{formatCLP(2000000)}</p>
                  </div>
                </div>
              </div>
            }
          >
            <p>Acciones y ETFs en dólares, depósitos a plazo con bancos chilenos y tu patrimonio en un solo lugar. Cada día, una lectura en palabras simples: comprar, esperar o vender.</p>
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Es una herramienta de seguimiento, no asesoría financiera.</p>
          </Pillar>
        </div>

        {/* ── Confianza: lo verificable, sin testimonios inventados ── */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-20">
          <h2 className="text-2xl lg:text-3xl font-semibold" style={{ color: 'var(--ink)' }}>Tus datos son tuyos.</h2>
          <ul className="mt-6 grid sm:grid-cols-3 gap-x-10 gap-y-6 max-w-5xl">
            {[
              [Landmark, 'No se conecta a tu banco', 'Registras tú, o importas un CSV. No pedimos claves bancarias.'],
              [ShieldCheck, 'Cada dato es solo tuyo', 'La base de datos separa a cada persona: nadie más puede leer tus gastos.'],
              [Download, 'Te lo llevas cuando quieras', 'Exporta todos tus gastos en CSV en cualquier momento.'],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Landmark
              return (
                <li key={t as string} className="flex gap-3">
                  <I className="w-5 h-5 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} aria-hidden />
                  <span>
                    <span className="block text-base font-bold" style={{ color: 'var(--ink)' }}>{t as string}</span>
                    <span className="block text-sm mt-1 leading-relaxed" style={{ color: 'var(--ink-2)' }}>{d as string}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        {/* ── Lista de espera ── */}
        <section id="lista" className="hero-gradient scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 lg:py-24 grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-3xl lg:text-4xl font-semibold leading-tight text-balance" style={{ color: '#FFFFFF' }}>
                Pide acceso.
              </h2>
              <p className="mt-4 text-lg leading-relaxed max-w-[48ch]" style={{ color: 'rgba(255,255,255,0.92)' }}>
                Bolsillo Mágico se comparte por invitación, de a poco. Deja tu correo y te escribimos si hay un lugar para ti.
              </p>
            </div>
            <WaitlistForm />
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <Wordmark />
        <div className="flex items-center gap-4 text-sm">
          <Link href="/demo" className="min-h-[44px] inline-flex items-center font-semibold" style={{ color: 'var(--ink-2)' }}>Demo</Link>
          <Link href="/login" className="min-h-[44px] inline-flex items-center font-semibold" style={{ color: 'var(--ink-2)' }}>Iniciar sesión</Link>
          <span style={{ color: 'var(--ink-3)' }}>Hecho en Chile · {year}</span>
        </div>
      </footer>
    </div>
  )
}
