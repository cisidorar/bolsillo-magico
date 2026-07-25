import Link from 'next/link'
import { Wallet, CreditCard, TrendingUp, PiggyBank } from 'lucide-react'
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
  sueldo: number | null          // ingreso registrado del mes que financia este ciclo — null si aún no lo registras
  sueldoMonthLabel: string       // ej. "de jul" — de qué mes es el sueldo que corresponde a este ciclo
  card: CicloSueldoCard | null
  investGoal: number | null      // meta mensual definida (solo referencia, no entra en el cálculo)
  investedThisMonth: number      // real: depósitos a la billetera USD este mes calendario
  debitSpentThisMonth: number    // real: gasto en débito/efectivo/digital este mes calendario
}

const fmtShort = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '')

export default function CicloSueldo({ sueldo, sueldoMonthLabel, card, investGoal, investedThisMonth, debitSpentThisMonth }: Props) {
  const deuda = card?.statementTotal ?? 0
  // "Queda para ahorro" no se puede calcular sin saber el sueldo real de este
  // ciclo — mostrar un número igual sería inventar un saldo. queda = null
  // hasta que el sueldo esté registrado (UX5/real-hasta-hoy: no proyectar).
  const queda = sueldo !== null ? sueldo - deuda - investedThisMonth - debitSpentThisMonth : null

  return (
    <div className="card overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Wallet className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
          <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Ciclo de sueldo</h2>
        </div>
        <span className="text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>{sueldoMonthLabel}</span>
      </div>

      <div className="px-4 pb-3 space-y-2.5">
        {/* Sueldo */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Wallet className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--mint)' }} />
            <div className="min-w-0">
              <span className="text-sm block" style={{ color: 'var(--ink-2)' }}>Sueldo</span>
              {sueldo === null && (
                <Link href="/ingresos" className="text-[10px] font-semibold" style={{ color: 'var(--primary)' }}>
                  Aún no lo registras →
                </Link>
              )}
            </div>
          </div>
          <span className="text-sm font-bold tabular-nums" style={{ color: sueldo !== null ? 'var(--mint)' : 'var(--ink-3)' }}>
            {sueldo !== null ? `+${formatCLP(sueldo)}` : '—'}
          </span>
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
          <PiggyBank className="w-4 h-4 flex-shrink-0" style={{ color: queda === null ? 'var(--ink-3)' : queda >= 0 ? 'var(--mint)' : 'var(--coral)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Queda para ahorro</span>
          <InfoTap explanation="Sueldo menos la tarjeta por pagar, menos lo que ya invertiste este mes, menos lo que ya gastaste en débito/efectivo este mes. Es tu saldo real hasta hoy, no una proyección — por eso necesita que registres tu sueldo primero." />
        </div>
        <span className="text-base font-extrabold tabular-nums" style={{ color: queda === null ? 'var(--ink-3)' : queda >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
          {queda === null ? '—' : `${queda < 0 ? '−' : ''}${formatCLP(Math.abs(queda))}`}
        </span>
      </div>
    </div>
  )
}
