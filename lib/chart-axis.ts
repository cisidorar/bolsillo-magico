// Helpers puros del gráfico de patrimonio (sep 2026) — separados del
// componente para poder testearlos sin JSX (vitest no transforma .tsx acá).

export const MONTH_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
export const MONTH_LONG  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

/** 'YYYY-MM-DD' → '3 ago' */
export function fmtDayShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`
}

/** 'YYYY-MM-DD' → '3 ago 2026' */
export function fmtDayLong(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

/** Paso "redondo" (1, 2, 2,5 o 5 × 10^k) para ~`target` divisiones del rango. */
export function niceStep(range: number, target: number): number {
  const raw  = range / Math.max(target, 1)
  const pow  = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const frac = raw / pow
  const mult = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10
  return mult * pow
}

/** Índices del eje X: ~`target` repartidos parejo, siempre el último, sin choques con él. */
export function xLabelIndices(n: number, target: number): number[] {
  if (n <= target) return Array.from({ length: n }, (_, i) => i)
  const step = Math.ceil((n - 1) / (target - 1))
  const out: number[] = []
  for (let i = 0; i < n - 1; i += step) {
    if (n - 1 - i >= step * 0.6) out.push(i)
  }
  out.push(n - 1)
  return out
}

