// ── Utilidades de earnings compartidas (server + client) — D3 del roadmap de
// calidad de decisión. El fetch a Finnhub vive en app/api/stock-earnings
// (server-only); esto es solo el cálculo puro de "días hábiles hasta la
// fecha", reutilizado en la ruta y en los componentes cliente.

export interface EarningsInfo {
  symbol:    string
  nextDate:  string | null   // YYYY-MM-DD, próxima fecha de resultados conocida (hoy o futura)
  asOf:      string          // ISO del momento en que se calculó
}

/** Días HÁBILES (lun-vie, sin feriados) entre hoy y `dateStr` — 0 si es hoy,
 *  null si `dateStr` es pasado o inválido. Suficiente para "en cuántos días
 *  hábiles reporta": no hace falta la precisión de feriados NYSE acá, es un
 *  aviso de contexto, no un cálculo financiero. */
export function businessDaysUntil(dateStr: string | null, todayStr?: string): number | null {
  if (!dateStr) return null
  const today  = todayStr ? new Date(todayStr + 'T12:00:00') : new Date(new Date().toISOString().slice(0, 10) + 'T12:00:00')
  const target = new Date(dateStr + 'T12:00:00')
  if (isNaN(target.getTime())) return null
  if (target < today) return null

  let days = 0
  const d = new Date(today)
  while (d < target) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) days++
  }
  return days
}
