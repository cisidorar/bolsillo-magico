// ── Modelo de la vista Estado de /propiedad ─────────────────────────────────
//
// Todo derivado de los cobros y de "hoy": nada se guarda. La vista responde tres
// preguntas, en este orden: ¿qué falta este mes?, ¿qué paga el arrendatario y
// qué pagas tú?, y ¿cómo vienen los últimos meses?

import { chargeStatus, chargeTotal, chargeOutstanding, KIND_LABEL, type ChargeLike } from './property-charges'
import { monthOf, overdueOwnerBills } from './property-summary'

export const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** Cobros del lado del arrendatario, en el orden en que se muestran. */
export const TENANT_KINDS = ['rent', 'electricity', 'water', 'gastos_comunes', 'gas'] as const
/** Cobros tuyos que tienen fila propia en la grilla de meses. */
const OWNER_GRID_KINDS = ['aseo', 'mortgage', 'contribuciones'] as const

export interface EstadoCharge extends ChargeLike {
  id: string
  is_estimate?: boolean
}

/** 'paid' = pagado · 'overdue' = vencido · 'soon' = por vencer · 'pending' = aún lejos */
export type Tone = 'paid' | 'overdue' | 'soon' | 'pending'

export function cellTone(c: ChargeLike, today: string): Tone {
  const s = chargeStatus(c, today)
  if (s === 'paid') return 'paid'
  if (s === 'overdue' || s === 'partial') return 'overdue'
  if (s === 'due_soon') return 'soon'
  return 'pending'
}

/** El arriendo y las cuentas de consumo las paga el arrendatario; el resto lo pagas tú. */
export function isTenantSide(c: ChargeLike): boolean {
  if (c.kind === 'deposit') return false
  return c.responsible === 'tenant' || c.direction === 'in'
}

export function isOwnerSide(c: ChargeLike): boolean {
  return c.direction === 'out' && c.responsible !== 'tenant'
}

const label = (kind?: string) => KIND_LABEL[kind ?? ''] ?? kind ?? ''

/** "a", "a y b", "a, b y c". */
export function joinEs(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

export function monthName(monthKey: string): string {
  return MONTH_NAMES[Number(monthKey.slice(5, 7)) - 1]
}

export interface TenantCard<T> {
  kind:   string
  /** null = este mes no hay cobro generado para ese servicio */
  charge: T | null
}

export interface EstadoModel<T extends EstadoCharge> {
  tenantCards: TenantCard<T>[]
  /** Cobros distintos que piden algo: del mes elegido + todo lo vencido de cualquier mes. */
  pendingCount: number
  tenantText: string
  tenantTone: Tone
  ownerText: string
  ownerTone: Tone
  /** Cuentas tuyas vencidas, de cualquier mes. */
  ownerOverdue: T[]
  /** Cuentas tuyas del mes elegido que faltan y aún no vencen. */
  ownerMonthTodo: T[]
  /** Del arrendatario: vencidas que no son del mes elegido. */
  tenantOverdueOther: T[]
  paidTenantCount: number
}

export function estadoModel<T extends EstadoCharge>(
  charges: T[], today: string, monthKey: string, fmt: (n: number) => string,
): EstadoModel<T> {
  const inMonth = charges.filter(c => monthOf(c.due_date) === monthKey)
  const tenantKinds = TENANT_KINDS.filter(k => charges.some(c => c.kind === k && isTenantSide(c)))
  const tenantCards: TenantCard<T>[] = tenantKinds.map(kind => ({
    kind, charge: inMonth.find(c => c.kind === kind && isTenantSide(c)) ?? null,
  }))

  const ownerOverdue = overdueOwnerBills(charges, today)
  const overdueIds = new Set(ownerOverdue.map(c => c.id))
  const ownerMonthTodo = inMonth.filter(c =>
    isOwnerSide(c) && chargeStatus(c, today) !== 'paid' && !overdueIds.has(c.id))
  const tenantTodo = tenantCards.filter(t => t.charge && chargeStatus(t.charge, today) !== 'paid')
  const tenantOverdueOther = charges.filter(c =>
    isTenantSide(c) && monthOf(c.due_date) !== monthKey && cellTone(c, today) === 'overdue')

  const ids = new Set<string>([
    ...tenantTodo.map(t => t.charge!.id),
    ...ownerOverdue.map(c => c.id),
    ...ownerMonthTodo.map(c => c.id),
    ...tenantOverdueOther.map(c => c.id),
  ])

  // Lado arrendatario
  const present = tenantCards.filter(t => t.charge)
  const paid = present.filter(t => chargeStatus(t.charge!, today) === 'paid')
  const missing = present.filter(t => chargeStatus(t.charge!, today) !== 'paid')
  const low = (k: string) => label(k).toLowerCase()
  let tenantText: string
  if (present.length === 0) tenantText = 'Sin cobros generados este mes.'
  else if (missing.length === 0) tenantText = 'Pagó todo este mes.'
  else {
    const first = paid.length > 0 ? `Pagó ${joinEs(paid.map(t => low(t.kind)))}. ` : ''
    tenantText = `${first}Falta ${joinEs(missing.map(t => low(t.kind)))}.`
  }
  const tenantAnyOverdue = present.some(t => cellTone(t.charge!, today) === 'overdue') || tenantOverdueOther.length > 0
  const tenantTone: Tone = tenantAnyOverdue ? 'overdue' : missing.length > 0 ? 'soon' : 'paid'

  // Lado tuyo
  let ownerText: string
  let ownerTone: Tone
  if (ownerOverdue.length === 1) {
    const c = ownerOverdue[0]
    ownerText = `Vencido: ${low(c.kind ?? '')} de ${monthName(monthOf(c.due_date))}, ${fmt(chargeOutstanding(c))}.`
    ownerTone = 'overdue'
  } else if (ownerOverdue.length > 1) {
    const months = [...new Set(ownerOverdue.map(c => monthName(monthOf(c.due_date))))]
    ownerText = `${ownerOverdue.length} cuentas vencidas (${joinEs(months)}): ${fmt(ownerOverdue.reduce((s, c) => s + chargeOutstanding(c), 0))}.`
    ownerTone = 'overdue'
  } else if (ownerMonthTodo.length > 0) {
    ownerText = `Por pagar: ${joinEs([...new Set(ownerMonthTodo.map(c => low(c.kind ?? '')))])}.`
    ownerTone = 'soon'
  } else {
    ownerText = 'Nada por pagar este mes.'
    ownerTone = 'paid'
  }

  return {
    tenantCards, pendingCount: ids.size, tenantText, tenantTone, ownerText, ownerTone,
    ownerOverdue, ownerMonthTodo, tenantOverdueOther, paidTenantCount: paid.length,
  }
}

// ── Grilla de los últimos meses ─────────────────────────────────────────────

export interface GridCell<T> { monthKey: string; tone: Tone | null; charge: T | null }
export interface GridRow<T> { kind: string; label: string; side: 'tenant' | 'owner'; cells: GridCell<T>[] }

/** Una fila por servicio que aparece en la ventana; una celda por mes. */
export function monthGrid<T extends EstadoCharge>(charges: T[], monthKeys: string[], today: string): GridRow<T>[] {
  const keys = new Set(monthKeys)
  const inWindow = charges.filter(c => keys.has(monthOf(c.due_date)))
  const rows: GridRow<T>[] = []
  const build = (kind: string, side: 'tenant' | 'owner', match: (c: T) => boolean) => {
    if (!inWindow.some(c => c.kind === kind && match(c))) return
    rows.push({
      kind, label: label(kind), side,
      cells: monthKeys.map(monthKey => {
        const charge = inWindow.find(c => c.kind === kind && match(c) && monthOf(c.due_date) === monthKey) ?? null
        return { monthKey, charge, tone: charge ? cellTone(charge, today) : null }
      }),
    })
  }
  for (const k of TENANT_KINDS) build(k, 'tenant', isTenantSide)
  for (const k of OWNER_GRID_KINDS) build(k, 'owner', isOwnerSide)
  return rows
}

// ── Derechos de aseo: cuotas del año ────────────────────────────────────────

export interface Cuota<T> { monthKey: string; short: string; tone: Tone; text: string; charge: T }

/** Cuotas de un año, en orden, con un texto de estado por cuota. */
export function cuotasOfYear<T extends EstadoCharge>(charges: T[], kind: string, year: number, today: string): Cuota<T>[] {
  return charges
    .filter(c => c.kind === kind && c.due_date.startsWith(String(year)))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .map(charge => {
      const tone = cellTone(charge, today)
      const monthKey = monthOf(charge.due_date)
      return {
        monthKey, charge, tone,
        short: monthName(monthKey).slice(0, 3),
        text: tone === 'paid' ? 'Pagada' : tone === 'overdue' ? 'Vencida' : tone === 'soon' ? 'Por vencer' : 'Próxima',
      }
    })
}

export { chargeTotal }
