// ── B2: Proyección de patrimonio a interés compuesto ─────────────────────────
// Card motivacional pura matemática (sin IA): dado un patrimonio inicial y un
// aporte mensual constante, proyecta cuánto valdría a 1/5/10 años bajo
// distintos supuestos de retorno anual real. Para un perfil joven que recién
// empieza a invertir, ver el efecto del interés compuesto a 10 años es el
// motivador más simple y más fuerte — no requiere IA ni datos adicionales,
// solo lo que ya se calcula en /analisis (patrimonio neto + aporte mensual).

/** Escenarios de retorno anual real ofrecidos por defecto (%). */
export const DEFAULT_RETURN_SCENARIOS = [5, 7, 10] as const

/** Horizontes en años ofrecidos por defecto. */
export const DEFAULT_HORIZONS_YEARS = [1, 5, 10] as const

export interface WealthProjectionInput {
  /** Patrimonio actual (punto de partida), en CLP. Puede ser 0 o negativo (deuda neta). */
  principal: number
  /** Aporte mensual constante que se proyecta a futuro, en CLP. */
  monthlyContribution: number
  /** Retorno anual real esperado, en % (ej. 7 = 7%/año). */
  annualReturnPct: number
  /** Horizonte de la proyección, en meses. */
  months: number
}

/**
 * Valor futuro de un principal + aportes mensuales constantes, con
 * capitalización mensual equivalente al retorno anual dado.
 * FV = P·(1+i)^n + C·(((1+i)^n − 1) / i), con i = (1+r)^(1/12) − 1.
 */
export function projectWealth({ principal, monthlyContribution, annualReturnPct, months }: WealthProjectionInput): number {
  if (months <= 0) return Math.round(principal)
  const r = annualReturnPct / 100
  const i = Math.pow(1 + r, 1 / 12) - 1

  if (Math.abs(i) < 1e-9) {
    // Retorno ~0%: sin interés compuesto, solo suma de aportes.
    return Math.round(principal + monthlyContribution * months)
  }

  const growthFactor = Math.pow(1 + i, months)
  const fromPrincipal = principal * growthFactor
  const fromContributions = monthlyContribution * ((growthFactor - 1) / i)
  return Math.round(fromPrincipal + fromContributions)
}

export interface ProjectionScenarioRow {
  annualReturnPct: number
  /** Valor proyectado por horizonte (mismo orden que el horizonte pedido). */
  values: { years: number; months: number; futureValue: number }[]
}

export interface WealthProjectionTable {
  principal: number
  monthlyContribution: number
  /** Total aportado (sin rendimiento) al final del horizonte más largo — para mostrar "de eso, cuánto es interés". */
  totalContributedAtLongestHorizon: number
  scenarios: ProjectionScenarioRow[]
}

/**
 * Arma la tabla completa de escenarios × horizontes para la card de
 * /analisis. `returnScenarios` y `horizonsYears` son parametrizables para
 * tests y para un futuro selector en la UI; por defecto usa 5/7/10% y
 * 1/5/10 años.
 */
export function buildWealthProjectionTable(
  principal: number,
  monthlyContribution: number,
  returnScenarios: readonly number[] = DEFAULT_RETURN_SCENARIOS,
  horizonsYears: readonly number[] = DEFAULT_HORIZONS_YEARS,
): WealthProjectionTable {
  const longestYears = Math.max(...horizonsYears)
  const scenarios: ProjectionScenarioRow[] = returnScenarios.map(annualReturnPct => ({
    annualReturnPct,
    values: horizonsYears.map(years => {
      const months = years * 12
      return { years, months, futureValue: projectWealth({ principal, monthlyContribution, annualReturnPct, months }) }
    }),
  }))

  return {
    principal,
    monthlyContribution,
    totalContributedAtLongestHorizon: Math.round(principal + monthlyContribution * longestYears * 12),
    scenarios,
  }
}
