'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Check, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ToastProvider'
import { cn, formatCLP } from '@/lib/utils'
import { saveSharedExpense, deleteSharedExpense } from '@/app/actions/shared'
import {
  splitByWeights, equalWeights, exactValid, TRIP_CATEGORIES,
  type SplitKind, type TripCategory,
} from '@/lib/shared-split'
import type { SharedGroup, SharedExpenseRow } from '@/lib/shared-types'
import type { PaymentMethod } from '@/types'
import { SheetShell, FieldLabel, InputRow, inputClass, Chip, PrimaryButton } from './SheetParts'

function fmtNum(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export default function SharedExpenseSheet({
  group, meId, members, weights, shares, paymentMethods, expense, today, onClose,
}: {
  group:          SharedGroup
  meId:           string
  /** Miembros que ya aceptaron */
  members:        { user_id: string; name: string }[]
  /** Pesos del reparto "según sueldo" (vacío si no se puede calcular) */
  weights:        Record<string, number>
  /** Partes guardadas del gasto que se edita: user_id → CLP */
  shares:         Record<string, number>
  paymentMethods: PaymentMethod[]
  expense:        SharedExpenseRow | null
  today:          string
  onClose:        () => void
}) {
  const router = useRouter()
  const { showToast } = useToast()

  const ids = members.map(m => m.user_id)
  const nameOf = (id: string) => id === meId ? 'Tú' : (members.find(m => m.user_id === id)?.name ?? 'Alguien')
  const incomeOk = group.split_mode === 'income' && !group.split_error && Object.keys(weights).length > 0
  const multi = ids.length > 1

  const [amount, setAmount] = useState(expense ? fmtNum(String(expense.amount)) : '')
  const [desc,   setDesc]   = useState(expense?.description ?? '')
  const [date,   setDate]   = useState(expense?.date ?? today)
  const [cat,    setCat]    = useState<TripCategory>(expense?.trip_category ?? 'otros')
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? meId)
  const [pmId,   setPmId]   = useState<string>(expense?.payment_method_id ?? '')
  const [kind,   setKind]   = useState<SplitKind>(expense?.split_kind ?? (incomeOk ? 'group' : 'equal'))
  const [everyone, setEveryone] = useState(expense ? expense.everyone : true)
  const [picked, setPicked] = useState<string[]>(
    expense && !expense.everyone ? Object.keys(shares) : ids,
  )
  const [exact, setExact] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, fmtNum(String(v))])),
  )
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  const amountN = parseInt(amount.replace(/\D/g, ''), 10) || 0
  const parts = everyone ? ids : picked.filter(id => ids.includes(id))
  const exactN: Record<string, number> = {}
  for (const id of ids) {
    const v = parseInt((exact[id] ?? '').replace(/\D/g, ''), 10)
    if (v > 0) exactN[id] = v
  }
  const exactSum = Object.values(exactN).reduce((s, v) => s + v, 0)

  // Mismo cálculo que hace el servidor al guardar (shared__compute_shares).
  const preview = useMemo<Record<string, number> | null>(() => {
    if (amountN <= 0) return null
    try {
      if (kind === 'exact') return exactValid(amountN, exactN) ? exactN : null
      if (parts.length === 0) return null
      if (kind === 'equal') return splitByWeights(amountN, equalWeights(parts), paidBy)
      if (!incomeOk) return null
      return splitByWeights(amountN, parts.map(id => ({ id, w: weights[id] ?? 1 })), paidBy)
    } catch { return null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountN, kind, parts.join(','), paidBy, incomeOk, JSON.stringify(exactN)])

  const iPaid = paidBy === meId
  const myShare = preview?.[meId] ?? 0

  const kinds: { key: SplitKind; label: string }[] = [
    ...(group.split_mode === 'income' ? [{ key: 'group' as SplitKind, label: 'Según lo que gana cada uno' }] : []),
    { key: 'equal', label: 'Partes iguales' },
    ...(multi ? [{ key: 'exact' as SplitKind, label: 'Montos exactos' }] : []),
  ]

  function togglePick(id: string) {
    setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  async function save() {
    if (amountN <= 0) { setError('Ingresa un monto mayor a cero.'); return }
    if (!desc.trim()) { setError('Escribe una descripción.'); return }
    if (kind === 'exact' && !exactValid(amountN, exactN)) { setError(`Las partes suman ${formatCLP(exactSum)}; tienen que sumar ${formatCLP(amountN)}.`); return }
    if (kind !== 'exact' && parts.length === 0) { setError('Elige al menos una persona.'); return }
    if (kind === 'group' && !incomeOk) { setError('El reparto según sueldo todavía no se puede calcular.'); return }
    setSaving(true); setError('')
    const res = await saveSharedExpense({
      id: expense?.id ?? null, groupId: group.id, tripCategory: cat,
      description: desc.trim(), date, amount: amountN, paidBy,
      paymentMethodId: iPaid && pmId ? pmId : null,
      splitKind: kind,
      participants: kind === 'exact' ? Object.keys(exactN) : (everyone ? null : parts),
      exact: kind === 'exact' ? exactN : null,
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
    <SheetShell
      title={expense ? 'Editar gasto' : 'Nuevo gasto'}
      subtitle={`${group.name} · en tus gastos queda solo tu parte`}
      label={expense ? 'Editar gasto del viaje' : 'Nuevo gasto del viaje'}
      onClose={onClose}
    >
      <InputRow icon={<FileText className="w-4 h-4" />} invalid={!!error && !desc.trim()}>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descripción — Ej: Alojamiento, Cena, Bencina…"
          className={inputClass} maxLength={80} autoFocus={!expense} />
      </InputRow>

      <div>
        <div className={cn(
          'sheet-input flex items-center gap-2 border rounded-2xl px-5 py-3 transition-colors focus-within:border-brand-400',
          error && amountN <= 0 ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50',
        )}>
          <span className="text-2xl font-bold text-gray-300">$</span>
          <input type="text" inputMode="numeric" value={amount} onChange={e => setAmount(fmtNum(e.target.value).slice(0, 13))}
            placeholder="0" className="flex-1 text-3xl font-bold text-gray-900 bg-transparent outline-none min-w-0 tabular-nums" />
        </div>
        {error && amountN <= 0 && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>

      <div>
        <FieldLabel>Categoría del viaje</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {TRIP_CATEGORIES.map(c => (
            <Chip key={c.key} active={cat === c.key} onClick={() => setCat(c.key)}>{c.label}</Chip>
          ))}
        </div>
      </div>

      {/* Quién pagó y con qué — se leen como una sola decisión, no dos campos sueltos */}
      {(multi || iPaid) && (
        <div className="space-y-3">
          {multi && (
            <div>
              <FieldLabel>Quién pagó</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {members.map(m => (
                  <Chip key={m.user_id} active={paidBy === m.user_id}
                    onClick={() => { setPaidBy(m.user_id); if (m.user_id !== meId) setPmId('') }}>
                    {m.user_id === meId ? 'Yo' : m.name}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {iPaid && (
            <div>
              <FieldLabel>Método</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={pmId === ''} onClick={() => setPmId('')}>Efectivo / transferencia</Chip>
                {paymentMethods.map(m => (
                  <Chip key={m.id} active={pmId === m.id} onClick={() => setPmId(m.id)}>
                    {m.name}{m.last_four ? ` ····${m.last_four}` : ''}
                  </Chip>
                ))}
              </div>
              {pmId && preview && myShare < amountN && (
                <p className="text-[11px] text-gray-400 mt-2">
                  Tu tarjeta cobra {formatCLP(amountN)}; en tus gastos queda {formatCLP(myShare)}.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <FieldLabel>Fecha</FieldLabel>
        <InputRow>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} />
        </InputRow>
      </div>

      {/* Cómo se reparte y entre quiénes — misma decisión en dos pasos */}
      <div className="space-y-3">
        <div>
          <FieldLabel>Cómo se reparte</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {kinds.map(k => (
              <Chip key={k.key} active={kind === k.key} onClick={() => setKind(k.key)}>{k.label}</Chip>
            ))}
          </div>
          {kind === 'group' && !incomeOk && (
            <p className="text-[11px] mt-2" style={{ color: 'var(--gold)' }}>
              Repartir según lo que gana cada uno necesita que todos hayan aceptado mostrar su %. Mientras tanto usa «Partes iguales».
            </p>
          )}
        </div>

        {multi && kind !== 'exact' && (
          <div>
            <FieldLabel hint={everyone ? 'Si entra alguien al viaje, este gasto se recalcula con él.' : undefined}>Entre quiénes</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={everyone} onClick={() => setEveryone(true)}>Todos</Chip>
              {members.map(m => (
                <Chip key={m.user_id} active={!everyone && picked.includes(m.user_id)}
                  onClick={() => { if (everyone) { setEveryone(false); setPicked([m.user_id]) } else togglePick(m.user_id) }}>
                  {m.user_id === meId ? 'Yo' : m.name}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </div>

      {kind === 'exact' && (
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.user_id} className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-28 truncate">{nameOf(m.user_id)}</span>
              <div className="flex-1">
                <InputRow icon={<span className="text-sm font-bold">$</span>}>
                  <input inputMode="numeric" value={exact[m.user_id] ?? ''} placeholder="0"
                    onChange={e => setExact(x => ({ ...x, [m.user_id]: fmtNum(e.target.value) }))}
                    className={inputClass + ' tabular-nums'} />
                </InputRow>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-gray-400">
            Suman {formatCLP(exactSum)} de {formatCLP(amountN)}.
          </p>
        </div>
      )}

      {preview && multi && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-1">
          {Object.entries(preview).map(([id, v]) => (
            <div key={id} className="flex justify-between text-sm">
              <span className="text-gray-500">{id === meId ? 'Te toca a ti' : `Le toca a ${nameOf(id)}`}</span>
              <span className="font-bold text-gray-900 tabular-nums">{formatCLP(v)}</span>
            </div>
          ))}
        </div>
      )}

      {error && amountN > 0 && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-3">
        {expense && (
          confirmDelete ? (
            <button onClick={remove} disabled={saving}
              className="px-4 py-3 text-sm font-bold text-white bg-red-500 rounded-2xl hover:bg-red-600 transition-colors disabled:opacity-60 flex-shrink-0">
              Confirmar
            </button>
          ) : (
            <button onClick={() => setConfirmDelete(true)} aria-label="Eliminar gasto"
              className="logout-btn flex items-center gap-2 px-4 py-3 text-sm font-semibold text-red-500 border rounded-2xl transition-colors flex-shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          )
        )}
        <div className="flex-1">
          <PrimaryButton onClick={save} disabled={saving || (!preview && kind !== 'group')}>
            {saving ? 'Guardando…' : <><Check className="w-4 h-4" /> {expense ? 'Guardar cambios' : 'Guardar gasto'}</>}
          </PrimaryButton>
        </div>
      </div>
    </SheetShell>
  )
}
