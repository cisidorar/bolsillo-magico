'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Plus, Check, Trash2, Sparkles, Utensils, Plane, ChevronRight } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { useToast } from '@/components/ToastProvider'
import { savePlanItem, deletePlanItem, payPlanItem, togglePlanItem } from '@/app/actions/shared'
import { TRIP_CATEGORIES, type TripCategory } from '@/lib/shared-split'
import { TRIP_CATEGORY_ICON } from '@/lib/trip-category-icons'
import { planTotals, overCap, qtyLabel, perDay, isActive } from '@/lib/trip-plan-items'
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

/**
 * Plan de costos del viaje, en tres bloques:
 * reservas (se pagan antes de salir, con fecha), gasto durante el viaje
 * (presupuesto, con monto por día) y opcionales con interruptor.
 */
export default function TripPlanItems({
  groupId, items, paymentMethods, today, closed, people, tripDays = null, embedded = false,
}: {
  embedded?:      boolean
  groupId:        string
  items:          SharedPlanItemRow[]
  paymentMethods: PaymentMethod[]
  today:          string
  closed:         boolean
  people:         number
  /** Días del viaje, para mostrar "$X al día" en lo que se gasta durante */
  tripDays?:      number | null
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const open = items.filter(i => !i.paid_at)
  const byDue = (a: SharedPlanItemRow, b: SharedPlanItemRow) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
  const reservas = open.filter(i => i.kind === 'reserva' && !i.optional).sort(byDue)
  const durante  = open.filter(i => i.kind === 'durante' && !i.optional)
  const opcionales = open.filter(i => i.optional)
  const totals = planTotals(open)
  const [sheet, setSheet] = useState<SharedPlanItemRow | { kind: 'reserva' | 'durante'; optional: boolean } | null>(null)
  const [detail, setDetail] = useState<SharedPlanItemRow | null>(null)
  const [paying, setPaying] = useState<string | null>(null)
  const [pm, setPm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (open.length === 0 && (closed || embedded)) return null

  // Abrir el detalle de un ítem da por cerrado cualquier "¿con qué pagaste?"
  // que haya quedado abierto para otro ítem — si no, al volver del detalle
  // ese panel reaparece sin que nadie se acuerde de haberlo abierto.
  function openDetail(it: SharedPlanItemRow) {
    setPaying(null); setPm(''); setError('')
    setDetail(it)
  }

  async function pay(it: SharedPlanItemRow) {
    setBusy(true); setError('')
    const res = await payPlanItem(it.id, it.est_amount, today, pm || null)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    setPaying(null); setPm('')
    showToast('Pago registrado como gasto del viaje')
    router.refresh()
  }

  async function toggle(it: SharedPlanItemRow) {
    setBusy(true); setError('')
    const res = await togglePlanItem(it.id, !it.enabled)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    router.refresh()
  }

  const share = (n: number) => (people > 1 ? ` · tu parte ${formatCLP(Math.ceil(n / people))}` : '')

  // Cada ítem es su propio talonario — no una fila más en una lista. La
  // perforación (línea punteada) separa el campo de categoría del cuerpo,
  // como un cupón; un opcional apagado queda "anulado", no solo atenuado.
  function Row({ it, sub, action }: { it: SharedPlanItemRow; sub: string; action?: React.ReactNode }) {
    const CatIcon = /vuelo|pasaje|avi[oó]n|a[eé]reo/i.test(it.description) ? Plane : TRIP_CATEGORY_ICON[it.trip_category]
    const over = overCap(it)
    const off = !isActive(it)
    return (
      <div className="flex items-center gap-3 px-4" style={{ opacity: off ? 0.6 : 1 }}>
        <button onClick={() => openDetail(it)} className="flex-1 min-w-0 text-left flex items-center gap-3 py-3" aria-label={`Ver detalle de ${it.description}`}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,194,60,0.14)' }}>
            <CatIcon className="w-4 h-4" style={{ color: 'var(--gold-ink)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{it.description}</p>
            <p className="text-xs" style={{ color: it.due_date && it.due_date < today && it.kind === 'reserva' ? 'var(--gold-ink)' : 'var(--ink-3)' }}>{sub}</p>
            {over > 0 && (
              <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(255,194,60,0.18)', color: 'var(--gold-ink)' }}>
                {formatCLP(over)} sobre tu tope
              </span>
            )}
          </div>
        </button>
        <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(it.est_amount)}</p>
        <div className="w-[60px] flex justify-end flex-shrink-0">
          {action ?? <ChevronRight className="w-4 h-4 mr-1" style={{ color: 'var(--ink-3)' }} aria-hidden />}
        </div>
      </div>
    )
  }

  const addBtn = (kind: 'reserva' | 'durante', optional = false, label = 'Agregar') => !closed && (
    <button onClick={() => { setDetail(null); setPaying(null); setSheet({ kind, optional }) }} className="inline-flex items-center gap-1 text-xs font-semibold min-h-[44px] px-2 -my-2 -mr-2" style={{ color: 'var(--primary)' }}>
      <Plus className="w-3.5 h-3.5" /> {label}
    </button>
  )

  const sectionHead = (icon: React.ReactNode, title: string, total: number, right?: React.ReactNode, hint?: string) => (
    <div className="flex items-center justify-between mb-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-4 rounded-full flex-shrink-0" style={{ background: 'var(--primary)', opacity: 0.55 }} aria-hidden />
          <h3 className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>{title}</h3>
          {total > 0 && <span className="text-xs tabular-nums" style={{ color: 'var(--ink-3)' }}>{formatCLP(total)}</span>}
        </div>
        {hint && <p className="text-[11px] ml-[11px]" style={{ color: 'var(--ink-3)' }}>{hint}</p>}
      </div>
      {right}
    </div>
  )

  return (
    <div className={embedded ? 'space-y-6' : 'card p-5 space-y-6'}>
      {/* Reservas */}
      <div>
        {sectionHead(<CalendarClock className="w-4 h-4" style={{ color: 'var(--primary)' }} />, 'Reservas', totals.before, addBtn('reserva'),
          'Se pagan antes de salir. Con fecha, aparecen en tu flujo de caja.')}
        {reservas.length === 0 ? (
          <p className="text-xs px-4 py-4 card-flat" style={{ color: 'var(--ink-3)' }}>
            Pasajes, auto, alojamiento: lo que reservas y pagas antes del viaje.
          </p>
        ) : (
          <div className="card-flat overflow-hidden [&>*+*]:border-t [&>*+*]:border-[color-mix(in_srgb,var(--border)_55%,transparent)]">
            {reservas.map(it => (
              <div key={it.id}>
                <Row it={it}
                  sub={`${it.due_date ? fmtDue(it.due_date, today) : (TRIP_CATEGORIES.find(c => c.key === it.trip_category)?.label ?? '')}${qtyLabel(it, formatCLP) ? ` · ${qtyLabel(it, formatCLP)}` : ''}${share(it.est_amount)}`}
                  action={!closed && paying !== it.id && (
                    <button onClick={() => { setDetail(null); setPaying(it.id); setError('') }}
                      className="px-2 min-h-[44px] text-xs font-bold"
                      style={{ color: 'var(--primary)' }}>Pagar</button>
                  )} />
                {paying === it.id && (
                  <div className="mx-3 mb-3 rounded-xl p-3 space-y-2" style={{ background: 'var(--surface-2)' }}>
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
      </div>

      {/* Durante el viaje */}
      <div>
        {sectionHead(<Utensils className="w-4 h-4" style={{ color: 'var(--primary)' }} />, 'Durante el viaje', totals.during, addBtn('durante'),
          tripDays && totals.during > 0
            ? `Se va gastando en ruta · unos ${formatCLP(perDay(totals.during, tripDays))} al día`
            : 'Comida, bencina y actividades: se van gastando en ruta.')}
        {durante.length === 0 ? (
          <p className="text-xs px-4 py-4 card-flat" style={{ color: 'var(--ink-3)' }}>Ej: comida $30.000 por persona al día.</p>
        ) : (
          <div className="card-flat overflow-hidden [&>*+*]:border-t [&>*+*]:border-[color-mix(in_srgb,var(--border)_55%,transparent)]">
            {durante.map(it => (
              <Row key={it.id} it={it}
                sub={`${TRIP_CATEGORIES.find(c => c.key === it.trip_category)?.label ?? ''}${tripDays ? ` · ${formatCLP(perDay(it.est_amount, tripDays))} al día` : ''}${share(it.est_amount)}`} />
            ))}
          </div>
        )}
      </div>

      {/* Opcionales */}
      {(opcionales.length > 0 || !closed) && (
        <div>
          {sectionHead(<Sparkles className="w-4 h-4" style={{ color: 'var(--primary)' }} />, 'Opcionales', 0, addBtn('durante', true),
            'Actívalos o apágalos y el total se ajusta.')}
          {opcionales.length === 0 ? (
            <p className="text-xs px-4 py-4 card-flat" style={{ color: 'var(--ink-3)' }}>Actividades que harías si alcanza: kayak, un tour, una cena especial.</p>
          ) : (
            <div className="card-flat overflow-hidden [&>*+*]:border-t [&>*+*]:border-[color-mix(in_srgb,var(--border)_55%,transparent)]">
              {opcionales.map(it => (
                <Row key={it.id} it={it}
                  sub={`${TRIP_CATEGORIES.find(c => c.key === it.trip_category)?.label ?? ''}${qtyLabel(it, formatCLP) ? ` · ${qtyLabel(it, formatCLP)}` : ''}${it.enabled ? share(it.est_amount) : ' · no incluido'}`}
                  action={!closed && (
                    <button role="switch" aria-checked={it.enabled} aria-label={`Incluir ${it.description}`} disabled={busy} onClick={() => toggle(it)}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center">
                      <span className="relative inline-block w-10 h-6 rounded-full transition-colors" style={{ background: it.enabled ? 'var(--primary)' : 'var(--ink-3)' }}>
                        <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: it.enabled ? 18 : 2, boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                      </span>
                    </button>
                  )} />
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{error}</p>}

      {detail && (() => {
        const it = items.find(i => i.id === detail.id) ?? detail
        const over = overCap(it)
        const catLabel = TRIP_CATEGORIES.find(c => c.key === it.trip_category)?.label ?? ''
        const q = qtyLabel(it, formatCLP)
        const rows: [string, string][] = [
          ['Tipo', it.kind === 'reserva' ? 'Reserva (antes de salir)' : 'Durante el viaje'],
          ['Categoría', catLabel],
        ]
        if (q) rows.push(['Detalle', q])
        if (it.cap_amount) rows.push(['Tope por unidad', formatCLP(it.cap_amount)])
        if (it.kind === 'reserva') rows.push(['Vence', it.due_date ? `${fmtDue(it.due_date, today)} · ${new Date(it.due_date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}` : 'Sin fecha'])
        if (it.kind === 'durante' && tripDays) rows.push(['Por día', `${formatCLP(perDay(it.est_amount, tripDays))} (${tripDays} días)`])
        if (people > 1) rows.push(['Tu parte aprox.', formatCLP(Math.ceil(it.est_amount / people))])
        if (it.optional) rows.push(['Opcional', it.enabled ? 'Incluido en el total' : 'No incluido'])
        return (
          <SheetShell title={it.description} subtitle={it.kind === 'reserva' ? 'Reserva (antes de salir)' : 'Durante el viaje'} label="Detalle del ítem" onClose={() => setDetail(null)}>
            <p className="font-display text-3xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(it.est_amount)}</p>
            {over > 0 && (
              <p className="text-xs font-semibold" style={{ color: 'var(--gold-ink)' }}>{formatCLP(over)} sobre tu tope por unidad</p>
            )}
            <div className="rounded-xl" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
              {rows.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{k}</span>
                  <span className="text-xs font-semibold text-right tabular-nums" style={{ color: 'var(--ink)' }}>{v}</span>
                </div>
              ))}
            </div>
            {!closed && (
              <div className="flex gap-2">
                <button onClick={() => { setDetail(null); setSheet(it) }}
                  className="flex-1 min-h-[44px] rounded-xl text-sm font-semibold border"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: 'var(--surface)' }}>Editar</button>
                {it.kind === 'reserva' && (
                  <button onClick={() => { setDetail(null); setPaying(it.id); setError('') }}
                    className="flex-1 min-h-[44px] rounded-xl text-sm font-bold"
                    style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>Pagar</button>
                )}
              </div>
            )}
          </SheetShell>
        )
      })()}

      {sheet && (
        <PlanItemSheet groupId={groupId} tripDays={tripDays}
          item={'id' in sheet ? sheet : null}
          preset={'id' in sheet ? null : sheet}
          onClose={() => setSheet(null)} />
      )}
    </div>
  )
}

function PlanItemSheet({ groupId, item, preset, tripDays, onClose }: {
  groupId: string; item: SharedPlanItemRow | null; preset: { kind: 'reserva' | 'durante'; optional: boolean } | null
  tripDays: number | null; onClose: () => void
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [kind, setKind] = useState<'reserva' | 'durante'>(item?.kind ?? preset?.kind ?? 'reserva')
  const [optional, setOptional] = useState(item?.optional ?? preset?.optional ?? false)
  const [desc, setDesc] = useState(item?.description ?? '')
  const [cat, setCat] = useState<TripCategory>(item?.trip_category ?? (preset?.kind === 'durante' ? 'comida' : 'alojamiento'))
  const [qty, setQty] = useState(String(item?.quantity ?? 1))
  // Con unitario: total = cantidad × precio. Sin unitario (ítems viejos): se edita el total.
  const [amount, setAmount] = useState(item ? fmtNum(String(item.unit_amount ?? item.est_amount)) : '')
  const [cap, setCap] = useState(item?.cap_amount ? fmtNum(String(item.cap_amount)) : '')
  const [due, setDue] = useState(item?.due_date ?? '')
  // Cerrado por defecto salvo que el ítem ya tenga algo acá — no esconder un
  // valor que la persona ya puso.
  const [moreOpen, setMoreOpen] = useState(!!(item?.cap_amount || item?.due_date))
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const q = Math.max(1, parseInt(qty.replace(/\D/g, ''), 10) || 1)
  const unit = parseInt(amount.replace(/\D/g, ''), 10) || 0
  const capN = parseInt(cap.replace(/\D/g, ''), 10) || 0
  const total = unit * q
  // No bloquea — solo avisa si la cantidad parece un error de tipeo (ej. 999
  // en vez de 9) antes de que el total salga mal sin que nadie lo note.
  const qtyThreshold = kind === 'durante' ? (tripDays ? tripDays + 5 : 60) : (cat === 'alojamiento' ? 60 : 20)
  const qtyImplausible = q > qtyThreshold

  async function save() {
    if (!desc.trim()) { setError('Escribe una descripción.'); return }
    if (unit <= 0) { setError('Ingresa un monto mayor a cero.'); return }
    setSaving(true); setError('')
    const res = await savePlanItem({
      id: item?.id ?? null, groupId, description: desc.trim(), category: cat, amount: total,
      dueDate: kind === 'reserva' ? (due || null) : null,
      kind, quantity: q, unitAmount: unit, capAmount: capN > 0 ? capN : null, optional,
    })
    setSaving(false)
    if (!res.ok) { setError(res.error); return }
    showToast(item ? 'Plan actualizado' : 'Agregado al plan')
    router.refresh(); onClose()
  }

  async function remove() {
    if (!item) return
    setSaving(true)
    const res = await deletePlanItem(item.id)
    setSaving(false)
    if (!res.ok) { setError(res.error); return }
    showToast('Eliminado del plan'); router.refresh(); onClose()
  }

  const qtyUnit = kind === 'durante' ? (tripDays ? 'días' : 'veces') : (cat === 'alojamiento' ? 'noches' : 'unidades')

  return (
    <SheetShell title={item ? 'Editar ítem' : 'Agregar al plan'} subtitle="Cantidad × precio, con tope si quieres" label="Ítem del plan del viaje" onClose={onClose}>
      <div className="flex gap-1.5">
        <Chip active={kind === 'reserva'} onClick={() => setKind('reserva')}>Reserva (antes de salir)</Chip>
        <Chip active={kind === 'durante'} onClick={() => setKind('durante')}>Durante el viaje</Chip>
      </div>
      <InputRow invalid={!!error && !desc.trim()}>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder={kind === 'reserva' ? 'Ej: Airbnb en Pucón' : 'Ej: Comida'} className={inputClass} maxLength={80} autoFocus />
      </InputRow>
      <div>
        <FieldLabel>Categoría</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {TRIP_CATEGORIES.map(c => <Chip key={c.key} active={cat === c.key} onClick={() => setCat(c.key)}>{c.label}</Chip>)}
        </div>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 96px' }}>
        <div>
          <FieldLabel>Precio por {kind === 'durante' ? 'día / vez' : 'unidad'}</FieldLabel>
          <InputRow icon={<span className="text-sm font-bold">$</span>} invalid={!!error && unit <= 0}>
            <input inputMode="numeric" value={amount} placeholder="100.000" onChange={e => setAmount(fmtNum(e.target.value).slice(0, 13))} className={inputClass + ' tabular-nums'} />
          </InputRow>
        </div>
        <div>
          <FieldLabel>{qtyUnit}</FieldLabel>
          <InputRow><input inputMode="numeric" value={qty} onChange={e => setQty(e.target.value.replace(/\D/g, '').slice(0, 3))} className={inputClass + ' tabular-nums'} /></InputRow>
        </div>
      </div>
      {total > 0 && (
        <p className="text-xs tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>
          {q > 1 ? <>{q} × {formatCLP(unit)} = <span className="font-bold">{formatCLP(total)}</span></> : <>Total: <span className="font-bold">{formatCLP(total)}</span></>}
        </p>
      )}
      {qtyImplausible && (
        <p className="text-xs font-medium" style={{ color: 'var(--gold-ink)' }}>
          {q} {qtyUnit} es bastante — revisa que no sea un error de tipeo.
        </p>
      )}
      {moreOpen ? (
        <div className="space-y-3">
          <div>
            <FieldLabel hint="Si encuentras algo más caro, te avisamos.">Tope por unidad (opcional)</FieldLabel>
            <InputRow icon={<span className="text-sm font-bold">$</span>}>
              <input inputMode="numeric" value={cap} placeholder="120.000" onChange={e => setCap(fmtNum(e.target.value).slice(0, 13))} className={inputClass + ' tabular-nums'} />
            </InputRow>
            {capN > 0 && unit > capN && <p className="text-xs mt-1 font-medium" style={{ color: 'var(--gold-ink)' }}>El precio pasa del tope en {formatCLP(unit - capN)}.</p>}
          </div>
          {kind === 'reserva' && (
            <div>
              <FieldLabel hint="Con fecha aparece en tu flujo de caja a 30 días.">Vence (opcional)</FieldLabel>
              <InputRow><input type="date" value={due} onChange={e => setDue(e.target.value)} className={inputClass} /></InputRow>
            </div>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setMoreOpen(true)}
          className="text-xs font-semibold min-h-[44px] -my-3 inline-flex items-center" style={{ color: 'var(--primary)' }}>
          + Más opciones {kind === 'reserva' ? '(tope, vencimiento)' : '(tope)'}
        </button>
      )}
      <div className="flex items-center gap-2">
        <Chip active={optional} onClick={() => setOptional(!optional)}>Es opcional</Chip>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-3">
        {item && (
          confirmDelete ? (
            <button onClick={remove} disabled={saving}
              className="px-4 py-3 text-sm font-bold text-white bg-red-500 rounded-2xl hover:bg-red-600 transition-colors disabled:opacity-60 flex-shrink-0">
              {saving ? 'Eliminando…' : 'Eliminar ítem'}
            </button>
          ) : (
            <button onClick={() => setConfirmDelete(true)} aria-label="Eliminar del plan"
              className="logout-btn flex items-center px-4 py-3 text-sm font-semibold text-red-500 border rounded-2xl transition-colors flex-shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          )
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
