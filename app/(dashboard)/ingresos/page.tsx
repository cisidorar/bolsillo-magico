import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatCLP, getNowChile } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react'
import LoadErrorNotice from '@/components/LoadErrorNotice'
import IncomeSheet from '@/components/IncomeSheet'
import IncomeHistoryRow from '@/components/IncomeHistoryRow'
import Sparkline from '@/components/Sparkline'
import PayslipUploader from '@/components/PayslipUploader'
import type { BreakdownItem, IncomeData } from '@/components/IncomeMonthEditor'
import type { PayslipData } from '@/components/PayslipDetailSheet'

export const dynamic = 'force-dynamic'

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

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
  // Último día REAL del mes: '2026-11-31' no existe y Postgres rechaza la consulta.
  const lastDay    = new Date(curYear, curMonth, 0).getDate()
  const rangeEnd   = `${curYear}-${String(curMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const [{ data: incomesRaw, error: incomesErr }, { data: expensesRaw, error: expensesErr }, { data: payslipsRaw, error: payslipsErr }] = await Promise.all([
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
    supabase
      .from('payslips')
      .select('month, year, employer_name, employer_rut, position, contract_type, contract_start, days_worked, uf_value, prevision_label, salud_label, haberes_imponibles, haberes_no_imponibles, descuentos_legales, otros_descuentos, total_haberes, total_descuentos, liquido, pdf_path')
      .eq('user_id', user.id)
      .gte('year', oldest.year),
  ])

  const incomeMap: Record<string, IncomeData> = {}
  for (const inc of incomesRaw ?? []) {
    incomeMap[`${inc.year}-${inc.month}`] = {
      amount:      inc.amount,
      description: inc.description ?? null,
      breakdown:   (inc.breakdown as BreakdownItem[]) ?? [],
    }
  }

  const payslipMap: Record<string, PayslipData> = {}
  for (const p of payslipsRaw ?? []) {
    payslipMap[`${p.year}-${p.month}`] = {
      employerName: p.employer_name, employerRut: p.employer_rut,
      position: p.position, contractType: p.contract_type,
      contractStart: p.contract_start, daysWorked: p.days_worked, ufValue: p.uf_value,
      previsionLabel: p.prevision_label, saludLabel: p.salud_label,
      haberesImponibles: p.haberes_imponibles ?? [],
      haberesNoImponibles: p.haberes_no_imponibles ?? [],
      descuentosLegales: p.descuentos_legales ?? [],
      otrosDescuentos: p.otros_descuentos ?? [],
      totalHaberes: p.total_haberes, totalDescuentos: p.total_descuentos, liquido: p.liquido,
      pdfPath: p.pdf_path,
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
  // Solo meses cerrados: el mes en curso puede estar sin registrar sin ser tarde
  // (el sueldo llega a fin de mes). El último cerrado es el único "pronto".
  const missingClosed = periods.slice(1).filter(p => !incomeMap[`${p.year}-${p.month}`]).length
  const prevMissing   = !prevInc

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

  // Si una consulta falló, mostrar "sin ingresos" sería mentir: parece que se
  // perdió el historial. Cada tabla se muestra solo si cargó.
  const loadFailed = incomesErr || payslipsErr
  const expensesFailed = !!expensesErr

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-12">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1
            className="text-3xl font-semibold leading-tight"
            style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
          >
            Ingresos
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
            Tu sueldo de cada mes y cuánto te sobró después de gastar.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PayslipUploader />
          <IncomeSheet
            userId={user.id}
            month={curMonth}
            year={curYear}
            current={curInc}
            prevIncome={prevInc}
            monthName={MONTH_NAMES[curMonth - 1]}
          />
        </div>
      </div>

      {loadFailed ? (
        <LoadErrorNotice what="tus ingresos" />
      ) : (
      <>
      {/* Faltantes: una sola nota, no 11 chips ni un tile de alerta. Solo el
          último mes cerrado cuenta como "pronto" (gold); el resto es historia. */}
      {prevMissing && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={{ color: 'var(--gold-ink)', background: 'color-mix(in srgb, var(--gold) 16%, var(--surface))' }}>
            <AlertCircle className="w-3 h-3" aria-hidden /> Falta el sueldo de {MONTH_NAMES[prevM - 1]}
          </span>
          {missingClosed > 1 && (
            <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
              y {missingClosed - 1} {missingClosed - 1 === 1 ? 'mes más' : 'meses más'} sin registrar en el último año
            </span>
          )}
        </div>
      )}

      {/* ── Cifra principal + 3 apoyos ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">

        {/* Ingreso este mes — el hero */}
        <div className="card p-5 lg:p-6 col-span-2 lg:col-span-2 flex flex-col justify-between gap-4">
          <div>
            <p className="text-xs font-bold mb-1" style={{ color: 'var(--ink-3)' }}>
              Ingreso de {MONTH_NAMES[curMonth - 1]} {curYear}
            </p>
            <p
              className="text-3xl lg:text-4xl font-extrabold tabular-nums leading-tight break-words"
              style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
            >
              {curInc ? formatCLP(curInc.amount) : '—'}
            </p>
            {!curInc && (
              <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
                Aún no lo registras: usa «Registrar» o sube tu liquidación.
              </p>
            )}
          </div>
          <Sparkline values={sparkSeries.slice(-6)} positive={!!curInc} />
        </div>

        {/* Promedio 6 meses */}
        <div className="card p-4 lg:p-5 flex flex-col justify-between gap-3 min-w-0">
          <div>
            <p className="text-[11px] font-bold mb-1" style={{ color: 'var(--ink-3)' }}>
              Promedio 6 meses
            </p>
            <p
              className="text-xl lg:text-2xl font-extrabold tabular-nums leading-tight break-words"
              style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
            >
              {avg6 ? formatCLP(avg6) : '—'}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>sin contar este mes</p>
          </div>
        </div>

        {/* Variación vs mes anterior — neutra: un sueldo que baja no es una alerta de hoy */}
        <div className="card p-4 lg:p-5 min-w-0">
          <p className="text-[11px] font-bold mb-1" style={{ color: 'var(--ink-3)' }}>
            Vs mes anterior
          </p>
          {varPct !== null ? (
            <>
              <div className="flex items-center gap-1.5">
                {varPct > 0
                  ? <TrendingUp className="w-4 h-4" aria-hidden style={{ color: 'var(--mint-ink)' }} />
                  : varPct < 0
                  ? <TrendingDown className="w-4 h-4" aria-hidden style={{ color: 'var(--ink-2)' }} />
                  : <Minus className="w-4 h-4" aria-hidden style={{ color: 'var(--ink-3)' }} />
                }
                <p
                  className="text-xl lg:text-2xl font-extrabold tabular-nums"
                  style={{
                    fontFamily: 'Fredoka, sans-serif',
                    color: varPct > 0 ? 'var(--mint-ink)' : 'var(--ink)',
                  }}
                >
                  {varPct > 0 ? '+' : ''}{varPct}%
                </p>
              </div>
              <p className="text-[11px] tabular-nums mt-1 font-semibold break-words"
                style={{ color: varAmt! > 0 ? 'var(--mint-ink)' : 'var(--ink-2)' }}>
                {varAmt! > 0 ? '+' : ''}{formatCLP(varAmt!)}
              </p>
            </>
          ) : (
            <p className="text-sm font-semibold mt-1" style={{ color: 'var(--ink-3)' }}>Sin datos</p>
          )}
        </div>

        {/* Tasa de ahorro */}
        <div className="card p-4 lg:p-5 col-span-2 lg:col-span-1 flex flex-col justify-between gap-3 min-w-0">
          <div>
            <p className="text-[11px] font-bold mb-1" style={{ color: 'var(--ink-3)' }}>
              Cuánto ahorras
            </p>
            <p
              className="text-xl lg:text-2xl font-extrabold tabular-nums leading-tight"
              style={{
                fontFamily: 'Fredoka, sans-serif',
                color: rateAvg6 === null ? 'var(--ink-3)' : rateAvg6 >= 0 ? 'var(--mint-ink)' : 'var(--ink)',
              }}
            >
              {rateAvg6 !== null ? `${rateAvg6}%` : '—'}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
              {rateAvg6 !== null
                ? 'de cada sueldo, promedio de 6 meses'
                : expensesFailed ? 'no pudimos cargar tus gastos' : 'registra ingresos y gastos'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Historial ─────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-4 lg:px-6 pt-4 pb-3">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Historial de ingresos</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
            «Sobró» es lo que quedó del sueldo del mes anterior después de los gastos de ese mes.
          </p>
        </div>
        <div>
        {periods.map(({ month, year }, idx) => {
          const key     = `${year}-${month}`
          const income  = incomeMap[key] ?? null
          const isCurrent = idx === 0

          // Saldo real: sueldo del mes ANTERIOR financió los gastos de ESTE mes
          const prevM2  = month === 1 ? 12 : month - 1
          const prevY2  = month === 1 ? year - 1 : year
          const prevInc = incomeMap[`${prevY2}-${prevM2}`] ?? null
          const expense = expensesFailed ? 0 : (expenseMap[key] ?? 0)
          const surplus = prevInc ? prevInc.amount - expense : null

          return (
            <IncomeHistoryRow
              key={key}
              userId={user.id}
              month={month}
              year={year}
              monthName={MONTH_NAMES[month - 1]}
              income={income}
              prevIncome={prevInc}
              surplus={surplus}
              expense={expense}
              payslip={payslipMap[key] ?? null}
              isCurrent={isCurrent}
              missingTone={idx === 1 ? 'gold' : 'neutral'}
            />
          )
        })}
        </div>
      </div>
      </>
      )}

    </div>
  )
}
