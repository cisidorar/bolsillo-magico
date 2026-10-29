import { formatCLP } from '@/lib/utils'

/**
 * "Tu año en números": ingresos registrados, gasto, aporte a inversión y lo que
 * queda. Responde la pregunta de un resumen anual antes de entrar en detalle.
 */
export default function AnnualFlow({
  year, income, spent, invested, incomeMonths, expectedMonths,
}: {
  year: number
  income: number
  spent: number
  invested: number
  incomeMonths: number
  expectedMonths: number
}) {
  if (income <= 0 || incomeMonths < 3) return null

  const left = income - spent - invested
  const base = Math.max(income, spent + invested, 1)
  const spentPct = Math.round((spent / base) * 100)
  const investPct = Math.min(100 - spentPct, Math.round((invested / base) * 100))
  const leftPct = Math.max(0, 100 - spentPct - investPct)
  const keptPct = Math.round(((income - spent) / income) * 100)

  const cells: { label: string; value: string; dot: string; color?: string; hint?: string }[] = [
    { label: 'Ingresos', value: formatCLP(income), dot: 'var(--ink-3)', hint: `${incomeMonths} ${incomeMonths === 1 ? 'mes' : 'meses'} registrados` },
    { label: 'Gastado', value: formatCLP(spent), dot: '#FF6F61', hint: `${Math.round((spent / income) * 100)}% de lo que ganaste` },
    { label: 'Invertido', value: formatCLP(invested), dot: '#1FBE8D', hint: 'Aportes a acciones y dólares' },
    { label: left >= 0 ? 'Queda' : 'Faltó', value: formatCLP(Math.abs(left)), dot: '#4D93FF', color: left >= 0 ? 'var(--ink)' : 'var(--coral-ink)', hint: 'Ingresos − gasto − inversión' },
  ]

  return (
    <div className="card p-4 lg:p-6 mb-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Tu {year} en números</p>
        <p className="text-xs font-semibold tabular-nums" style={{ color: keptPct >= 0 ? 'var(--mint-ink)' : 'var(--coral-ink)' }}>
          {keptPct >= 0 ? `Guardaste el ${keptPct}% de lo que ganaste` : `Gastaste ${Math.abs(keptPct)}% más de lo que ganaste`}
        </p>
      </div>

      <div className="flex h-3 rounded-full overflow-hidden mt-3" style={{ background: 'var(--surface-2)' }}
        role="img" aria-label={`Del total de ingresos, ${spentPct}% gastado, ${investPct}% invertido y ${leftPct}% restante`}>
        {spentPct > 0 && <div style={{ width: `${spentPct}%`, background: '#FF6F61' }} />}
        {investPct > 0 && <div style={{ width: `${investPct}%`, background: '#1FBE8D' }} />}
        {leftPct > 0 && <div style={{ width: `${leftPct}%`, background: '#4D93FF' }} />}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        {cells.map(c => (
          <div key={c.label}>
            <p className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: c.dot }} aria-hidden />{c.label}
            </p>
            <p className="text-base lg:text-lg font-extrabold tabular-nums mt-0.5" style={{ color: c.color ?? 'var(--ink)' }}>{c.value}</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-2)' }}>{c.hint}</p>
          </div>
        ))}
      </div>

      {incomeMonths < expectedMonths && (
        <p className="text-[11px] mt-3 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          Solo {incomeMonths} de {expectedMonths} meses tienen ingreso registrado: el porcentaje guardado puede verse más bajo de lo real.
        </p>
      )}
    </div>
  )
}
