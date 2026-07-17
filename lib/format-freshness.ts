const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Última corrida del cron diario (sync-prices → daily_signals), en hora de
 *  Chile — para notar de un vistazo si el pipeline automático dejó de correr.
 *  Compartido entre StockPositionManager y WatchlistPanel (U6 del roadmap
 *  UX): un solo cálculo de frescura, un solo pill en pantalla. */
export function fmtLastAutoUpdate(iso: string): { label: string; stale: boolean } {
  const d  = new Date(iso)
  const cl = new Date(d.toLocaleString('en-US', { timeZone: 'America/Santiago' }))
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }))
  const sameDay = cl.getFullYear() === now.getFullYear() && cl.getMonth() === now.getMonth() && cl.getDate() === now.getDate()
  const hh = String(cl.getHours()).padStart(2, '0')
  const mm = String(cl.getMinutes()).padStart(2, '0')
  const label = sameDay ? `hoy ${hh}:${mm}` : `${cl.getDate()} ${MONTHS_ES[cl.getMonth()]}, ${hh}:${mm}`
  // "Viejo" si no es de hoy ni de ayer (el corte de las 21h hace que el análisis
  // de "ayer" siga siendo válido temprano en la mañana antes de que corra hoy).
  const diffDays = Math.floor((now.getTime() - new Date(cl.getFullYear(), cl.getMonth(), cl.getDate()).getTime()) / 86_400_000)
  return { label, stale: diffDays > 1 }
}
