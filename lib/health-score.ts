// ── F5: Health score (0–100) — v2, premia construir patrimonio Y cumplir el
// aporte a inversión ──────────────────────────────────────────────────────
// Mix: tasa de ahorro (20) · cumplimiento de aporte a inversión (15) ·
// fondo de emergencia (20) · disciplina de presupuesto (25) · deuda
// comprometida (20). "Neutral" cuando falta el dato: no castigamos por no
// haber registrado/definido algo todavía.
//
// v1 (jul 2026) solo pesaba tasa de ahorro/fondo/disciplina/deuda. v2 agrega
// la señal de "cumplimiento de aporte": para un perfil que invierte una
// parte fija del sueldo cada mes, ahorrar (dejar plata sin gastar) y
// efectivamente invertirla son cosas distintas — v1 las trataba igual.

export interface HealthScoreInputs {
  /** Tasa de ahorro proyectada (mes en curso) o real (mes cerrado), % del sueldo anterior. */
  scoreRate: number | null
  /** Meta mensual de aporte a inversión, en CLP. null = no definida. */
  monthlyInvestGoal: number | null
  /** Cuánto se ha invertido (billetera USD) en el mes evaluado, en CLP. */
  investedThisMonth: number
  isCurrentMonth: boolean
  /** Día del mes de referencia (para prorratear la meta si el mes está en curso). */
  dayOfMonth: number
  daysInMonth: number
  /** Meses de gasto que cubre el fondo de emergencia líquido. */
  monthsCovered: number | null
  /** % del ingreso ya comprometido en deuda/fijos futuros. */
  commitRatio: number | null
  /** Cantidad de categorías con presupuesto excedido este mes. */
  numExcedidas: number
  /** Proyección de gasto al cierre del mes (null si no aplica). */
  projection: number | null
  /**
   * Presupuesto contra el que se juzga la disciplina: el más estricto entre
   * el presupuesto global definido y el ingreso disponible tras la meta de
   * inversión (ingreso_anterior − meta). Resuelto por quien llama (A3).
   */
  effectiveBudget: number | null
  /** true si la proyección está inflada por una única compra atípica (no castigar). */
  projInflatedByTop: boolean
}

export interface HealthScoreResult {
  sAhorro: number
  sAporte: number
  sFondo: number
  sCompromiso: number
  sDisciplina: number
  total: number
  label: string
  color: string
  summary: string
  /** % de la meta de aporte alcanzado (prorrateada si el mes está en curso). null = sin meta definida. */
  aporteRatio: number | null
  /**
   * true cuando el fondo de emergencia aún cubre menos de 3 meses PERO el
   * aporte de este mes ya se cumplió — sugiere destinar el próximo aporte a
   * ahorro líquido en vez de seguir invirtiendo con poco colchón.
   */
  suggestDivertToSavings: boolean
}

export function computeHealthScore(input: HealthScoreInputs): HealthScoreResult {
  const {
    scoreRate, monthlyInvestGoal, investedThisMonth, isCurrentMonth,
    dayOfMonth, daysInMonth, monthsCovered, commitRatio, numExcedidas,
    projection, effectiveBudget, projInflatedByTop,
  } = input

  // Señal 1 — tasa de ahorro (invertido + líquido sobrante), 20 pts
  const sAhorro = scoreRate === null ? 12
    : scoreRate >= 20 ? 20
    : scoreRate >= 10 ? 15
    : scoreRate >= 0 ? 9
    : scoreRate >= -10 ? 4 : 0

  // Señal 2 — cumplimiento de la meta de aporte a inversión, 15 pts
  // Sin meta definida: neutral (8/15, ~53%), igual criterio que las demás señales.
  let sAporte = 8
  let aporteRatio: number | null = null
  if (monthlyInvestGoal !== null && monthlyInvestGoal > 0) {
    const effectiveGoal = isCurrentMonth
      ? Math.max(1, Math.round(monthlyInvestGoal * (dayOfMonth / Math.max(1, daysInMonth))))
      : monthlyInvestGoal
    aporteRatio = investedThisMonth / effectiveGoal
    sAporte = aporteRatio >= 1 ? 15
      : aporteRatio >= 0.6 ? 10
      : aporteRatio >= 0.3 ? 5
      : 0
  }

  // Señal 3 — fondo de emergencia, 20 pts
  const sFondo = monthsCovered === null ? 10
    : monthsCovered >= 6 ? 20
    : monthsCovered >= 3 ? 16
    : monthsCovered >= 1 ? 10 : 5

  // Señal 4 — deuda comprometida / ingreso, 20 pts (peso sin cambios vs v1)
  const sCompromiso = commitRatio === null ? 10
    : commitRatio < 20 ? 20
    : commitRatio <= 35 ? 12 : 4

  // Señal 5 — disciplina de presupuesto, 25 pts. Se juzga contra el
  // presupuesto EFECTIVO (el más estricto entre el límite global y el
  // disponible real tras la meta de inversión — A3).
  let sDisciplina = numExcedidas === 0 ? 25 : numExcedidas === 1 ? 17 : numExcedidas === 2 ? 10 : 3
  if (projection !== null && effectiveBudget !== null && projection > effectiveBudget * 1.1 && !projInflatedByTop) {
    sDisciplina = Math.max(0, sDisciplina - 7)
  }

  const total = sAhorro + sAporte + sFondo + sCompromiso + sDisciplina
  const label = total >= 80 ? 'Buena salud'
    : total >= 60 ? 'En camino'
    : total >= 40 ? 'Atención'
    : 'Alerta'
  const color = total >= 80 ? '#1FBE8D'
    : total >= 60 ? '#4D93FF'
    : total >= 40 ? '#FFC23C' : '#FF6F61'
  const summary = total >= 80
    ? 'Vas muy bien: inviertes, ahorras y tus compromisos están bajo control.'
    : total >= 60
    ? 'Vas en buen camino. Revisa las señales en amarillo para subir tu puntaje.'
    : total >= 40
    ? 'Atención: hay señales que necesitan cuidado. Parte por la más roja.'
    : 'Alerta: tus finanzas necesitan un ajuste este mes. Una señal a la vez.'

  // Fondo bajo + aporte ya cumplido → sugerir priorizar colchón antes que seguir invirtiendo.
  const suggestDivertToSavings = monthsCovered !== null && monthsCovered < 3
    && aporteRatio !== null && aporteRatio >= 1

  return { sAhorro, sAporte, sFondo, sCompromiso, sDisciplina, total, label, color, summary, aporteRatio, suggestDivertToSavings }
}
