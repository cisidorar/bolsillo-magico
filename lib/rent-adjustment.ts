// ── Reajuste semestral del arriendo por IPC (nov 2026) ──────────────────────
// Cláusula QUINTO del contrato de Cas: la renta se reajusta cada 6 meses por la
// variación ACUMULADA del IPC de los 6 meses anteriores; si sale negativa, la
// renta se mantiene hasta el próximo reajuste.
//
// Desfase de 2 meses (a propósito): el arriendo se paga dentro de los primeros
// 5 días del mes, pero el INE publica el IPC de un mes recién ~el 8 del mes
// siguiente. Para reajustar el arriendo de diciembre, el último IPC conocido
// antes del día 5 es el de octubre. Misma convención del aviso de la corredora
// (marzo → ago-25…ene-26): la ventana son los 6 meses que terminan 2 meses
// antes del mes del reajuste. Pura: sin Supabase, sin fetch.

import type { IpcObservation } from './cl-indicators'
import { addMonths } from './lease'

/** Meses entre el último IPC usado y el mes del reajuste (ver comentario de arriba). */
export const IPC_LAG_MONTHS = 2
/** Largo de la ventana por defecto — el contrato dice 6. */
export const DEFAULT_WINDOW_MONTHS = 6

export interface AdjustmentWindowMonth {
  /** YYYY-MM-01 */
  date: string
  /** Variación mensual en %, null si el INE aún no la publica o la serie no la trae. */
  pct:  number | null
}

export interface RentAdjustment {
  /** Mes del reajuste, YYYY-MM-01 (la renta nueva rige desde ese mes). */
  adjustmentMonth: string
  windowMonths:    AdjustmentWindowMonth[]
  /** Faltan datos de IPC en la ventana → no se puede calcular. */
  complete:        boolean
  /** Variación acumulada compuesta, en % (puede ser negativa). null si incompleto. */
  cumulativePct:   number | null
  previousRent:    number
  newRent:         number
  delta:           number
  /** IPC negativo: el contrato manda mantener la renta. */
  floored:         boolean
}

const monthKey = (d: string) => d.slice(0, 7)

/** Primer día del mes (YYYY-MM-01) de una fecha cualquiera. */
export function monthStart(dateStr: string): string {
  return `${monthKey(dateStr)}-01`
}

/** Los `months` meses (YYYY-MM-01, cronológicos) cuyo IPC alimenta el reajuste de `adjustmentMonth`. */
export function adjustmentWindow(
  adjustmentMonth: string,
  months = DEFAULT_WINDOW_MONTHS,
  lag = IPC_LAG_MONTHS,
): string[] {
  const base = monthStart(adjustmentMonth)
  const out: string[] = []
  for (let i = months + lag - 1; i >= lag; i--) out.push(addMonths(base, -i))
  return out
}

/**
 * Calcula el reajuste de la renta. El IPC se compone mes a mes
 * ("en forma acumulada"), no se suma. La renta se redondea al peso.
 */
export function computeRentAdjustment(
  rent: number,
  series: IpcObservation[],
  adjustmentMonth: string,
  months = DEFAULT_WINDOW_MONTHS,
): RentAdjustment {
  const byMonth = new Map(series.map(o => [monthKey(o.date), o.pctChange]))
  const windowMonths: AdjustmentWindowMonth[] = adjustmentWindow(adjustmentMonth, months)
    .map(date => ({ date, pct: byMonth.get(monthKey(date)) ?? null }))
  const complete = windowMonths.every(m => m.pct !== null)

  if (!complete) {
    return {
      adjustmentMonth: monthStart(adjustmentMonth), windowMonths, complete: false,
      cumulativePct: null, previousRent: rent, newRent: rent, delta: 0, floored: false,
    }
  }

  const factor = windowMonths.reduce((f, m) => f * (1 + (m.pct as number) / 100), 1)
  const cumulativePct = (factor - 1) * 100
  const floored = factor <= 1
  const newRent = floored ? rent : Math.round(rent * factor)
  return {
    adjustmentMonth: monthStart(adjustmentMonth), windowMonths, complete: true,
    cumulativePct, previousRent: rent, newRent, delta: newRent - rent, floored,
  }
}

/** ¿Corresponde avisar? Ventana completa, aún no avisado y el reajuste no pasó hace más de `graceMonths`. */
export function shouldNotifyAdjustment(opts: {
  adjustment:     RentAdjustment
  alreadyNotified: boolean
  today:          string
  graceMonths?:   number
}): boolean {
  const { adjustment, alreadyNotified, today, graceMonths = 2 } = opts
  if (!adjustment.complete || alreadyNotified) return false
  return monthStart(today) <= addMonths(adjustment.adjustmentMonth, graceMonths)
}
