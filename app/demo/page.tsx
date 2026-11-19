'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CreditCard, Wallet, Repeat, TrendingUp, Plus, Check, Sparkles, Eye, EyeOff } from 'lucide-react'
import { formatCLP, getNowChile, nextPaydayDate } from '@/lib/utils'
import PayCycleTimeline from '@/components/PayCycleTimeline'

// ── Demo pública (nov 2026) ─────────────────────────────────────────────────
// Rehecha sobre los cuatro pilares de la landing, con los tokens y .card de la
// app real. Todo es ficticio y vive solo en memoria: no hay cuenta, no se
// guarda nada, y recargar vuelve al inicio. Determinista (sin Math.random) y
// con fechas de Santiago, para que lo que muestra no cambie entre toques.

type Tab = 'tarjeta' | 'sueldo' | 'fijos' | 'inversiones'
const TABS: { id: Tab; label: string; Icon: typeof CreditCard }[] = [
  { id: 'tarjeta',     label: 'Tarjeta',     Icon: CreditCard },
  { id: 'sueldo',      label: 'Sueldo',      Icon: Wallet },
  { id: 'fijos',       label: 'Fijos',       Icon: Repeat },
  { id: 'inversiones', label: 'Inversiones', Icon: TrendingUp },
]

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const CLOSING = 20

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

function TarjetaView({ monthName, prevMonthName }: { monthName: string; prevMonthName: string }) {
  const [view, setView]   = useState<'compra' | 'facturacion'>('facturacion')
  const [items, setItems] = useState(SEED)
  const [amount, setAmount] = useState('')
  const [day, setDay]     = useState(21)
  const [lastAdded, setLastAdded] = useState<number | null>(null)

  const thisMonth = items.filter(p => !p.prevMonth)
  const inStatement = items.filter(p => (p.prevMonth ? p.day > CLOSING : p.day <= CLOSING))
  const nextStatement = items.filter(p => !p.prevMonth && p.day > CLOSING)
  const sum = (ps: Purchase[]) => ps.reduce((s, p) => s + p.amount, 0)
  const cupo = 800000
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
    ? [{ title: `Compras de ${monthName}`, items: thisMonth }]
    : [
        { title: `Estado que cierra el ${CLOSING} de ${monthName}`, items: inStatement },
        { title: `Próximo estado (cierra el ${CLOSING} del mes que viene)`, items: nextStatement },
      ]

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold">Visa · Cupo usado</p>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{ color: 'var(--gold-ink)', background: 'color-mix(in srgb, var(--gold) 16%, var(--surface))' }}>
            Cierra el {CLOSING}
          </span>
        </div>
        <p className="text-3xl font-extrabold tabular-nums mt-2" style={{ fontFamily: 'var(--font-fredoka), sans-serif' }}>{formatCLP(used)}</p>
        <div className="h-2 rounded-full overflow-hidden mt-3" style={{ background: 'var(--surface-2)' }}>
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, Math.round((used / cupo) * 100))}%`, background: 'var(--primary)' }} />
        </div>
        <p className="text-xs mt-1.5 tabular-nums" style={{ color: 'var(--ink-3)' }}>de un cupo de {formatCLP(cupo)}</p>
      </div>

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
            <p className="text-sm font-bold">{g.title}</p>
            <p className="text-sm font-bold tabular-nums">{formatCLP(sum(g.items))}</p>
          </div>
          {g.items.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Todavía nada.</p>
          ) : (
            <ul className="space-y-2.5">
              {[...g.items].sort((a, b) => Number(!!b.prevMonth) - Number(!!a.prevMonth) || a.day - b.day).map(p => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="text-sm font-semibold">{p.name}</span>
                    <span className="text-xs ml-2" style={{ color: 'var(--ink-3)' }}>{p.day} de {p.prevMonth ? prevMonthName : monthName}</span>
                    {p.id === lastAdded && (
                      <span className="text-[11px] font-bold ml-2 px-2 py-0.5 rounded-full" style={{ color: 'var(--primary)', background: 'var(--primary-soft)' }}>nueva</span>
                    )}
                  </span>
                  <span className="text-sm font-bold tabular-nums">{formatCLP(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <form onSubmit={add} className="card p-5 space-y-3">
        <p className="text-sm font-bold">Prueba con una compra</p>
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
            className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Después del {CLOSING}, mira cómo salta al próximo estado en la vista por facturación.</p>
      </form>
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
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, Math.round(((gastado + extra) / sueldo) * 100))}%`, background: 'var(--primary)' }} />
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

      <PayCycleTimeline lastPay={lastPay} nextPay={nextPay} today={today} payslipDone paidMonthName={paidMonth} daysToPay={daysToPay} />

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
          <Sparkles className="w-5 h-5 shrink-0" style={{ color: 'var(--primary)' }} aria-hidden />
          <p className="text-sm flex-1">
            <span className="font-bold">Gimnasio {formatCLP(24990)}</span> se repite cada mes cerca del día 5, pero no está entre tus fijos.
          </p>
          <button type="button" onClick={() => setCreated(true)}
            className="min-h-[44px] px-4 rounded-xl text-sm font-bold"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
            Crear recurrente
          </button>
        </div>
      )}
    </div>
  )
}

// ── Inversiones ──────────────────────────────────────────────────────────────
// Patrimonio a fin de cada año (ficticio) y un factor de IPC acumulado para
// llevarlo a pesos de hoy. Valores fijos: la demo no debe cambiar entre toques.
const PATRIMONIO = [
  { y: -4, v: 3200000, ipc: 1.29 },
  { y: -3, v: 4100000, ipc: 1.17 },
  { y: -2, v: 5600000, ipc: 1.09 },
  { y: -1, v: 6900000, ipc: 1.04 },
  { y: 0,  v: 8150000, ipc: 1.0 },
]

function InversionesView() {
  const { year } = getNowChile()
  const [real, setReal] = useState(false)
  const [hidden, setHidden] = useState(false)
  const bars = useMemo(() => PATRIMONIO.map(p => ({ year: year + p.y, v: Math.round(real ? p.v * p.ipc : p.v) })), [real, year])
  const max = Math.max(...bars.map(b => b.v))
  const mask = (s: string) => hidden ? '••••••' : s

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <p className="text-xs font-bold" style={{ color: 'var(--ink-3)' }}>Hoy, en tu lista</p>
        <p className="text-2xl font-semibold mt-1">Hoy no compres nada de tu lista.</p>
        <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          Ninguna se ve como una buena entrada hoy. Tu meta del mes puede esperar en la billetera, sin apuro por forzar una compra.
        </p>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold">Tu patrimonio, año a año</p>
          <button type="button" onClick={() => setHidden(h => !h)} aria-pressed={hidden}
            aria-label={hidden ? 'Mostrar montos' : 'Ocultar montos'}
            className="w-11 h-11 -mr-2 flex items-center justify-center rounded-xl" style={{ color: 'var(--ink-3)' }}>
            {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex items-end gap-3 h-40 mt-4" role="img"
          aria-label={`Patrimonio por año${real ? ' en pesos de hoy' : ''}: ${bars.map(b => `${b.year} ${formatCLP(b.v)}`).join(', ')}`}>
          {bars.map(b => (
            <div key={b.year} className="flex-1 flex flex-col items-center justify-end h-full">
              <div className="w-full rounded-t-xl transition-[height] duration-500" style={{ height: `${Math.round((b.v / max) * 100)}%`, background: 'var(--primary)' }} />
              <span className="text-[11px] mt-1.5 tabular-nums" style={{ color: 'var(--ink-3)' }}>{b.year}</span>
            </div>
          ))}
        </div>
        <p className="text-sm font-bold tabular-nums mt-3">{mask(formatCLP(bars[bars.length - 1].v))} hoy</p>
        <div className="mt-4">
          <Segmented label="Cómo ver los montos" value={real ? 'real' : 'nominal'} onChange={v => setReal(v === 'real')}
            options={[{ id: 'nominal', label: 'Pesos de cada año' }, { id: 'real', label: 'Pesos de hoy' }]} />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--ink-3)' }}>
          En pesos de hoy, los años anteriores se ajustan por inflación (IPC) para comparar de verdad.
        </p>
      </div>
      <p className="text-xs px-1" style={{ color: 'var(--ink-3)' }}>Es una herramienta de seguimiento, no asesoría financiera.</p>
    </div>
  )
}

export default function DemoPage() {
  const [tab, setTab] = useState<Tab>('tarjeta')
  const { month } = getNowChile()
  const monthName = MONTHS[month - 1]
  const prevMonthName = MONTHS[(month + 10) % 12]

  return (
    <div className="min-h-svh" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <header className="sticky top-0 z-40" style={{ background: 'color-mix(in srgb, var(--bg) 90%, transparent)', backdropFilter: 'blur(14px)' }}>
        <div className="mx-auto max-w-xl px-4 h-16 flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-1.5 min-h-[44px] text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
            <ArrowLeft className="w-4 h-4" aria-hidden /> Volver
          </Link>
          <p className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Demo · datos de ejemplo</p>
          <Link href="/#lista" className="inline-flex items-center min-h-[44px] px-3 rounded-xl text-sm font-bold"
                style={{ color: 'var(--primary)', background: 'var(--primary-soft)' }}>
            Pedir acceso
          </Link>
        </div>
        <nav aria-label="Secciones de la demo" className="mx-auto max-w-xl px-4 pb-3">
          <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl" style={{ background: 'var(--surface-2)' }}>
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}
                className="min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-xs font-bold transition-colors"
                style={tab === id
                  ? { background: 'var(--surface)', color: 'var(--primary)', boxShadow: '0 2px 8px var(--shadow)' }
                  : { color: 'var(--ink-2)' }}>
                <Icon className="w-4 h-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-xl px-4 pt-4 pb-16">
        <h1 className="text-2xl font-semibold mb-4">
          {tab === 'tarjeta' ? 'Tu tarjeta, como la ve tu banco'
            : tab === 'sueldo' ? 'Tu sueldo y lo que queda'
            : tab === 'fijos' ? 'Lo fijo que se te olvida'
            : 'Tu plata que crece'}
        </h1>
        {tab === 'tarjeta' && <TarjetaView monthName={monthName} prevMonthName={prevMonthName} />}
        {tab === 'sueldo' && <SueldoView />}
        {tab === 'fijos' && <FijosView />}
        {tab === 'inversiones' && <InversionesView />}

        <div className="mt-10 rounded-3xl p-6 hero-gradient">
          <p className="text-lg font-semibold" style={{ color: '#FFFFFF', fontFamily: 'var(--font-fredoka), sans-serif' }}>¿Te sirve algo así?</p>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.92)' }}>Bolsillo Mágico se comparte por invitación. Pide acceso con tu correo.</p>
          <Link href="/#lista" className="inline-flex items-center mt-4 min-h-[44px] px-5 rounded-xl text-sm font-bold"
                style={{ background: '#FFFFFF', color: '#0E2A52' }}>
            Pedir acceso
          </Link>
        </div>
      </main>
    </div>
  )
}
