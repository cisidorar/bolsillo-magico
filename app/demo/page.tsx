'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CreditCard, Wallet, Repeat, HandCoins, Plus, Check, Sparkles } from 'lucide-react'
import { formatCLP, getNowChile, nextPaydayDate } from '@/lib/utils'
import PayCycleTimeline from '@/components/PayCycleTimeline'
import WaitlistForm from '@/components/landing/WaitlistForm'
import PorCobrarDemo from '@/components/landing/PorCobrarDemo'

// ── Demo pública (nov 2026) ─────────────────────────────────────────────────
// Rehecha sobre los pilares de la landing (tarjeta, sueldo, fijos y lo que te
// deben; inversiones y propiedad son módulos opcionales y no entran acá), con los tokens y .card de la
// app real. Todo es ficticio y vive solo en memoria: no hay cuenta, no se
// guarda nada, y recargar vuelve al inicio. Determinista (sin Math.random) y
// con fechas de Santiago, para que lo que muestra no cambie entre toques.

type Tab = 'tarjeta' | 'sueldo' | 'fijos' | 'deben'
const TABS: { id: Tab; label: string; Icon: typeof CreditCard }[] = [
  { id: 'tarjeta',     label: 'Tarjeta',     Icon: CreditCard },
  { id: 'sueldo',      label: 'Sueldo',      Icon: Wallet },
  { id: 'fijos',       label: 'Fijos',       Icon: Repeat },
  { id: 'deben',       label: 'Te deben',    Icon: HandCoins },
]

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const CLOSING = 20
const DUE_DAY = 5

function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 p-1 rounded-2xl" style={{ background: 'var(--surface-2)' }}>
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className="flex-1 min-h-[44px] rounded-xl text-sm font-bold transition-colors"
          style={value === o.id
            ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 2px 8px var(--shadow)' }
            : { color: 'var(--ink-2)' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Tarjeta ──────────────────────────────────────────────────────────────────
type Purchase = { id: number; name: string; amount: number; day: number; prevMonth?: boolean }
const SEED: Purchase[] = [
  { id: 1, name: 'Farmacia',     amount: 18990, day: 24, prevMonth: true },
  { id: 2, name: 'Bencina',      amount: 42000, day: 28, prevMonth: true },
  { id: 3, name: 'Supermercado', amount: 64320, day: 3 },
  { id: 4, name: 'Notebook · cuota 3 de 6', amount: 89990, day: 10 },
  { id: 5, name: 'Uber',         amount: 7840,  day: 14 },
  { id: 6, name: 'Restaurant',   amount: 32500, day: 19 },
  { id: 7, name: 'Zapatillas',   amount: 59990, day: 22 },
]

function TarjetaView({ monthName, prevMonthName, nextMonthName, next2MonthName }: {
  monthName: string; prevMonthName: string; nextMonthName: string; next2MonthName: string
}) {
  const [view, setView]   = useState<'compra' | 'facturacion'>('facturacion')
  const [items, setItems] = useState(SEED)
  // Parte con un monto de ejemplo: un toque en + ya muestra la fecha de pago.
  const [amount, setAmount] = useState('25000')
  const [day, setDay]     = useState(21)
  const [lastAdded, setLastAdded] = useState<number | null>(null)

  const thisMonth = items.filter(p => !p.prevMonth)
  const inStatement = items.filter(p => (p.prevMonth ? p.day > CLOSING : p.day <= CLOSING))
  const nextStatement = items.filter(p => !p.prevMonth && p.day > CLOSING)
  const sum = (ps: Purchase[]) => ps.reduce((s, p) => s + p.amount, 0)
  const cupo = 800000
  const added = lastAdded != null ? items.find(p => p.id === lastAdded) : null
  const used = sum(inStatement)

  function add(e: React.FormEvent) {
    e.preventDefault()
    const n = parseInt(amount.replace(/\D/g, ''), 10)
    if (!n) return
    const id = Date.now()
    setItems(prev => [...prev, { id, name: 'Tu compra', amount: n, day }])
    setLastAdded(id); setAmount('')
  }

  const groups = view === 'compra'
    ? [{ title: `Compras de ${monthName}`, due: '', items: thisMonth }]
    : [
        { title: `Estado que cierra el ${CLOSING} de ${monthName}`, due: `La pagas el ${DUE_DAY} de ${nextMonthName}`, items: inStatement },
        { title: `Próximo estado · cierra el ${CLOSING} de ${nextMonthName}`, due: `La pagas el ${DUE_DAY} de ${next2MonthName}`, items: nextStatement },
      ]

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold">Visa · Cupo usado</p>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{ color: 'var(--ink-2)', background: 'var(--surface-2)' }}>
            Factura el {CLOSING} · vence el {DUE_DAY}
          </span>
        </div>
        <p className="text-3xl font-extrabold tabular-nums mt-2" style={{ fontFamily: 'var(--font-fredoka), sans-serif' }}>{formatCLP(used)}</p>
        <div className="h-2 rounded-full overflow-hidden mt-3" style={{ background: 'var(--surface-2)' }}>
          <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${Math.min(100, Math.round((used / cupo) * 100))}%`, background: 'var(--primary)' }} />
        </div>
        <p className="text-xs mt-1.5 tabular-nums" style={{ color: 'var(--ink-3)' }}>de un cupo de {formatCLP(cupo)}</p>
      </div>

      <form onSubmit={add} className="card p-5 space-y-3">
        <p className="text-sm font-bold">Registra una compra</p>
        <div className="flex gap-2">
          <label htmlFor="dm-amount" className="sr-only">Monto</label>
          <input id="dm-amount" inputMode="numeric" placeholder="$25.000"
            value={amount ? Number(amount.replace(/\D/g, '') || 0).toLocaleString('es-CL') : ''}
            onChange={e => setAmount(e.target.value.replace(/\D/g, ''))}
            className="flex-1 min-w-0 min-h-[44px] rounded-xl px-3 text-sm tabular-nums outline-none"
            style={{ background: 'var(--surface-2)', color: 'var(--ink)' }} />
          <label htmlFor="dm-day" className="sr-only">Día de la compra</label>
          <select id="dm-day" value={day} onChange={e => setDay(Number(e.target.value))}
            className="min-h-[44px] rounded-xl px-3 text-sm outline-none"
            style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}>
            {Array.from({ length: 30 }, (_, i) => i + 1).map(d => <option key={d} value={d}>Día {d}</option>)}
          </select>
          <button type="submit" aria-label="Agregar compra"
            className="cta-primary w-11 h-11 shrink-0 rounded-xl flex items-center justify-center transition-transform duration-150 active:scale-[.97]">
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <div aria-live="polite" className="min-h-[2.5rem]">
          {added ? (
            <p key={added.id} className="sd-flip lp-flash text-sm font-semibold rounded-xl px-3 py-2 -mx-3" style={{ color: 'var(--ink)' }}>
              Listo: la pagas el <span style={{ color: 'var(--primary-text)' }}>{DUE_DAY} de {added.day > CLOSING ? next2MonthName : nextMonthName}</span>
              <span className="font-normal" style={{ color: 'var(--ink-2)' }}> · {added.day > CLOSING ? `compraste después del ${CLOSING}, entra al estado siguiente` : `entra al estado que cierra el ${CLOSING}`}.</span>
            </p>
          ) : (
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Monto y día, nada más. Si compras después del {CLOSING}, la pagas un mes más tarde: prueba con el día 21.</p>
          )}
        </div>
      </form>

      <Segmented label="Cómo ver los gastos" value={view} onChange={setView}
        options={[{ id: 'compra', label: 'Por compra' }, { id: 'facturacion', label: 'Por facturación' }]} />
      <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
        {view === 'compra'
          ? `Cada gasto en el mes en que compraste. Las compras de fines de ${prevMonthName} no aparecen acá, aunque las pagues ahora.`
          : `Cada gasto en el estado de cuenta donde cae. Lo que compraste después del ${CLOSING} de ${prevMonthName} se paga en este estado; lo de después del ${CLOSING} de ${monthName}, en el próximo.`}
      </p>

      {groups.map(g => (
        <div key={g.title} className="card p-5">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="text-sm font-bold">{g.title}</p>
              {g.due && <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--primary-text)' }}>{g.due}</p>}
            </div>
            <p className="text-sm font-bold tabular-nums shrink-0">{formatCLP(sum(g.items))}</p>
          </div>
          {g.items.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Todavía nada.</p>
          ) : (
            <ul className="space-y-2.5">
              {[...g.items].sort((a, b) => Number(!!b.prevMonth) - Number(!!a.prevMonth) || a.day - b.day).map(p => (
                <li key={p.id} className={`flex items-center justify-between gap-3${p.id === lastAdded ? ' lp-pop' : ''}`}>
                  <span className="min-w-0">
                    <span className="text-sm font-semibold">{p.name}</span>
                    <span className="text-xs ml-2" style={{ color: 'var(--ink-3)' }}>{p.day} de {p.prevMonth ? prevMonthName : monthName}</span>
                    {p.id === lastAdded && (
                      <span className="text-[11px] font-bold ml-2 px-2 py-0.5 rounded-full" style={{ color: 'var(--primary-text)', background: 'var(--primary-soft)' }}>
                        nueva · la pagas el {DUE_DAY} de {p.day > CLOSING ? next2MonthName : nextMonthName}
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-bold tabular-nums">{formatCLP(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

    </div>
  )
}

// ── Sueldo ───────────────────────────────────────────────────────────────────
function SueldoView() {
  const { dateStr: today, year, month } = getNowChile()
  const prevY = month === 1 ? year - 1 : year
  const prevM = month === 1 ? 12 : month - 1
  const lastPay = nextPaydayDate(`${prevY}-${String(prevM).padStart(2, '0')}-01`, null, true)!
  const nextPay = nextPaydayDate(today, null, true)
  const daysToPay = nextPay ? Math.round((new Date(nextPay + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86_400_000) : null
  const paidMonth = MONTHS[Number(lastPay.slice(5, 7)) - 1]

  const sueldo = 1450000
  const gastado = 831800
  const [extra, setExtra] = useState(0)
  const queda = sueldo - gastado - extra
  const comprometido = [
    ['Notebook · cuotas 4 a 6', 269970],
    ['Dentista · cuotas 3 y 4', 90000],
    ['Cobros fijos de 3 meses', 196140],
  ] as const

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <p className="text-xs font-bold" style={{ color: 'var(--ink-3)' }}>Lo que queda de tu sueldo de {paidMonth}</p>
        <p className="text-4xl font-extrabold tabular-nums mt-1" style={{ fontFamily: 'var(--font-fredoka), sans-serif' }}>
          {queda >= 0 ? formatCLP(queda) : `−${formatCLP(-queda)}`}
        </p>
        <div className="h-2 rounded-full overflow-hidden mt-3" style={{ background: 'var(--surface-2)' }}>
          <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${Math.min(100, Math.round(((gastado + extra) / sueldo) * 100))}%`, background: 'var(--primary)' }} />
        </div>
        <p className="text-xs mt-1.5 tabular-nums" style={{ color: 'var(--ink-3)' }}>
          Llevas gastado {formatCLP(gastado + extra)} de {formatCLP(sueldo)}{queda < 0 && ' · te pasaste'}
        </p>
        <label htmlFor="dm-extra" className="flex items-baseline justify-between mt-5 text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
          <span>¿Y si gastas algo más este mes?</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(extra)}</span>
        </label>
        <input id="dm-extra" type="range" min={0} max={800000} step={10000} value={extra}
          onChange={e => setExtra(Number(e.target.value))} className="w-full h-11 accent-[var(--primary)]" />
      </div>

      <div className="card p-5">
        <p className="text-sm font-bold">Ya comprometido</p>
        <p className="text-xs mt-0.5 mb-3" style={{ color: 'var(--ink-3)' }}>Lo que tus próximos sueldos ya deben, antes de gastar nada.</p>
        <ul className="space-y-2.5">
          {comprometido.map(([n, a]) => (
            <li key={n} className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">{n}</span>
              <span className="text-sm font-bold tabular-nums">{formatCLP(a)}</span>
            </li>
          ))}
        </ul>
      </div>

      <PayCycleTimeline lastPay={lastPay} nextPay={nextPay} today={today} payslipDone paidMonthName={paidMonth} daysToPay={daysToPay} />

    </div>
  )
}

// ── Fijos ────────────────────────────────────────────────────────────────────
function FijosView() {
  const [created, setCreated] = useState(false)
  const base = [
    { name: 'Arriendo',     amount: 520000, day: 5 },
    { name: 'Plan celular', amount: 15990,  day: 8 },
    { name: 'Spotify',      amount: 7390,   day: 12, rose: 1000 },
    { name: 'Dentista · cuota 2 de 4', amount: 45000, day: 15 },
  ]
  const list = created ? [...base, { name: 'Gimnasio', amount: 24990, day: 5, isNew: true }] : base
  const total = list.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-bold">Cobros fijos del mes</p>
          <p className="text-sm font-bold tabular-nums">{formatCLP(total)}</p>
        </div>
        <ul className="space-y-3 mt-4">
          {list.map(r => (
            <li key={r.name} className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="text-sm font-semibold">{r.name}</span>
                <span className="text-xs ml-2" style={{ color: 'var(--ink-3)' }}>día {r.day}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                {'rose' in r && r.rose && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                        style={{ color: 'var(--gold-ink)', background: 'color-mix(in srgb, var(--gold) 16%, var(--surface))' }}>
                    subió {formatCLP(r.rose)}
                  </span>
                )}
                {'isNew' in r && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                        style={{ color: 'var(--mint-ink)', background: 'color-mix(in srgb, var(--mint) 14%, var(--surface))' }}>
                    <Check className="w-3 h-3" aria-hidden /> creado
                  </span>
                )}
                <span className="text-sm font-bold tabular-nums">{formatCLP(r.amount)}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs mt-4" style={{ color: 'var(--ink-3)' }}>Se registran solos el día que corresponde.</p>
      </div>

      {!created && (
        <div className="card p-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <Sparkles className="w-5 h-5 shrink-0" style={{ color: 'var(--primary-text)' }} aria-hidden />
          <p className="text-sm flex-1">
            <span className="font-bold">Gimnasio {formatCLP(24990)}</span> se repite cada mes cerca del día 5, pero no está entre tus fijos.
          </p>
          <button type="button" onClick={() => setCreated(true)}
            className="cta-primary min-h-[44px] px-4 rounded-xl text-sm font-bold">
            Crear recurrente
          </button>
        </div>
      )}
    </div>
  )
}

// ── Te deben ─────────────────────────────────────────────────────────────────
function DebenView() {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
        Pagas con tu tarjeta por otros y la app divide el gasto. Tu estado de cuenta sigue cobrando el total, pero en tus gastos queda solo tu parte.
      </p>
      <PorCobrarDemo />
    </div>
  )
}

export default function DemoPage() {
  const [tab, setTab] = useState<Tab>('tarjeta')
  // Cambiar este número vuelve a montar la pestaña: así "Reiniciar" deja la
  // demo como al llegar, sin recargar la página.
  const [run, setRun] = useState(0)
  const { month } = getNowChile()
  const monthName = MONTHS[month - 1]
  const prevMonthName = MONTHS[(month + 10) % 12]
  const nextMonthName = MONTHS[month % 12]
  const next2MonthName = MONTHS[(month + 1) % 12]

  return (
    <div className="min-h-svh" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <header className="sticky top-0 z-40" style={{ background: 'color-mix(in srgb, var(--bg) 90%, transparent)', backdropFilter: 'blur(14px)' }}>
        <div className="mx-auto max-w-xl px-4 h-16 flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-1.5 min-h-[44px] text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
            <ArrowLeft className="w-4 h-4" aria-hidden /> Volver
          </Link>
          <p className="text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
            <span className="hidden min-[380px]:max-sm:inline">Datos de ejemplo</span><span className="hidden sm:inline">Demo · datos de ejemplo</span>
          </p>
          <a href="#pedir" className="inline-flex items-center min-h-[44px] px-3 rounded-xl text-sm font-bold whitespace-nowrap"
             style={{ color: 'var(--primary-text)', background: 'var(--primary-soft)' }}>
            Pedir acceso
          </a>
        </div>
        <nav aria-label="Secciones de la demo" className="mx-auto max-w-xl px-4 pb-3">
          <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl" style={{ background: 'var(--surface-2)' }}>
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}
                className="min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-xs font-bold transition-colors"
                style={tab === id
                  ? { background: 'var(--surface)', color: 'var(--primary-text)', boxShadow: '0 2px 8px var(--shadow)' }
                  : { color: 'var(--ink-2)' }}>
                <Icon className="w-4 h-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-xl px-4 pt-4 pb-16">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h1 className="text-2xl font-semibold">
            {tab === 'tarjeta' ? 'Cuándo pagas cada compra'
              : tab === 'sueldo' ? 'Tu sueldo y lo que queda'
              : tab === 'fijos' ? 'Lo fijo que se te olvida'
              : 'Lo que te deben tus amigos'}
          </h1>
          <button type="button" onClick={() => setRun(r => r + 1)}
            className="min-h-[44px] px-3 rounded-xl text-xs font-semibold shrink-0" style={{ color: 'var(--ink-2)' }}>
            Reiniciar
          </button>
        </div>
        <div key={`${tab}-${run}`} className="lp-tab">
          {tab === 'tarjeta' && <TarjetaView monthName={monthName} prevMonthName={prevMonthName} nextMonthName={nextMonthName} next2MonthName={next2MonthName} />}
          {tab === 'sueldo' && <SueldoView />}
          {tab === 'fijos' && <FijosView />}
          {tab === 'deben' && <DebenView />}
        </div>

        {/* El formulario vive acá mismo: antes "Pedir acceso" sacaba de la demo. */}
        <div id="pedir" className="mt-10 rounded-3xl p-6 hero-gradient scroll-mt-36">
          <p className="text-lg font-semibold" style={{ color: '#FFFFFF', fontFamily: 'var(--font-fredoka), sans-serif' }}>¿Te serviría algo así?</p>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.92)' }}>Bolsillo Mágico es nuevo y se comparte por invitación, de a poco. Deja tu correo y te escribimos si hay un lugar para ti; lo que nos cuentes cambia lo que sigue.</p>
          <p className="text-sm mt-3 mb-4" style={{ color: 'rgba(255,255,255,0.92)' }}>Registras tú tus gastos, o importas un CSV: no se conecta a tu banco ni te pide la clave.</p>
          <WaitlistForm source="demo" />
        </div>
        <p className="text-sm text-center mt-6" style={{ color: 'var(--ink-2)' }}>
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="font-bold inline-flex items-center min-h-[44px]" style={{ color: 'var(--primary-text)' }}>Inicia sesión</Link>
        </p>
      </main>
    </div>
  )
}
