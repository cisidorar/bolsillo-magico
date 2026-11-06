'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { HandCoins, ChevronDown, ChevronUp, MessageCircle, Check, AlertTriangle } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { useToast } from '@/components/ToastProvider'
import { markReceived, undoReceived, forgiveReceivable, unforgiveReceivable } from '@/app/actions/receivables'
import {
  summarizeReceivables, cardDueDateFor, reminderText, whatsappLink, STALE_DAYS,
  type ReceivableWithExpense,
} from '@/lib/receivables'
import type { PaymentMethod } from '@/types'

// ── "Te deben" (nov 2026) ───────────────────────────────────────────────────
// Lo que adelantaste con tu tarjeta por otras personas y todavía no te
// transfieren. Por persona: cuánto, desde cuándo, recordarle por WhatsApp,
// marcar que pagó (y a qué cuenta llegó) o asumirlo. UX5: gold = cobro con
// ≥ 7 días o factura que vence pronto; nunca banner coral (no es urgente hoy).

const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
const ago = (days: number) => days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`

export default function ReceivablesCard({ rows, paymentMethods, today, flat = true }: {
  rows: ReceivableWithExpense[]
  paymentMethods: PaymentMethod[]
  today: string
  flat?: boolean
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())   // optimista: ids ya resueltos

  const visible = useMemo(() => rows.filter(r => !hidden.has(r.id)), [rows, hidden])
  const summary = useMemo(() => summarizeReceivables(visible, today), [visible, today])

  // Cuenta donde llegan las transferencias: débito/digital primero.
  const accounts = paymentMethods.filter(p => p.card_type !== 'credit')
  const [accountId, setAccountId] = useState<string | null>(accounts.find(a => a.card_type === 'debit')?.id ?? accounts[0]?.id ?? null)

  // Próxima factura de tarjeta que incluye plata adelantada.
  const nextDue = useMemo(() => {
    const byDue = new Map<string, { date: string; card: string; amount: number }>()
    for (const r of visible) {
      const pm = paymentMethods.find(p => p.id === r.expense?.payment_method_id)
      const due = r.expense ? cardDueDateFor(r.expense.date, pm) : null
      if (!due || due < today || !pm) continue
      const k = `${due}|${pm.id}`
      const cur = byDue.get(k)
      byDue.set(k, { date: due, card: pm.name, amount: (cur?.amount ?? 0) + r.amount })
    }
    return [...byDue.values()].sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  }, [visible, paymentMethods, today])

  if (summary.pendingCount === 0) return null

  const dueSoon = nextDue ? (new Date(nextDue.date + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86_400_000 <= 7 : false

  function hide(ids: string[]) { setHidden(h => new Set([...h, ...ids])) }
  function unhide(ids: string[]) { setHidden(h => { const n = new Set(h); ids.forEach(i => n.delete(i)); return n }) }

  function paid(name: string, ids: string[], total: number) {
    hide(ids)
    startTransition(async () => {
      const res = await markReceived(ids, today, accountId)
      if (!res.ok) { unhide(ids); showToast(res.error); return }
      router.refresh()
      showToast(`${name} te pagó ${formatCLP(total)}`, {
        action: {
          label: 'Deshacer',
          onClick: async () => {
            for (const id of ids) await undoReceived(id)
            unhide(ids)
            router.refresh()
          },
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
        action: {
          label: 'Deshacer',
          onClick: async () => { await unforgiveReceivable(id); unhide([id]); router.refresh() },
        },
      })
    })
  }

  return (
    <div className={flat ? 'card-flat overflow-hidden' : 'card overflow-hidden'}>
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <HandCoins className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} />
          <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Te deben</h2>
          {summary.staleCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
              style={{ background: 'color-mix(in srgb, var(--gold) 15%, var(--surface))', color: 'var(--gold-ink)' }}>
              {summary.staleCount} con +{STALE_DAYS} días
            </span>
          )}
        </div>
        <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(summary.pendingTotal)}</span>
      </div>

      {nextDue && (
        <p className="px-4 -mt-1 pb-3 text-[11px] leading-snug flex items-start gap-1.5"
          style={{ color: dueSoon ? 'var(--gold-ink)' : 'var(--ink-3)' }}>
          {dueSoon && <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-px" />}
          <span>Tu {nextDue.card} vence el {fmtDay(nextDue.date)} y trae {formatCLP(nextDue.amount)} que pagaste por otros.</span>
        </p>
      )}

      <div className="[&>*+*]:border-t [&>*+*]:border-[color-mix(in_srgb,var(--border)_55%,transparent)]">
        {summary.people.map(p => {
          const key = p.name.toLocaleLowerCase('es-CL')
          const isOpen = open === key
          const stale = p.oldestDays >= STALE_DAYS
          const ids = p.items.map(i => i.id)
          const first = p.items[0]
          return (
            <div key={key}>
              <button type="button" onClick={() => setOpen(isOpen ? null : key)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition-opacity hover:opacity-80">
                <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                  style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                  {p.name.charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{p.name}</span>
                  <span className="block text-[11px] truncate" style={{ color: stale ? 'var(--gold-ink)' : 'var(--ink-2)' }}>
                    {p.items.length === 1
                      ? `${first.expense?.description || 'Gasto'} · ${ago(p.oldestDays)}`
                      : `${p.items.length} gastos · el más antiguo ${ago(p.oldestDays)}`}
                  </span>
                </span>
                <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>{formatCLP(p.total)}</span>
                {isOpen ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
                        : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />}
              </button>

              {isOpen && (
                <div className="px-4 pb-4 space-y-3">
                  {p.items.length > 1 && (
                    <ul className="space-y-1.5">
                      {p.items.map(it => (
                        <li key={it.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate" style={{ color: 'var(--ink-2)' }}>
                            {it.expense?.description || 'Gasto'}{it.expense?.date ? ` · ${fmtDay(it.expense.date)}` : ''}
                          </span>
                          <span className="flex items-center gap-2 flex-shrink-0">
                            <span className="tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>{formatCLP(it.amount)}</span>
                            <button type="button" disabled={pending} onClick={() => forgive(it.id, p.name, it.amount)}
                              className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>Lo asumo</button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {accounts.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>Llegó a</span>
                      {accounts.map(a => (
                        <button key={a.id} type="button" onClick={() => setAccountId(a.id)} aria-pressed={accountId === a.id}
                          className={`px-2.5 py-1 rounded-full text-[11px] border transition-all ${accountId === a.id ? 'sheet-chip-active' : 'sheet-chip'}`}>
                          {a.name}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button type="button" disabled={pending} onClick={() => paid(p.name, ids, p.total)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-60"
                      style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
                      <Check className="w-4 h-4" /> Me pagó {formatCLP(p.total)}
                    </button>
                    <a href={whatsappLink(reminderText(p))} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold"
                      style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
                      <MessageCircle className="w-4 h-4" /> Recordar
                    </a>
                  </div>

                  {p.items.length === 1 && (
                    <button type="button" disabled={pending} onClick={() => forgive(first.id, p.name, first.amount)}
                      className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                      No me lo va a pagar · lo asumo yo
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
