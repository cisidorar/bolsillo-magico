import { detectLeverage } from './leveraged-etfs'

// ── Exposición por tema (nov 2026) ───────────────────────────────────────────
// Caso real: a la semana del 20-nov, 53% del costo de la cartera estaba en
// semiconductores/IA (SOXL, MU, TSM, NVDA, INTC, SNDK) — SOXL además 3×. Cada
// acción se evaluaba por separado y el motor siguió sugiriendo "compra fuerte"
// dentro del mismo tema una y otra vez: seis posiciones distintas, UNA sola
// apuesta (el índice de semis cayó 10,7% en un día; las seis cayeron juntas).
//
// Esto NO predice nada: limita cuánto de la cartera puede depender de la misma
// causa. Mide a valor de mercado (lo que hoy está en riesgo) y cuenta los ETF
// apalancados por su factor (US$100 de SOXL se mueven como US$300 de semis).
//
// Los temas son una lista corta y explícita, no una clasificación completa: un
// ticker que no figura no tiene tema y no se limita. Gigantes tecnológicos
// (MSFT, GOOGL, META…) también dependen del gasto en IA, pero son negocios
// distintos — no se mezclan aquí.

export type ThemeKey = 'semis_ia' | 'cripto'

/** Tope de exposición efectiva a un mismo tema, como % del valor total de la cartera. */
export const THEME_CAP_PCT = 35

/** Desde qué fracción del tope se avisa (gold chip) sin bloquear aún. */
export const THEME_WARN_FRACTION = 0.8

const THEMES: Record<ThemeKey, { label: string; tickers: string[] }> = {
  semis_ia: {
    label: 'semiconductores / IA',
    tickers: [
      'NVDA', 'AMD', 'AVGO', 'TSM', 'MU', 'INTC', 'SNDK', 'WDC', 'STX', 'QCOM', 'MRVL', 'ARM',
      'AMAT', 'LRCX', 'KLAC', 'ASML', 'TXN', 'ADI', 'MCHP', 'ON', 'NXPI', 'SMCI',
      'SOXL', 'SOXX', 'SMH',
    ],
  },
  cripto: {
    label: 'cripto',
    tickers: ['IBIT', 'FBTC', 'GBTC', 'BITO', 'ETHA', 'MSTR', 'COIN'],
  },
}

const THEME_OF: Record<string, ThemeKey> = {}
for (const [key, def] of Object.entries(THEMES) as [ThemeKey, { label: string; tickers: string[] }][]) {
  for (const t of def.tickers) THEME_OF[t] = key
}

export function themeOf(ticker: string): ThemeKey | null {
  return THEME_OF[ticker.toUpperCase()] ?? null
}

export interface ThemePosition {
  ticker:   string
  valueUsd: number          // valor de mercado actual de la posición
  name?:    string | null   // para detectar apalancamiento por nombre
}

export interface ThemeExposure {
  theme:        ThemeKey
  label:        string
  valueUsd:     number      // valor de mercado sumado (sin apalancar)
  effectiveUsd: number      // con ETF apalancados contados por su factor
  pct:          number      // effectiveUsd / valor total de la cartera × 100
  tickers:      string[]
}

/** Exposición por tema. `portfolioUsd` = posiciones + efectivo (mismo total que
 *  muestra la app); comprar con efectivo no cambia ese total, solo lo reparte. */
export function computeThemeExposure(positions: ThemePosition[], portfolioUsd: number): ThemeExposure[] {
  if (!(portfolioUsd > 0)) return []
  const acc = new Map<ThemeKey, ThemeExposure>()
  for (const p of positions) {
    const theme = themeOf(p.ticker)
    if (!theme || !(p.valueUsd > 0)) continue
    const lev = detectLeverage(p.ticker, p.name)?.factor ?? 1
    const cur = acc.get(theme) ?? { theme, label: THEMES[theme].label, valueUsd: 0, effectiveUsd: 0, pct: 0, tickers: [] }
    cur.valueUsd += p.valueUsd
    cur.effectiveUsd += p.valueUsd * lev
    cur.tickers.push(p.ticker)
    acc.set(theme, cur)
  }
  return [...acc.values()]
    .map(e => ({ ...e, pct: Math.round((e.effectiveUsd / portfolioUsd) * 1000) / 10 }))
    .sort((a, b) => b.pct - a.pct)
}

export interface ThemeCapCheck {
  theme:     ThemeKey
  label:     string
  pct:       number        // exposición efectiva actual
  capPct:    number
  /** true si ya está en el tope o sobre él: no se sugiere sumar más al tema. */
  blocked:   boolean
  /** USD reales que aún caben bajo el tope (ya dividido por el apalancamiento). */
  maxAddUsd: number
}

/** ¿Cabe comprar `ticker` sin pasar el tope de su tema? null si no tiene tema. */
export function checkThemeCap(
  ticker: string,
  exposures: ThemeExposure[],
  portfolioUsd: number,
  name?: string | null,
  capPct: number = THEME_CAP_PCT,
): ThemeCapCheck | null {
  const theme = themeOf(ticker)
  if (!theme || !(portfolioUsd > 0)) return null
  const exp = exposures.find(e => e.theme === theme)
  const effective = exp?.effectiveUsd ?? 0
  const pct = exp?.pct ?? 0
  const lev = detectLeverage(ticker, name)?.factor ?? 1
  const roomEffective = (capPct / 100) * portfolioUsd - effective
  const maxAddUsd = Math.max(0, Math.round((roomEffective / lev) * 100) / 100)
  return { theme, label: THEMES[theme].label, pct, capPct, blocked: roomEffective <= 0, maxAddUsd }
}

/** Temas que ya pesan ≥ 80% del tope (para el chip gold de aviso). */
export function themesNearCap(exposures: ThemeExposure[], capPct: number = THEME_CAP_PCT): ThemeExposure[] {
  return exposures.filter(e => e.pct >= capPct * THEME_WARN_FRACTION)
}
