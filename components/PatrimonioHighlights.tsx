import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { formatCLP } from '@/lib/utils'

export interface PatrimonioHighlightsProps {
  idleDeposits: { total: number; count: number }   // DAP vencidos sin renovar
  usdShare: { pct: number; total: number } | null   // acciones + caja USD
  growth: { avgMonthly: number; months: number; avgContribution: number } | null
}

/**
 * Tres lecturas que no se ven sumando las tarjetas de abajo: plata que no está
 * ganando nada, cuánto depende tu patrimonio del dólar y a qué ritmo crece de
 * verdad (separando lo que pones tú de lo que rinde).
 */
export default function PatrimonioHighlights({ idleDeposits, usdShare, growth }: PatrimonioHighlightsProps) {
  const rows: { key: string; title: string; body: string; tone: 'gold' | 'neutral'; href?: string; cta?: string }[] = []

  if (idleDeposits.total > 0) rows.push({
    key: 'idle', tone: 'gold',
    title: `${formatCLP(idleDeposits.total)} sin ganar interés`,
    body: `${idleDeposits.count === 1 ? 'Un depósito a plazo venció' : `${idleDeposits.count} depósitos a plazo vencieron`} y no ${idleDeposits.count === 1 ? 'se renovó' : 'se renovaron'}. Renuévalo o muévelo a ahorro para que vuelva a rendir.`,
    href: '/inversiones?view=ahorro', cta: 'Ver depósitos',
  })

  if (usdShare && usdShare.pct >= 20) rows.push({
    key: 'usd', tone: 'neutral',
    title: `${usdShare.pct}% de tu patrimonio está en dólares`,
    body: `Si el dólar baja 10%, tu patrimonio en pesos baja ~${formatCLP(Math.round(usdShare.total * 0.1))} sin que tus acciones se muevan.`,
  })

  if (growth && growth.months >= 2) {
    const fromReturns = growth.avgMonthly - growth.avgContribution
    rows.push({
      key: 'growth', tone: 'neutral',
      title: `Creces ~${formatCLP(growth.avgMonthly)} al mes`,
      body: growth.avgContribution > 0
        ? `Promedio de ${growth.months} meses: ${formatCLP(growth.avgContribution)} son aportes tuyos y ${fromReturns >= 0 ? '+' : '−'}${formatCLP(Math.abs(fromReturns))} viene de rendimiento y otros movimientos.`
        : `Promedio de los últimos ${growth.months} meses.`,
    })
  }

  if (rows.length === 0) return null

  return (
    <div className="card p-4 lg:p-6 mb-5">
      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Lo importante hoy</p>
      <div className="mt-2 lg:grid lg:grid-cols-3 lg:gap-6">
        {rows.map(r => (
          <div key={r.key} className="py-2.5">
            {r.tone === 'gold' ? (
              <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums"
                style={{ background: 'rgba(255,194,60,0.15)', color: 'var(--gold-ink)' }}>
                {r.title}
              </span>
            ) : (
              <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{r.title}</p>
            )}
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--ink-2)' }}>{r.body}</p>
            {r.href && (
              <Link href={r.href} className="inline-flex items-center gap-1 text-xs font-semibold mt-1.5 min-h-[32px]" style={{ color: 'var(--primary)' }}>
                {r.cta} <ArrowRight className="w-3 h-3" aria-hidden />
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
