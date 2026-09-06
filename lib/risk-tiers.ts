// ── Clasificación de riesgo de una posición (sep 2026, a pedido de Cas) ──────
// Pedido: un gráfico de torta que agrupe la cartera por riesgo real, no por si
// el vehículo es un ETF o una acción individual — su propio ejemplo lo deja
// claro: AVUV es un ETF pero lo considera "menos riesgo", mientras que SOXL
// también es un ETF pero apalancado 3× (mucho más riesgoso que una acción
// normal), e IBIT es un ETF que es 100% bitcoin. La categoría correcta es el
// riesgo del activo subyacente, no el envoltorio.
//
// Mismo patrón que lib/leveraged-etfs.ts: sin API que dé esto, una lista corta
// y curada de casos conocidos + un default razonable para lo que no está en la
// lista, NUNCA "no se puede clasificar" (eso dejaría el gráfico incompleto).
// La lista no pretende ser exhaustiva ni perfecta — por eso cada posición
// puede tener su propio `risk_tier` guardado que pisa este default (ver
// TransactionModal): si Cas no está de acuerdo con la clasificación de un
// ticker, lo corrige una vez y queda.
import { detectLeverage } from './leveraged-etfs'

export type RiskTier = 'bajo' | 'medio' | 'alto'

export const RISK_TIER_LABEL: Record<RiskTier, string> = {
  bajo:  'Bajo riesgo',
  medio: 'Riesgo',
  alto:  'Riesgo alto',
}

/** Mismo semáforo que el resto de la app (UX5): mint = tranquilo, gold = ojo, coral = urgencia. */
export const RISK_TIER_COLOR: Record<RiskTier, string> = {
  bajo:  'var(--mint)',
  medio: 'var(--gold)',
  alto:  'var(--coral)',
}

export const RISK_TIER_ORDER: RiskTier[] = ['bajo', 'medio', 'alto']

// Diversificado o históricamente poco volátil: índices amplios, bonos y
// blue-chips defensivas. No es "nunca baja" — es que un solo evento no le
// pega como a una acción o un fondo concentrado.
const KNOWN_LOW_RISK = new Set([
  // Índices amplios de mercado
  'VOO', 'SPY', 'IVV', 'VTI', 'SCHB', 'ITOT',
  // Factor funds diversificados (cientos de posiciones, no apalancados)
  'AVUV', 'AVDV', 'AVUS', 'VTV', 'SCHD', 'VYM',
  // Renta fija
  'BND', 'AGG', 'BNDX', 'SCHZ', 'TLT', 'IEF',
  // Blue-chips defensivas de baja volatilidad histórica
  'KO', 'PG', 'JNJ', 'PEP', 'WMT', 'COST', 'MCD',
])

// Especulativo más allá de lo apalancado: cripto envuelta en ETF/trust. El
// riesgo es el del activo subyacente (bitcoin, ether), no el de un fondo
// diversificado — por eso va aparte de detectLeverage, que solo mira el
// apalancamiento nominal del fondo.
const KNOWN_HIGH_RISK = new Set([
  'IBIT', 'FBTC', 'GBTC', 'BITB', 'ARKB', 'BITO', 'ETHE', 'ETHA',
])

/**
 * Riesgo por defecto de un ticker, sin considerar ningún override guardado.
 * `name` es el nombre completo (de price_cache/Quote) — se lo pasamos a
 * detectLeverage para que también detecte apalancados nuevos que no estén en
 * su lista corta (mismo respaldo que ya usa en Radar.tsx).
 */
export function defaultRiskTier(ticker: string, name?: string | null): RiskTier {
  const tk = ticker.toUpperCase()
  if (detectLeverage(tk, name)) return 'alto'
  if (KNOWN_HIGH_RISK.has(tk)) return 'alto'
  if (KNOWN_LOW_RISK.has(tk)) return 'bajo'
  return 'medio'
}

/**
 * Riesgo efectivo de una posición: el override guardado por Cas (columna
 * `risk_tier` de stock_positions) manda sobre el default curado. `null`/
 * `undefined` en el override significa "todavía no lo corrigió" — no "sin
 * riesgo" — así que cae al default, nunca queda sin clasificar.
 */
export function effectiveRiskTier(
  ticker: string,
  override: RiskTier | null | undefined,
  name?: string | null,
): RiskTier {
  return override ?? defaultRiskTier(ticker, name)
}
