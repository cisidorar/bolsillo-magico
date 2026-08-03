// ── Cálculos de cuentas de ahorro (TAE, capitalización compuesta diaria) ─────
// Extraído de components/DepositManager.tsx (ago 2026) para poder reusarse
// también en el hero de resumen combinado Ahorro+Depósitos (RentaFijaSummary)
// sin duplicar la fórmula en un tercer lugar.

/** Días transcurridos desde start_date hasta hoy (mínimo 0 — el día de inicio no genera interés). */
export function daysElapsed(startDate: string, now: Date = new Date()): number {
  const s = new Date(startDate + 'T12:00:00')
  return Math.max(0, Math.floor((now.getTime() - s.getTime()) / 86_400_000))
}

/** Tasa diaria efectiva a partir de TEA: (1 + r)^(1/365) - 1 */
export function dailyRate(annualRate: number): number {
  return Math.pow(1 + annualRate / 100, 1 / 365) - 1
}

/** Interés ganado acumulado (capitalización compuesta diaria) en CLP. */
export function earnedSoFar(balance: number, annualRate: number, startDate: string, now: Date = new Date()): number {
  const days = daysElapsed(startDate, now)
  return Math.round(balance * (Math.pow(1 + annualRate / 100, days / 365) - 1))
}

/** Interés ganado en un día en CLP (tasa diaria efectiva). */
export function dailyInterest(balance: number, annualRate: number): number {
  return Math.round(balance * dailyRate(annualRate))
}

/** Interés proyectado en N días (capitalización compuesta). */
export function projectedInterest(balance: number, annualRate: number, days: number): number {
  return Math.round(balance * (Math.pow(1 + annualRate / 100, days / 365) - 1))
}
