// ── E1 (roadmap economía personal, jul 2026): monitor de avisos ─────────────
// Un sistema de alertas que falla en silencio es peor que no tener alertas —
// genera confianza falsa ("ya me van a avisar"). Este módulo resume, a partir
// de `notification_log`, cuándo se envió realmente cada tipo de aviso, y
// detecta el caso concreto que motivó esto: el umbral de presupuesto ya se
// cruzó este mes pero no hay ningún envío de `budget_80`/`budget_100`
// registrado en el mes — exactamente lo que le pasó a Cas en julio 2026 por
// un bug ahora corregido (ver supabase/functions/notify-*).

export interface NotificationLogRow {
  type: string
  sent_at: string  // timestamptz ISO
}

export interface ChannelStatus {
  /** Fecha ISO del envío más reciente encontrado en el log, o null si nunca. */
  lastSentAt: string | null
  /**
   * true cuando la condición de disparo ya se cumplió este mes pero no hay
   * envío registrado en el mes — señal de que el aviso pudo haber fallado.
   * Por ahora solo se evalúa para `budget` (es el único canal cuya condición
   * de disparo se puede recomputar barato en el server component de Ajustes).
   */
  lagging: boolean
}

export interface NotificationStatusSummary {
  billing:          ChannelStatus
  budget:           ChannelStatus
  monthly:          ChannelStatus
  recurring:        ChannelStatus
  watchlistDigest:  ChannelStatus
  weeklyReport:     ChannelStatus
  depositMaturity:  ChannelStatus
}

/** Último `sent_at` (ISO, comparación lexicográfica válida) entre los tipos dados. */
function latestOf(byType: Map<string, string>, types: string[]): string | null {
  let best: string | null = null
  for (const t of types) {
    const v = byType.get(t)
    if (v && (!best || v > best)) best = v
  }
  return best
}

export function summarizeNotificationStatus({
  logs,
  monthStr,        // 'YYYY-MM' del mes en curso, para el chequeo de "lagging"
  budgetPct,        // % de presupuesto usado este mes, null si no hay presupuesto definido
  budgetThreshold,  // profiles.budget_alert_pct del usuario
}: {
  logs: NotificationLogRow[]
  monthStr: string
  budgetPct: number | null
  budgetThreshold: number
}): NotificationStatusSummary {
  const latestByType = new Map<string, string>()
  for (const l of logs) {
    const prev = latestByType.get(l.type)
    if (!prev || l.sent_at > prev) latestByType.set(l.type, l.sent_at)
  }

  const billingLast         = latestOf(latestByType, ['billing'])
  const budgetLast          = latestOf(latestByType, ['budget_80', 'budget_100'])
  const monthlyLast         = latestOf(latestByType, ['monthly'])
  const recurringLast       = latestOf(latestByType, ['recurring_due', 'recurring_overdue'])
  const watchlistDigestLast = latestOf(latestByType, ['watchlist_digest'])
  const weeklyReportLast    = latestOf(latestByType, ['weekly_report'])
  const depositMaturityLast = latestOf(latestByType, ['deposit_maturity'])

  const budgetSentThisMonth = budgetLast !== null && budgetLast.startsWith(monthStr)
  const budgetLagging =
    budgetPct !== null && budgetPct >= budgetThreshold && !budgetSentThisMonth

  return {
    billing:         { lastSentAt: billingLast,         lagging: false },
    budget:          { lastSentAt: budgetLast,          lagging: budgetLagging },
    monthly:         { lastSentAt: monthlyLast,         lagging: false },
    recurring:       { lastSentAt: recurringLast,       lagging: false },
    watchlistDigest: { lastSentAt: watchlistDigestLast, lagging: false },
    weeklyReport:    { lastSentAt: weeklyReportLast,    lagging: false },
    depositMaturity: { lastSentAt: depositMaturityLast, lagging: false },
  }
}
