import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatCLP } from '@/lib/utils'
import { CalendarDays, TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react'
import IncomeMonthEditor from '@/components/IncomeMonthEditor'
import IncomeEditor from '@/components/IncomeEditor'
import type { BreakdownItem, IncomeData } from '@/components/IncomeMonthEditor'

export const dynamic = 'force-dynamic'

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

/** Mini sparkline SVG de una serie de valores */
function Sparkline({ values, color = '#4D93FF' }: { values: number[]; color?: string }) {
  const w = 80, h = 28, pad = 3
  if (values.length < 2) return <svg width={w} height={h} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const xs = values.map((_, i) => pad + (i / (values.length - 1)) * (w - pad * 2))
  const ys = values.map(v => h - pad - ((v - min) / range) * (h - pad * 2))
  const d  = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline
        points={xs.map((x, i) => `${x},${ys[i]}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Punto final */}
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="2.5" fill={color} />
    </svg>
  )
}

export default async function IngresosPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const now      = new Date()
  const curMonth = now.getMonth() + 1
  const curYear  = now.getFullYear()

  // Generar últimos 12 meses (más reciente primero)
  const periods: { month: number; year: number }[] = []
  for (let i = 0; i < 12; i++) {
    let m = curMonth - i, y = curYear
    if (m <= 0) { m += 12; y -= 1 }
    periods.push({ month: m, year: y })
  }

  const oldest    = periods[periods.length - 1]
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

  // Mapas
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

  // ── KPI ───────────────────────────────────────────────────────────────────
  const curKey  = `${curYear}-${curMonth}`
  const curInc  = incomeMap[curKey] ?? null

  // Mes anterior
  const prevM   = curMonth === 1 ? 12 : curMonth - 1
  const prevY   = curMonth === 1 ? curYear - 1 : curYear
  const prevInc = incomeMap[`${prevY}-${prevM}`] ?? null

  // Promedio 6 meses (excluyendo mes actual)
  const last6 = periods.slice(1, 7).map(p => incomeMap[`${p.year}-${p.month}`]?.amount ?? 0).filter(v => v > 0)
  const avg6  = last6.length > 0 ? Math.round(last6.reduce((s, v) => s + v, 0) / last6.length) : null

  // Variación vs mes anterior
  const varAmt = curInc && prevInc ? curInc.amount - prevInc.amount : null
  const varPct = varAmt !== null && prevInc ? Math.round((varAmt / prevInc.amount) * 100 * 10) / 10 : null

  // Meses sin registrar
  const unregistered = periods.filter(p => !incomeMap[`${p.year}-${p.month}`]).length

  // Serie para sparklines (12 meses, más antiguo primero para el gráfico)
  const sparkSeries = [...periods].reverse().map(p => incomeMap[`${p.year}-${p.month}`]?.amount ?? 0)

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-12">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--ink)' }}>Ingresos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
            Registra tus ingresos mensuales variables y sigue su evolución.
          </p>
        </div>
      </div>

      {/* ── 4 KPI Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">

        {/* Ingreso este mes */}
        <div className="card p-4 lg:p-5 flex flex-col justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
              Ingreso este mes
            </p>
            <p className="text-xl lg:text-2xl font-extrabold tabular-nums mt-1" style={{ color: 'var(--ink)' }}>
              {curInc ? formatCLP(curInc.amount) : '—'}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
              {MONTH_NAMES[curMonth - 1]} {curYear}
            </p>
          </div>
          <Sparkline values={sparkSeries.slice(-6)} color="#4D93FF" />
        </div>

        {/* Promedio 6 meses */}
        <div className="card p-4 lg:p-5 flex flex-col justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
              Promedio 6 meses
            </p>
            <p className="text-xl lg:text-2xl font-extrabold tabular-nums mt-1" style={{ color: 'var(--ink)' }}>
              {avg6 ? formatCLP(avg6) : '—'}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-3)' }}>meses anteriores</p>
          </div>
          {/* Mini barras */}
          <div className="flex items-end gap-0.5 h-7">
            {last6.map((v, i) => {
              const maxV = Math.max(...last6, 1)
              const h = Math.max(3, Math.round((v / maxV) * 24))
              return (
                <div key={i} className="flex-1 rounded-sm" style={{ height: h, background: '#4D93FF', opacity: 0.4 + (i / last6.length) * 0.6 }} />
              )
            })}
          </div>
        </div>

        {/* Variación vs mes anterior */}
        <div className="card p-4 lg:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--ink-3)' }}>
            Variación vs mes anterior
          </p>
          {varPct !== null ? (
            <>
              <div className="flex items-center gap-1.5 mt-1">
                {varPct > 0
                  ? <TrendingUp className="w-4 h-4" style={{ color: '#1FBE8D' }} />
                  : varPct < 0
                  ? <TrendingDown className="w-4 h-4" style={{ color: '#FF6F61' }} />
                  : <Minus className="w-4 h-4" style={{ color: 'var(--ink-3)' }} />
                }
                <p className="text-xl lg:text-2xl font-extrabold tabular-nums"
                  style={{ color: varPct > 0 ? '#1FBE8D' : varPct < 0 ? '#FF6F61' : 'var(--ink)' }}>
                  {varPct > 0 ? '+' : ''}{varPct}%
                </p>
              </div>
              <p className="text-[11px] tabular-nums mt-0.5"
                style={{ color: varAmt! > 0 ? '#1FBE8D' : varAmt! < 0 ? '#FF6F61' : 'var(--ink-3)' }}>
                {varAmt! > 0 ? '+' : ''}{formatCLP(varAmt!)}
              </p>
            </>
          ) : (
            <p className="text-sm font-semibold mt-1" style={{ color: 'var(--ink-3)' }}>Sin datos</p>
          )}
        </div>

        {/* Meses sin registrar */}
        <div className="card p-4 lg:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--ink-3)' }}>
            Meses sin registrar
          </p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xl lg:text-2xl font-extrabold" style={{ color: unregistered > 0 ? '#FFC23C' : '#1FBE8D' }}>
              {unregistered}
            </p>
            {unregistered > 0 && <AlertCircle className="w-4 h-4" style={{ color: '#FFC23C' }} />}
          </div>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-3)' }}>de los últimos 12 meses</p>
        </div>
      </div>

      {/* ── Editor mes actual ──────────────────────────────────────────────── */}
      <div className="card p-5 lg:p-6 mb-6" style={{ border: '1.5px solid var(--primary)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
            Actual
          </span>
          <div className="flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4" style={{ color: 'var(--ink-3)' }} />
            <h2 className="text-lg font-extrabold" style={{ color: 'var(--ink)' }}>
              {MONTH_NAMES[curMonth - 1]} <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>{curYear}</span>
            </h2>
          </div>
        </div>
        <IncomeMonthEditor
          userId={user.id}
          month={curMonth}
          year={curYear}
          current={curInc}
          prevIncome={prevInc}
        />
      </div>

      {/* ── Historial ─────────────────────────────────────────────────────── */}
      <h2 className="text-base font-bold mb-3" style={{ color: 'var(--ink)' }}>Historial de ingresos</h2>
      <div className="card overflow-hidden divide-y" style={{ borderColor: 'var(--border)' }}>
        {periods.slice(1).map(({ month, year }, idx) => {
          const key     = `${year}-${month}`
          const income  = incomeMap[key] ?? null
          const expense = expenseMap[key] ?? 0
          const surplus = income ? income.amount - expense : null
          const isReg   = income !== null

          // Sparkline de 6 puntos alrededor de este mes
          const sparkValues: number[] = []
          for (let i = 5; i >= 0; i--) {
            let m = month - i, y = year
            if (m <= 0) { m += 12; y -= 1 }
            sparkValues.push(incomeMap[`${y}-${m}`]?.amount ?? 0)
          }

          return (
            <div key={key} className="px-4 lg:px-6 py-3.5 flex items-center gap-3 lg:gap-4">

              {/* Ícono + mes */}
              <div className="flex items-center gap-2 w-36 shrink-0">
                <CalendarDays className="w-4 h-4 shrink-0" style={{ color: 'var(--ink-3)' }} />
                <div>
                  <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{MONTH_NAMES[month - 1]}</span>
                  <span className="text-[11px] ml-1.5" style={{ color: 'var(--ink-3)' }}>{year}</span>
                </div>
              </div>

              {/* Badge */}
              <span className="hidden sm:inline text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                style={isReg
                  ? { background: 'rgba(31,190,141,0.12)', color: '#1FBE8D' }
                  : { background: 'rgba(255,194,60,0.15)', color: '#B87A00' }
                }>
                {isReg ? 'Registrado' : 'Sin registrar'}
              </span>

              {/* Monto */}
              <div className="flex-1 min-w-0">
                {income
                  ? <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(income.amount)}</p>
                  : <p className="text-sm" style={{ color: 'var(--ink-3)' }}>—</p>
                }
                {surplus !== null && expense > 0 && (
                  <p className="text-[10px] tabular-nums"
                    style={{ color: surplus >= 0 ? '#1FBE8D' : '#FF6F61' }}>
                    {surplus >= 0 ? 'Ahorro: ' : 'Déficit: '}{formatCLP(Math.abs(surplus))}
                  </p>
                )}
              </div>

              {/* Sparkline */}
              <div className="hidden md:block shrink-0">
                <Sparkline
                  values={sparkValues}
                  color={isReg ? '#1FBE8D' : 'var(--ink-3)'}
                />
              </div>

              {/* Botón editar */}
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
