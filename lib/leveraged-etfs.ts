// ── Detección de ETFs apalancados/inversos (D6, roadmap de calidad de decisión) ──
// SOXL (3× semiconductores) y similares tienen decay estructural: mantenerlos
// semanas en mercado lateral pierde valor aunque el índice subyacente termine
// plano, y su volatilidad hace que la alarma de salida por ATR quede lejísimos
// del precio — el motor los trataba como cualquier acción normal: mismos
// umbrales, misma regla del 1% (que con 3× de apalancamiento implícito es en
// realidad ~3% de riesgo económico real). Sin API nueva: lista corta de
// tickers conocidos + detección por nombre como respaldo.

export interface LeverageInfo {
  factor: number          // 2 o 3 (el apalancamiento nominal diario)
  source: 'known' | 'name'
}

// Los más comunes en brokers retail — no pretende ser exhaustiva, solo cubrir
// los casos típicos (semis, índices amplios, sectores, bonos, oro/petróleo).
const KNOWN_LEVERAGED: Record<string, number> = {
  SOXL: 3, SOXS: 3, TQQQ: 3, SQQQ: 3, UPRO: 3, SPXU: 3, SPXL: 3, SPXS: 3,
  TNA: 3, TZA: 3, LABU: 3, LABD: 3, FAS: 3, FAZ: 3, TMF: 3, TMV: 3,
  UDOW: 3, SDOW: 3, YINN: 3, YANG: 3, TECL: 3, TECS: 3, CURE: 3, DPST: 3,
  NUGT: 2, DUST: 2, BOIL: 2, KOLD: 2, QLD: 2, QID: 2, SSO: 2, SDS: 2,
  UWM: 2, TWM: 2, UCO: 2, SCO: 2,
}

/** ¿Es un ETF apalancado/inverso? `name` es el nombre completo (ej. de
 *  price_cache/ServiceLogo) — se usa como respaldo cuando el ticker no está
 *  en la lista conocida (fondos nuevos, variantes regionales, etc.). */
export function detectLeverage(ticker: string, name?: string | null): LeverageInfo | null {
  const known = KNOWN_LEVERAGED[ticker.toUpperCase()]
  if (known) return { factor: known, source: 'known' }

  if (!name) return null
  // "...Bull 3X Shares", "...Ultra 2x ...", "...Daily Bull 3X ..."
  const m = name.match(/(\d)\s*[xX](?:\b|shares)/)
  if (m) {
    const factor = Number(m[1])
    if (factor >= 2 && factor <= 5 && /bull|bear|ultra|daily/i.test(name)) return { factor, source: 'name' }
  }
  return null
}
