'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Check, Trash2 } from 'lucide-react'
import { useBackdropClose } from '@/components/useBackdropClose'
import { useToast } from '@/components/ToastProvider'
import { formatCLP } from '@/lib/utils'
import { saveSharedExpense, deleteSharedExpense } from '@/app/actions/shared'
import { splitAmount, ratioToPct, TRIP_CATEGORIES, type SplitKind, type TripCategory } from '@/lib/shared-split'
import type { SharedGroup, SharedExpenseRow } from '@/lib/shared-types'
import type { PaymentMethod } from '@/types'

const label = 'text-[10px] font-bold uppercase tracking-widest block mb-1.5'
const input = 'w-full text-sm border px-3 py-2.5 rounded-xl outline-none'
const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)' }

function fmtNum(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export default function SharedExpenseSheet({
  group, meId, names, paymentMethods, expense, today, onClose,
}: {
  group:          SharedGroup
  meId:           string
  /** user_id → nombre para mostrar */
  names:          Record<string, string>
  paymentMethods: PaymentMethod[]
  expense:        SharedExpenseRow | null
  today:          string
  onClose:        () => void
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const backdropClose = useBackdropClose(onClose)

  const meIsA   = group.member_a === meId
  const otherId = meIsA ? group.member_b! : group.member_a
  const hasRatio = group.ratio_agreed_at != null && group.ratio_a != null

  const [amount, setAmount]   = useState(expense ? fmtNum(String(expense.amount)) : '')
  const [desc,   setDesc]     = useState(expense?.description ?? '')
  const [date,   setDate]     = useState(expense?.date ?? today)
  const [cat,    setCat]      = useState<TripCategory>(expense?.trip_category ?? 'otros')
  const [paidBy, setPaidBy]   = useState(expense?.paid_by ?? meId)
  const [pmId,   setPmId]     = useState<string>(expense?.payment_method_id ?? '')
  const [kind,   setKind]     = useState<SplitKind>(expense?.split_kind ?? (hasRatio ? 'group' : 'equal'))
  // "Mi parte" cuando el reparto es por montos exactos
  const [myExact, setMyExact] = useState(
    expense && expense.split_kind === 'exact'
      ? fmtNum(String(meIsA ? expense.share_a : expense.share_b)) : '',
  )
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  const amountN = parseInt(amount.replace(/\D/g, ''), 10) || 0
  const myExactN = parseInt(myExact.replace(/\D/g, ''), 10) || 0

  // Mismo cálculo que hace el servidor al guardar (shared__shares).
  const preview = useMemo(() => {
    if (amountN <= 0) return null
    try {
      // 'only_me' / 'only_other' se traducen a only_a / only_b según quién soy
      const exactA = kind === 'exact' ? (meIsA ? myExactN : amountN - myExactN) : undefined
      const s = splitAmount(amountN, kind, group.ratio_a, paidBy === group.member_a, exactA)
      return meIsA ? { mine: s.shareA, theirs: s.shareB } : { mine: s.shareB, theirs: s.shareA }
    } catch { return null }
  }, [amountN, kind, group.ratio_a, group.member_a, paidBy, meIsA, myExactN])

  const iPaid = paidBy === meId
  // Solo tus propios medios de pago: el de la otra persona es suyo.
  const myMethods = paymentMethods

  const pct = hasRatio ? ratioToPct(group.ratio_a!) : null
  const myPct = pct ? (meIsA ? pct.a : pct.b) : null

  const kinds: { key: SplitKind; label: string }[] = [
    ...(hasRatio ? [{ key: 'group' as SplitKind, label: `Según acuerdo (${myPct}% / ${100 - myPct!}%)` }] : []),
    { key: 'equal', label: '50 / 50' },
    { key: meIsA ? 'only_a' : 'only_b', label: 'Solo mío' },
    { key: meIsA ? 'only_b' : 'only_a', label: `Solo de ${names[otherId] ?? 'la otra persona'}` },
    { key: 'exact', label: 'Montos exactos' },
  ]

  async function save() {
    if (amountN <= 0) { setError('Ingresa un monto mayor a cero.'); return }
    if (!desc.trim()) { setError('Escribe una descripción.'); return }
    if (kind === 'exact' && (myExactN < 0 || myExactN > amountN)) { setError('Tu parte tiene que estar entre 0 y el monto total.'); return }
    setSaving(true); setError('')
    const res = await saveSharedExpense({
      id: expense?.id ?? null, groupId: group.id, tripCategory: cat,
      description: desc.trim(), date, amount: amountN, paidBy,
      paymentMethodId: iPaid && pmId ? pmId : null,
      splitKind: kind,
      exactA: kind === 'exact' ? (meIsA ? myExactN : amountN - myExactN) : null,
    })
    setSaving(false)
    if (!res.ok) { setError(res.error); return }
    showToast(expense ? 'Gasto actualizado' : 'Gasto agregado al viaje')
    router.refresh()
    onClose()
  }

  async function remove() {
    if (!expense) return
    setSaving(true); setError('')
    const res = await deleteSharedExpense(expense.id)
    setSaving(false)
    if (!res.ok) { setError(res.error); setConfirmDelete(false); return }
    showToast('Gasto eliminado')
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end lg:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }} {...backdropClose}>
      <div className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-y-auto overscroll-contain"
        style={{ background: 'var(--surface)', maxHeight: '92dvh' }}>
        <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />
        <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>
              {expense ? 'Editar gasto' : 'Nuevo gasto'} · {group.name}
            </h2>
            <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
              En tus gastos queda solo tu parte.
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <label className={label} style={{ color: 'var(--ink-3)' }}>Monto total (CLP)</label>
            <input inputMode="numeric" value={amount} onChange={e => setAmount(fmtNum(e.target.value))}
              placeholder="480.000" className={input} style={inputStyle} />
          </div>

          <div>
            <label className={label} style={{ color: 'var(--ink-3)' }}>Descripción</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Alojamiento Castro"
              className={input} style={inputStyle} maxLength={80} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} style={{ color: 'var(--ink-3)' }}>Fecha</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={input} style={inputStyle} />
            </div>
            <div>
              <label className={label} style={{ color: 'var(--ink-3)' }}>Categoría del viaje</label>
              <select value={cat} onChange={e => setCat(e.target.value as TripCategory)} className={input} style={inputStyle}>
                {TRIP_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={label} style={{ color: 'var(--ink-3)' }}>Quién pagó</label>
            <div className="grid grid-cols-2 gap-2">
              {[meId, otherId].map(id => (
                <button key={id} type="button" onClick={() => setPaidBy(id)}
                  className="py-2.5 rounded-xl text-xs font-semibold border transition-colors truncate px-2"
                  style={paidBy === id
                    ? { background: 'var(--primary-soft)', color: 'var(--primary)', borderColor: 'var(--primary)' }
                    : { background: 'var(--surface-2)', color: 'var(--ink-2)', borderColor: 'var(--border)' }}>
                  {id === meId ? 'Yo' : (names[id] ?? 'La otra persona')}
                </button>
              ))}
            </div>
          </div>

          {iPaid && myMethods.length > 0 && (
            <div>
              <label className={label} style={{ color: 'var(--ink-3)' }}>Con qué pagaste</label>
              <select value={pmId} onChange={e => setPmId(e.target.value)} className={input} style={inputStyle}>
                <option value="">Sin método (efectivo / transferencia)</option>
                {myMethods.map(m => <option key={m.id} value={m.id}>{m.name}{m.last_four ? ` ····${m.last_four}` : ''}</option>)}
              </select>
              {pmId && preview && preview.theirs > 0 && (
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-3)' }}>
                  Tu tarjeta cobra {formatCLP(amountN)}; en tus gastos queda {formatCLP(preview.mine)}.
                </p>
              )}
            </div>
          )}

          <div>
            <label className={label} style={{ color: 'var(--ink-3)' }}>Cómo se reparte</label>
            <select value={kind} onChange={e => setKind(e.target.value as SplitKind)} className={input} style={inputStyle}>
              {kinds.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
            {kind === 'exact' && (
              <div className="mt-2">
                <label className={label} style={{ color: 'var(--ink-3)' }}>Tu parte (CLP)</label>
                <input inputMode="numeric" value={myExact} onChange={e => setMyExact(fmtNum(e.target.value))}
                  className={input} style={inputStyle} />
              </div>
            )}
          </div>

          {preview && (
            <div className="rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--ink-2)' }}>Te toca a ti</span>
                <span className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(preview.mine)}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span style={{ color: 'var(--ink-2)' }}>Le toca a {names[otherId] ?? 'la otra persona'}</span>
                <span className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(preview.theirs)}</span>
              </div>
            </div>
          )}

          {error && <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{error}</p>}

          <div className="flex gap-3 pt-1">
            {expense && (
              confirmDelete ? (
                <button onClick={remove} disabled={saving}
                  className="px-4 py-3 text-sm font-bold rounded-2xl border disabled:opacity-50"
                  style={{ color: 'var(--coral)', borderColor: 'var(--coral)', background: 'var(--surface-2)' }}>
                  Confirmar
                </button>
              ) : (
                <button onClick={() => setConfirmDelete(true)} aria-label="Eliminar gasto"
                  className="px-4 py-3 rounded-2xl border" style={{ color: 'var(--ink-3)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )
            )}
            <button onClick={onClose} className="flex-1 py-3 text-sm font-semibold rounded-2xl border"
              style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
              Cancelar
            </button>
            <button onClick={save} disabled={saving || !preview}
              className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-2xl disabled:opacity-50 active:scale-[.98]"
              style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}>
              <Check className="w-4 h-4" />
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
