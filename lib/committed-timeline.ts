// ── E2 (roadmap economía personal, jul 2026): línea de tiempo de compromiso ──
// computeCommittedDebt() (lib/net-worth.ts) ya calcula CUÁNTO está
// comprometido hoy, pero solo como un escalar dentro del health score. Este
// módulo responde la pregunta que realmente motiva mirarlo: ¿CUÁNDO se libera
// esa plata? Proyecta, mes a mes hacia adelante, el compromiso fijo conocido
// (cuotas pendientes + fijos indefinidos + anuales en su mes) — NO incluye
// compras sueltas con tarjeta (no son recurrentes, no hay nada que proyectar
// a futuro sobre ellas) ni el estado de cuenta en curso (eso ya lo cubre
// Flujo de caja 30 días, con el detalle día a día que esto no necesita).

export interface CommittedTimelineItem {
  name: string
  amount: number
  /** null = mensual o en cuotas (se cobra cada mes); 1–12 = anual, se cobra una vez ese mes. */
  billing_month: number | null
  /** null = fijo indefinido (arriendo, suscripciones); N = en cuotas, con `paidInstallments` ya pagadas. */
  totalInstallments: number | null
  paidInstallments: number
  isActive: boolean
  /** Día del mes en que se cobra (1–31). Necesario para saber si el cargo
   *  del mes actual ya pasó (billingDay <= todayDay) — en ese caso, los
   *  cargos restantes empiezan el mes siguiente, no este mes. */
  billingDay?: number | null
}

export interface ReleasingItem {
  name: string
  amount: number
}

export interface CommittedStatement {
  label: string
  amount: number
  /** YYYY-MM-DD — se suma al mes/año de esta fecha si cae dentro del horizonte. */
  dueDate: string
}

export interface CommittedMonth {
  month: number  // 1-12
  year: number
  total: number
  /** true cuando en este mes termina al menos una cuota — el compromiso baja respecto de este mes en adelante. */
  freesUp: boolean
  releasing: ReleasingItem[]
}

/**
 * Proyecta el compromiso mensual desde (startMonth, startYear) hacia
 * adelante, `horizonMonths` meses (default 12, empezando por el mes actual).
 *
 * `statements` — estados de cuenta de tarjeta con vencimiento YA CONOCIDO
 * (el más próximo a vencer de cada tarjeta, calculado en la página). A
 * diferencia de cuotas/fijos/anuales, el gasto con tarjeta de meses futuros
 * todavía no existe — no se puede proyectar, así que solo se suma el
 * vencimiento conocido más cercano, en su mes correspondiente. Sin esto, "Ya
 * comprometido" podía verse artificialmente bajo frente al vencimiento real
 * más grande del usuario (el estado de cuenta), que ya se mostraba al lado
 * en Flujo de caja 30 días — una discrepancia confusa entre dos cards
 * vecinas.
 */
export function buildCommittedTimeline(
  items: CommittedTimelineItem[],
  startMonth: number,
  startYear: number,
  horizonMonths = 12,
  statements: CommittedStatement[] = [],
  todayDay = 1,
): CommittedMonth[] {
  const months: CommittedMonth[] = []
  for (let i = 0; i < horizonMonths; i++) {
    let m = startMonth + i
    let y = startYear
    while (m > 12) { m -= 12; y++ }
    months.push({ month: m, year: y, total: 0, freesUp: false, releasing: [] })
  }

  for (const item of items) {
    if (!item.isActive) continue

    if (item.billing_month !== null) {
      // Anual: se cobra una sola vez, en su mes — cae exactamente una vez
      // dentro de cualquier ventana de 12 meses consecutivos.
      const idx = months.findIndex(mo => mo.month === item.billing_month)
      if (idx >= 0) months[idx].total += item.amount
      continue
    }

    if (item.totalInstallments !== null) {
      // En cuotas: quedan (total - pagadas) meses.
      // Si el billing_day del mes actual ya pasó (ej. hoy=26, billing_day=24),
      // el cargo de este mes ya ocurrió → los restantes empiezan el mes siguiente.
      const remaining = Math.max(0, item.totalInstallments - item.paidInstallments)
      const offset = (item.billingDay != null && item.billingDay <= todayDay) ? 1 : 0
      const lastIdx = offset + remaining - 1
      for (let i = offset; i < offset + remaining && i < months.length; i++) {
        months[i].total += item.amount
      }
      if (remaining > 0 && lastIdx < months.length) {
        months[lastIdx].freesUp = true
        months[lastIdx].releasing.push({ name: item.name, amount: item.amount })
      }
      continue
    }

    // Fijo indefinido: se paga todos los meses del horizonte.
    for (const mo of months) mo.total += item.amount
  }

  for (const st of statements) {
    const [y, m] = st.dueDate.split('-').map(Number)
    const idx = months.findIndex(mo => mo.month === m && mo.year === y)
    if (idx >= 0) months[idx].total += st.amount
  }

  return months
}

/** % del ingreso ya comprometido en un mes dado. null si no hay ingreso registrado. */
export function committedPct(monthTotal: number, income: number | null): number | null {
  if (!income || income <= 0) return null
  return Math.round((monthTotal / income) * 100)
}
