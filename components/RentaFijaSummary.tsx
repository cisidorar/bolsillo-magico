import { Wallet, Lock, TrendingUp } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { realReturnPct } from '@/lib/cl-indicators'
import { computeRentaFijaSummary, type SavingsLike } from '@/lib/renta-fija-summary'
import type { DepositLike } from '@/lib/term-deposits'

// ── A2 (roadmap ROADMAP-ahorro-depositos.md): hero de resumen que combina
// Ahorro y Depósitos a plazo en una sola pregunta — "¿cuánta plata segura
// tengo en pesos y cuánto me está rindiendo?" — sin perder la distinción
// que sí le importa a Cas: el ahorro se puede sacar hoy, el depósito no
// hasta su vencimiento. Ver lib/renta-fija-summary.ts para el cálculo.

function fmtPct(n: number): string {
  return n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + '%'
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-CL', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
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

  return (
    <div className="card overflow-hidden hero-gradient mb-4">
      <div className="px-5 pt-5 pb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Total en pesos
        </p>
        <p
          className="text-4xl lg:text-5xl font-extrabold tabular-nums leading-none"
          style={{ color: 'white', fontFamily: 'Fredoka, sans-serif' }}
        >
          {formatCLP(r.totalCurrentValue)}
        </p>
        <p className="text-[11px] mt-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {fmtPct(r.weightedRatePct)} TAE promedio ponderada
          {trailingInflationPct !== null && r.weightedRatePct > 0 && (
            <> · ≈{fmtPct(realReturnPct(r.weightedRatePct, trailingInflationPct))} real (IPC {fmtPct(trailingInflationPct)} 12m)</>
          )}
        </p>
      </div>

      <div className="border-t grid grid-cols-3" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
        <div className="px-2 py-3 lg:px-5 lg:py-4 min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1 whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <Wallet className="w-2.5 h-2.5" /> Disponible hoy
          </p>
          <p className="text-xs sm:text-sm lg:text-base font-bold tabular-nums truncate" style={{ color: 'white' }}>
            {formatCLP(r.availableToday)}
          </p>
        </div>
        <div className="px-2 py-3 lg:px-5 lg:py-4 border-l min-w-0" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
          <p className="text-[9px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1 whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <Lock className="w-2.5 h-2.5" /> Comprometido
          </p>
          <p className="text-xs sm:text-sm lg:text-base font-bold tabular-nums truncate" style={{ color: 'white' }}>
            {formatCLP(r.committed)}
          </p>
          {r.nearestMaturityDate && (
            <p className="text-[9px] mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>
              hasta {fmtDate(r.nearestMaturityDate)}
            </p>
          )}
        </div>
        <div className="px-2 py-3 lg:px-5 lg:py-4 border-l min-w-0" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
          <p className="text-[9px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1 whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <TrendingUp className="w-2.5 h-2.5" /> Interés ganado
          </p>
          <p className="text-xs sm:text-sm lg:text-base font-bold tabular-nums truncate" style={{ color: '#7CF2CB' }}>
            +{formatCLP(r.earnedCombined)}
          </p>
        </div>
      </div>
    </div>
  )
}
