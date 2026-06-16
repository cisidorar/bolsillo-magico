import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formatea un número como peso chileno: $1.234.567 */
export function formatCLP(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Nombre del mes en español */
export function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString('es-CL', { month: 'long' })
}

/** Fecha relativa corta: "Hoy", "Ayer", "lun 9 jun" */
export function relativeDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Hoy'
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer'

  return date.toLocaleString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Porcentaje seguro (evita división por 0) */
export function pct(value: number, total: number): number {
  if (!total) return 0
  return Math.min(100, Math.round((value / total) * 100))
}

/**
 * Determina si un string es un emoji (no un nombre de ícono Lucide).
 * Los nombres Lucide son PascalCase y siempre empiezan con letra mayúscula ASCII.
 */
export function isEmoji(str: string): boolean {
  if (!str) return false
  return !/^[A-Z]/.test(str)
}

/**
 * Retorna el mes/año del estado de cuenta al que pertenece un gasto de tarjeta de crédito.
 * billingDay: día de corte (1–28). null → débito/efectivo, usa el mes de compra.
 *
 * Regla: compra en día ≤ billingDay → estado de ese mes.
 *        compra en día > billingDay → estado del mes siguiente.
 *
 * Ejemplo corte día 15:
 *   compra el 10 jun → estado junio | compra el 20 jun → estado julio
 */
export function billingPeriod(
  purchaseDate: string,
  billingDay: number | null
): { month: number; year: number } {
  const d = new Date(purchaseDate + 'T12:00:00')
  if (!billingDay) {
    return { month: d.getMonth() + 1, year: d.getFullYear() }
  }
  if (d.getDate() <= billingDay) {
    return { month: d.getMonth() + 1, year: d.getFullYear() }
  }
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return { month: next.getMonth() + 1, year: next.getFullYear() }
}

/**
 * Retorna el rango del estado de cuenta ACTUALMENTE ABIERTO para una tarjeta con un
 * día de corte dado. El estado abierto es el que se está acumulando ahora.
 *
 * Ejemplo hoy = 20 jun, corte = 15 → abierto: 16 jun – 15 jul (cierra 15 jul)
 * Ejemplo hoy = 10 jun, corte = 15 → abierto: 16 may – 15 jun (cierra 15 jun)
 */
export function currentStatementRange(billingDay: number): {
  start: string  // primer día del período abierto
  end:   string  // fecha de cierre del período
  month: number  // mes del cierre (= mes del estado)
  year:  number
} {
  const today    = new Date()
  const todayDay = today.getDate()
  const y        = today.getFullYear()
  const m        = today.getMonth() // 0-indexed

  let startDate: Date
  let endDate: Date

  if (todayDay <= billingDay) {
    // Corte aún no llegó: estado corre desde el día siguiente al corte del mes anterior
    startDate = new Date(y, m - 1, billingDay + 1)
    endDate   = new Date(y, m,     billingDay)
  } else {
    // Corte ya pasó: estado corre desde el día siguiente al corte de este mes
    startDate = new Date(y, m,     billingDay + 1)
    endDate   = new Date(y, m + 1, billingDay)
  }

  // Clampar endDate al último día real del mes (evita overflow cuando billingDay
  // es mayor que los días del mes, ej: billing_day=31 en junio que tiene 30 días)
  const lastDayOfEndMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate()
  if (endDate.getDate() !== billingDay && billingDay > lastDayOfEndMonth) {
    endDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0)
  }

  // Formatear como YYYY-MM-DD usando componentes locales (sin conversión UTC)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  return {
    start: fmt(startDate),
    end:   fmt(endDate),
    month: endDate.getMonth() + 1,
    year:  endDate.getFullYear(),
  }
}
