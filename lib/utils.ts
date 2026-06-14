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
