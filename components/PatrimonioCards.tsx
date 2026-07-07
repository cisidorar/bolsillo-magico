import Link from 'next/link'
import { PiggyBank, ShieldCheck, ArrowRight, CalendarClock, Gem, TrendingUp, Timer, Landmark, DollarSign } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import type { NetWorthResult } from '@/lib/net-worth'

export interface RatePoint {
  label: string        // 'ene', 'feb', …
  rate: number | null  // % del ingreso no gastado; null = sin ingreso registrado
}

export interface CommitMonth {
  label: string  // 'ago', 'sep', …
  fixed: number  // CLP en cuotas + fijos + anuales
  card:  number  // CLP ya cargado a tarjetas de crédito que se factura ese mes
  total: number
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
  // UX: proyección para el mes en curso (la tasa cruda al día 5 es engañosa)
  projectedRate: number | null     // tasa estimada al cierre del mes
  dayOfMonth: number               // día de hoy (contexto del avance)
  isCurrentMonth: boolean          // el mes seleccionado es el mes en curso
  // F3: deuda comprometida a futuro
  commitMonths: CommitMonth[]      // próximos 6 meses
  commitNext: number               // CLP comprometido el próximo mes (fijos + tarjeta)
  commitRatio: number | null       // % del ingreso mensual ya comprometido
  cuotasPendingTotal: number       // CLP total de cuotas que faltan por pagar
  fixedMonthlyTotal: number        // CLP mensual en recurrentes indefinidos
  cardNextTotal: number            // CLP ya cargado a tarjetas que se paga el próximo mes
  freeMonthLabel: string | null    // primer mes donde bajan los fijos
  // F4: patrimonio neto
  netWorth: NetWorthResult | null
}

/** Mini gráfico SVG de barras +/- para la tasa de ahorro, con mes bajo cada barra. */
function RateBars({ points }: { points: RatePoint[] }) {
  // viewBox ancho para que la tipografía NO se agigante al estirarse al contenedor
  const W = 560, H = 86, gap = 8
  const n = points.length
  const barW = (W - gap * (n - 1)) / n

  const values = points.map(p => p.rate).filter((r): r is number => r !== null)
  const posMax = Math.max(...values.map(v => Math.max(v, 0)), 10)
  const negMax = Math.max(...values.map(v => Math.max(-v, 0)), 0)
  const usable = H - 20 // deja espacio para los labels de mes
  const scale  = usable / (posMax + negMax || 1)
  const baseY  = 2 + posMax * scale

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block" aria-hidden="true">
      {/* Línea base */}
      <line x1={0} y1={baseY} x2={W} y2={baseY} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
      {points.map((p, i) => {
        const x = i * (barW + gap)
        const label = (
          <text key={`l${i}`} x={x + barW / 2} y={H - 4} fontSize="9" fontWeight="600"
            fill="var(--ink-3)" textAnchor="middle" style={{ textTransform: 'capitalize' }}>
            {p.label}
          </text>
        )
        if (p.rate === null) {
          // Mes sin ingreso registrado: marcador tenue en la base
          return [
            <rect key={i} x={x} y={baseY - 2} width={barW} height={2} rx={1} fill="var(--border)" />,
            label,
          ]
        }
        const h = Math.max(Math.abs(p.rate) * scale, 2)
        const y = p.rate >= 0 ? baseY - h : baseY
        return [
          <rect
            key={i}
            x={x} y={y} width={barW} height={h} rx={2}
            fill={p.rate >= 0 ? 'var(--mint)' : 'var(--coral)'}
            opacity={i === points.length - 1 ? 1 : 0.55 + (i / points.length) * 0.4}
          />,
          label,
        ]
      })}
    </svg>
  )
}

function fmtMonths(v: number): string {
  return v.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

const MONTH_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

/** Gráfico de área SVG del patrimonio neto (histórico de snapshots). */
function NetWorthChart({ points }: { points: { label: string; total: number }[] }) {
  const W = 560, H = 120, padX = 4, padTop = 10, padBot = 18
  const n = points.length
  if (n < 2) return null
  const totals = points.map(p => p.total)
  const min = Math.min(...totals)
  const max = Math.max(...totals)
  const range = max - min || 1
  const xs = points.map((_, i) => padX + (i / (n - 1)) * (W - padX * 2))
  const ys = totals.map(t => padTop + (1 - (t - min) / range) * (H - padTop - padBot))
  const line = xs.map((x, i) => `${x},${ys[i]}`).join(' ')
  const area = `${padX},${H - padBot} ${line} ${W - padX},${H - padBot}`
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block" aria-hidden="true">
      <polygon points={area} fill="var(--primary)" opacity="0.10" />
      <polyline points={line} fill="none" stroke="var(--primary)" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[n - 1]} cy={ys[n - 1]} r="4" fill="var(--primary)" />
      <circle cx={xs[n - 1]} cy={ys[n - 1]} r="7" fill="var(--primary)" opacity="0.2" />
      <text x={padX} y={H - 4} fontSize="10" fontWeight="600" fill="var(--ink-3)">{points[0].label}</text>
      <text x={W - padX} y={H - 4} fontSize="10" fontWeight="600" fill="var(--ink-3)" textAnchor="end">{points[n - 1].label}</text>
    </svg>
  )
}

export default function PatrimonioCards({
  ratePoints, currentRate, currentSaved, avg6, avg12,
  totalSavings, savingsCount, avgMonthlyExpense, monthsCovered,
  monthLabel, prevMonthLabel,
  projectedRate, dayOfMonth, isCurrentMonth,
  commitMonths, commitNext, commitRatio,
  cuotasPendingTotal, fixedMonthlyTotal, cardNextTotal, freeMonthLabel,
  netWorth,
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

  // Para el mes en curso la cifra principal es la PROYECCIÓN al cierre:
  // al día 5 casi no hay gastos y la tasa cruda (~98%) engaña.
  const displayRate = isCurrentMonth
    ? (projectedRate ?? null)
    : currentRate
  const tooEarly = isCurrentMonth && projectedRate === null
  const rateColor = displayRate === null ? 'var(--ink-3)'
    : displayRate >= 0 ? 'var(--mint)' : 'var(--coral)'

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

  // F4: patrimonio neto
  const nw = netWorth && netWorth.current.total_clp > 0 ? netWorth : null
  const nwPoints = nw
    ? nw.snapshots.slice(-13).map(s => ({ label: MONTH_SHORT[s.month - 1], total: s.total_clp }))
    : []
  const nwPrev = nw && nw.snapshots.length >= 2 ? nw.snapshots[nw.snapshots.length - 2] : null
  const nwDelta = nw && nwPrev ? nw.current.total_clp - nwPrev.total_clp : null
  const nwDeltaPct = nwDelta !== null && nwPrev && nwPrev.total_clp > 0
    ? Math.round((nwDelta / nwPrev.total_clp) * 1000) / 10
    : null
  const nwBreakdown = nw ? [
    { label: 'Acciones',  value: nw.current.stocks_clp,   color: 'var(--primary)', Icon: TrendingUp, href: '/inversiones' },
    { label: 'Depósitos', value: nw.current.deposits_clp, color: 'var(--gold)',    Icon: Timer,      href: '/inversiones?view=depositos' },
    { label: 'Ahorro',    value: nw.current.savings_clp,  color: 'var(--mint)',    Icon: Landmark,   href: '/inversiones?view=ahorro' },
    { label: 'Dólares',   value: nw.current.usd_clp ?? 0, color: '#A78BFA',        Icon: DollarSign, href: '/inversiones?view=ahorro' },
  ].filter(b => b.value > 0) : []

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Construcción de patrimonio</h2>
      </div>

      {/* ── Card 0: Patrimonio neto (F4) ──────────────────────────────────── */}
      {nw && (
        <div className="card p-4 lg:p-5 mb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--primary-soft)' }}>
                <Gem className="w-4 h-4" style={{ color: 'var(--primary)' }} />
              </div>
              <div>
                <p className="text-sm font-bold leading-tight" style={{ color: 'var(--ink)' }}>Patrimonio neto</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-3)' }}>Todo lo que tienes invertido y ahorrado, sumado</p>
              </div>
            </div>
            <Link href="/inversiones" className="text-sm font-semibold hover:opacity-70 transition-opacity" style={{ color: 'var(--primary)' }}>
              Ver
            </Link>
          </div>

          <div className="lg:grid lg:gap-6 lg:items-start space-y-4 lg:space-y-0" style={{ gridTemplateColumns: '260px 1fr' }}>

            {/* Izquierda: total + delta + desglose */}
            <div>
              <p className="text-3xl font-extrabold tabular-nums leading-none"
                style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>
                {formatCLP(nw.current.total_clp)}
              </p>
              {nwDelta !== null ? (
                <p className="text-[11px] mt-1.5 font-semibold tabular-nums"
                  style={{ color: nwDelta >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                  {nwDelta >= 0 ? '+' : '−'}{formatCLP(Math.abs(nwDelta))}
                  {nwDeltaPct !== null && ` (${nwDelta >= 0 ? '+' : ''}${nwDeltaPct}%)`} vs el mes pasado
                </p>
              ) : (
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-3)' }}>
                  Primer registro: desde ahora tu evolución se guarda mes a mes.
                </p>
              )}

              <div className="space-y-2 mt-3">
                {nwBreakdown.map(({ label, value, color, Icon, href }) => (
                  <Link key={label} href={href}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-opacity hover:opacity-80"
                    style={{ background: 'var(--surface-2)' }}>
                    <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface)' }}>
                      <Icon className="w-3.5 h-3.5" style={{ color }} />
                    </div>
                    <p className="text-xs font-semibold flex-1" style={{ color: 'var(--ink-2)' }}>{label}</p>
                    <p className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(value)}</p>
                  </Link>
                ))}
              </div>
              {!nw.stocksPriced && (
                <p className="text-[10px] mt-2" style={{ color: 'var(--ink-3)' }}>
                  Abre Acciones para actualizar precios de mercado; mientras tanto se usa el último valor disponible.
                </p>
              )}
            </div>

            {/* Derecha: evolución */}
            <div>
              {nwPoints.length >= 2 ? (
                <NetWorthChart points={nwPoints} />
              ) : (
                <div className="rounded-2xl px-4 py-6 text-center h-full flex flex-col justify-center" style={{ background: 'var(--surface-2)' }}>
                  <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>Tu gráfico se está construyendo</p>
                  <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--ink-3)' }}>
                    Cada mes guardamos una foto de tu patrimonio. Desde el próximo mes verás aquí la curva de crecimiento.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

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
              {/* Cifra del mes: proyección si el mes va en curso, real si ya cerró */}
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-extrabold tabular-nums leading-none"
                  style={{ fontFamily: 'Fredoka, sans-serif', color: rateColor }}>
                  {displayRate !== null ? `${displayRate}%` : '—'}
                </p>
                {displayRate !== null && (
                  <span className="text-[11px] font-bold" style={{ color: rateColor }}>
                    {isCurrentMonth
                      ? 'proyectado al cierre'
                      : `${displayRate >= 0 ? 'ahorrado' : 'déficit'} en ${monthLabel.toLowerCase()}`}
                  </span>
                )}
              </div>
              {isCurrentMonth ? (
                tooEarly ? (
                  <p className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>
                    Recién empieza {monthLabel.toLowerCase()} (día {dayOfMonth}): con pocos días de gastos
                    todavía no se puede proyectar una tasa confiable.
                  </p>
                ) : (
                  <p className="text-[11px] mt-1 tabular-nums" style={{ color: 'var(--ink-3)' }}>
                    Si sigues gastando a este ritmo, cerrarás {monthLabel.toLowerCase()} ahorrando{' '}
                    <span className="font-bold" style={{ color: rateColor }}>{displayRate}%</span> del sueldo de {prevMonthLabel.toLowerCase()}.
                    {currentRate !== null && (
                      <> Al día {dayOfMonth} llevas {currentRate}% sin gastar — ese número baja solo a medida que avanza el mes.</>
                    )}
                  </p>
                )
              ) : (
                <p className="text-[11px] mt-1 tabular-nums" style={{ color: 'var(--ink-3)' }}>
                  {currentSaved !== null
                    ? currentSaved >= 0
                      ? <>Guardaste <span className="font-bold" style={{ color: 'var(--mint)' }}>{formatCLP(currentSaved)}</span> del sueldo de {prevMonthLabel.toLowerCase()}</>
                      : <>Gastaste <span className="font-bold" style={{ color: 'var(--coral)' }}>{formatCLP(Math.abs(currentSaved))}</span> más que el sueldo de {prevMonthLabel.toLowerCase()}</>
                    : `Sin ingreso registrado en ${prevMonthLabel.toLowerCase()}`}
                </p>
              )}

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
                {/* Próximo hito accionable */}
                {avgMonthlyExpense !== null && monthsCovered < 6 && (() => {
                  const targetMonths = monthsCovered < 3 ? 3 : 6
                  const missing = targetMonths * avgMonthlyExpense - totalSavings
                  if (missing <= 0) return null
                  return (
                    <div className="flex items-center justify-between rounded-2xl px-3 py-2.5"
                      style={{ background: 'rgba(31,190,141,0.08)', border: '1px solid rgba(31,190,141,0.2)' }}>
                      <p className="text-xs font-semibold" style={{ color: 'var(--mint)' }}>
                        Próximo hito: {targetMonths} meses
                      </p>
                      <p className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--mint)' }}>
                        faltan {formatCLP(missing)}
                      </p>
                    </div>
                  )
                })()}
                {avgMonthlyExpense !== null && monthsCovered >= 6 && (
                  <div className="flex items-center justify-between rounded-2xl px-3 py-2.5"
                    style={{ background: 'rgba(31,190,141,0.08)', border: '1px solid rgba(31,190,141,0.2)' }}>
                    <p className="text-xs font-semibold" style={{ color: 'var(--mint)' }}>
                      Meta lograda: tu fondo está completo
                    </p>
                  </div>
                )}
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
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-3)' }}>Cuotas, fijos y compras con tarjeta que ya debes</p>
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
                {cardNextTotal > 0 && (
                  <div className="flex items-center justify-between rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
                    <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                      Tarjeta: ya gastado, se paga en <span className="capitalize">{commitMonths[0]?.label}</span>
                    </p>
                    <p className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--primary)' }}>{formatCLP(cardNextTotal)}</p>
                  </div>
                )}
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

            {/* Derecha: barras apiladas próximos 6 meses (fijos + tarjeta) */}
            <div>
              <div className="flex items-end gap-2 lg:gap-3" style={{ height: 120 }}>
                {commitMonths.map((m, i) => {
                  const hFixed = Math.round((m.fixed / maxCommit) * 88)
                  const hCard  = Math.round((m.card / maxCommit) * 88)
                  // Colores sólidos con alpha en vez de opacity: la opacidad sobre
                  // fondo oscuro ensuciaba el gold (se veía café)
                  const goldBg = i === 0 ? 'var(--gold)'    : 'rgba(255,194,60,0.30)'
                  const cardBg = i === 0 ? 'var(--primary)' : 'rgba(77,147,255,0.30)'
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5 min-w-0">
                      <p className="text-[9px] font-bold tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>
                        {m.total > 0 ? formatCLP(m.total) : ''}
                      </p>
                      <div className="w-full flex flex-col justify-end" style={{ minHeight: 2 }}>
                        {m.card > 0 && (
                          <div className="w-full rounded-t-lg" style={{ height: Math.max(hCard, 4), background: cardBg }} />
                        )}
                        {m.fixed > 0 && (
                          <div className={`w-full ${m.card > 0 ? '' : 'rounded-t-lg'}`}
                            style={{ height: Math.max(hFixed, 4), background: goldBg }} />
                        )}
                        {m.total === 0 && <div className="w-full rounded-t-lg" style={{ height: 2, background: 'var(--border)' }} />}
                      </div>
                      <p className="text-[9px] font-semibold capitalize" style={{ color: i === 0 ? 'var(--ink)' : 'var(--ink-3)' }}>
                        {m.label}
                      </p>
                    </div>
                  )
                })}
              </div>
              {/* Leyenda */}
              <div className="flex items-center gap-4 mt-2">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'var(--gold)' }} /> Cuotas y fijos
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'var(--primary)' }} /> Tarjeta por facturar
                </span>
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
