import { formatCLP } from '@/lib/utils'
import { realReturnPct } from '@/lib/cl-indicators'
import { computeRentaFijaSummary, type SavingsLike } from '@/lib/renta-fija-summary'
import type { DepositLike } from '@/lib/term-deposits'
import StatHeroRow from '@/components/StatHeroRow'

// ── A2 (roadmap ROADMAP-ahorro-depositos.md): hero de resumen que combina
// Ahorro y Depósitos a plazo en una sola pregunta — "¿cuánta plata segura
// tengo en pesos y cuánto me está rindiendo?" — sin perder la distinción
// que sí le importa a Cas: el ahorro se puede sacar hoy, el depósito no
// hasta su vencimiento. Ver lib/renta-fija-summary.ts para el cálculo.
// Layout (mockup de Cas, ago 2026): una sola banda vía StatHeroRow — antes
// era hero-gradient + grid de 3 KPI cards separado.

function fmtPct(n: number): string {
  return n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + '%'
}

interface Props {
  savings:  SavingsLike[]
  deposits: DepositLike[]
  todayStr: string
  trailingInflationPct?: number | null
}

export default function RentaFijaSummary({ savings, deposits, todayStr, trailingInflationPct = null }: Props) {
  if (savings.length === 0 && deposits.length === 0) return null

  const r = computeRentaFijaSummary(savings, deposits, todayStr)

  const caption = r.weightedRatePct > 0
    ? `${fmtPct(r.weightedRatePct)} TAE promedio${
        trailingInflationPct !== null ? ` · ≈${fmtPct(realReturnPct(r.weightedRatePct, trailingInflationPct))} real` : ''
      }`
    : undefined

  return (
    <div className="mb-4">
      <StatHeroRow
        variant="hero"
        label="Total en pesos"
        value={formatCLP(r.totalCurrentValue)}
        caption={caption}
        stats={[
          { label: 'Disponible',      value: formatCLP(r.availableToday) },
          { label: 'Comprometido',    value: formatCLP(r.committed) },
          { label: 'Interés ganado',  value: `+${formatCLP(r.earnedCombined)}`, color: '#7CF2CB' },
        ]}
      />
    </div>
  )
}
