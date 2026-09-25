// ── Qué cobros recurrentes están pendientes de registrar ────────────────────
// Extraído de app/actions/auto-register.ts (sep 2026) para poder testearlo sin
// Supabase, a raíz de un bug real reportado por Cas:
//
//   Spotify (billing_day 29) no se registró en agosto. El auto-registro corre
//   SOLO cuando se abre la app, y solo miraba el mes calendario en curso
//   (`eff <= todayDay` con currentMonth = hoy). Cas usó la app por última vez
//   el 27 de agosto y volvió el 2 de septiembre: el 29 pasó sin que nadie
//   ejecutara el chequeo, y al volver la comparación quedó `29 <= 2` → falso.
//   Agosto quedó en un hueco del que la app ya no salía sola.
//
// La corrección es mirar también los meses YA CERRADOS dentro de una ventana
// acotada, y registrar cada cobro con la fecha real en que correspondía —
// no con la de hoy, que mandaría el gasto al mes equivocado y rompería
// tanto el historial como el período de facturación de la tarjeta.

/** Cuántos meses hacia atrás se revisan además del mes en curso. */
export const CATCHUP_MONTHS = 3

export interface DueItem {
  /** Día del mes en que se cobra (1-31). */
  billingDay: number
  /** Mes de cobro (1-12) si es anual; null si es mensual. */
  billingMonth?: number | null
}

export interface DueDate {
  /** Fecha del cobro en formato YYYY-MM-DD. */
  date:  string
  year:  number
  month: number
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * Día real del cobro en un mes dado. Un ítem que cobra el 31 no puede cobrarse
 * el 31 de febrero: cae al último día disponible del mes.
 */
export function effectiveDay(billingDay: number, year: number, month: number): number {
  return Math.min(billingDay, daysInMonth(year, month))
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Todas las fechas de cobro de un ítem MENSUAL que ya pasaron y siguen dentro
 * de la ventana de catch-up, de la más antigua a la más reciente.
 *
 * El mes en curso entra solo si el día de cobro ya llegó; los meses anteriores
 * entran completos (su día de cobro ya pasó por definición).
 *
 * `createdAt` acota el arranque: un recurrente creado en agosto no debe
 * inventar cobros de junio. Se compara contra la fecha del cobro, así que un
 * ítem creado el 20 de agosto con billing_day 29 sí genera el de agosto.
 */
export function monthlyDueDates(
  item:     DueItem,
  todayStr: string,
  createdAt?: string | null,
  months = CATCHUP_MONTHS,
): DueDate[] {
  const [ty, tm] = todayStr.split('-').map(Number)
  const out: DueDate[] = []

  // De más antiguo a más nuevo: el orden importa para que el historial quede
  // coherente si se insertan en lote.
  for (let back = months; back >= 0; back--) {
    let month = tm - back
    let year  = ty
    while (month <= 0) { month += 12; year -= 1 }

    const day  = effectiveDay(item.billingDay, year, month)
    const date = iso(year, month, day)

    if (date > todayStr) continue                    // el cobro aún no llega
    if (createdAt && date < createdAt.slice(0, 10)) continue  // anterior al alta
    out.push({ date, year, month })
  }
  return out
}

/**
 * Igual que monthlyDueDates pero para cobros ANUALES (billing_month). Devuelve
 * a lo más una fecha por año calendario dentro de la ventana.
 */
export function annualDueDates(
  item:     DueItem,
  todayStr: string,
  createdAt?: string | null,
  months = CATCHUP_MONTHS,
): DueDate[] {
  if (item.billingMonth == null) return []
  const [ty, tm] = todayStr.split('-').map(Number)

  // Años a considerar: el actual y el anterior solo si la ventana de catch-up
  // cruza el cambio de año (ej. hoy 2 de enero mirando 3 meses atrás).
  const years = tm - months <= 0 ? [ty - 1, ty] : [ty]
  const out: DueDate[] = []

  for (const year of years) {
    const month = item.billingMonth
    const day   = effectiveDay(item.billingDay, year, month)
    const date  = iso(year, month, day)

    if (date > todayStr) continue
    if (createdAt && date < createdAt.slice(0, 10)) continue

    // Fuera de la ventana de catch-up (en meses) → no revivir cobros viejos.
    const monthsAgo = (ty - year) * 12 + (tm - month)
    if (monthsAgo > months) continue

    out.push({ date, year, month })
  }
  return out
}

/**
 * Fecha proyectada del próximo cobro de un recurrente "cada N meses" (N>1),
 * sin importar si ya llegó o no — sep 2026, Cas: "Comida Kida" se repite
 * cada ~2 meses, no cada mes, y el monto varía (no es un cargo fijo).
 *
 * A diferencia de monthlyDueDates, esto NO es una función de calendario pura
 * sobre billing_day: se ancla a la fecha del ÚLTIMO gasto real vinculado
 * (lastPaidDate), o a la fecha de alta (createdAt) si todavía no se ha
 * registrado ninguno.
 */
export function projectedIntervalDate(
  intervalMonths: number,
  lastPaidDate:   string | null,
  createdAt:      string,
): DueDate {
  const anchor  = lastPaidDate ?? createdAt.slice(0, 10)
  const [ay, am, ad] = anchor.split('-').map(Number)
  let year  = ay
  let month = am + intervalMonths
  while (month > 12) { month -= 12; year += 1 }

  const day  = effectiveDay(ad, year, month)
  return { date: iso(year, month, day), year, month }
}

/**
 * Igual que projectedIntervalDate, pero solo si el cobro YA VENCIÓ (fecha
 * <= hoy) — para detectar "atrasados". Tampoco hay ventana de catch-up de
 * varios ciclos como en monthlyDueDates: solo existe UN próximo cobro
 * pendiente a la vez, porque no son cargos automáticos de monto fijo que
 * tenga sentido "recuperar" en lote — son compras reales que la persona ya
 * hizo o no.
 *
 * Devuelve null si el próximo cobro todavía no llega.
 */
export function intervalDueDate(
  intervalMonths: number,
  lastPaidDate:   string | null,
  createdAt:      string,
  todayStr:       string,
): DueDate | null {
  const due = projectedIntervalDate(intervalMonths, lastPaidDate, createdAt)
  return due.date > todayStr ? null : due
}
