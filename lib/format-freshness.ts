import { lastNyseTradingDayOnOrBefore } from './nyse-calendar'

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function pad(n: number): string { return String(n).padStart(2, '0') }
function dateStr(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function shiftDate(ymd: string, days: number): string {
  const dt = new Date(ymd + 'T12:00:00')
  dt.setDate(dt.getDate() + days)
  return dateStr(dt)
}

/** Última corrida del cron diario (sync-prices → daily_signals), en hora de
 *  Chile — para notar de un vistazo si el pipeline automático dejó de correr.
 *  Compartido entre StockPositionManager y WatchlistPanel (U6 del roadmap
 *  UX): un solo cálculo de frescura, un solo pill en pantalla.
 *
 * sep 2026: "viejo si no es de hoy ni de ayer" contaba días de CALENDARIO —
 * cada lunes (Viernes→Lunes son 3 días) y cada feriado NYSE entre semana
 * (Labor Day, lunes 7 sep 2026: Viernes→Martes son 4 días) esto marcaba
 * coral "revisa el cron" con el cron corriendo perfecto, porque el mercado
 * simplemente no operó esos días — bug real reportado por Cas ("no corrió el
 * cron"), confirmado con datos: daily_signals SÍ estaba al día con el último
 * cierre disponible. Ahora compara contra el último día HÁBIL NYSE antes de
 * hoy (lib/nyse-calendar.ts), no contra "ayer" a secas — un viernes sigue
 * siendo la referencia válida el lunes Y el martes feriado. */
export function fmtLastAutoUpdate(iso: string, nowReal: Date = new Date()): { label: string; stale: boolean } {
  const d  = new Date(iso)
  const cl = new Date(d.toLocaleString('en-US', { timeZone: 'America/Santiago' }))
  const now = new Date(nowReal.toLocaleString('en-US', { timeZone: 'America/Santiago' }))
  const sameDay = cl.getFullYear() === now.getFullYear() && cl.getMonth() === now.getMonth() && cl.getDate() === now.getDate()
  const hh = String(cl.getHours()).padStart(2, '0')
  const mm = String(cl.getMinutes()).padStart(2, '0')
  const label = sameDay ? `hoy ${hh}:${mm}` : `${cl.getDate()} ${MONTHS_ES[cl.getMonth()]}, ${hh}:${mm}`

  // Referencia: el último día hábil NYSE ANTES de hoy — no hoy mismo, porque
  // el cron corre de noche (≈18:30-19:30 CL) y temprano en el día el análisis
  // del hábil anterior sigue siendo válido, no atrasado.
  const referenceDate = lastNyseTradingDayOnOrBefore(shiftDate(dateStr(now), -1))
  const stale = dateStr(cl) < referenceDate
  return { label, stale }
}
