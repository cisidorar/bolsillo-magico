'use client'

import { Pencil } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { TRIP_CATEGORIES, type SplitMode } from '@/lib/shared-split'
import { TRIP_CATEGORY_ICON } from '@/lib/trip-category-icons'
import type { SharedGroup, SharedExpenseRow } from '@/lib/shared-types'
import type { PaymentMethod } from '@/types'
import { SheetShell } from './SheetParts'

/**
 * Detalle de un gasto del viaje. Tocar un gasto abre esto primero (verlo no cambia nada);
 * editar o eliminar es un paso aparte, con el botón «Editar».
 */
export default function TripExpenseDetail({
  expense, group, meId, members, shares, paymentMethods, canEdit, onEdit, onClose,
}: {
  expense:        SharedExpenseRow
  group:          SharedGroup
  meId:           string
  /** Miembros que ya aceptaron */
  members:        { user_id: string; name: string }[]
  /** Partes guardadas de este gasto: user_id → CLP */
  shares:         Record<string, number>
  paymentMethods: PaymentMethod[]
  /** Falso con el viaje cerrado: se puede ver, no cambiar */
  canEdit:        boolean
  onEdit:         () => void
  onClose:        () => void
}) {
  const nameOf = (id: string | null) => !id ? 'Alguien' : id === meId ? 'Tú' : (members.find(m => m.user_id === id)?.name ?? 'Alguien')
  const cat = TRIP_CATEGORIES.find(c => c.key === expense.trip_category)
  const CatIcon = TRIP_CATEGORY_ICON[expense.trip_category]

  const when = new Date(expense.date + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
  const whenLabel = when.charAt(0).toUpperCase() + when.slice(1)

  const mode: SplitMode | 'exact' = expense.split_kind === 'exact' ? 'exact' : expense.split_kind === 'equal' ? 'equal' : group.split_mode
  const modeLabel = mode === 'income' ? 'Según lo que gana cada uno' : mode === 'exact' ? 'Montos exactos' : 'Partes iguales'

  // Solo se ve el método si es uno tuyo: los de otra persona no se comparten.
  const pm = expense.payment_method_id ? paymentMethods.find(p => p.id === expense.payment_method_id) : null

  const rows = Object.entries(shares).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const myPart = shares[meId] ?? 0
  const iPaid = expense.paid_by === meId
  const balance = iPaid ? expense.amount - myPart : -myPart

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm" style={{ color: 'var(--ink-3)' }}>{label}</dt>
      <dd className="text-sm font-semibold text-right min-w-0" style={{ color: 'var(--ink)' }}>{children}</dd>
    </div>
  )

  return (
    <SheetShell title={expense.description} subtitle={`${group.name} · ${whenLabel}`} label="Detalle del gasto del viaje" onClose={onClose}>
      <div className="flex items-center gap-3">
        <span className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-soft)' }}>
          <CatIcon className="w-5 h-5" style={{ color: 'var(--primary-text)' }} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-display text-3xl font-bold tabular-nums leading-none" style={{ color: 'var(--ink)' }}>{formatCLP(expense.amount)}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>{cat?.label ?? expense.trip_category}</p>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--surface-2)' }}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>Tu parte</p>
            <p className="font-display text-xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(myPart)}</p>
          </div>
          <p className="text-sm mt-1" style={{ color: balance > 0 ? 'var(--mint-ink)' : balance < 0 ? 'var(--gold-ink)' : 'var(--ink-3)' }}>
            {balance > 0 ? `Pagaste tú: te deben ${formatCLP(balance)} por este gasto.`
              : balance < 0 ? `Pagó ${nameOf(expense.paid_by)}: le debes ${formatCLP(-balance)} por este gasto.`
              : 'Pagaste justo tu parte.'}
          </p>
        </div>
      )}

      <dl className="space-y-2.5">
        <Row label="Pagó">{nameOf(expense.paid_by)}{pm ? ` · ${pm.name}` : ''}</Row>
        <Row label="Reparto">{modeLabel}</Row>
        <Row label="Entre">{expense.everyone ? 'Todos' : rows.map(([id]) => nameOf(id)).join(', ')}</Row>
        {expense.created_by !== expense.paid_by && <Row label="Agregado por">{nameOf(expense.created_by)}</Row>}
      </dl>

      {rows.length > 1 && (
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>Cuánto le toca a cada uno</p>
          <ul className="space-y-2.5">
            {rows.map(([id, v]) => (
              <li key={id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span style={{ color: id === meId ? 'var(--ink)' : 'var(--ink-2)', fontWeight: id === meId ? 700 : 500 }}>{nameOf(id)}</span>
                  <span className="tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>
                    {formatCLP(v)} <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>· {Math.round((v / expense.amount) * 100)}%</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full" style={{ background: 'var(--surface-2)' }} aria-hidden>
                  <div className="h-full rounded-full rc-grow" style={{ width: `${Math.max(2, (v / expense.amount) * 100)}%`, background: 'var(--primary)', opacity: id === meId ? 1 : 0.5 }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canEdit && (
        <button onClick={onEdit}
          className="w-full min-h-[52px] rounded-2xl text-base font-bold flex items-center justify-center gap-2 transition-transform active:scale-[.99]"
          style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
          <Pencil className="w-4 h-4" aria-hidden /> Editar gasto
        </button>
      )}
    </SheetShell>
  )
}
