'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Copy, Check, HandCoins } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { useToast } from '@/components/ToastProvider'
import { markReceived, undoReceived, forgiveReceivable, unforgiveReceivable } from '@/app/actions/receivables'
import {
  summarizeReceivables, cardDueDateFor, reminderText, whatsappLink, STALE_DAYS,
  type ReceivableWithExpense, type PersonSummary,
} from '@/lib/receivables'
import type { PaymentMethod } from '@/types'

// ── Página "Por cobrar" (nov 2026) ──────────────────────────────────────────
// Maestro-detalle: lista de personas a la izquierda (con antigüedad y total),
// detalle a la derecha (gastos uno a uno, recordatorio listo para copiar).
// En el celular el detalle queda bajo la lista. UX5: la antigüedad ≥ 7 días va
// en gold (chip), nunca coral.

type Sort = 'old' | 'amount' | 'name'
const SORTS: { id: Sort; label: string }[] = [
  { id: 'old', label: 'Más antiguo' },
  { id: 'amount', label: 'Mayor monto' },
  { id: 'name', label: 'Nombre' },
]

const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '')
const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000)
const ago = (n: number) => n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`
const badge = (n: number) => n <= 0 ? 'hoy' : n === 1 ? '1 día' : `${n} días`

export default function PorCobrarView({ rows, paymentMethods, today }: {
  rows: ReceivableWithExpense[]
  paymentMethods: PaymentMethod[]
  today: string
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [pending, startTransition] = useTransition()
  const [sort, setSort] = useState<Sort>('old')
  const [selected, setSelected] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())   // optimista
  const [multi, setMulti] = useState<Set<string>>(new Set())     // selección múltiple (barra flotante)
  const detailRef = useRef<HTMLDivElement>(null)

  const accounts = paymentMethods.filter(p => p.card_type !== 'credit')
  const [accountId, setAccountId] = useState<string | null>(
    accounts.find(a => a.card_type === 'debit')?.id ?? accounts[0]?.id ?? null,
  )

  const visible = useMemo(() => rows.filter(r => !hidden.has(r.id)), [rows, hidden])
  const summary = useMemo(() => summarizeReceivables(visible, today), [visible, today])

  const people = useMemo(() => {
    const p = [...summary.people]
    if (sort === 'amount') p.sort((a, b) => b.total - a.total)
    else if (sort === 'name') p.sort((a, b) => a.name.localeCompare(b.name, 'es-CL'))
    else p.sort((a, b) => b.oldestDays - a.oldestDays || b.total - a.total)
    return p
  }, [summary.people, sort])

  const keyOf = (p: PersonSummary) => p.name.toLocaleLowerCase('es-CL')
  const current = people.find(p => keyOf(p) === selected) ?? people[0] ?? null
  const selectedAccountName = accounts.find(a => a.id === accountId)?.name ?? null

  // Elegir una persona en mobile desplaza el detalle a la vista — sin esto,
  // el detalle actualiza bajo la lista completa y el usuario tiene que
  // volver a desplazarse manualmente cada vez que cambia de persona.
  function selectPerson(key: string) {
    setSelected(key)
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }

  function toggleMulti(key: string) {
    setMulti(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function paidMany(ps: PersonSummary[]) {
    const ids = ps.flatMap(p => p.items.map(i => i.id))
    const total = ps.reduce((s, p) => s + p.total, 0)
    const label = ps.length === 1 ? ps[0].name : `${ps.length} personas`
    setMulti(new Set())
    paid(label, ids, total)
  }

  // Próxima factura de tarjeta que trae plata adelantada.
  const nextDue = useMemo(() => {
    let best: { date: string; card: string } | null = null
    for (const r of visible) {
      const pm = paymentMethods.find(p => p.id === r.expense?.payment_method_id)
      const due = r.expense ? cardDueDateFor(r.expense.date, pm) : null
      if (!due || due < today || !pm) continue
      if (!best || due < best.date) best = { date: due, card: pm.name }
    }
    return best
  }, [visible, paymentMethods, today])

  function hide(ids: string[]) { setHidden(h => new Set([...h, ...ids])) }
  function unhide(ids: string[]) { setHidden(h => { const n = new Set(h); ids.forEach(i => n.delete(i)); return n }) }

  function paid(label: string, ids: string[], total: number) {
    hide(ids)
    startTransition(async () => {
      const res = await markReceived(ids, today, accountId)
      if (!res.ok) { unhide(ids); showToast(res.error); return }
      router.refresh()
      showToast(`${label} te pagó ${formatCLP(total)}`, {
        action: {
          label: 'Deshacer',
          onClick: async () => { for (const id of ids) await undoReceived(id); unhide(ids); router.refresh() },
        },
      })
    })
  }

  function forgive(id: string, name: string, amount: number) {
    hide([id])
    startTransition(async () => {
      const res = await forgiveReceivable(id)
      if (!res.ok) { unhide([id]); showToast(res.error); return }
      router.refresh()
      showToast(`${formatCLP(amount)} de ${name} pasan a ser gasto tuyo`, {
        action: { label: 'Deshacer', onClick: async () => { await unforgiveReceivable(id); unhide([id]); router.refresh() } },
      })
    })
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); showToast('Recordatorio copiado') }
    catch { showToast('No se pudo copiar') }
  }

  if (people.length === 0 || !current) {
    return (
      <div className="card p-8 text-center lg:max-w-xl">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--primary-soft)' }}>
          <HandCoins className="w-6 h-6" style={{ color: 'var(--primary)' }} />
        </div>
        <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>Nadie te debe plata</p>
        <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>
          Abre un gasto en Historial y toca «Cobrar a alguien» para anotar quién te lo devuelve.
        </p>
      </div>
    )
  }

  const text = reminderText(current)
  const oldestItemDate = current.items.map(i => i.expense?.date ?? i.created_at.slice(0, 10)).sort()[0]

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <div className="inline-flex rounded-xl p-1 gap-0.5" style={{ background: 'var(--surface-2)' }} role="tablist" aria-label="Ordenar">
          {SORTS.map(s => (
            <button key={s.id} type="button" role="tab" aria-selected={sort === s.id} onClick={() => setSort(s.id)}
              className="px-3 py-1.5 rounded-lg text-xs lg:text-sm font-semibold transition-colors"
              style={sort === s.id
                ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 1px 3px var(--shadow)' }
                : { color: 'var(--ink-3)' }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-5 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start lg:space-y-0">
        {/* Lista */}
        <div className="card overflow-hidden">
          <div className="[&>*+*]:border-t [&>*+*]:border-[color-mix(in_srgb,var(--border)_55%,transparent)]">
            {people.map(p => {
              const active = keyOf(p) === keyOf(current)
              const stale = p.oldestDays >= STALE_DAYS
              return (
                <button key={keyOf(p)} type="button" onClick={() => selectPerson(keyOf(p))} aria-current={active}
                  className="w-full flex items-center gap-2 px-4 py-3.5 text-left transition-colors"
                  style={{
                    background: active ? 'var(--primary-soft)' : 'transparent',
                    boxShadow: active ? 'inset 3px 0 0 var(--primary)' : undefined,
                  }}>
                  <label
                    className="flex items-center justify-center min-w-[44px] min-h-[44px] -mx-2.5 flex-shrink-0 cursor-pointer"
                    onClick={e => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={multi.has(keyOf(p))}
                      onChange={() => toggleMulti(keyOf(p))}
                      aria-label={`Seleccionar a ${p.name}`}
                      className="w-4 h-4 rounded accent-[var(--primary)]"
                    />
                  </label>
                  <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                    style={{ background: 'var(--surface-2)', color: 'var(--primary)' }}>
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{p.name}</span>
                    <span className="block text-xs truncate" style={{ color: 'var(--ink-3)' }}>
                      {p.items.length === 1
                        ? (p.items[0].expense?.description || 'Gasto')
                        : `${p.items.length} gastos · ${p.items.map(i => i.expense?.description || 'Gasto').join(', ')}`}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(p.total)}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={stale
                        ? { background: 'color-mix(in srgb, var(--gold) 15%, var(--surface))', color: 'var(--gold-ink)' }
                        : { background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
                      {badge(p.oldestDays)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="min-w-0">
              <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
                Total por cobrar · {people.length} {people.length === 1 ? 'persona' : 'personas'}
              </p>
              {nextDue && (
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>Tu {nextDue.card} vence el {fmtDay(nextDue.date)}</p>
              )}
            </div>
            <span className="text-xl font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>{formatCLP(summary.pendingTotal)}</span>
          </div>
        </div>

        {/* Detalle */}
        <div ref={detailRef} className="card p-5 lg:p-6 space-y-5">
          <div className="flex items-start gap-3">
            <span className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-lg font-bold"
              style={{ background: 'var(--surface-2)', color: 'var(--primary)' }}>
              {current.name.charAt(0).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold truncate" style={{ color: 'var(--ink)' }}>{current.name}</h2>
              <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                Te debe desde el {fmtDay(oldestItemDate)} · {ago(current.oldestDays)}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Te debe</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(current.total)}</p>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold tracking-wider mb-1" style={{ color: 'var(--ink-3)' }}>GASTOS</p>
            <ul className="[&>*+*]:border-t [&>*+*]:border-[color-mix(in_srgb,var(--border)_55%,transparent)] border-t border-b"
              style={{ borderColor: 'color-mix(in srgb, var(--border) 55%, transparent)' }}>
              {current.items.map(it => {
                const d = it.expense?.date ?? it.created_at.slice(0, 10)
                return (
                  <li key={it.id} className="flex items-center gap-3 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{it.expense?.description || 'Gasto'}</p>
                      <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                        {fmtDay(d)} · {ago(daysBetween(d, today))}
                        {' · '}
                        <button type="button" disabled={pending} onClick={() => forgive(it.id, current.name, it.amount)}
                          className="inline-flex items-center font-semibold underline-offset-2 hover:underline min-h-[44px] -my-3">lo asumo</button>
                      </p>
                    </div>
                    <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>{formatCLP(it.amount)}</span>
                    <button type="button" disabled={pending} onClick={() => paid(current.name, [it.id], it.amount)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border flex-shrink-0 disabled:opacity-60"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink-2)' }}>
                      <Check className="w-3 h-3" /> Pagado
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-bold tracking-wider mb-2" style={{ color: 'var(--ink-3)' }}>RECORDATORIO</p>
            <p className="rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
              {text}
            </p>
          </div>

          {accounts.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>Pagos llegan a</span>
              {accounts.map(a => (
                <button key={a.id} type="button" onClick={() => setAccountId(a.id)} aria-pressed={accountId === a.id}
                  className={`px-2.5 py-1 rounded-full text-[11px] border transition-all ${accountId === a.id ? 'sheet-chip-active' : 'sheet-chip'}`}>
                  {a.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={() => copy(text)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold"
              style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
              <Copy className="w-4 h-4" /> Copiar recordatorio
            </button>
            <button type="button" disabled={pending}
              onClick={() => paid(current.name, current.items.map(i => i.id), current.total)}
              className="flex-1 py-3 rounded-xl text-sm font-semibold border disabled:opacity-60"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              Marcar todo pagado{selectedAccountName ? ` · a ${selectedAccountName}` : ''}
            </button>
          </div>
          <a href={whatsappLink(text)} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--primary)' }}>
            <MessageCircle className="w-3.5 h-3.5" /> Enviar por WhatsApp
          </a>
        </div>
      </div>

      {/* Barra flotante de selección múltiple — settle-up de varias personas
          a la vez (ej. después de un viaje grupal) sin repetir el flujo
          persona por persona. */}
      {multi.size > 0 && (() => {
        const selectedPeople = people.filter(p => multi.has(keyOf(p)))
        const total = selectedPeople.reduce((s, p) => s + p.total, 0)
        return (
          <div className="fixed bottom-24 lg:bottom-8 left-0 lg:left-60 right-0 z-[60] px-4 lg:px-8 flex justify-center">
            <div className="card flex items-center gap-3 px-4 py-3 w-full lg:max-w-md" style={{ boxShadow: '0 8px 24px var(--shadow)' }}>
              <span className="text-sm font-semibold flex-1 min-w-0 truncate" style={{ color: 'var(--ink)' }}>
                {selectedPeople.length} {selectedPeople.length === 1 ? 'persona' : 'personas'} · {formatCLP(total)}
              </span>
              <button type="button" onClick={() => setMulti(new Set())}
                className="text-xs font-semibold flex-shrink-0 min-h-[44px] px-2" style={{ color: 'var(--ink-3)' }}>
                Cancelar
              </button>
              <button type="button" disabled={pending} onClick={() => paidMany(selectedPeople)}
                className="px-3 py-2.5 rounded-lg text-sm font-bold flex-shrink-0 disabled:opacity-60"
                style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
                Marcar pagado{selectedAccountName ? ` · a ${selectedAccountName}` : ''}
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
