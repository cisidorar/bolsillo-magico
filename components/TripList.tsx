import Link from 'next/link'
import { Plane, ArrowRight } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { TRIP_PHASE_LABEL, daysToStart, tripDay, type TripPhase } from '@/lib/shared-split'

export interface TripListRow {
  id:            string
  name:          string
  start:         string | null
  end:           string | null
  phase:         TripPhase
  people:        number
  /** Tu saldo: + te deben, − debes */
  net:           number
  total:         number
  budget:        number
  transferCount: number
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function parts(d: string) {
  const [, m, day] = d.split('-').map(Number)
  return { day, month: MONTHS[m - 1] }
}

function fmtRange(start: string | null, end: string | null): string {
  if (!start) return 'Fechas por definir'
  const a = parts(start)
  if (!end || end === start) return `${a.day} ${a.month}`
  const b = parts(end)
  return a.month === b.month ? `${a.day} al ${b.day} ${b.month}` : `${a.day} ${a.month} al ${b.day} ${b.month}`
}

/** Lo que importa de este viaje hoy, en una frase. */
function headline(r: TripListRow, today: string): string {
  if (r.phase === 'settling') return r.transferCount === 1 ? 'Falta 1 transferencia' : `Faltan ${r.transferCount} transferencias`
  if (r.phase === 'traveling') {
    const t = tripDay(r.start, r.end, today)
    return t ? `Día ${t.day}${t.total ? ` de ${t.total}` : ''}` : 'En viaje'
  }
  if (r.phase === 'planning') {
    const d = daysToStart(r.start, today)
    return d == null ? 'Fechas por definir' : d === 1 ? 'Sale mañana' : `Sale en ${d} días`
  }
  return TRIP_PHASE_LABEL[r.phase]
}

function balanceText(r: TripListRow): { text: string; tone: 'owed' | 'owes' | 'even' } | null {
  if (r.people < 2 || r.total <= 0) return null
  if (r.net > 0) return { text: `Te deben ${formatCLP(r.net)}`, tone: 'owed' }
  if (r.net < 0) return { text: `Debes ${formatCLP(-r.net)}`, tone: 'owes' }
  return { text: 'A mano', tone: 'even' }
}

const people = (n: number) => (n === 1 ? 'Solo tú' : `${n} personas`)

/** El viaje que hoy pide atención: tarjeta grande, azul, entera clicable. */
function Featured({ r, today }: { r: TripListRow; today: string }) {
  const bal = balanceText(r)
  const settle = r.phase === 'settling'
  const toneColor = bal?.tone === 'owed' ? 'var(--mint-on-brand-soft)' : bal?.tone === 'owes' ? 'var(--gold-on-brand)' : '#fff'
  return (
    <Link href={`/compartidos?g=${r.id}`}
      className="hero-gradient group rounded-3xl p-6 lg:p-8 text-white min-h-[220px] lg:min-h-[260px] flex flex-col justify-between gap-8 transition-transform active:scale-[.99]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-2xl lg:text-3xl font-bold leading-tight truncate">{r.name}</p>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,.82)' }}>
            {fmtRange(r.start, r.end)} · {people(r.people)}
          </p>
        </div>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
          style={settle ? { background: 'var(--gold-on-brand)', color: '#3B2A00' } : { background: 'rgba(255,255,255,.18)', color: '#fff' }}>
          {TRIP_PHASE_LABEL[r.phase]}
        </span>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-4xl lg:text-5xl font-extrabold leading-none tracking-tight">{headline(r, today)}</p>
          <p className="text-sm mt-3 tabular-nums" style={{ color: 'rgba(255,255,255,.82)' }}>
            {bal ? (
              <>
                <span className="font-bold" style={{ color: toneColor }}>{bal.text}</span> · {formatCLP(r.total)} en total
              </>
            ) : r.total > 0 ? (
              <>{formatCLP(r.total)} gastados</>
            ) : r.budget > 0 ? (
              <>Presupuesto estimado {formatCLP(r.budget)}</>
            ) : (
              <>Aún sin gastos ni presupuesto</>
            )}
          </p>
        </div>
        <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{ background: 'rgba(255,255,255,.18)' }} aria-hidden>
          <ArrowRight className="w-5 h-5" />
        </span>
      </div>
    </Link>
  )
}

/** Fila compacta: calendario a la izquierda, estado en una línea, saldo a la derecha. */
function Row({ r, today, muted = false }: { r: TripListRow; today: string; muted?: boolean }) {
  const bal = balanceText(r)
  const a = r.start ? parts(r.start) : null
  const needs = r.phase === 'settling'
  return (
    <Link href={`/compartidos?g=${r.id}`}
      className="flex items-center gap-3.5 px-3 py-3 min-h-[64px] rounded-2xl transition-colors hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]">
      <span className="w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0 leading-none"
        style={{ background: muted ? 'var(--surface-2)' : 'var(--primary-soft)', color: muted ? 'var(--ink-3)' : 'var(--primary)' }}>
        {a ? (
          <>
            <span className="text-base font-extrabold tabular-nums">{a.day}</span>
            <span className="text-[10px] font-semibold mt-0.5 capitalize">{a.month}</span>
          </>
        ) : <Plane className="w-5 h-5" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{r.name}</span>
        <span className="block text-xs truncate mt-0.5" style={{ color: needs ? 'var(--gold-ink)' : 'var(--ink-3)' }}>
          <span className={needs ? 'font-semibold' : ''}>{headline(r, today)}</span> · {people(r.people)}
        </span>
      </span>
      {bal ? (
        <span className="text-right flex-shrink-0">
          <span className="block text-sm font-bold tabular-nums"
            style={{ color: bal.tone === 'owed' ? 'var(--mint-ink)' : bal.tone === 'owes' ? 'var(--gold-ink)' : 'var(--ink-2)' }}>
            {bal.tone === 'owed' ? '+' : bal.tone === 'owes' ? '−' : ''}{bal.tone === 'even' ? 'A mano' : formatCLP(Math.abs(r.net))}
          </span>
          <span className="block text-[11px] tabular-nums" style={{ color: 'var(--ink-3)' }}>de {formatCLP(r.total)}</span>
        </span>
      ) : r.total > 0 ? (
        <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink-2)' }}>{formatCLP(r.total)}</span>
      ) : null}
    </Link>
  )
}

export default function TripList({ rows, today }: { rows: TripListRow[]; today: string }) {
  const active = rows.filter(r => r.phase !== 'done' && r.phase !== 'closed')
  const past = rows.filter(r => r.phase === 'done' || r.phase === 'closed')
  const [first, ...rest] = active.length ? active : past.slice(0, 1)
  const others = active.length ? rest : past.slice(1)
  const older = active.length ? past : []

  const side = (
    <>
      {others.length > 0 && (
        <div className="card p-2">
          <h2 className="text-sm font-bold px-3 pt-3 pb-1" style={{ color: 'var(--ink-2)' }}>Otros viajes</h2>
          {others.map(r => <Row key={r.id} r={r} today={today} />)}
        </div>
      )}
      {older.length > 0 && (
        <div className="card p-2">
          <h2 className="text-sm font-bold px-3 pt-3 pb-1" style={{ color: 'var(--ink-2)' }}>Anteriores</h2>
          {older.map(r => <Row key={r.id} r={r} today={today} muted />)}
        </div>
      )}
    </>
  )
  const hasSide = others.length > 0 || older.length > 0

  return first ? (
    <div className={hasSide ? 'lg:grid lg:gap-6 lg:items-start space-y-5 lg:space-y-0' : ''}
      style={hasSide ? { gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)' } : undefined}>
      <Featured r={first} today={today} />
      {hasSide && <div className="space-y-5">{side}</div>}
    </div>
  ) : null
}
