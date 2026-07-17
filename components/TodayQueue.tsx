import Link from 'next/link'
import { Target, DollarSign, AlertTriangle, Flag } from 'lucide-react'

// ── "Hoy": la cola de acciones del día, arriba de todo (U1 del roadmap UX) ──
// Antes la decisión ("¿qué comprar hoy?") vivía al fondo de Favoritos y las
// alarmas de venta eran un chip suelto en cada fila de la tabla — había que
// bajar toda la página para saber si hoy tocaba hacer algo. Esto junta todo
// lo accionable en un solo lugar, server-side, leyendo la MISMA fuente que
// el correo diario (daily_decisions + daily_signals) — no un recálculo
// client-side que puede desalinearse con el cierre que se analizó.
// Server Component: sin interactividad, es la síntesis; el detalle y las
// acciones viven en las tablas de abajo.

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

function fmtUSD(n: number): string {
  return 'US$' + n.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const KIND_UI: Record<TodaySignal['kind'], { label: string; color: string; bg: string; Icon: typeof DollarSign }> = {
  sell:    { label: 'Vender',         color: 'var(--coral)',   bg: 'rgba(255,111,97,0.10)', Icon: DollarSign },
  caution: { label: 'Toma de ganancias', color: 'var(--gold)',  bg: 'rgba(255,194,60,0.12)', Icon: AlertTriangle },
  target:  { label: 'Precio objetivo',   color: 'var(--primary)', bg: 'rgba(43,124,246,0.10)', Icon: Flag },
}

export default function TodayQueue({
  decision, signals,
}: {
  decision: TodayDecision | null
  signals:  TodaySignal[]
}) {
  const isBuy = decision !== null && decision.ticker !== null && (decision.tier === 'compra' || decision.tier === 'compra_fuerte')
  const hasNothing = decision === null && signals.length === 0

  if (hasNothing) return null   // sin historia suficiente todavía (cuenta nueva) — no mostrar una card vacía confusa

  return (
    <div className="card overflow-hidden mb-4">
      <div className="px-4 lg:px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
        <Target className="w-4 h-4" style={{ color: 'var(--primary)' }} />
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Hoy</p>
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>

        {/* Decisión de compra — el veredicto comparado, mismo cálculo del correo.
            Clickeable (I1 roadmap interacción): antes había que bajar a buscar el
            ticker en la lista para poder actuar sobre lo que este panel decía. */}
        {decision && (
          isBuy ? (
            <Link href={`?ticker=${decision.ticker}`} scroll={false}
              className="px-4 lg:px-5 py-3.5 flex items-center gap-3 transition-colors hover:bg-black/5" style={{ background: 'rgba(31,190,141,0.06)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(31,190,141,0.16)' }}>
                <span className="text-[11px] font-extrabold tabular-nums" style={{ color: 'var(--mint)' }}>{decision.score}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                  Compra {decision.suggested_usd !== null ? `hasta ${fmtUSD(decision.suggested_usd)} de ` : ''}{decision.ticker}
                </p>
                <p className="text-[11px] leading-snug mt-0.5" style={{ color: 'var(--ink-3)' }}>{decision.verdict}</p>
              </div>
            </Link>
          ) : (
            <div className="px-4 lg:px-5 py-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--surface-2)' }}>
                <span className="text-[15px]">—</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>Hoy no compres nada</p>
                <p className="text-[11px] leading-snug mt-0.5" style={{ color: 'var(--ink-3)' }}>{decision.verdict}</p>
              </div>
            </div>
          )
        )}

        {/* Ventas, toma de ganancias, precios objetivo — todo lo demás accionable hoy */}
        {signals.map((s, i) => {
          const ui = KIND_UI[s.kind]
          return (
            <Link key={`${s.ticker}-${s.kind}-${i}`} href={`?ticker=${s.ticker}`} scroll={false}
              className="px-4 lg:px-5 py-3.5 flex items-center gap-3 transition-colors hover:bg-black/5" style={{ background: ui.bg }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--surface)' }}>
                <ui.Icon className="w-4 h-4" style={{ color: ui.color }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                  {ui.label}: {s.ticker}
                </p>
                <p className="text-[11px] leading-snug mt-0.5" style={{ color: 'var(--ink-3)' }}>{s.message}</p>
              </div>
            </Link>
          )
        })}

        {/* Sin nada accionable hoy, pero sí hay decisión de "no comprar" arriba */}
        {!decision && signals.length === 0 && null}
      </div>
    </div>
  )
}
