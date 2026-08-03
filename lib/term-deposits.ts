// ── Cálculos de depósitos a plazo (interés simple del período) ──────────────
// Extraído de components/TermDepositManager.tsx (ago 2026) para poder
// reusarse también en el hero de resumen combinado Ahorro+Depósitos
// (RentaFijaSummary) sin duplicar la fórmula en un tercer lugar.
//
// Tipo mínimo (no se importa TermDeposit desde app/.../page.tsx a propósito:
// ese archivo importa TermDepositManager, que importaría este archivo —
// ciclo de imports). Cualquier objeto con estos 4 campos sirve.
export interface DepositLike {
  amount:        number
  interest_rate: number   // % sobre el capital, del PERÍODO completo (no anual)
  start_date:    string   // YYYY-MM-DD
  maturity_date: string   // YYYY-MM-DD
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T12:00:00'), db = new Date(b + 'T12:00:00')
  return Math.round((db.getTime() - da.getTime()) / 86_400_000)
}

/** dateStr + N días (YYYY-MM-DD) — para calcular el vencimiento por defecto a partir del plazo. */
export function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

/** Interés total del período en CLP: interest_rate es % sobre el capital al vencimiento. */
export function totalInterest(d: DepositLike): number {
  return Math.round(d.amount * (d.interest_rate / 100))
}

/** Interés devengado a hoy (lineal por días transcurridos, capped al total). */
export function earnedToDate(d: DepositLike, todayStr: string): number {
  const total = daysBetween(d.start_date, d.maturity_date)
  const gone  = Math.min(Math.max(daysBetween(d.start_date, todayStr), 0), total)
  return total > 0 ? Math.round(totalInterest(d) * (gone / total)) : 0
}

export function progressPct(d: DepositLike, todayStr: string): number {
  const total = daysBetween(d.start_date, d.maturity_date)
  const gone  = Math.min(Math.max(daysBetween(d.start_date, todayStr), 0), total)
  return total > 0 ? Math.round((gone / total) * 100) : 100
}

export function daysToMaturity(d: DepositLike, todayStr: string): number {
  return daysBetween(todayStr, d.maturity_date)
}

// ── Desempeño combinado con Ahorro (A2, roadmap ROADMAP-ahorro-depositos.md) ─
// El ahorro se expresa en TAE (tasa anual) y el depósito en tasa del período
// (ej. 0,39667% a 35 días) — son unidades distintas, promediarlas tal cual es
// un error. Esta función anualiza la tasa del período con capitalización
// compuesta para poder mezclarla con una TAE en un promedio ponderado por
// capital.
export function annualizeRate(periodRatePct: number, days: number): number {
  if (days <= 0) return 0
  return (Math.pow(1 + periodRatePct / 100, 365 / days) - 1) * 100
}
