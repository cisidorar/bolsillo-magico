import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Fecha actual en zona horaria de Chile (America/Santiago).
 * Evita el desfase UTC que hace que el servidor muestre el día siguiente
 * después de las 20:00-21:00 hora chilena.
 */
export function getNowChile(): { now: Date; year: number; month: number; todayDate: number; dateStr: string } {
  const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }) // YYYY-MM-DD
  const [year, month, todayDate] = dateStr.split('-').map(Number)
  const now = new Date(`${dateStr}T12:00:00`)
  return { now, year, month, todayDate, dateStr }
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

/** Formato de fecha elegido en Ajustes → Preferencias → Idioma y región */
export type DateFormat = 'DD/MM/AAAA' | 'MM/DD/AAAA' | 'AAAA-MM-DD'

/** Formatea una fecha en formato numérico según la preferencia del usuario */
export function formatNumericDate(date: Date, format: DateFormat = 'DD/MM/AAAA'): string {
  const dd   = String(date.getDate()).padStart(2, '0')
  const mm   = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  switch (format) {
    case 'MM/DD/AAAA': return `${mm}/${dd}/${yyyy}`
    case 'AAAA-MM-DD': return `${yyyy}-${mm}-${dd}`
    case 'DD/MM/AAAA':
    default:            return `${dd}/${mm}/${yyyy}`
  }
}

/** Fecha relativa corta: "Hoy", "Ayer", o numérica según preferencia (default DD/MM/AAAA) */
export function relativeDate(dateStr: string, dateFormat: DateFormat = 'DD/MM/AAAA'): string {
  const date = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Hoy'
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer'

  return formatNumericDate(date, dateFormat)
}

/**
 * Último día hábil (lunes a viernes) de un mes dado. No considera feriados,
 * solo fines de semana. Usado por "Día de sueldo → Último día hábil".
 */
export function lastBusinessDay(year: number, month: number): number {
  let day = new Date(year, month, 0).getDate() // último día calendario del mes
  let dow = new Date(year, month - 1, day).getDay() // 0=Dom..6=Sáb
  while (dow === 0 || dow === 6) {
    day -= 1
    dow = new Date(year, month - 1, day).getDay()
  }
  return day
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
 * Dado un mes/año de estado de cuenta y el día de corte, retorna el rango exacto
 * de fechas del período:
 *   - end: día de corte del mes del estado (clampado al último día real del mes)
 *   - start: día siguiente al corte del mes anterior (maneja overflow de mes)
 *
 * Ejemplo corte 15, estado junio 2025 → start: 2025-05-16, end: 2025-06-15
 * Ejemplo corte 28, estado marzo 2025 → start: 2025-03-01 (feb solo tiene 28 días)
 */
export function billingPeriodRange(
  statementMonth: number,
  statementYear: number,
  billingDay: number
): { start: string; end: string } {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  // end = día de corte del mes del estado (clampado al último día real)
  const lastDayOfEnd = new Date(statementYear, statementMonth, 0).getDate()
  const endDay = Math.min(billingDay, lastDayOfEnd)
  const endDate = new Date(statementYear, statementMonth - 1, endDay)

  // start = día siguiente al cierre del mes anterior
  // Para evitar overflow (ej: billingDay=28, prevMonth=febrero → no existe día 29):
  // computamos el cierre del mes anterior y le sumamos 1 día
  const prevM = statementMonth === 1 ? 12 : statementMonth - 1
  const prevY = statementMonth === 1 ? statementYear - 1 : statementYear
  const lastDayOfPrev = new Date(prevY, prevM, 0).getDate()
  const prevCloseDay  = Math.min(billingDay, lastDayOfPrev)
  const prevClose     = new Date(prevY, prevM - 1, prevCloseDay)
  const startDate     = new Date(prevClose.getTime() + 86_400_000) // +1 día

  return { start: fmt(startDate), end: fmt(endDate) }
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
  // Hora de Chile, no UTC: cerca de medianoche la fecha UTC ya es "mañana" y
  // el período abierto puede saltar un mes en el borde (mismo bug que tenía
  // auto-register). getNowChile funciona en server y client.
  const { todayDate: todayDay, month: m, year: y } = getNowChile()

  // Si el corte aún no llegó este mes → el estado cierra este mes
  // Si el corte ya pasó → el estado cierra el mes que viene
  const statementMonth = todayDay <= billingDay ? m : (m === 12 ? 1 : m + 1)
  const statementYear  = todayDay <= billingDay ? y : (m === 12 ? y + 1 : y)

  const range = billingPeriodRange(statementMonth, statementYear, billingDay)
  return { ...range, month: statementMonth, year: statementYear }
}

/**
 * Fecha de vencimiento de pago de un estado de cuenta: siempre cae en el mes
 * SIGUIENTE al mes del estado, en el día `paymentDueDay` (ej: estado de julio,
 * paymentDueDay=5 → vence el 5 de agosto). Clampado al último día real del
 * mes si paymentDueDay lo excede (ej: 31 en un mes de 30 días).
 * Usado por la card "Ciclo de sueldo" en /inicio.
 */
export function statementDueDate(
  statementMonth: number,
  statementYear: number,
  paymentDueDay: number
): string {
  const dueMonth = statementMonth === 12 ? 1 : statementMonth + 1
  const dueYear  = statementMonth === 12 ? statementYear + 1 : statementYear
  const lastDay  = new Date(dueYear, dueMonth, 0).getDate()
  const day      = Math.min(paymentDueDay, lastDay)
  return `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Días entre dos fechas YYYY-MM-DD (b − a). Positivo si b es posterior. */
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000)
}

/**
 * Próxima fecha de sueldo (YYYY-MM-DD) a partir de hoy, dado el día de sueldo
 * configurado (`profiles.payday`) o la preferencia "último día hábil"
 * (`profiles.payday_last_business_day`). null si no hay payday configurado.
 * Misma lógica que la cuenta regresiva de /inicio, extraída para reusar en
 * el calendario de flujo de caja (F8) sin duplicar el cálculo día a día.
 */
export function nextPaydayDate(
  todayStr: string,
  payday: number | null,
  paydayIsLastBusinessDay: boolean
): string | null {
  const [y, m, d] = todayStr.split('-').map(Number)
  const fmt = (yy: number, mm: number, dd: number) =>
    `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`

  if (paydayIsLastBusinessDay) {
    const effectiveThis = lastBusinessDay(y, m)
    if (d <= effectiveThis) return fmt(y, m, effectiveThis)
    const nextM = m === 12 ? 1 : m + 1
    const nextY = m === 12 ? y + 1 : y
    return fmt(nextY, nextM, lastBusinessDay(nextY, nextM))
  }

  if (!payday) return null
  const dim = new Date(y, m, 0).getDate()
  const effectivePayday = Math.min(payday, dim)
  if (d <= effectivePayday) return fmt(y, m, effectivePayday)
  const nextM = m === 12 ? 1 : m + 1
  const nextY = m === 12 ? y + 1 : y
  const nextDim = new Date(nextY, nextM, 0).getDate()
  return fmt(nextY, nextM, Math.min(payday, nextDim))
}
