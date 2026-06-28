import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatCLP } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import IncomeEditor from '@/components/IncomeEditor'

export const dynamic = 'force-dynamic'

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default async function IngresosPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const now      = new Date()
  const curMonth = now.getMonth() + 1
  const curYear  = now.getFullYear()

  // Generar los últimos 12 meses (más reciente primero)
  const periods: { month: number; year: number }[] = []
  for (let i = 0; i < 12; i++) {
    let m = curMonth - i
    let y = curYear
    if (m <= 0) { m += 12; y -= 1 }
    periods.push({ month: m, year: y })
  }

  // Rango de fechas: 12 meses atrás
  const oldest = periods[periods.length - 1]
  const rangeStart = `${oldest.year}-${String(oldest.month).padStart(2, '0')}-01`
  const rangeEnd   = `${curYear}-${String(curMonth).padStart(2, '0')}-31`

  // Fetch ingresos + gastos por mes en paralelo
  const [{ data: incomesRaw }, { data: expensesRaw }] = await Promise.all([
    supabase
      .from('incomes')
      .select('month, year, amount, description')
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

  // Agrupar gastos por (year, month)
  const expenseMap: Record<string, number> = {}
  for (const e of expensesRaw ?? []) {
    const d = new Date(e.date + 'T12:00:00')
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`
    expenseMap[key] = (expenseMap[key] ?? 0) + e.amount
  }

  // Mapa de ingresos
  const incomeMap: Record<string, { amount: number; description: string | null }> = {}
  for (const inc of incomesRaw ?? []) {
    incomeMap[`${inc.year}-${inc.month}`] = { amount: inc.amount, description: inc.description }
  }

  // Totales para el resumen
  const totalIncome  = Object.values(incomeMap).reduce((s, v) => s + v.amount, 0)
  const totalExpense = Object.values(expenseMap).reduce((s, v) => s + v, 0)
  const totalSurplus = totalIncome - totalExpense
  const monthsWithIncome = Object.keys(incomeMap).length

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-12">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--ink)' }}>Ingresos</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
          Registra cuánto ganaste cada mes para calcular tu salud financiera.
        </p>
      </div>

      {/* KPI resumen — solo si hay al menos 1 mes con ingreso */}
      {monthsWithIncome > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--ink-3)' }}>
              Ingresos totales
            </p>
            <p className="text-lg font-extrabold tabular-nums leading-tight" style={{ color: 'var(--ink)' }}>
              {formatCLP(totalIncome)}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-3)' }}>últimos 12 meses</p>
          </div>
          <div className="card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--ink-3)' }}>
              Gastos totales
            </p>
            <p className="text-lg font-extrabold tabular-nums leading-tight" style={{ color: 'var(--ink)' }}>
              {formatCLP(totalExpense)}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-3)' }}>en los mismos meses</p>
          </div>
          <div
            className="card p-4"
            style={totalSurplus > 0
              ? { background: 'rgba(31,190,141,0.08)', border: '1.5px solid rgba(31,190,141,0.2)' }
              : totalSurplus < 0
              ? { background: 'rgba(255,111,97,0.08)', border: '1.5px solid rgba(255,111,97,0.2)' }
              : {}
            }
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--ink-3)' }}>
              {totalSurplus >= 0 ? 'Ahorro neto' : 'Déficit neto'}
            </p>
            <p
              className="text-lg font-extrabold tabular-nums leading-tight"
              style={{ color: totalSurplus > 0 ? '#1FBE8D' : totalSurplus < 0 ? '#FF6F61' : 'var(--ink)' }}
            >
              {formatCLP(Math.abs(totalSurplus))}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
              {monthsWithIncome} {monthsWithIncome === 1 ? 'mes registrado' : 'meses registrados'}
            </p>
          </div>
        </div>
      )}

      {/* Lista de meses */}
      <div className="card overflow-hidden divide-y" style={{ borderColor: 'var(--border)' }}>
        {periods.map(({ month, year }, idx) => {
          const key     = `${year}-${month}`
          const income  = incomeMap[key] ?? null
          const expense = expenseMap[key] ?? 0
          const surplus = income ? income.amount - expense : null
          const isCurrentMonth = month === curMonth && year === curYear

          return (
            <div key={key} className="px-4 py-4 lg:px-6 lg:py-5">
              <div className="flex items-start gap-4">

                {/* Mes + año */}
                <div className="w-28 shrink-0">
                  <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                    {MONTH_NAMES[month - 1]}
                    {year !== curYear && (
                      <span className="text-[10px] font-normal ml-1" style={{ color: 'var(--ink-3)' }}>{year}</span>
                    )}
                  </p>
                  {isCurrentMonth && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                      Este mes
                    </span>
                  )}
                </div>

                {/* Editor de ingreso */}
                <div className="flex-1 min-w-0">
                  <IncomeEditor
                    userId={user.id}
                    month={month}
                    year={year}
                    amount={income?.amount ?? null}
                    description={income?.description ?? null}
                  />
                </div>

                {/* Columna derecha: gasto + diferencia */}
                {expense > 0 && (
                  <div className="shrink-0 text-right hidden sm:block">
                    <p className="text-xs font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>
                      {formatCLP(expense)}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--ink-3)' }}>gasto del mes</p>
                    {surplus !== null && (
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        {surplus > 0
                          ? <TrendingUp className="w-3 h-3" style={{ color: '#1FBE8D' }} />
                          : surplus < 0
                          ? <TrendingDown className="w-3 h-3" style={{ color: '#FF6F61' }} />
                          : <Minus className="w-3 h-3" style={{ color: 'var(--ink-3)' }} />
                        }
                        <span className="text-[10px] font-bold tabular-nums"
                          style={{ color: surplus > 0 ? '#1FBE8D' : surplus < 0 ? '#FF6F61' : 'var(--ink-3)' }}>
                          {surplus > 0 ? '+' : ''}{formatCLP(surplus)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Mobile: gasto + diferencia debajo */}
              {expense > 0 && (
                <div className="flex items-center gap-3 mt-2 sm:hidden">
                  <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>
                    Gasto: <strong className="tabular-nums">{formatCLP(expense)}</strong>
                  </span>
                  {surplus !== null && (
                    <span className="text-[10px] font-bold tabular-nums"
                      style={{ color: surplus > 0 ? '#1FBE8D' : surplus < 0 ? '#FF6F61' : 'var(--ink-3)' }}>
                      {surplus > 0 ? '↑' : '↓'} {formatCLP(Math.abs(surplus))}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

    </div>
  )
}
