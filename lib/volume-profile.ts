// ── Perfil de volumen simplificado: POC (point of control) ──────────────────
// El precio en el que más volumen se negoció en la ventana reciente — no es
// una opinión, es un hecho agregado de los datos (igual en espíritu a un
// soporte/resistencia por toques, pero pesado por volumen en vez de por
// cantidad de toques). Con velas diarias (sin datos intrabar) se aproxima
// acumulando el volumen de cada día en el bin de precio que contiene su
// cierre — suficiente para ubicar zonas de alta liquidez a nivel semanal,
// que es el horizonte de decisión de esta app (ver lib/technical.ts).

export interface VolumeProfileBin {
  priceLow:  number
  priceHigh: number
  volume:    number
}

export interface VolumeProfile {
  poc:       number   // precio (punto medio del bin ganador) de mayor volumen negociado
  rangeLow:  number
  rangeHigh: number
  bins:      VolumeProfileBin[]   // ordenados de precio menor a mayor
}

/**
 * Perfil de volumen sobre los últimos `lookback` cierres/volúmenes.
 * `numBins` divide el rango [mín, máx] de esa ventana en franjas de igual
 * ancho. null si no hay datos suficientes o el rango es degenerado.
 */
export function computeVolumeProfile(
  closes: number[],
  volumes: number[],
  lookback = 60,
  numBins = 20,
): VolumeProfile | null {
  const n = closes.length
  if (n === 0 || volumes.length !== n || numBins < 1) return null

  const start = Math.max(0, n - lookback)
  const windowCloses  = closes.slice(start)
  const windowVolumes = volumes.slice(start)

  const rangeLow  = Math.min(...windowCloses)
  const rangeHigh = Math.max(...windowCloses)

  // Rango degenerado (un solo precio en toda la ventana): un bin único con
  // todo el volumen — sigue siendo un resultado válido, no un error.
  if (rangeHigh === rangeLow) {
    const totalVolume = windowVolumes.reduce((s, v) => s + v, 0)
    return {
      poc: rangeLow,
      rangeLow,
      rangeHigh,
      bins: [{ priceLow: rangeLow, priceHigh: rangeHigh, volume: totalVolume }],
    }
  }

  const binWidth = (rangeHigh - rangeLow) / numBins
  const bins: VolumeProfileBin[] = Array.from({ length: numBins }, (_, i) => ({
    priceLow:  rangeLow + i * binWidth,
    priceHigh: rangeLow + (i + 1) * binWidth,
    volume:    0,
  }))

  for (let i = 0; i < windowCloses.length; i++) {
    const price = windowCloses[i]
    let idx = Math.floor((price - rangeLow) / binWidth)
    if (idx >= numBins) idx = numBins - 1   // el máximo exacto cae en el último bin
    if (idx < 0) idx = 0
    bins[idx].volume += windowVolumes[i]
  }

  let pocIdx = 0
  for (let i = 1; i < bins.length; i++) {
    if (bins[i].volume > bins[pocIdx].volume) pocIdx = i
  }
  const pocBin = bins[pocIdx]
  const poc = (pocBin.priceLow + pocBin.priceHigh) / 2

  return { poc, rangeLow, rangeHigh, bins }
}
