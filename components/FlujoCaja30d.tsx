import Link from 'next/link'
import { Wallet, CreditCard, RefreshCw, AlertTriangle, Info } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import ServiceLogo from './ServiceLogo'
import type { CashFlowEventWithBalance } from '@/lib/cash-flow'

interface Props {
  events: CashFlowEventWithBalance[]
  hasPayday: boolean
  hasIncome: boolean
  cardsWithoutDueDay: string[]
  /** UX5 — jerarquía de alerta única: máximo un banner coral por pantalla. Si ya
   *  hay un banner coral más urgente (p. ej. atrasados), este riesgo se degrada
   *  a un chip gold inline en vez de su propio banner completo. */
  muteRiskBanner?: boolean
}

const fmtDay = (dateStr: string, daysUntil: number) => {
  if (daysUntil === 0) return 'Hoy'
  if (daysUntil === 1) return 'Mañana'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '')
}

const ICONS = { income: Wallet, card: CreditCard, recurring: RefreshCw }

export default function FlujoCaja30d({ events, hasPayday, hasIncome, cardsWithoutDueDay, muteRiskBanner }: Props) {
  const minBalance = events.length > 0 ? Math.min(...events.map(e => e.runningBalance)) : 0
  const hasRisk    = minBalance < 0

  return (
    <div className="card overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Próximos 30 días</h2>
          {hasRisk && muteRiskBanner && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,194,60,0.15)', color: 'var(--gold)' }}>
              Riesgo de saldo negativo
            </span>
          )}
        </div>
        <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>flujo neto proyectado</span>
      </div>

      {events.length === 0 ? (
        <div className="px-4 pb-4">
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
            {!hasPayday
              ? 'Configura tu día de sueldo en Ajustes para ver tu flujo de los próximos 30 días.'
              : !hasIncome
                ? 'Registra tu ingreso del mes en /ingresos para proyectar tu flujo.'
                : 'No hay eventos programados en los próximos 30 días.'}
          </p>
          {!hasPayday && (
            <Link href="/ajustes" className="text-xs font-semibold mt-2 inline-block" style={{ color: 'var(--primary)' }}>Ir a Ajustes →</Link>
          )}
        </div>
      ) : (
        <>
          {hasRisk && !muteRiskBanner && (
            <div className="flex items-center gap-2 mx-4 mb-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(239,91,82,0.10)', border: '1px solid rgba(239,91,82,0.25)' }}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--coral)' }} />
              <p className="text-xs font-semibold" style={{ color: 'var(--coral)' }}>
                Tu flujo proyectado queda en negativo en algún punto de estos 30 días.
              </p>
            </div>
          )}

          <div className="px-4 pb-1 space-y-0">
            {events.map((e, i) => {
              const Icon = ICONS[e.type]
              const isIncome = e.amount >= 0
              return (
                <div
                  key={`${e.type}-${e.label}-${e.date}-${i}`}
                  className="flex items-center gap-3 py-2.5"
                  style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}
                >
                  {e.domain !== undefined ? (
                    <ServiceLogo domain={e.domain ?? null} name={e.label} size={28} className="flex-shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: isIncome ? 'rgba(31,190,141,0.12)' : 'var(--surface-2)' }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: isIncome ? 'var(--mint)' : 'var(--ink-3)' }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{e.label}</p>
                    <p className="text-[10px]" style={{ color: 'var(--ink-3)' }}>
                      {fmtDay(e.date, e.daysUntil)}{e.sublabel ? ` · ${e.sublabel}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold tabular-nums" style={{ color: isIncome ? 'var(--mint)' : 'var(--coral)' }}>
                      {isIncome ? '+' : '−'}{formatCLP(Math.abs(e.amount))}
                    </p>
                    <p className="text-[9px] tabular-nums" style={{ color: e.runningBalance < 0 ? 'var(--coral)' : 'var(--ink-3)' }}>
                      saldo {formatCLP(e.runningBalance)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {cardsWithoutDueDay.length > 0 && (
        <div className="flex items-start gap-2 mx-4 mb-4 mt-2 px-3 py-2.5 rounded-xl" style={{ background: 'var(--surface-2)' }}>
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--ink-3)' }} />
          <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
            {cardsWithoutDueDay.join(', ')} no {cardsWithoutDueDay.length === 1 ? 'tiene' : 'tienen'} día de pago configurado.{' '}
            <Link href="/metodos" className="font-semibold" style={{ color: 'var(--primary)' }}>Configurar →</Link>
          </p>
        </div>
      )}
    </div>
  )
}
