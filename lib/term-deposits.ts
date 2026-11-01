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

// ── Cadena de renovaciones (sep 2026) ────────────────────────────────────────
// Cuando un DAP renovable se renueva, el ciclo nuevo se guarda como otra fila
// con renewed_from_id = id del ciclo anterior. El capital del ciclo viejo YA
// ESTÁ dentro del nuevo (se reinvirtió capital + interés), así que cualquier
// suma de "cuánto tengo en depósitos" debe saltarse los ciclos renovados.
// Bug real (Cas): Patrimonio mostraba Depósitos $1.174.847 cuando lo real era
// ~$838k — el ciclo 4 ago → 8 sep ($336.329 al vencer) seguía sumando como
// "vencido" al lado del ciclo que lo reemplazó.
export interface RenewableLike {
  id:               string
  renewed_from_id?: string | null
  start_date:       string
}

/** Filtra los ciclos que ya fueron renovados (otro depósito apunta a ellos). */
export function withoutSuperseded<T extends RenewableLike>(rows: T[]): T[] {
  const superseded = new Set(rows.map(r => r.renewed_from_id).filter((x): x is string => !!x))
  return rows.filter(r => !superseded.has(r.id))
}

/**
 * id del ciclo renovado → fecha en que empezó el ciclo que lo reemplazó.
 * Para curvas históricas: un ciclo renovado cuenta hasta el día anterior a
 * que arranca su reemplazo, no para siempre ni nunca.
 */
export function supersededSince<T extends RenewableLike>(rows: T[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of rows) {
    if (!r.renewed_from_id) continue
    const prev = out.get(r.renewed_from_id)
    if (!prev || r.start_date < prev) out.set(r.renewed_from_id, r.start_date)
  }
  return out
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

// ── Intereses sin registrar de un depósito vencido (nov 2026) ────────────────
// Un depósito vencido que no se renovó en la app sigue "debiendo" un registro:
// el interés de su propio período y, si es renovable, el de los períodos que el
// banco ya renovó solo desde entonces. Cas: "no puedo saber cuántos meses
// faltan sin registrar intereses".
export interface UnregisteredInterest {
  /** períodos sin registrar: el vencido + los que el banco renovó solo desde entonces */
  periods:  number
  /** de esos, cuántos son renovaciones automáticas posteriores al vencimiento */
  autoRenewed: number
  /** interés estimado de todos esos períodos (se capitaliza en cada renovación) */
  interest: number
  /** meses aproximados que cubren (períodos × plazo / 30) */
  months:   number
  /** fecha en que se completaría el próximo período si siguió renovándose */
  nextCycleEnd: string
}

export function unregisteredInterest(
  d: DepositLike & { renewable?: boolean | null }, todayStr: string,
): UnregisteredInterest | null {
  const term = daysBetween(d.start_date, d.maturity_date)
  const idle = daysBetween(d.maturity_date, todayStr)
  if (term <= 0 || idle < 0) return null

  const autoRenewed = d.renewable ? Math.floor(idle / term) : 0
  let capital = d.amount
  let interest = 0
  for (let i = 0; i <= autoRenewed; i++) {
    const gain = Math.round(capital * (d.interest_rate / 100))
    interest += gain
    capital += gain
  }
  const periods = 1 + autoRenewed
  return {
    periods,
    autoRenewed,
    interest,
    months: Math.round((periods * term / 30) * 10) / 10,
    nextCycleEnd: addDaysStr(d.maturity_date, term * (autoRenewed + 1)),
  }
}
