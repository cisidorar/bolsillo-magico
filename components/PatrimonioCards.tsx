import Link from 'next/link'
import { PiggyBank, ShieldCheck, ArrowRight, CalendarClock } from 'lucide-react'
import { formatCLP } from '@/lib/utils'

export interface RatePoint {
  label: string        // 'ene', 'feb', …
  rate: number | null  // % del ingreso no gastado; null = sin ingreso registrado
}

export interface CommitMonth {
  label: string  // 'ago', 'sep', …
  total: number  // CLP comprometido ese mes
}

interface Props {
  ratePoints: RatePoint[]          // 12 puntos, más antiguo → más reciente
  currentRate: number | null       // % del mes seleccionado
  currentSaved: number | null      // CLP ahorrados (o déficit) del mes seleccionado
  avg6: number | null              // promedio 6 meses completados
  avg12: number | null             // promedio 12 meses completados
  totalSavings: number             // CLP líquidos en cuentas de ahorro
  savingsCount: number             // nº de cuentas de ahorro
  avgMonthlyExpense: number | null // gasto promedio mensual (meses completados)
  monthsCovered: number | null     // totalSavings / avgMonthlyExpense
  monthLabel: string               // 'Julio'
  prevMonthLabel: string           // 'Junio' (el sueldo que financió este mes)
  // F3: deuda comprometida a futuro
  commitMonths: CommitMonth[]      // próximos 6 meses
  commitNext: number               // CLP comprometido el próximo mes
  commitRatio: number | null       // % del ingreso mensual ya comprometido
  cuotasPendingTotal: number       // CLP total de cuotas que faltan por pagar
  fixedMonthlyTotal: number        // CLP mensual en recurrentes indefinidos
  freeMonthLabel: string | null    // primer mes donde baja el compromiso
}

/** Mini gráfico SVG de barras +/- para la tasa de ahorro (12 meses). */
function RateBars({ points }: { points: RatePoint[] }) {
  const W = 264, H = 64, gap = 5
  const n = points.length
  const barW = (W - gap * (n - 1)) / n

  const values = points.map(p => p.rate).filter((r): r is number => r !== null)
  const posMax = Math.max(...values.map(v => Math.max(v, 0)), 10)
  const negMax = Math.max(...values.map(v => Math.max(-v, 0)), 0)
  const usable = H - 14 // deja espacio para labels
  const scale  = usable / (posMax + negMax || 1)
  const baseY  = 2 + posMax * scale

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block" aria-hidden="true">
      {/* Línea base */}
      <line x1={0} y1={baseY} x2={W} y2={baseY} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
      {points.map((p, i) => {
        const x = i * (barW + gap)
        if (p.rate === null) {
          // Mes sin ingreso registrado: marcador tenue en la base
          return <rect key={i} x={x} y={baseY - 2} width={barW} height={2} rx={1} fill="var(--border)" />
        }
        const h = Math.max(Math.abs(p.rate) * scale, 2)
        const y = p.rate >= 0 ? baseY - h : baseY
        return (
          <rect
            key={i}
            x={x} y={y} width={barW} height={h} rx={2}
            fill={p.rate >= 0 ? 'var(--mint)' : 'var(--coral)'}
            opacity={i === points.length - 1 ? 1 : 0.55 + (i / points.length) * 0.4}
          />
        )
      })}
      {/* Labels primer y último mes */}
      <text x={0} y={H - 2} fontSize="9" fontWeight="600" fill="var(--ink-3)">{points[0]?.label}</text>
      <text x={W} y={H - 2} fontSize="9" fontWeight="600" fill="var(--ink-3)" textAnchor="end">{points[points.length - 1]?.label}</text>
    </svg>
  )
}

function fmtMonths(v: number): string {
  return v.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export default function PatrimonioCards({
  ratePoints, currentRate, currentSaved, avg6, avg12,
  totalSavings, savingsCount, avgMonthlyExpense, monthsCovered,
  monthLabel, prevMonthLabel,
  commitMonths, commitNext, commitRatio,
  cuotasPendingTotal, fixedMonthlyTotal, freeMonthLabel,
}: Props) {
  const hasRateData = ratePoints.some(p => p.rate !== null) || currentRate !== null
  const hasSavings  = savingsCount > 0

  // Colores del fondo de emergencia según la regla 3–6 meses
  const coveredColor = monthsCovered === null ? 'var(--ink-3)'
    : monthsCovered >= 3 ? 'var(--mint)'
    : monthsCovered >= 1 ? 'var(--gold)'
    : 'var(--coral)'
  const coveredBg = monthsCovered === null ? 'rgba(148,163,184,0.15)'
    : monthsCovered >= 3 ? 'rgba(31,190,141,0.14)'
    : monthsCovered >= 1 ? 'rgba(255,194,60,0.15)'
    : 'rgba(255,111,97,0.14)'
  const coveredLabel = monthsCovered === null ? null
    : monthsCovered >= 6 ? 'Fondo completo'
    : monthsCovered >= 3 ? 'En zona segura'
    : monthsCovered >= 1 ? 'En construcción'
    : 'Fondo inicial'
  const coveredPct = monthsCovered !== null ? Math.min(monthsCovered / 6, 1) * 100 : 0

  const rateColor = currentRate === null ? 'var(--ink-3)'
    : currentRate >= 0 ? 'var(--mint)' : 'var(--coral)'

  // Semáforo de deuda comprometida (regla ~35% del ingreso)
  const hasCommit = commitMonths.some(m => m.total > 0)
  const ratioColor = commitRatio === null ? 'var(--ink-3)'
    : commitRatio > 35 ? 'var(--coral)'
    : commitRatio >= 20 ? 'var(--gold)'
    : 'var(--mint)'
  const ratioBg = commitRatio === null ? 'rgba(148,163,184,0.15)'
    : commitRatio > 35 ? 'rgba(255,111,97,0.14)'
    : commitRatio >= 20 ? 'rgba(255,194,60,0.15)'
    : 'rgba(31,190,141,0.14)'
  const ratioLabel = commitRatio === null ? null
    : commitRatio > 35 ? 'Compromiso alto'
    : commitRatio >= 20 ? 'Compromiso moderado'
    : 'Compromiso holgado'
  const maxCommit = Math.max(...commitMonths.map(m => m.total), 1)

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Construcción de patrimonio</h2>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">

        {/* ── Card 1: Tasa de ahorro ─────────────────────────────────────── */}
        <div className="card p-4 lg:p-5">
          {/* Header dentro de la card */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(31,190,141,0.15)' }}>
                <PiggyBank className="w-4 h-4" style={{ color: 'var(--mint)' }} />
              </div>
              <div>
                <p className="text-sm font-bold leading-tight" style={{ color: 'var(--ink)' }}>Tasa de ahorro</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-3)' }}>% del ingreso que no gastaste</p>
              </div>
            </div>
            <Link href="/ingresos" className="text-sm font-semibold hover:opacity-70 transition-opacity" style={{ color: 'var(--primary)' }}>
              Ver
            </Link>
          </div>

          {hasRateData ? (
            <>
              {/* Cifra del mes */}
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-extrabold tabular-nums leading-none"
                  style={{ fontFamily: 'Fredoka, sans-serif', color: rateColor }}>
                  {currentRate !== null ? `${currentRate}%` : '—'}
                </p>
                {currentRate !== null && (
                  <span className="text-[11px] font-bold" style={{ color: rateColor }}>
                    {currentRate >= 0 ? 'ahorrado' : 'déficit'} en {monthLabel.toLowerCase()}
                  </span>
                )}
              </div>
              <p className="text-[11px] mt-1 tabular-nums" style={{ color: 'var(--ink-3)' }}>
                {currentSaved !== null
                  ? currentSaved >= 0
                    ? <>Guardaste <span className="font-bold" style={{ color: 'var(--mint)' }}>{formatCLP(currentSaved)}</span> del sueldo de {prevMonthLabel.toLowerCase()}</>
                    : <>Gastaste <span className="font-bold" style={{ color: 'var(--coral)' }}>{formatCLP(Math.abs(currentSaved))}</span> más que el sueldo de {prevMonthLabel.toLowerCase()}</>
                  : `Sin ingreso registrado en ${prevMonthLabel.toLowerCase()}`}
              </p>

              {/* Histórico 12 meses */}
              <div className="mt-4">
                <RateBars points={ratePoints} />
              </div>

              {/* Promedios móviles — filas inset */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Promedio 6m</p>
                  <p className="text-base font-extrabold tabular-nums mt-0.5"
                    style={{ color: avg6 === null ? 'var(--ink-3)' : avg6 >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                    {avg6 !== null ? `${avg6}%` : '—'}
                  </p>
                </div>
                <div className="rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Promedio 12m</p>
                  <p className="text-base font-extrabold tabular-nums mt-0.5"
                    style={{ color: avg12 === null ? 'var(--ink-3)' : avg12 >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                    {avg12 !== null ? `${avg12}%` : '—'}
                  </p>
                </div>
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="rounded-2xl px-4 py-5 text-center" style={{ background: 'var(--surface-2)' }}>
              <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Registra tus ingresos para ver tu tasa de ahorro</p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--ink-3)' }}>
                Es la métrica que mejor predice tu salud financiera a largo plazo.
              </p>
              <Link href="/ingresos"
                className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-xl text-xs font-bold transition-opacity hover:opacity-85"
                style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 8px 18px var(--shadow)' }}>
                Registrar ingresos <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>

        {/* ── Card 2: Fondo de emergencia ────────────────────────────────── */}
        <div className="card p-4 lg:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--primary-soft)' }}>
                <ShieldCheck className="w-4 h-4" style={{ color: 'var(--primary)' }} />
              </div>
              <div>
                <p className="text-sm font-bold leading-tight" style={{ color: 'var(--ink)' }}>Fondo de emergencia</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-3)' }}>Recomendado: 3–6 meses de gasto</p>
              </div>
            </div>
            <Link href="/inversiones?view=ahorro" className="text-sm font-semibold hover:opacity-70 transition-opacity" style={{ color: 'var(--primary)' }}>
              Ver
            </Link>
          </div>

          {hasSavings && monthsCovered !== null ? (
            <>
              {/* Meses cubiertos */}
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-extrabold tabular-nums leading-none"
                  style={{ fontFamily: 'Fredoka, sans-serif', color: coveredColor }}>
                  {fmtMonths(monthsCovered)}
                </p>
                <span className="text-[11px] font-bold" style={{ color: coveredColor }}>
                  {monthsCovered === 1 ? 'mes cubierto' : 'meses cubiertos'}
                </span>
              </div>
              {coveredLabel && (
                <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-[10px] font-bold"
                  style={{ background: coveredBg, color: coveredColor }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: coveredColor }} />
                  {coveredLabel}
                </span>
              )}

              {/* Track 0 → 6 meses con hito en 3 */}
              <div className="mt-4">
                <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                  <div className="absolute inset-y-0 left-0 rounded-full transition-all"
                    style={{ width: `${coveredPct}%`, background: coveredColor }} />
                  {/* Marcador de 3 meses */}
                  <div className="absolute inset-y-0" style={{ left: '50%', width: 2, background: 'var(--surface)', opacity: 0.9 }} />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>0</span>
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>3 meses</span>
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>6 meses</span>
                </div>
              </div>

              {/* Detalle — filas inset */}
              <div className="space-y-2 mt-3">
                <div className="flex items-center justify-between rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
                  <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                    Ahorros líquidos · {savingsCount} cuenta{savingsCount !== 1 ? 's' : ''}
                  </p>
                  <p className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(totalSavings)}</p>
                </div>
                <div className="flex items-center justify-between rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
                  <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Gasto promedio mensual</p>
                  <p className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {avgMonthlyExpense !== null ? formatCLP(avgMonthlyExpense) : '—'}
                  </p>
                </div>
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="rounded-2xl px-4 py-5 text-center" style={{ background: 'var(--surface-2)' }}>
              <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                {hasSavings ? 'Aún no hay gasto promedio para calcular' : 'Registra tus cuentas de ahorro'}
              </p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--ink-3)' }}>
                {hasSavings
                  ? 'Cuando tengas meses completos de gastos, verás cuántos meses cubren tus ahorros.'
                  : 'Sabrás cuántos meses de gasto cubren tus ahorros líquidos: el primer hito antes de invertir.'}
              </p>
              {!hasSavings && (
                <Link href="/inversiones?view=ahorro"
                  className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-xl text-xs font-bold transition-opacity hover:opacity-85"
                  style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 8px 18px var(--shadow)' }}>
                  Agregar cuenta <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )}
        </div>

      </div>

      {/* ── Card 3: Ya comprometido (F3) ──────────────────────────────────── */}
      {hasCommit && (
        <div className="card p-4 lg:p-5 mt-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,194,60,0.15)' }}>
                <CalendarClock className="w-4 h-4" style={{ color: 'var(--gold)' }} />
              </div>
              <div>
                <p className="text-sm font-bold leading-tight" style={{ color: 'var(--ink)' }}>Ya comprometido</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-3)' }}>Cuotas y fijos que ya debes en los próximos meses</p>
              </div>
            </div>
            <Link href="/recurrentes" className="text-sm font-semibold hover:opacity-70 transition-opacity" style={{ color: 'var(--primary)' }}>
              Ver
            </Link>
          </div>

          <div className="lg:grid lg:gap-6 lg:items-start space-y-4 lg:space-y-0" style={{ gridTemplateColumns: '260px 1fr' }}>

            {/* Izquierda: cifra + ratio */}
            <div>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-extrabold tabular-nums leading-none"
                  style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>
                  {formatCLP(commitNext)}
                </p>
              </div>
              <p className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>
                comprometido para {commitMonths[0]?.label} antes de gastar $1
              </p>
              {ratioLabel ? (
                <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-[10px] font-bold"
                  style={{ background: ratioBg, color: ratioColor }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: ratioColor }} />
                  {ratioLabel} · {commitRatio}% del ingreso
                </span>
              ) : (
                <p className="text-[10px] mt-2 font-semibold" style={{ color: 'var(--ink-3)' }}>
                  Registra tu ingreso para ver qué % ya está comprometido
                </p>
              )}

              {/* Desglose — filas inset */}
              <div className="space-y-2 mt-3">
                <div className="flex items-center justify-between rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
                  <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Cuotas pendientes</p>
                  <p className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(cuotasPendingTotal)}</p>
                </div>
                <div className="flex items-center justify-between rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
                  <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Fijos mensuales</p>
                  <p className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(fixedMonthlyTotal)}/mes</p>
                </div>
              </div>
            </div>

            {/* Derecha: barras próximos 6 meses */}
            <div>
              <div className="flex items-end gap-2 lg:gap-3" style={{ height: 120 }}>
                {commitMonths.map((m, i) => {
                  const h = Math.max(Math.round((m.total / maxCommit) * 88), m.total > 0 ? 6 : 2)
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5 min-w-0">
                      <p className="text-[9px] font-bold tabular-nums" style={{ color: 'var(--ink-3)' }}>
                        {m.total > 0 ? `$${Math.round(m.total / 1000)}k` : '—'}
                      </p>
                      <div className="w-full rounded-t-lg transition-all"
                        style={{
                          height: h,
                          background: i === 0 ? 'var(--gold)' : 'rgba(255,194,60,0.35)',
                        }} />
                      <p className="text-[10px] font-semibold capitalize" style={{ color: i === 0 ? 'var(--ink)' : 'var(--ink-3)' }}>
                        {m.label}
                      </p>
                    </div>
                  )
                })}
              </div>
              {freeMonthLabel && (
                <p className="text-[11px] mt-2 font-semibold" style={{ color: 'var(--mint)' }}>
                  En <span className="capitalize">{freeMonthLabel}</span> se te libera plata: terminan cuotas antes de ese mes.
                </p>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
