import { formatCLP } from './utils'

// ── E4 (roadmap economía personal, jul 2026): "¿me lo puedo comprar?" ───────
// Todo lo necesario para responder esto ya está calculado y disperso en
// cuatro pantallas (presupuesto en /presupuesto, flujo de 30 días en
// /recurrentes, compromiso futuro en el health score de /analisis, meta de
// aporte en /inversiones) — el usuario tiene que abrir las cuatro y hacer la
// síntesis mentalmente. Esto es pura composición sobre datos que YA existen,
// sin ninguna fuente nueva: reduce cuatro pantallas a un veredicto de una
// línea con como máximo tres razones, con la misma jerarquía de severidad
// que el resto de la app (UX5 — coral = acción hoy, gold = atención pronto,
// mint = confirmación positiva).

export type Severity = 'coral' | 'gold' | 'mint'
export type Verdict  = 'yes' | 'tight' | 'no'

export interface AffordabilityReason {
  severity: Severity
  text: string
}

export interface AffordabilityInput {
  /** Precio total de la compra. */
  amount: number
  /** 1 = de contado; ≥2 = en cuotas. */
  installments: number
  /** Presupuesto restante de este mes, ANTES de esta compra. null = sin presupuesto definido. */
  budgetRemaining: number | null
  /** Punto más bajo del saldo proyectado a 30 días, ANTES de esta compra. null = sin datos suficientes. */
  cashFlowMin: number | null
  /** Fecha (ya formateada para mostrar, ej. "14 de agosto") de ese punto mínimo. */
  cashFlowMinLabel: string | null
  /** Ingreso de referencia (último registrado). null = sin ingreso registrado. */
  income: number | null
  /** Compromiso fijo YA existente para el próximo mes (sin esta compra) — CommittedMonth[0].total. */
  monthlyCommitted: number
  /** Meta mensual de ahorro/aporte (profiles.monthly_invest_goal) — lo que el
   *  usuario ya planea apartar ANTES de gastar. null o 0 = sin meta definida
   *  (no resta nada; el chequeo de disponible sigue corriendo, solo que sin
   *  reservar ahorro). */
  monthlyInvestGoal: number | null
  /** Mes en que termina de pagarse esta compra en cuotas (ya formateado, ej. "marzo"). null si installments ≤ 1. */
  releaseLabel: string | null
}

export interface AffordabilityResult {
  verdict: Verdict
  /** Monto que golpea el presupuesto/flujo de ESTE mes: el total si es de contado, o la primera cuota. */
  immediateImpact: number
  budgetPctUsed: number | null
  reasons: AffordabilityReason[]
}

// Saldo proyectado por debajo de este monto ya se siente "justo", aunque no
// llegue a negativo — evita el falso "sí" cuando el margen es de $3.000.
const CASH_FLOW_TIGHT_THRESHOLD = 20_000
const BUDGET_TIGHT_PCT = 70

export function evaluateAffordability(input: AffordabilityInput): AffordabilityResult {
  const installments = Math.max(1, Math.round(input.installments))
  const immediateImpact = installments > 1 ? Math.round(input.amount / installments) : input.amount

  const reasons: AffordabilityReason[] = []
  // Rango numérico en vez de comparar literales de string — evita que TS
  // sobre-angoste el tipo de `worst` al reasignarlo desde el closure `bump`.
  const RANK: Record<Severity, number> = { mint: 0, gold: 1, coral: 2 }
  let worstRank = RANK.mint
  const bump = (sev: Severity) => { worstRank = Math.max(worstRank, RANK[sev]) }

  // 1) Presupuesto del mes
  let budgetPctUsed: number | null = null
  if (input.budgetRemaining !== null) {
    if (immediateImpact > input.budgetRemaining) {
      bump('coral')
      reasons.push({
        severity: 'coral',
        text: `Te pasas del presupuesto de este mes por ${formatCLP(immediateImpact - input.budgetRemaining)}`,
      })
    } else {
      budgetPctUsed = input.budgetRemaining > 0 ? Math.round((immediateImpact / input.budgetRemaining) * 100) : 100
      if (budgetPctUsed >= BUDGET_TIGHT_PCT) {
        bump('gold')
        reasons.push({
          severity: 'gold',
          text: `Te quedan ${formatCLP(input.budgetRemaining)} de presupuesto este mes — esto usa el ${budgetPctUsed}%`,
        })
      }
    }
  }

  // 2) Flujo de caja 30 días
  if (input.cashFlowMin !== null) {
    const projectedMin = input.cashFlowMin - immediateImpact
    const dateSuffix = input.cashFlowMinLabel ? ` el ${input.cashFlowMinLabel}` : ''
    if (projectedMin < 0) {
      bump('coral')
      reasons.push({ severity: 'coral', text: `Tu flujo de 30 días queda en negativo (${formatCLP(projectedMin)})${dateSuffix}` })
    } else if (projectedMin < CASH_FLOW_TIGHT_THRESHOLD) {
      bump('gold')
      reasons.push({ severity: 'gold', text: `Tu flujo de 30 días queda justo en ${formatCLP(projectedMin)}${dateSuffix}` })
    }
  }

  // 3) Disponible tras tu meta de ahorro — el chequeo más realista: no
  // cuánto presupuesto de categorías queda, sino si esto compromete la plata
  // que ya planeabas ahorrar. income − meta de ahorro − fijos YA
  // comprometidos (sin esta compra) = lo que de verdad sobra para vivir y
  // para compras como esta ("pay yourself first", mismo principio que
  // SavingsGoalHelper en /presupuesto).
  if (input.income !== null) {
    const disposable = input.income - (input.monthlyInvestGoal ?? 0) - input.monthlyCommitted
    const remaining  = disposable - immediateImpact
    const goalSuffix  = input.monthlyInvestGoal ? ` (después de ahorrar ${formatCLP(input.monthlyInvestGoal)}/mes)` : ''
    const untilSuffix = installments > 1 && input.releaseLabel ? ` hasta ${input.releaseLabel}` : ''

    if (remaining < 0) {
      bump('coral')
      reasons.push({
        severity: 'coral',
        text: `Se pasa por ${formatCLP(Math.abs(remaining))} de lo que te queda disponible${goalSuffix}${untilSuffix}`,
      })
    } else if (installments > 1) {
      // De contado y le alcanza: no hace falta confirmarlo con una razón
      // aparte (ya lo dice el veredicto). En cuotas sí vale mostrar la
      // aritmética, porque es información nueva sobre varios meses.
      reasons.push({
        severity: 'mint',
        text: `Cabe en tu disponible${goalSuffix} — suma ${formatCLP(immediateImpact)}/mes${untilSuffix}`,
      })
    }
  }

  const verdict: Verdict = worstRank === RANK.coral ? 'no' : worstRank === RANK.gold ? 'tight' : 'yes'

  return { verdict, immediateImpact, budgetPctUsed, reasons }
}
