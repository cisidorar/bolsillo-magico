'use client'

import { useState } from 'react'
import { Copy, MessageCircle, Check } from 'lucide-react'
import { formatCLP, daysBetween } from '@/lib/utils'
import { useToast } from '@/components/ToastProvider'
import { longDate, shortDate, CLOSING, DUE_DAY, type DDebt } from './data'
import { groupDebts } from './parts'
import { sum } from './calc'

type Sort = 'old' | 'amount' | 'name'

export default function PorCobrarScreen({ debts, today, onPaid, onForgive }: {
  debts: DDebt[]; today: string
  onPaid: (ids: string[], who: string, total: number) => void
  onForgive: (id: string, who: string, amount: number) => void
}) {
  const { showToast } = useToast()
  const [sort, setSort] = useState<Sort>('old')
  const [selected, setSelected] = useState<string | null>(null)

  const people = groupDebts(debts, today).sort((a, b) =>
    sort === 'amount' ? b.total - a.total : sort === 'name' ? a.name.localeCompare(b.name, 'es') : b.oldestDays - a.oldestDays)
  const current = people.find(p => p.name === selected) ?? people[0]
  const total = sum(people.map(p => p.total))

  const reminder = current
    ? `Hola ${current.name}! Te recuerdo tu parte de ${current.items.length === 1 ? current.items[0].concept : `${current.items.length} gastos`} (${longDate(current.items[0].date)}): ${formatCLP(current.total)}. ¡Gracias!`
    : ''

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8">
      <h1 className="text-xl lg:text-2xl font-bold" style={{ color: 'var(--ink)' }}>Por cobrar</h1>
      <p className="text-sm mt-1 mb-5" style={{ color: 'var(--ink-2)' }}>Lo que pagaste con tu tarjeta y tus amigos te van a devolver.</p>

      {people.length === 0 ? (
        <div className="card-flat p-10 text-center">
          <p className="text-base font-semibold inline-flex items-center gap-2" style={{ color: 'var(--mint-ink)' }}><Check className="w-5 h-5" /> Todo cobrado</p>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>Cuando pagues por otros con tu tarjeta, aparece acá.</p>
        </div>
      ) : (
        <>
          <div className="flex justify-end mb-3">
            <div className="inline-flex p-1 rounded-xl" style={{ background: 'var(--surface)' }} role="group" aria-label="Ordenar">
              {([['old', 'Más antiguo'], ['amount', 'Mayor monto'], ['name', 'Nombre']] as [Sort, string][]).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}
                  className="px-3 min-h-[40px] rounded-lg text-xs font-semibold transition-colors"
                  style={sort === k ? { background: 'var(--primary-soft)', color: 'var(--primary)' } : { color: 'var(--ink-2)' }}>{l}</button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <div className="card-flat overflow-hidden">
              <div className="[&>*+*]:border-t [&>*+*]:border-[color-mix(in_srgb,var(--border)_55%,transparent)]">
                {people.map(p => {
                  const on = current?.name === p.name
                  return (
                    <button key={p.name} type="button" onClick={() => setSelected(p.name)} aria-pressed={on}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
                      style={on ? { background: 'var(--primary-soft)', boxShadow: 'inset 3px 0 0 var(--primary)' } : undefined}>
                      <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                        style={{ background: 'var(--surface-2)', color: 'var(--primary)' }}>{p.name.charAt(0)}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>{p.name}</span>
                        <span className="block text-[11px] truncate" style={{ color: 'var(--ink-2)' }}>
                          {p.items.length === 1 ? p.items[0].concept : `${p.items.length} gastos · ${p.items.map(i => i.concept).join(', ')}`}
                        </span>
                      </span>
                      <span className="text-right flex-shrink-0">
                        <span key={p.total} className="sd-flip block text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(p.total)}</span>
                        {p.oldestDays >= 7 && (
                          <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: 'color-mix(in srgb, var(--gold) 16%, var(--surface))', color: 'var(--gold-ink)' }}>{p.oldestDays} días</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="flex items-end justify-between px-4 py-3.5" style={{ background: 'var(--surface-2)' }}>
                <span>
                  <span className="block text-[11px]" style={{ color: 'var(--ink-2)' }}>Total por cobrar · {people.length} {people.length === 1 ? 'persona' : 'personas'}</span>
                  <span className="block text-[10px]" style={{ color: 'var(--ink-3)' }}>Tu Visa vence el {DUE_DAY} y cierra el {CLOSING}</span>
                </span>
                <span key={total} className="sd-flip text-xl font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(total)}</span>
              </div>
            </div>

            {current && (
              <div className="card-flat p-5 lg:p-6 space-y-5" key={current.name}>
                <div className="flex items-start gap-3">
                  <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-base font-bold"
                    style={{ background: 'var(--surface-2)', color: 'var(--primary)' }}>{current.name.charAt(0)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-base font-bold" style={{ color: 'var(--ink)' }}>{current.name}</span>
                    <span className="block text-xs" style={{ color: 'var(--ink-2)' }}>
                      Te debe desde el {shortDate(current.items[0].date)} · hace {daysBetween(current.items[0].date, today)} días
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[10px]" style={{ color: 'var(--ink-3)' }}>Te debe</span>
                    <span className="block text-2xl font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(current.total)}</span>
                  </span>
                </div>

                <div>
                  <p className="text-[10px] font-bold tracking-wide mb-2" style={{ color: 'var(--ink-3)' }}>GASTOS</p>
                  <ul className="space-y-2">
                    {current.items.map(it => (
                      <li key={it.id} className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{it.concept}</span>
                          <span className="block text-[11px]" style={{ color: 'var(--ink-3)' }}>
                            {shortDate(it.date)} · hace {daysBetween(it.date, today)} días ·{' '}
                            <button type="button" onClick={() => onForgive(it.id, current.name, it.amount)} className="font-semibold underline underline-offset-2 min-h-[32px]">lo asumo</button>
                          </span>
                        </span>
                        <span className="flex items-center gap-2.5 flex-shrink-0">
                          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(it.amount)}</span>
                          <button type="button" onClick={() => onPaid([it.id], current.name, it.amount)}
                            className="inline-flex items-center gap-1 px-3 min-h-[40px] rounded-lg text-xs font-semibold border active:scale-[.97] transition-transform"
                            style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', borderWidth: 1.5 }}>
                            <Check className="w-3 h-3" /> Pagado
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-[10px] font-bold tracking-wide mb-2" style={{ color: 'var(--ink-3)' }}>RECORDATORIO</p>
                  <p className="text-sm rounded-2xl p-4 leading-relaxed" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>{reminder}</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button type="button"
                    onClick={() => { navigator.clipboard?.writeText(reminder).catch(() => {}); showToast('Recordatorio copiado') }}
                    className="flex-1 flex items-center justify-center gap-2 min-h-[48px] rounded-xl text-sm font-bold active:scale-[.98] transition-transform"
                    style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
                    <Copy className="w-4 h-4" /> Copiar recordatorio
                  </button>
                  <button type="button" onClick={() => onPaid(current.items.map(i => i.id), current.name, current.total)}
                    className="flex-1 min-h-[48px] rounded-xl text-sm font-semibold border active:scale-[.98] transition-transform"
                    style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', borderWidth: 1.5 }}>
                    Marcar todo pagado
                  </button>
                </div>
                <button type="button" onClick={() => showToast('En la app se abre WhatsApp con este mensaje listo')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold min-h-[44px]" style={{ color: 'var(--primary)' }}>
                  <MessageCircle className="w-3.5 h-3.5" /> Enviar por WhatsApp
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
