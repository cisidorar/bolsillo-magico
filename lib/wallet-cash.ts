// ── Efectivo disponible en la billetera USD ─────────────────────────────────
// sep 2026. Antes esto se calculaba en 5 lugares distintos con la misma
// fórmula equivocada:
//
//     saldo = Σ movimientos (aportes + ventas) − Σ wallet_cost_usd de las
//             posiciones ABIERTAS
//
// El problema: cuando vendes una posición COMPLETA, su fila de
// stock_positions se borra, así que su costo deja de restarse — pero los
// dólares de la venta se quedan sumando. Compraste MELI en 300 y la vendiste
// en 400: el saldo subía 700 en vez de 100.
//
// Se detectó reconciliando la billetera de Cas contra el histórico real del
// bróker: el saldo se veía correcto ($752,50) solo porque ese error de más
// cancelaba casi exacto tres depósitos que nunca se habían registrado. Con
// los depósitos ya cargados, la fórmula vieja daba $3.736 contra ~$743 reales.
//
// La corrección es la identidad de caja de toda la vida: lo que entró menos lo
// que salió. No depende de qué posiciones sigan abiertas.
//
// OJO: esto asume que `stock_purchases` tiene TODAS las compras. Una compra
// sin registrar infla el saldo en su monto — es la contraparte de que la
// fórmula ya no dependa de wallet_cost_usd.

export interface WalletMovement {
  /** 'deposit' = compraste USD con pesos · 'sell' = vendiste acciones */
  kind:       'deposit' | 'sell'
  usd_amount: number
}

export interface WalletPurchase {
  total_paid_usd: number
}

export interface WalletCash {
  /** USD comprados con pesos, acumulado — la línea gris del gráfico. */
  deposited: number
  /** USD recuperados vendiendo acciones. */
  proceeds:  number
  /** USD gastados comprando acciones. */
  spent:     number
  /** Efectivo sin invertir. Puede dar negativo si faltan datos. */
  cash:      number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function computeWalletCash(
  movements: WalletMovement[],
  purchases: WalletPurchase[],
): WalletCash {
  let deposited = 0, proceeds = 0
  for (const m of movements) {
    const amt = Number(m.usd_amount) || 0
    if (m.kind === 'sell') proceeds += amt
    else deposited += amt
  }
  const spent = purchases.reduce((s, p) => s + (Number(p.total_paid_usd) || 0), 0)
  return {
    deposited: round2(deposited),
    proceeds:  round2(proceeds),
    spent:     round2(spent),
    cash:      round2(deposited + proceeds - spent),
  }
}

/** Efectivo disponible para comprar — nunca negativo, para no sugerir montos
 *  imposibles ni romper el sizing de posición. `null` si nunca hubo billetera
 *  (no es lo mismo "no tienes plata" que "no usas esta función"). */
export function availableToInvest(movements: WalletMovement[], purchases: WalletPurchase[]): number | null {
  if (movements.length === 0) return null
  return Math.max(0, computeWalletCash(movements, purchases).cash)
}

/**
 * Misma identidad, para los componentes de cliente que ya reciben los totales
 * en vez de las listas (Radar, TransactionModal): `movementsUsd` es Σ de
 * usd_purchases (aportes + ventas) y `spentUsd` es Σ de las compras.
 *
 * Vive acá y no inline en cada componente a propósito: el bug original fue
 * justamente tener la fórmula copiada en cinco archivos y arreglarla en uno.
 * Devuelve `null` cuando nunca hubo movimientos, igual que availableToInvest.
 */
export function cashFromTotals(movementsUsd: number, spentUsd: number): number | null {
  if (movementsUsd <= 0) return null
  return round2(movementsUsd - spentUsd)
}
