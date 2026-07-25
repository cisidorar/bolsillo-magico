import Link from 'next/link'
import { Wallet, CreditCard, TrendingUp, PiggyBank, ArrowRight } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import ServiceLogo from './ServiceLogo'
import InfoTap from './InfoTap'

export type CicloSueldoCard = {
  id: string
  name: string
  domain: string | null
  statementTotal: number
  closesOn: string          // YYYY-MM-DD
  dueDate: string | null    // null si la tarjeta no tiene payment_due_day configurado
  daysToDue: number | null
  statementMonth: number    // mes del estado mostrado — para enlazar a /cuenta/[id]
  statementYear: number
}

interface Props {
  sueldo: number | null          // último ingreso registrado (estimado del próximo)
  sueldoMonthLabel: string | null // ej. "según jul" — de qué mes es el dato
  card: CicloSueldoCard | null
  investGoal: number | null      // meta mensual definida (solo referencia, no entra en el cálculo)
  investedThisMonth: number      // real: depósitos a la billetera USD este mes calendario
  debitSpentThisMonth: number    // real: gasto en débito/efectivo/digital este mes calendario
}

const fmtShort = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '')

export default function CicloSueldo({ sueldo, sueldoMonthLabel, card, investGoal, investedThisMonth, debitSpentThisMonth }: Props) {
  if (sueldo === null) {
    return (
      <div className="card p-4 flex items-center gap-3" style={{ borderColor: 'var(--border)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-soft)' }}>
          <Wallet className="w-4 h-4" style={{ color: 'var(--primary)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Ciclo de sueldo</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Registra tu ingreso del mes para ver cuánto te queda libre cuando llegue tu sueldo.</p>
        </div>
        <Link href="/ingresos" className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--primary)' }}>Registrar</Link>
      </div>
    )
  }

  const deuda   = card?.statementTotal ?? 0
  const queda   = sueldo - deuda - investedThisMonth - debitSpentThisMonth

  return (
    <div className="card overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Wallet className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
          <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Ciclo de sueldo</h2>
        </div>
        {sueldoMonthLabel && (
          <span className="text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>{sueldoMonthLabel}</span>
        )}
      </div>

      <div className="px-4 pb-3 space-y-2.5">
        {/* Sueldo */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Wallet className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--mint)' }} />
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>Sueldo</span>
          </div>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--mint)' }}>+{formatCLP(sueldo)}</span>
        </div>

        {/* Tarjeta de crédito — toca para ver la factura con el detalle de gastos */}
        {card && (
          <Link
            href={`/cuenta/${card.id}?month=${card.statementMonth}&year=${card.statementYear}`}
            className="flex items-center justify-between -mx-1 px-1 py-0.5 rounded-lg transition-opacity hover:opacity-70"
          >
            <div className="flex items-center gap-2 min-w-0">
              <ServiceLogo domain={card.domain} name={card.name} size={20} className="flex-shrink-0" />
              <div className="min-w-0">
                <span className="text-sm block truncate" style={{ color: 'var(--ink-2)' }}>{card.name}</span>
                {card.dueDate ? (
                  <span className="text-[10px]" style={{ color: card.daysToDue !== null && card.daysToDue <= 3 ? 'var(--gold)' : 'var(--ink-3)' }}>
                    Vence {fmtShort(card.dueDate)}{card.daysToDue !== null ? ` · en ${card.daysToDue}d` : ''}
                  </span>
                ) : (
                  <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>Sin día de pago configurado</span>
                )}
              </div>
            </div>
            <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--coral)' }}>−{formatCLP(deuda)}</span>
          </Link>
        )}

        {/* Invertido este mes (real, no meta) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
            <div className="min-w-0">
              <span className="text-sm block" style={{ color: 'var(--ink-2)' }}>Invertido este mes</span>
              {investedThisMonth === 0 ? (
                <Link href="/inversiones" className="text-[10px] font-semibold" style={{ color: 'var(--primary)' }}>
                  Aún no registras aportes →
                </Link>
              ) : investGoal !== null ? (
                <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>de tu meta {formatCLP(investGoal)}</span>
              ) : null}
            </div>
          </div>
          <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: investedThisMonth > 0 ? 'var(--coral)' : 'var(--ink-3)' }}>
            {investedThisMonth > 0 ? `−${formatCLP(investedThisMonth)}` : '—'}
          </span>
        </div>

        {/* Gasto en débito este mes (real, no promedio) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <CreditCard className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
            <div className="min-w-0">
              <span className="text-sm block" style={{ color: 'var(--ink-2)' }}>Débito / efectivo</span>
              <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>gastado este mes</span>
            </div>
          </div>
          <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink-3)' }}>
            {debitSpentThisMonth > 0 ? `−${formatCLP(debitSpentThisMonth)}` : '—'}
          </span>
        </div>
      </div>

      {/* Queda para ahorro */}
      <div className="flex items-center justify-between px-4 py-3.5" style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <PiggyBank className="w-4 h-4 flex-shrink-0" style={{ color: queda >= 0 ? 'var(--mint)' : 'var(--coral)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Queda para ahorro</span>
          <InfoTap explanation="Sueldo menos la tarjeta por pagar, menos lo que ya invertiste este mes, menos lo que ya gastaste en débito/efectivo este mes. Es tu saldo real hasta hoy, no una proyección." />
        </div>
        <span className="text-base font-extrabold tabular-nums" style={{ color: queda >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
          {queda < 0 ? '−' : ''}{formatCLP(Math.abs(queda))}
        </span>
      </div>
    </div>
  )
}
