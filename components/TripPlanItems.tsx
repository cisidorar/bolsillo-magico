'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Plus, Check, Trash2 } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { useToast } from '@/components/ToastProvider'
import { savePlanItem, deletePlanItem, payPlanItem } from '@/app/actions/shared'
import { TRIP_CATEGORIES, type TripCategory } from '@/lib/shared-split'
import type { SharedPlanItemRow } from '@/lib/shared-types'
import type { PaymentMethod } from '@/types'
import { SheetShell, FieldLabel, InputRow, inputClass, Chip, PrimaryButton } from './SheetParts'

function fmtNum(raw: string): string {
  return raw.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function fmtDue(d: string | null, today: string): string {
  if (!d) return 'sin fecha'
  const days = Math.round((new Date(d + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86400000)
  if (days === 0) return 'vence hoy'
  if (days === 1) return 'vence mañana'
  if (days < 0) return `venció hace ${-days} d`
  if (days <= 45) return `en ${days} días`
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '')
}

/** Pagos futuros conocidos del viaje ("saldo del alojamiento el 20 de nov"). */
export default function TripPlanItems({
  groupId, items, paymentMethods, today, closed, people,
}: {
  groupId:        string
  items:          SharedPlanItemRow[]
  paymentMethods: PaymentMethod[]
  today:          string
  closed:         boolean
  people:         number
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const open = items.filter(i => !i.paid_at).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  const [sheet, setSheet] = useState<SharedPlanItemRow | 'new' | null>(null)
  const [paying, setPaying] = useState<string | null>(null)
  const [pm, setPm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (open.length === 0 && closed) return null

  async function pay(it: SharedPlanItemRow) {
    setBusy(true); setError('')
    const res = await payPlanItem(it.id, it.est_amount, today, pm || null)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    setPaying(null); setPm('')
    showToast('Pago registrado como gasto del viaje')
    router.refresh()
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4" style={{ color: 'var(--primary)' }} />
          <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Por pagar</h2>
        </div>
        {!closed && (
          <button onClick={() => setSheet('new')} className="inline-flex items-center gap-1 text-xs font-semibold min-h-[44px] px-2 -my-2 -mr-2" style={{ color: 'var(--primary)' }}>
            <Plus className="w-3.5 h-3.5" /> Agregar
          </button>
        )}
      </div>

      {open.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
          Anota pagos futuros (el saldo del alojamiento, los pasajes) y aparecen en tu flujo de caja a 30 días.
        </p>
      ) : (
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {open.map(it => (
            <div key={it.id} className="py-2.5">
              <div className="flex items-center gap-3">
                <button onClick={() => !closed && setSheet(it)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{it.description}</p>
                  <p className="text-xs" style={{ color: it.due_date && it.due_date < today ? 'var(--gold)' : 'var(--ink-3)' }}>
                    {fmtDue(it.due_date, today)}{people > 1 ? ` · tu parte aprox. ${formatCLP(Math.ceil(it.est_amount / people))}` : ''}
                  </p>
                </button>
                <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(it.est_amount)}</p>
                {!closed && paying !== it.id && (
                  <button onClick={() => { setPaying(it.id); setError('') }}
                    className="px-3 py-2 min-h-[44px] rounded-xl text-xs font-bold"
                    style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>Pagar</button>
                )}
              </div>
              {paying === it.id && (
                <div className="mt-2 rounded-xl p-3 space-y-2" style={{ background: 'var(--surface-2)' }}>
                  <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
                    Pagaste {formatCLP(it.est_amount)}. Se registra como gasto del viaje y se reparte entre todos. ¿Con qué?
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip active={pm === ''} onClick={() => setPm('')}>Efectivo / transferencia</Chip>
                    {paymentMethods.map(m => (
                      <Chip key={m.id} active={pm === m.id} onClick={() => setPm(m.id)}>
                        {m.name}{m.last_four ? ` ····${m.last_four}` : ''}
                      </Chip>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setPaying(null)} className="flex-1 py-2.5 min-h-[44px] text-xs font-semibold rounded-lg border"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink-2)', background: 'var(--surface)' }}>Todavía no</button>
                    <button disabled={busy} onClick={() => pay(it)} className="flex-1 py-2.5 min-h-[44px] text-xs font-bold rounded-lg disabled:opacity-50"
                      style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>{busy ? 'Registrando…' : 'Confirmar pago'}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-xs font-medium mt-2" style={{ color: 'var(--coral)' }}>{error}</p>}

      {sheet && (
        <PlanItemSheet groupId={groupId} item={sheet === 'new' ? null : sheet} onClose={() => setSheet(null)} />
      )}
    </div>
  )
}

function PlanItemSheet({ groupId, item, onClose }: { groupId: string; item: SharedPlanItemRow | null; onClose: () => void }) {
  const router = useRouter()
  const { showToast } = useToast()
  const [desc, setDesc] = useState(item?.description ?? '')
  const [cat, setCat] = useState<TripCategory>(item?.trip_category ?? 'alojamiento')
  const [amount, setAmount] = useState(item ? fmtNum(String(item.est_amount)) : '')
  const [due, setDue] = useState(item?.due_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const n = parseInt(amount.replace(/\D/g, ''), 10) || 0

  async function save() {
    if (!desc.trim()) { setError('Escribe qué hay que pagar.'); return }
    if (n <= 0) { setError('Ingresa un monto mayor a cero.'); return }
    setSaving(true); setError('')
    const res = await savePlanItem({ id: item?.id ?? null, groupId, description: desc.trim(), category: cat, amount: n, dueDate: due || null })
    setSaving(false)
    if (!res.ok) { setError(res.error); return }
    showToast(item ? 'Pago actualizado' : 'Pago agregado')
    router.refresh(); onClose()
  }

  async function remove() {
    if (!item) return
    setSaving(true)
    const res = await deletePlanItem(item.id)
    setSaving(false)
    if (!res.ok) { setError(res.error); return }
    showToast('Pago eliminado'); router.refresh(); onClose()
  }

  return (
    <SheetShell title={item ? 'Editar pago' : 'Pago por hacer'} subtitle="Un pago futuro que ya conoces" label="Pago programado del viaje" onClose={onClose}>
      <InputRow invalid={!!error && !desc.trim()}>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ej: Saldo del alojamiento" className={inputClass} maxLength={80} autoFocus />
      </InputRow>
      <InputRow icon={<span className="text-sm font-bold">$</span>} invalid={!!error && n <= 0}>
        <input inputMode="numeric" value={amount} placeholder="Monto total" onChange={e => setAmount(fmtNum(e.target.value).slice(0, 13))} className={inputClass + ' tabular-nums'} />
      </InputRow>
      <div>
        <FieldLabel>Categoría</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {TRIP_CATEGORIES.map(c => <Chip key={c.key} active={cat === c.key} onClick={() => setCat(c.key)}>{c.label}</Chip>)}
        </div>
      </div>
      <div>
        <FieldLabel hint="Con fecha aparece en tu flujo de caja a 30 días.">Vence (opcional)</FieldLabel>
        <InputRow><input type="date" value={due} onChange={e => setDue(e.target.value)} className={inputClass} /></InputRow>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-3">
        {item && (
          <button onClick={remove} disabled={saving} aria-label="Eliminar pago"
            className="logout-btn flex items-center px-4 py-3 text-sm font-semibold text-red-500 border rounded-2xl flex-shrink-0">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1">
          <PrimaryButton onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : <><Check className="w-4 h-4" /> Guardar</>}
          </PrimaryButton>
        </div>
      </div>
    </SheetShell>
  )
}
