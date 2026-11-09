'use client'

import { getExpenseIcon, guessMerchantDomain } from '@/lib/expense-icons'
import ServiceLogo from '@/components/ServiceLogo'

/** Ícono de una fila de gasto (pedido de Cas, ago 2026): si la descripción
 *  nombra una marca reconocida (guessMerchantDomain, lista curada) muestra su
 *  logo real vía ServiceLogo — igual que Métodos de pago. Si no hay match
 *  confiable, cae al ícono genérico de siempre (getExpenseIcon). ServiceLogo
 *  ya resuelve su propio fallback (emoji o inicial) si el logo no carga. */
export default function ExpenseRowIcon({
  description,
  categoryName,
  categoryColor,
  categoryBg,
  size = 32,
}: {
  description: string | null
  categoryName: string | null
  /** Si viene, el ícono toma el color de la categoría (pedido de Cas, nov 2026);
   *  el dibujo sigue saliendo de la descripción (getExpenseIcon). */
  categoryColor?: string | null
  categoryBg?: string | null
  size?: number
}) {
  const { icon: Icon, color: autoColor, bg: autoBg } = getExpenseIcon(description, categoryName)
  const color = categoryColor ?? autoColor
  const bg = categoryBg ?? autoBg
  const domain = guessMerchantDomain(description)

  if (domain) {
    return (
      <ServiceLogo
        domain={domain}
        name={description ?? categoryName ?? '?'}
        size={size}
        fallbackColor={color}
      />
    )
  }

  return (
    <div
      className="rounded-xl flex items-center justify-center flex-shrink-0 cat-icon-bg"
      style={{ width: size, height: size, '--cat-bg': bg, '--cat-color': color } as React.CSSProperties}
    >
      <Icon className={categoryColor ? 'cat-text' : undefined}
        style={{ width: Math.round(size * 0.44), height: Math.round(size * 0.44), ...(categoryColor ? {} : { color }) }} />
    </div>
  )
}
