'use client'

import { ChevronRight, CalendarDays } from 'lucide-react'
import { formatCLP, daysBetween, nextPaydayDate } from '@/lib/utils'
import ServiceLogo from '@/components/ServiceLogo'
import { RECURRING, SUELDO, catOf, shortDate, monthShort } from './data'
import { sum, nextChargeDate, type MonthCtx } from './calc'

// La cuota del notebook termina en 3 meses: se ve cómo baja lo comprometido.
const CUOTAS_LEFT = 3

export default function RecurrentesScreen({ ctx }: { ctx: MonthCtx }) {
  const today = ctx.dateStr
  const monthly = sum(RECURRING.map(r => r.amount))

  const withNext = RECURRING
    .map(r => ({ r, date: nextChargeDate(r.day, ctx) }))
    .map(x => ({ ...x, days: daysBetween(today, x.date) }))
    .sort((a, b) => a.days - b.days)

  const week = withNext.filter(x => x.days <= 7)
  const changes = RECURRING.filter(r => r.prevAmount)
  const byCat = Object.values(RECURRING.reduce<Record<string, { name: string; color: string; total: number; n: number }>>((acc, r) => {
    const c = catOf(r.categoryId)
    acc[c.id] = acc[c.id] ?? { name: c.name, color: c.color, total: 0, n: 0 }
    acc[c.id].total += r.amount; acc[c.id].n += 1
    return acc
  }, {})).sort((a, b) => b.total - a.total).slice(0, 4)

  // Lo comprometido de los próximos 6 meses: las cuotas salen de la cuenta a medida que terminan.
  const cuotaAmt = RECURRING.find(r => r.note)?.amount ?? 0
  const months = Array.from({ length: 6 }, (_, i) => {
    const t = ctx.year * 12 + (ctx.month - 1) + i
    return { label: monthShort((t % 12) + 1), value: monthly - (i >= CUOTAS_LEFT ? cuotaAmt : 0) }
  })
  const maxBar = Math.max(...months.map(m => m.value))

  const nextPay = nextPaydayDate(today, null, true)
  const flow = [
    ...withNext.filter(x => x.days <= 30).map(x => ({ key: x.r.id, date: x.date, name: x.r.name, amount: -x.r.amount, cat: catOf(x.r.categoryId) })),
    ...(nextPay && daysBetween(today, nextPay) <= 30 ? [{ key: 'sueldo', date: nextPay, name: 'Sueldo', amount: SUELDO, cat: null as ReturnType<typeof catOf> | null }] : []),
  ].sort((a, b) => (a.date < b.date ? -1 : 1))
  let saldo = 420_000
  const flowRows = flow.map(f => { saldo += f.amount; return { ...f, saldo } })

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8">
      <h1 className="text-xl lg:text-2xl font-bold" style={{ color: 'var(--ink)' }}>Gastos recurrentes</h1>
      <p className="text-sm mt-1 mb-5" style={{ color: 'var(--ink-2)' }}>Visualiza, gestiona y controla tus gastos que se repiten cada mes.</p>

      <div className="hero-gradient rounded-3xl px-5 py-5 lg:px-8 lg:py-6 text-white mb-5">
        <p className="text-xs font-medium text-white">Carga mensual</p>
        <p className="text-4xl lg:text-5xl font-extrabold tabular-nums leading-none tracking-tight mt-2">{formatCLP(monthly)}</p>
        <p className="text-xs text-white mt-2">{RECURRING.length} gastos activos · {formatCLP(monthly * 12)} al año</p>
      </div>

      <div className="card-flat p-5 mb-5">
        <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--ink)' }}>Qué mirar</h2>
        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>Esta semana</p>
            <p className="text-xl font-extrabold tabular-nums mt-1" style={{ color: 'var(--ink)' }}>
              {formatCLP(sum(week.map(x => x.r.amount)))} <span className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>en {week.length} {week.length === 1 ? 'cargo' : 'cargos'}</span>
            </p>
            <ul className="mt-2 space-y-1">
              {week.slice(0, 3).map(x => (
                <li key={x.r.id} className="flex justify-between text-xs" style={{ color: 'var(--ink-2)' }}>
                  <span className="truncate">{shortDate(x.date)} · {x.r.name}</span><span className="tabular-nums">{formatCLP(x.r.amount)}</span>
                </li>
              ))}
              {week.length === 0 && <li className="text-xs" style={{ color: 'var(--ink-3)' }}>Nada esta semana.</li>}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>Cambios de precio</p>
            <p className="text-xl font-extrabold tabular-nums mt-1" style={{ color: 'var(--gold-ink)' }}>
              +{formatCLP(sum(changes.map(r => (r.amount - r.prevAmount!) * 12)))} <span className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>al año</span>
            </p>
            <ul className="mt-2 space-y-1">
              {changes.map(r => (
                <li key={r.id} className="flex justify-between text-xs" style={{ color: 'var(--ink-2)' }}>
                  <span className="truncate">↑ {r.name}</span><span className="tabular-nums">+{formatCLP((r.amount - r.prevAmount!) * 12)}/año</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--ink-3)' }}>Dónde se va tu carga mensual</p>
            <ul className="space-y-2">
              {byCat.map(c => (
                <li key={c.name}>
                  <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--ink-2)' }}>
                    <span>{c.name} ({c.n})</span><span className="tabular-nums">{formatCLP(c.total)} · {Math.round((c.total / monthly) * 100)}%</span>
                  </div>
                  <div className="progress-track h-1.5 rounded-full overflow-hidden" style={{ '--bar-color': c.color } as React.CSSProperties}>
                    <div className="h-full rounded-full" style={{ width: `${(c.total / byCat[0].total) * 100}%`, background: c.color }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="grid gap-5 items-start lg:grid-cols-[1fr_340px]">
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>Mensuales <span style={{ color: 'var(--ink-3)' }}>({RECURRING.length})</span></h2>
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink-2)' }}>{formatCLP(monthly)}</span>
          </div>
          <div className="card-flat overflow-hidden [&>*+*]:border-t [&>*+*]:border-[color-mix(in_srgb,var(--border)_55%,transparent)]">
            {withNext.map(({ r, date, days }) => {
              const c = catOf(r.categoryId)
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3.5">
                  <ServiceLogo domain={r.domain} name={r.name} size={40} fallbackColor={c.color} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{r.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="cat-badge text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ '--cat-bg': c.bg, '--cat-color': c.color } as React.CSSProperties}>{c.name}</span>
                      {r.prevAmount && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--gold) 16%, var(--surface))', color: 'var(--gold-ink)' }}>
                          subió {formatCLP(r.amount - r.prevAmount)}
                        </span>
                      )}
                      {r.note && <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>{r.note}</span>}
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--ink-3)' }}>≈ {formatCLP(r.amount * 12)}/año</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px]" style={{ color: 'var(--ink-3)' }}>{days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : days <= 7 ? `En ${days} días` : shortDate(date)}</p>
                    <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(r.amount)} <span className="text-[10px] font-medium" style={{ color: 'var(--ink-3)' }}>/mes</span></p>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--ink-3)' }} />
                </div>
              )
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card-flat p-4">
            <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Ya comprometido</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
              De tu próximo sueldo, {formatCLP(monthly)} ya están comprometidos ({Math.round((monthly / SUELDO) * 100)}%). La cuota del notebook termina en {CUOTAS_LEFT} meses.
            </p>
            <div className="flex items-end gap-2 h-28 mt-4">
              {months.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                  <span className="text-[9px] font-bold tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>{formatCLP(m.value)}</span>
                  <div className="w-full rounded-md" style={{ height: `${Math.max(12, (m.value / maxBar) * 70)}%`, background: i === 0 ? 'var(--primary)' : 'color-mix(in srgb, var(--primary) 30%, var(--surface))' }} />
                  <span className="text-[10px] font-semibold capitalize" style={{ color: i === 0 ? 'var(--primary)' : 'var(--ink-3)' }}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card-flat p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--ink)' }}><CalendarDays className="w-4 h-4" style={{ color: 'var(--primary)' }} /> Próximos 30 días</h2>
              <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>flujo neto proyectado</span>
            </div>
            <ul className="mt-3 space-y-2.5">
              {flowRows.map(f => (
                <li key={f.key} className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                    style={f.cat ? { background: f.cat.bg, color: f.cat.color } : { background: 'color-mix(in srgb, var(--mint) 16%, var(--surface))', color: 'var(--mint-ink)' }}>
                    {f.name.charAt(0)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{f.name}</span>
                    <span className="block text-[10px]" style={{ color: 'var(--ink-3)' }}>{shortDate(f.date)} · saldo {formatCLP(f.saldo)}</span>
                  </span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: f.amount > 0 ? 'var(--mint-ink)' : 'var(--coral-ink)' }}>
                    {f.amount > 0 ? '+' : '−'}{formatCLP(Math.abs(f.amount))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}


