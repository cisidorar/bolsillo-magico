// ── Calendario de días hábiles NYSE (compartido) ────────────────────────────
// sep 2026: antes esta lista vivía duplicada dentro de
// app/api/cron/sync-prices/route.ts, sin nada que la comparara contra "cuándo
// se ve vieja una actualización" (lib/format-freshness.ts contaba días de
// calendario a secas). Resultado real: cada lunes — y peor, cada feriado NYSE
// entre semana (Labor Day cayó lunes 7 sep 2026) — el pill de "análisis"
// pasaba a coral "revisa el cron" aunque el cron hubiera corrido perfecto el
// último día hábil, porque de Viernes a Lunes/Martes son 3-4 días de
// calendario. Cas lo reportó como "no corrió el cron" — el cron SÍ corrió (se
// saltó a propósito el feriado, correcto), la alarma era falsa.
//
// Este archivo es la única fuente de verdad del lado Node/Next (route.ts y
// cualquier componente cliente pueden importarlo). La Edge Function
// notify-watchlist-digest (Deno) mantiene su PROPIA copia de las fechas a
// propósito — no puede importar código de lib/ (dos runtimes distintos,
// mismo criterio que fedRateSentence/computeRatePath documentado ahí).
// Actualizar los dos lados si cambia el calendario NYSE de un año nuevo.

export interface NyseHoliday {
  date:  string   // YYYY-MM-DD
  label: string
}

export const NYSE_HOLIDAYS: Record<number, NyseHoliday[]> = {
  2026: [
    { date: '2026-01-01', label: 'Año Nuevo' },
    { date: '2026-01-19', label: 'Martin Luther King Jr. Day' },
    { date: '2026-02-16', label: "Washington's Birthday" },
    { date: '2026-04-03', label: 'Good Friday' },
    { date: '2026-05-25', label: 'Memorial Day' },
    { date: '2026-06-19', label: 'Juneteenth' },
    { date: '2026-07-03', label: 'Independence Day (observado)' },
    { date: '2026-09-07', label: 'Labor Day' },
    { date: '2026-11-26', label: 'Thanksgiving' },
    { date: '2026-12-25', label: 'Navidad' },
  ],
  2027: [
    { date: '2027-01-01', label: 'Año Nuevo' },
    { date: '2027-01-18', label: 'Martin Luther King Jr. Day' },
    { date: '2027-02-15', label: "Washington's Birthday" },
    { date: '2027-03-26', label: 'Good Friday' },
    { date: '2027-05-31', label: 'Memorial Day' },
    { date: '2027-06-18', label: 'Juneteenth (observado)' },
    { date: '2027-07-05', label: 'Independence Day (observado)' },
    { date: '2027-09-06', label: 'Labor Day' },
    { date: '2027-11-25', label: 'Thanksgiving' },
    { date: '2027-12-24', label: 'Navidad (observado)' },
  ],
}

function shiftDate(dateStr: string, days: number): string {
  const dt = new Date(dateStr + 'T12:00:00')   // mediodía: mismo truco que lib/property-charges.ts para no saltar de día por huso horario
  dt.setDate(dt.getDate() + days)
  return dt.toISOString().slice(0, 10)
}

/** true si `dateStr` cae sábado o domingo — el calendario NYSE no distingue huso horario para esto, un YYYY-MM-DD es el mismo día de semana en cualquier zona. */
export function isNyseWeekend(dateStr: string): boolean {
  const day = new Date(dateStr + 'T12:00:00').getDay()
  return day === 0 || day === 6
}

/** Nombre del feriado NYSE en `dateStr`, o null si no lo es (o si el año no está cargado — ver NYSE_HOLIDAYS arriba). */
export function nyseHolidayLabel(dateStr: string): string | null {
  const year = Number(dateStr.slice(0, 4))
  const match = NYSE_HOLIDAYS[year]?.find(h => h.date === dateStr)
  return match?.label ?? null
}

/** true si `dateStr` es un día hábil NYSE: ni fin de semana ni feriado. */
export function isNyseTradingDay(dateStr: string): boolean {
  return !isNyseWeekend(dateStr) && !nyseHolidayLabel(dateStr)
}

/** El último día hábil NYSE en `dateStr` o antes (lo incluye si ya lo es). Tope de 14 días hacia atrás — de sobra, nunca hay más de ~4 días seguidos cerrados. */
export function lastNyseTradingDayOnOrBefore(dateStr: string): string {
  let d = dateStr
  for (let i = 0; i < 14; i++) {
    if (isNyseTradingDay(d)) return d
    d = shiftDate(d, -1)
  }
  return dateStr
}

/** Fecha de hoy en YYYY-MM-DD, hora de Nueva York (la que manda para el calendario NYSE). */
export function todayEt(now: Date = new Date()): string {
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const y = et.getFullYear(), m = String(et.getMonth() + 1).padStart(2, '0'), d = String(et.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
