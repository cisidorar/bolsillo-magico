// Participante sin cuenta en un viaje (docs/PLAN_VIAJE_CON_INVITADA.md).
// Su ingreso se guarda solo como un promedio mensual; los sueldos sueltos que
// se escriben en la calculadora no salen del navegador.

export const GUEST_SALARY_SLOTS = 6

export interface GuestIncome {
  /** Promedio mensual en CLP enteros */
  average: number
  /** Cuántos sueldos entraron al promedio */
  months: number
}

/** Promedio de los sueldos líquidos escritos; ignora vacíos y valores no positivos. */
export function averageSalaries(values: Array<number | string | null | undefined>): GuestIncome | null {
  const nums = values
    .map(v => (typeof v === 'string' ? Number(v.replace(/[^\d]/g, '')) : v))
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
  if (nums.length === 0) return null
  const sum = nums.reduce((a, b) => a + b, 0)
  return { average: Math.round(sum / nums.length), months: nums.length }
}

/** Porcentaje de cada uno según ingreso (suma 100 con un decimal), solo para mostrar. */
export function incomeShares(incomes: number[]): number[] {
  const total = incomes.reduce((a, b) => a + b, 0)
  if (total <= 0) return incomes.map(() => 0)
  return incomes.map(i => Math.round((i / total) * 1000) / 10)
}
