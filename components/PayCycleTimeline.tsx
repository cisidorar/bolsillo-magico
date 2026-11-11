// El ciclo de sueldo dibujado: pago → liquidación → gastos → próximo pago.
// Es lo que distingue a esta página: el sueldo llega a fin de mes, la
// liquidación unos días después, y con él se pagan los gastos del mes que
// viene. Puro y sin estado, para poder renderizarlo en el servidor.

export interface PayCycleProps {
  lastPay:       string          // YYYY-MM-DD, último pago ya ocurrido
  nextPay:       string | null   // YYYY-MM-DD, próximo pago (null si no hay día configurado)
  today:         string
  payslipDone:   boolean         // ¿ya está registrado el sueldo de ese pago?
  paidMonthName: string          // mes que pagó ese sueldo ("octubre")
  daysToPay:     number | null
}

const SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const short = (d: string) => `${Number(d.slice(8))} ${SHORT[Number(d.slice(5, 7)) - 1]}`
const ms = (d: string) => new Date(d + 'T12:00:00').getTime()

export default function PayCycleTimeline({ lastPay, nextPay, today, payslipDone, paidMonthName, daysToPay }: PayCycleProps) {
  const end = nextPay ?? lastPay
  const span = Math.max(1, ms(end) - ms(lastPay))
  const pct = (d: string) => Math.min(100, Math.max(0, ((ms(d) - ms(lastPay)) / span) * 100))
  const todayPct = nextPay ? pct(today) : 0
  // La liquidación suele llegar ~5 días después del pago.
  const slipDate = new Date(ms(lastPay) + 5 * 86_400_000)
  const slipStr = `${slipDate.getFullYear()}-${String(slipDate.getMonth() + 1).padStart(2, '0')}-${String(slipDate.getDate()).padStart(2, '0')}`
  const slipPct = nextPay ? Math.min(pct(slipStr), 40) : 20

  const node = (left: number, label: string, sub: string, done: boolean, key: string) => (
    <div key={key} className="absolute top-0 -translate-x-1/2 flex flex-col items-center" style={{ left: `${left}%` }}>
      <span className="w-3 h-3 rounded-full" style={{ background: done ? 'var(--primary)' : 'var(--surface)', boxShadow: `0 0 0 2px ${done ? 'var(--primary)' : 'var(--border)'}` }} />
      <span className="text-[11px] font-bold mt-2 whitespace-nowrap" style={{ color: 'var(--ink)' }}>{label}</span>
      <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>{sub}</span>
    </div>
  )

  return (
    <div className="card p-5 lg:p-6 mb-6">
      <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Tu ciclo de sueldo</h2>
      <p className="text-[11px] mt-0.5 mb-5" style={{ color: 'var(--ink-3)' }}>
        Con el sueldo de {paidMonthName} pagas los gastos de este mes.
      </p>
      <div
        role="img"
        aria-label={`Pago del ${short(lastPay)}, liquidación ${payslipDone ? 'registrada' : 'pendiente'}${nextPay ? `, próximo pago el ${short(nextPay)}` : ''}`}
        className="relative mx-4 mb-14"
        style={{ height: 12 }}
      >
        <div className="absolute left-0 right-0 top-[5px] h-[2px] rounded-full" style={{ background: 'var(--border)' }} />
        {nextPay && (
          <div className="absolute left-0 top-[5px] h-[2px] rounded-full" style={{ width: `${todayPct}%`, background: 'var(--primary)' }} />
        )}
        {node(0, 'Te pagaron', short(lastPay), true, 'pay')}
        {node(slipPct, 'Liquidación', payslipDone ? 'registrada' : 'por registrar', payslipDone, 'slip')}
        {nextPay && node(100, 'Próximo pago', daysToPay !== null ? (daysToPay === 0 ? 'hoy' : `en ${daysToPay} días`) : short(nextPay), false, 'next')}
        {nextPay && todayPct > 0 && todayPct < 100 && (
          <div className="absolute -translate-x-1/2 -top-5 text-[11px] font-bold" style={{ left: `${todayPct}%`, color: 'var(--primary)' }}>
            Hoy
          </div>
        )}
      </div>
    </div>
  )
}
