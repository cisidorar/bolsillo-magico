import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatCLP, getNowChile } from '@/lib/utils'
import { CalendarDays, TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react'
import IncomeSheet from '@/components/IncomeSheet'
import IncomeEditor from '@/components/IncomeEditor'
import type { BreakdownItem, IncomeData } from '@/components/IncomeMonthEditor'

export const dynamic = 'force-dynamic'

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function Sparkline({ values, positive = true }: { values: number[]; positive?: boolean }) {
  const w = 80, h = 28, pad = 3
  if (values.filter(v => v > 0).length < 2) {
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <line x1={pad} y1={h/2} x2={w-pad} y2={h/2} stroke="var(--border)" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
    )
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const xs = values.map((_, i) => pad + (i / (values.length - 1)) * (w - pad * 2))
  const ys = values.map(v => h - pad - ((v - min) / range) * (h - pad * 2))
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline
        points={xs.map((x, i) => `${x},${ys[i]}`).join(' ')}
        fill="none"
        stroke={positive ? 'var(--mint)' : 'var(--border)'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]} r="2.5" fill={positive ? 'var(--mint)' : 'var(--border)'} />
    </svg>
  )
}

export default async function IngresosPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const { year: curYear, month: curMonth } = getNowChile()

  const periods: { month: number; year: number }[] = []
  for (let i = 0; i < 12; i++) {
    let m = curMonth - i, y = curYear
    if (m <= 0) { m += 12; y -= 1 }
    periods.push({ month: m, year: y })
  }

  const oldest     = periods[periods.length - 1]
  const rangeStart = `${oldest.year}-${String(oldest.month).padStart(2, '0')}-01`
  const rangeEnd   = `${curYear}-${String(curMonth).padStart(2, '0')}-31`

  const [{ data: incomesRaw }, { data: expensesRaw }] = await Promise.all([
    supabase
      .from('incomes')
      .select('month, year, amount, description, breakdown')
      .eq('user_id', user.id)
      .gte('year', oldest.year)
      .order('year', { ascending: false })
      .order('month', { ascending: false }),
    supabase
      .from('expenses')
      .select('amount, date')
      .eq('user_id', user.id)
      .gte('date', rangeStart)
      .lte('date', rangeEnd),
  ])

  const incomeMap: Record<string, IncomeData> = {}
  for (const inc of incomesRaw ?? []) {
    incomeMap[`${inc.year}-${inc.month}`] = {
      amount:      inc.amount,
      description: inc.description ?? null,
      breakdown:   (inc.breakdown as BreakdownItem[]) ?? [],
    }
  }

  const expenseMap: Record<string, number> = {}
  for (const e of expensesRaw ?? []) {
    const d = new Date(e.date + 'T12:00:00')
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`
    expenseMap[key] = (expenseMap[key] ?? 0) + e.amount
  }

  // KPIs
  const curKey  = `${curYear}-${curMonth}`
  const curInc  = incomeMap[curKey] ?? null
  const prevM   = curMonth === 1 ? 12 : curMonth - 1
  const prevY   = curMonth === 1 ? curYear - 1 : curYear
  const prevInc = incomeMap[`${prevY}-${prevM}`] ?? null

  const last6   = periods.slice(1, 7).map(p => incomeMap[`${p.year}-${p.month}`]?.amount ?? 0).filter(v => v > 0)
  const avg6    = last6.length > 0 ? Math.round(last6.reduce((s, v) => s + v, 0) / last6.length) : null

  const varAmt  = curInc && prevInc ? curInc.amount - prevInc.amount : null
  const varPct  = varAmt !== null && prevInc ? Math.round((varAmt / prevInc.amount) * 100 * 10) / 10 : null
  const unregistered = periods.filter(p => !incomeMap[`${p.year}-${p.month}`]).length

  const sparkSeries = [...periods].reverse().map(p => incomeMap[`${p.year}-${p.month}`]?.amount ?? 0)

  // Tasa de ahorro por mes: el sueldo de M-1 financia los gastos de M (convención de la app).
  // Solo meses cerrados con ingreso y gasto — el mes en curso es parcial y engaña.
  const rateFor = (p: { month: number; year: number }): number | null => {
    const pm  = p.month === 1 ? 12 : p.month - 1
    const py  = p.month === 1 ? p.year - 1 : p.year
    const inc = incomeMap[`${py}-${pm}`]?.amount ?? 0
    const exp = expenseMap[`${p.year}-${p.month}`] ?? 0
    if (inc <= 0 || exp <= 0) return null
    return Math.round(((inc - exp) / inc) * 100)
  }
  const closedRates = periods.slice(1, 7).map(rateFor).filter((r): r is number => r !== null)
  const rateAvg6    = closedRates.length > 0 ? Math.round(closedRates.reduce((s, v) => s + v, 0) / closedRates.length) : null
  const rateBars    = [...periods.slice(1, 7)].reverse().map(rateFor)  // viejo → reciente

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-12">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1
            className="text-3xl font-semibold leading-tight"
            style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
          >
            Ingresos
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>
            Registra tus ingresos mensuales variables y sigue su evolución.
          </p>
        </div>
        <IncomeSheet
          userId={user.id}
          month={curMonth}
          year={curYear}
          current={curInc}
          prevIncome={prevInc}
          monthName={MONTH_NAMES[curMonth - 1]}
        />
      </div>

      {/* ── 5 KPI cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">

        {/* Ingreso este mes */}
        <div className="card p-4 lg:p-5 flex flex-col justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>
              Ingreso este mes
            </p>
            <p
              className="text-xl lg:text-2xl font-extrabold tabular-nums leading-tight"
              style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
            >
              {curInc ? formatCLP(curInc.amount) : '—'}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--primary)' }}>
              {MONTH_NAMES[curMonth - 1]} {curYear}
            </p>
          </div>
          <Sparkline values={sparkSeries.slice(-6)} positive={!!curInc} />
        </div>

        {/* Promedio 6 meses */}
        <div className="card p-4 lg:p-5 flex flex-col justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>
              Promedio 6 meses
            </p>
            <p
              className="text-xl lg:text-2xl font-extrabold tabular-nums leading-tight"
              style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
            >
              {avg6 ? formatCLP(avg6) : '—'}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-3)' }}>meses anteriores</p>
          </div>
          <div className="flex items-end gap-0.5 h-7">
            {last6.length > 0 ? last6.map((v, i) => {
              const maxV = Math.max(...last6, 1)
              const h = Math.max(4, Math.round((v / maxV) * 24))
              return <div key={i} className="flex-1 rounded-sm transition-all" style={{ height: h, background: 'var(--primary)', opacity: 0.3 + (i / last6.length) * 0.7 }} />
            }) : (
              <p className="text-[10px]" style={{ color: 'var(--ink-3)' }}>Sin datos</p>
            )}
          </div>
        </div>

        {/* Variación vs mes anterior */}
        <div className="card p-4 lg:p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-3)' }}>
            Variación vs mes anterior
          </p>
          {varPct !== null ? (
            <>
              <div className="flex items-center gap-1.5">
                {varPct > 0
                  ? <TrendingUp className="w-4 h-4" style={{ color: 'var(--mint)' }} />
                  : varPct < 0
                  ? <TrendingDown className="w-4 h-4" style={{ color: 'var(--coral)' }} />
                  : <Minus className="w-4 h-4" style={{ color: 'var(--ink-3)' }} />
                }
                <p
                  className="text-xl lg:text-2xl font-extrabold tabular-nums"
                  style={{
                    fontFamily: 'Fredoka, sans-serif',
                    color: varPct > 0 ? 'var(--mint)' : varPct < 0 ? 'var(--coral)' : 'var(--ink)',
                  }}
                >
                  {varPct > 0 ? '+' : ''}{varPct}%
                </p>
              </div>
              <p className="text-[11px] tabular-nums mt-1 font-semibold"
                style={{ color: varAmt! > 0 ? 'var(--mint)' : varAmt! < 0 ? 'var(--coral)' : 'var(--ink-3)' }}>
                {varAmt! > 0 ? '+' : ''}{formatCLP(varAmt!)}
              </p>
            </>
          ) : (
            <p className="text-sm font-semibold mt-1" style={{ color: 'var(--ink-3)' }}>Sin datos</p>
          )}
        </div>

        {/* Meses sin registrar */}
        <div className="card p-4 lg:p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-3)' }}>
            Meses sin registrar
          </p>
          <div className="flex items-center gap-2">
            <p
              className="text-xl lg:text-2xl font-extrabold"
              style={{
                fontFamily: 'Fredoka, sans-serif',
                color: unregistered > 0 ? 'var(--gold)' : 'var(--mint)',
              }}
            >
              {unregistered}
            </p>
            {unregistered > 0 && <AlertCircle className="w-4 h-4" style={{ color: 'var(--gold)' }} />}
          </div>
          <p className="text-[10px] mt-1" style={{ color: 'var(--ink-3)' }}>de los últimos 12 meses</p>
        </div>

        {/* Tasa de ahorro — misma métrica que /analisis, cerrando el loop del link "Ver" */}
        <div className="card p-4 lg:p-5 col-span-2 lg:col-span-1 flex flex-col justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>
              Tasa de ahorro
            </p>
            <p
              className="text-xl lg:text-2xl font-extrabold tabular-nums leading-tight"
              style={{
                fontFamily: 'Fredoka, sans-serif',
                color: rateAvg6 === null ? 'var(--ink-3)' : rateAvg6 >= 0 ? 'var(--mint)' : 'var(--coral)',
              }}
            >
              {rateAvg6 !== null ? `${rateAvg6}%` : '—'}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
              {rateAvg6 !== null ? 'promedio 6 meses cerrados' : 'registra ingresos y gastos'}
            </p>
          </div>
          <div className="flex items-end gap-0.5 h-7">
            {rateBars.map((r, i) => {
              if (r === null) return <div key={i} className="flex-1 rounded-sm" style={{ height: 3, background: 'var(--border)' }} />
              const maxAbs = Math.max(...rateBars.map(v => Math.abs(v ?? 0)), 10)
              const h = Math.max(4, Math.round((Math.abs(r) / maxAbs) * 24))
              return <div key={i} className="flex-1 rounded-sm transition-all"
                style={{ height: h, background: r >= 0 ? 'var(--mint)' : 'var(--coral)', opacity: 0.4 + (i / rateBars.length) * 0.6 }} />
            })}
          </div>
        </div>
      </div>

      {/* ── Historial ─────────────────────────────────────────────────────── */}
      <h2
        className="text-base font-semibold mb-3"
        style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
      >
        Historial de ingresos
      </h2>

      <div className="card overflow-hidden divide-y" style={{ borderColor: 'var(--border)' }}>
        {periods.slice(1).map(({ month, year }) => {
          const key     = `${year}-${month}`
          const income  = incomeMap[key] ?? null
          const isReg   = income !== null

          // Saldo real: sueldo del mes ANTERIOR financió los gastos de ESTE mes
          const prevM2  = month === 1 ? 12 : month - 1
          const prevY2  = month === 1 ? year - 1 : year
          const prevInc = incomeMap[`${prevY2}-${prevM2}`] ?? null
          const expense = expenseMap[key] ?? 0
          const surplus = prevInc ? prevInc.amount - expense : null

          const sparkValues: number[] = []
          for (let i = 5; i >= 0; i--) {
            let m = month - i, y = year
            if (m <= 0) { m += 12; y -= 1 }
            sparkValues.push(incomeMap[`${y}-${m}`]?.amount ?? 0)
          }

          return (
            <div key={key} className="px-4 lg:px-6 py-4 flex items-center gap-3 lg:gap-5">

              {/* Mes */}
              <div className="flex items-center gap-2 w-32 shrink-0">
                <CalendarDays className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--ink-3)' }} />
                <div>
                  <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{MONTH_NAMES[month - 1]}</span>
                  <span className="text-[11px] ml-1.5" style={{ color: 'var(--ink-3)' }}>{year}</span>
                </div>
              </div>

              {/* Badge */}
              <span
                className="hidden sm:inline text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wide"
                style={isReg
                  ? { background: 'rgba(31,190,141,0.12)', color: 'var(--mint)' }
                  : { background: 'rgba(255,194,60,0.15)', color: 'var(--gold)' }
                }
              >
                {isReg ? 'Registrado' : 'Sin registrar'}
              </span>

              {/* Monto + surplus */}
              <div className="flex-1 min-w-0">
                {income
                  ? <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(income.amount)}</p>
                  : <p className="text-sm" style={{ color: 'var(--ink-3)' }}>—</p>
                }
                {surplus !== null && expense > 0 && prevInc && (
                  <p className="text-[10px] font-semibold tabular-nums mt-0.5"
                    style={{ color: surplus >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                    {surplus >= 0 ? 'Sobró ' : 'Déficit '}{formatCLP(Math.abs(surplus))}
                    {' '}· {surplus >= 0 ? '' : '−'}{Math.abs(Math.round((surplus / prevInc.amount) * 100))}% del sueldo
                  </p>
                )}
              </div>

              {/* Sparkline */}
              <div className="hidden md:block shrink-0">
                <Sparkline values={sparkValues} positive={isReg} />
              </div>

              {/* Botón */}
              <div className="shrink-0">
                <IncomeEditor
                  userId={user.id}
                  month={month}
                  year={year}
                  amount={income?.amount ?? null}
                  description={income?.description ?? null}
                  historyMode
                />
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
