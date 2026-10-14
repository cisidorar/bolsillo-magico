// Editar / eliminar UNA compra del historial (stock_purchases) y propagar el
// cambio al agregado de la posición (stock_positions). oct 2026 (Cas: "quiero
// editar una de esas compras, quedó mal registrada"): el timeline de
// Movimientos era solo lectura y la única forma de corregir era "Editar
// posición", que pisa el agregado sin tocar las compras individuales — las
// dos cosas quedaban desalineadas.
//
// Se trabaja por DELTA sobre el agregado (no se recalcula desde cero a partir
// de stock_purchases) porque las posiciones legacy / las ventas parciales ya
// movieron acciones y costo por fuera de la lista de compras.

export interface PurchaseAmounts { shares: number; total: number }

export interface PositionAggregate {
  shares:          number
  avg_cost_usd:    number
  wallet_cost_usd: number
}

export type PurchaseChangeResult =
  | { ok: true;  position: PositionAggregate }
  | { ok: false; error: string }

const round8 = (n: number) => Math.round(n * 1e8) / 1e8
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Quita `oldP` del agregado y suma `newP` (null = eliminar la compra).
 * - acciones y costo total se ajustan por la diferencia; el promedio se recalcula.
 * - el costo financiado por billetera se ajusta igual, solo si la posición ya
 *   usaba billetera (wallet_cost_usd > 0), y nunca baja de 0.
 */
export function applyPurchaseChange(
  pos: PositionAggregate,
  oldP: PurchaseAmounts,
  newP: PurchaseAmounts | null,
): PurchaseChangeResult {
  const shares = round8(pos.shares - oldP.shares + (newP?.shares ?? 0))
  if (shares <= 1e-6) {
    return { ok: false, error: 'Es la única compra de la posición — usa "Eliminar sin registrar venta".' }
  }
  const cost = pos.shares * pos.avg_cost_usd - oldP.total + (newP?.total ?? 0)
  if (!(cost > 0)) {
    return { ok: false, error: 'Con ese cambio el costo de la posición quedaría en cero o negativo.' }
  }
  const wallet = pos.wallet_cost_usd > 0
    ? round2(Math.max(0, pos.wallet_cost_usd - oldP.total + (newP?.total ?? 0)))
    : pos.wallet_cost_usd
  return {
    ok: true,
    position: { shares, avg_cost_usd: cost / shares, wallet_cost_usd: wallet },
  }
}
