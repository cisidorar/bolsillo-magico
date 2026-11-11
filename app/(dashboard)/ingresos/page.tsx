import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatCLP, getNowChile, nextPaydayDate, daysBetween } from '@/lib/utils'
import Link from 'next/link'
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react'
import LoadErrorNotice from '@/components/LoadErrorNotice'
import RegisterEntry from '@/components/RegisterEntry'
import PayCycleTimeline from '@/components/PayCycleTimeline'
import IncomeHistoryRow from '@/components/IncomeHistoryRow'
import Sparkline from '@/components/Sparkline'
import type { BreakdownItem, IncomeData } from '@/components/IncomeMonthEditor'
import type { PayslipData } from '@/components/PayslipDetailSheet'

export const dynamic = 'force-dynamic'

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default async function IngresosPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const { year: curYear, month: curMonth, todayDate, dateStr: todayStr } = getNowChile()

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

  // Día de sueldo (Ajustes). Es opcional: sin él solo se omite "próximo sueldo".
  const [{ data: payRow }, { data: lbdRow }] = await Promise.all([
    supabase.from('profiles').select('payday').eq('id', user.id).maybeSingle(),
    supabase.from('profiles').select('payday_last_business_day').eq('id', user.id).maybeSingle(),
  ])
  const payday = (payRow as { payday?: number | null } | null)?.payday ?? null
  const payLbd = (lbdRow as { payday_last_business_day?: boolean } | null)?.payday_last_business_day ?? false
  const nextPay = nextPaydayDate(todayStr, payday, payLbd)
  // Último pago ya ocurrido: el más reciente entre el de este mes y el del anterior.
  const mm = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-01`
  const pmY = curMonth === 1 ? curYear - 1 : curYear
  const pmM = curMonth === 1 ? 12 : curMonth - 1
  const lastPay = [nextPaydayDate(mm(pmY, pmM), payday, payLbd), nextPaydayDate(mm(curYear, curMonth), payday, payLbd)]
    .filter((d): d is string => !!d && d <= todayStr)
    .sort()
    .pop() ?? null
  const daysToPay = nextPay ? daysBetween(todayStr, nextPay) : null

  const expensesFailed = !!expensesErr

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
  // El sueldo llega a fin de mes y la liquidación unos días después, así que el
  // mes en curso casi siempre está vacío: el "último sueldo" es el más reciente
  // que sí está registrado, no el de este mes.
  const keyOf   = (p: { month: number; year: number }) => `${p.year}-${p.month}`
  const curKey  = `${curYear}-${curMonth}`
  const curInc  = incomeMap[curKey] ?? null
  const prevM   = curMonth === 1 ? 12 : curMonth - 1
  const prevY   = curMonth === 1 ? curYear - 1 : curYear
  const prevInc = incomeMap[`${prevY}-${prevM}`] ?? null

  const latestIdx = periods.findIndex(p => incomeMap[keyOf(p)])
  const latest    = latestIdx >= 0 ? periods[latestIdx] : null
  const latestInc = latest ? incomeMap[keyOf(latest)] : null
  const beforeLatest = latestIdx >= 0 && periods[latestIdx + 1] ? periods[latestIdx + 1] : null
  const beforeLatestInc = beforeLatest ? incomeMap[keyOf(beforeLatest)] ?? null : null

  const last6   = periods.map(p => incomeMap[keyOf(p)]?.amount ?? 0).filter(v => v > 0).slice(0, 6)
  const avg6    = last6.length > 0 ? Math.round(last6.reduce((s, v) => s + v, 0) / last6.length) : null

  const varAmt  = latestInc && beforeLatestInc ? latestInc.amount - beforeLatestInc.amount : null
  const varPct  = varAmt !== null && beforeLatestInc ? Math.round((varAmt / beforeLatestInc.amount) * 100 * 10) / 10 : null
  // Solo meses cerrados cuentan como faltantes. Y el último cerrado tiene una
  // semana de gracia: la liquidación llega ~5 días después del pago.
  const missingClosed = periods.slice(1).filter(p => !incomeMap[keyOf(p)]).length
  const prevMissing   = !prevInc
  const overdue       = prevMissing && todayDate > 7
  // Lo que queda del sueldo anterior después de lo gastado en el mes en curso.
  const curExpense = expensesFailed ? null : (expenseMap[curKey] ?? 0)
  const queda = prevInc && curExpense !== null ? prevInc.amount - curExpense : null

  // Solo meses con sueldo registrado: un mes vacío (casi siempre el actual, el
  // sueldo llega a fin de mes) no es un sueldo de $0 y hundía la línea.
  const sparkSeries = [...periods].reverse().map(p => incomeMap[keyOf(p)]?.amount ?? 0).filter(v => v > 0)

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
  // Las liquidaciones son secundarias: si solo fallan ellas, el historial sigue.
  const loadFailed = !!incomesErr
  void payslipsErr
  const existingAmounts: Record<string, number> = {}
  for (const [k, v] of Object.entries(incomeMap)) existingAmounts[k] = v.amount

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
          {/* Una sola puerta: "Registrar" ofrece subir la liquidación primero. Apunta
              al mes que toca: el cerrado si falta, si no el actual. */}
          {!loadFailed && <RegisterEntry
            userId={user.id}
            month={prevMissing ? prevM : curMonth}
            year={prevMissing ? prevY : curYear}
            current={prevMissing ? null : curInc}
            prevIncome={prevMissing
              ? (incomeMap[`${prevM === 1 ? prevY - 1 : prevY}-${prevM === 1 ? 12 : prevM - 1}`] ?? null)
              : prevInc}
            monthName={MONTH_NAMES[(prevMissing ? prevM : curMonth) - 1]}
            existingAmounts={existingAmounts}
          />}
        </div>
      </div>

      {loadFailed ? (
        <LoadErrorNotice what="tus ingresos" />
      ) : (
      <>
      {/* Faltantes: una sola nota, no 11 chips. Dorado solo si el último mes
          cerrado ya pasó la semana de gracia; antes es una expectativa normal. */}
      {prevMissing && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          {overdue ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
              style={{ color: 'var(--gold-ink)', background: 'color-mix(in srgb, var(--gold) 16%, var(--surface))' }}>
              <AlertCircle className="w-3 h-3" aria-hidden /> Falta registrar el sueldo de {MONTH_NAMES[prevM - 1]}
            </span>
          ) : (
            <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
              Cuando te llegue la liquidación de {MONTH_NAMES[prevM - 1]}, súbela aquí.
            </span>
          )}
          {missingClosed > 1 && (
            <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
              {overdue ? 'y ' : 'Además, '}{missingClosed - 1} {missingClosed - 1 === 1 ? 'mes más' : 'meses más'} sin registrar en el último año
            </span>
          )}
        </div>
      )}

      {/* ── Cifra principal + 3 apoyos ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">

        {/* Lo que queda del sueldo — el hero. El sueldo del mes anterior financia
            los gastos de este: lo que importa es cuánto queda, no cuánto entró. */}
        <div className="card p-5 lg:p-6 col-span-2 lg:col-span-2 flex flex-col justify-between gap-4">
          <div>
            <p className="text-xs font-bold mb-1" style={{ color: 'var(--ink-3)' }}>
              Lo que queda de tu sueldo de {MONTH_NAMES[prevM - 1].toLowerCase()}
            </p>
            <p
              className="text-3xl lg:text-4xl font-extrabold tabular-nums leading-tight break-words"
              style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
            >
              {queda === null ? '—' : queda >= 0 ? formatCLP(queda) : `−${formatCLP(-queda)}`}
            </p>
            {queda !== null && prevInc ? (
              <>
                <div className="h-2 rounded-full overflow-hidden mt-3" style={{ background: 'var(--surface-2)' }} role="img"
                  aria-label={`Gastaste ${formatCLP(curExpense ?? 0)} de ${formatCLP(prevInc.amount)}`}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(((curExpense ?? 0) / prevInc.amount) * 100))}%`, background: 'var(--primary)' }} />
                </div>
                <p className="text-xs mt-1.5 tabular-nums" style={{ color: 'var(--ink-3)' }}>
                  Llevas gastado {formatCLP(curExpense ?? 0)} de {formatCLP(prevInc.amount)}
                  {queda < 0 && ' · te pasaste'}
                </p>
              </>
            ) : (
              <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
                {expensesFailed && prevInc
                  ? 'No pudimos cargar tus gastos de este mes.'
                  : `Registra tu liquidación de ${MONTH_NAMES[prevM - 1].toLowerCase()} para calcularlo.`}
              </p>
            )}
            {nextPay && daysToPay !== null && (
              <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
                {`Próximo sueldo: ${Number(nextPay.slice(8))} de ${MONTH_NAMES[Number(nextPay.slice(5, 7)) - 1].toLowerCase()}${daysToPay === 0 ? ' (hoy)' : daysToPay === 1 ? ' (mañana)' : ` (en ${daysToPay} días)`}`}
              </p>
            )}
            {!nextPay && (
              <Link href="/ajustes" className="inline-flex items-center min-h-[44px] text-xs font-semibold" style={{ color: 'var(--primary)' }}>
                Indica tu día de sueldo en Ajustes para ver cuándo llega el próximo
              </Link>
            )}
          </div>
          <div>
            <Sparkline values={sparkSeries.slice(-6)} positive={sparkSeries.length > 0} label={`Tendencia de tus últimos ${Math.min(sparkSeries.length, 6)} sueldos`} />
            <p className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>Tus últimos sueldos</p>
          </div>
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
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>de tus últimos {last6.length} sueldos</p>
          </div>
        </div>

        {/* Variación vs mes anterior — neutra: un sueldo que baja no es una alerta de hoy */}
        <div className="card p-4 lg:p-5 min-w-0">
          <p className="text-[11px] font-bold mb-1" style={{ color: 'var(--ink-3)' }}>
            Vs sueldo anterior
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
                  {varPct > 0 ? '+' : varPct < 0 ? '−' : ''}{Math.abs(varPct)}%
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

      {lastPay && (
        <PayCycleTimeline
          lastPay={lastPay}
          nextPay={nextPay}
          today={todayStr}
          payslipDone={!!incomeMap[`${lastPay.slice(0, 4)}-${Number(lastPay.slice(5, 7))}`]}
          paidMonthName={MONTH_NAMES[Number(lastPay.slice(5, 7)) - 1].toLowerCase()}
          daysToPay={daysToPay}
        />
      )}

      {/* ── Historial ─────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-4 lg:px-6 pt-4 pb-3">
          <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Historial de ingresos</h2>
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
