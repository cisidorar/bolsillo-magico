// ── Resumen combinado Ahorro + Depósitos a plazo ─────────────────────────────
// A2 del roadmap ROADMAP-ahorro-depositos.md: una sola pregunta — "¿cuánta
// plata segura tengo en pesos y cuánto me está rindiendo?" — que hoy exigía
// mirar dos pestañas separadas. Vive en lib/ (no inline en el componente)
// porque mezcla unidades que es fácil hacer mal: el ahorro rinde en TAE
// (tasa anual) y el depósito en tasa del período (ej. 0,39667% a 35 días) —
// sumarlas o promediarlas tal cual sería un error de unidades.

import { earnedSoFar } from './savings-accounts'
import { daysBetween, totalInterest, earnedToDate, annualizeRate, type DepositLike } from './term-deposits'

export interface SavingsLike {
  balance:     number
  annual_rate: number   // % TAE
  start_date:  string   // YYYY-MM-DD
}

export interface RentaFijaSummary {
  /** Gran total: todo el capital (ahorro + depósitos) + todo el interés ganado a la fecha. */
  totalCurrentValue:   number
  /** Líquido hoy: saldo de ahorro (con su interés ya incluido) + depósitos ya vencidos (con su interés completo, listos para retirar o reinvertir). */
  availableToday:      number
  /** Capital inmovilizado en depósitos que todavía NO vencen (sin contar su interés devengado — ese va en earnedCombined). */
  committed:           number
  /** Fecha del próximo vencimiento entre los depósitos activos, o null si no hay ninguno vigente. */
  nearestMaturityDate: string | null
  /** Interés ganado combinado: ahorro (compuesto diario) + depósitos (total si venció, devengado a la fecha si sigue activo). */
  earnedCombined:      number
  /** TAE ponderada por capital, SOLO sobre lo que hoy sigue rindiendo (ahorro + depósitos activos, estos últimos anualizados). Los depósitos vencidos sin reinvertir no entran: están rindiendo 0% ahora mismo ("plata parada"), meterlos acá ensuciaría la lectura de a qué tasa está trabajando la plata hoy. */
  weightedRatePct:     number
}

export function computeRentaFijaSummary(
  savings: SavingsLike[],
  deposits: DepositLike[],
  todayStr: string,
): RentaFijaSummary {
  const now = new Date(todayStr + 'T12:00:00')

  const savingsBalance = savings.reduce((s, a) => s + a.balance, 0)
  const savingsEarned  = savings.reduce((s, a) => s + earnedSoFar(a.balance, a.annual_rate, a.start_date, now), 0)

  const activeDeposits  = deposits.filter(d => daysBetween(todayStr, d.maturity_date) >= 0)
  const maturedDeposits = deposits.filter(d => daysBetween(todayStr, d.maturity_date) < 0)

  const committed        = activeDeposits.reduce((s, d) => s + d.amount, 0)
  const activeAccrued    = activeDeposits.reduce((s, d) => s + earnedToDate(d, todayStr), 0)
  const maturedPrincipal = maturedDeposits.reduce((s, d) => s + d.amount, 0)
  const maturedInterest  = maturedDeposits.reduce((s, d) => s + totalInterest(d), 0)

  const availableToday = savingsBalance + savingsEarned + maturedPrincipal + maturedInterest
  const earnedCombined = savingsEarned + maturedInterest + activeAccrued
  const totalCurrentValue = availableToday + committed + activeAccrued

  const earningCapital = savingsBalance + committed
  const weightedRatePct = earningCapital > 0
    ? (
        savings.reduce((s, a) => s + a.annual_rate * a.balance, 0) +
        activeDeposits.reduce((s, d) => s + annualizeRate(d.interest_rate, daysBetween(d.start_date, d.maturity_date)) * d.amount, 0)
      ) / earningCapital
    : 0

  const nearestMaturityDate = activeDeposits.length > 0
    ? [...activeDeposits].sort((a, b) => a.maturity_date.localeCompare(b.maturity_date))[0].maturity_date
    : null

  return { totalCurrentValue, availableToday, committed, nearestMaturityDate, earnedCombined, weightedRatePct }
}
