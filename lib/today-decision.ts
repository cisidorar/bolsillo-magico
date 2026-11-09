// Forma de las filas de daily_decisions / daily_signals que lee /inversiones
// para armar la línea "Hoy" y la tarjeta "¿Qué comprar hoy?" (Radar).
// Antes vivían en components/TodayQueue.tsx, un componente que ya no se
// renderiza.

export interface TodayDecision {
  ticker:        string | null   // null = "hoy no compres nada"
  tier:          string | null
  score:         number
  suggested_usd: number | null
  verdict:       string
  reasons:       string[]
}

export interface TodaySignal {
  ticker:  string
  kind:    'sell' | 'caution' | 'target'
  message: string
  price:   number
}
