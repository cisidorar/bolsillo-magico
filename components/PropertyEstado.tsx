'use client'

import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, Upload, Info } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { chargeTotal, chargeOutstanding, daysBetween, KIND_LABEL, type UtilityKind } from '@/lib/property-charges'
import {
  estadoModel, monthGrid, cuotasOfYear, cellTone, monthName, MONTH_NAMES, type Tone,
} from '@/lib/property-estado'
import type { Charge } from './PropertyManager'

const TONE_COLOR: Record<Tone, string> = {
  paid: 'var(--mint)', overdue: 'var(--coral)', soon: 'var(--gold-ink)', pending: 'var(--ink-3)',
}
const TONE_DOT: Record<Tone, string> = {
  paid: 'var(--mint)', overdue: 'var(--coral)', soon: 'var(--gold)', pending: 'var(--ink-3)',
}
const tint = (c: string, pct = 14) => `color-mix(in srgb, ${c} ${pct}%, var(--surface))`

function shortDay(d: string): string {
  return `${d.slice(8, 10)} ${MONTH_NAMES[Number(d.slice(5, 7)) - 1].slice(0, 3)}`
}

function monthTitle(key: string): string {
  const n = monthName(key)
  return n[0].toUpperCase() + n.slice(1)
}

/** Etiqueta de estado de una tarjeta del arrendatario. */
function badgeFor(c: Charge, today: string): { text: string; tone: Tone | 'neutral' } {
  const tone = cellTone(c, today)
  if (tone === 'paid') return { text: 'Pagó', tone }
  if (tone === 'overdue') return { text: 'Vencido', tone }
  if (c.is_estimate) return { text: 'Sin boleta', tone: 'neutral' }
  const days = daysBetween(today, c.due_date)
  if (days <= 7) return { text: days === 0 ? 'Vence hoy' : days === 1 ? 'Vence mañana' : `Vence en ${days} días`, tone: 'soon' }
  return { text: 'Sin pagar', tone: 'neutral' }
}

export default function PropertyEstado({
  charges, today, monthKeys, selectedMonth, onSelectMonth, busy, unconfirmed,
  onOpen, onPay, onUnpay, onUploadBill, onBulkPay, onBulkCollect, onConfirm,
}: {
  charges: Charge[]
  today: string
  monthKeys: string[]
  selectedMonth: string
  onSelectMonth: (key: string) => void
  busy: boolean
  unconfirmed: Charge[]
  onOpen: (c: Charge) => void
  onPay: (c: Charge) => void
  onUnpay: (c: Charge) => void
  /** null = abrir el uploader sin servicio preseleccionado */
  onUploadBill: (kind: UtilityKind | null) => void
  onBulkPay: (cs: Charge[]) => void
  onBulkCollect: () => void
  onConfirm: (id: string) => void
}) {
  const model = useMemo(() => estadoModel(charges, today, selectedMonth, formatCLP), [charges, today, selectedMonth])
  const grid = useMemo(() => monthGrid(charges, monthKeys, today), [charges, monthKeys, today])
  const year = Number(selectedMonth.slice(0, 4))
  const aseoCuotas = useMemo(() => cuotasOfYear(charges, 'aseo', year, today), [charges, year, today])

  const idx = monthKeys.indexOf(selectedMonth)
  const mName = monthTitle(selectedMonth)
  const n = model.pendingCount
  const headline = n === 0 ? `${mName}: todo al día` : `${mName}: ${n} ${n === 1 ? 'cosa pendiente' : 'cosas pendientes'}`

  const aseoOverdue = model.ownerOverdue.filter(c => c.kind === 'aseo')
  const otherOwner = [
    ...model.ownerOverdue.filter(c => c.kind !== 'aseo'),
    ...model.ownerMonthTodo.filter(c => c.kind !== 'aseo'),
  ]
  const aseoMonthPending = model.ownerMonthTodo.filter(c => c.kind === 'aseo')
  const aseoNext = aseoCuotas.find(q => q.charge.due_date > today && q.tone !== 'paid')
  const presentTenant = model.tenantCards.length
  const showAseo = aseoCuotas.length > 0

  const nextCuotaText = aseoNext ? `Próxima: ${monthName(aseoNext.monthKey)}.` : 'No quedan cuotas este año.'
  const aseoHasThisMonth = aseoCuotas.some(q => q.monthKey === selectedMonth)

  return (
    <div className="space-y-8">
      {/* ── Qué falta este mes ──────────────────────────────────────────── */}
      <div className="card p-5 lg:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button onClick={() => onSelectMonth(monthKeys[idx - 1])} disabled={idx <= 0}
              aria-label="Mes anterior"
              className="w-11 h-11 rounded-xl flex items-center justify-center disabled:opacity-30"
              style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="px-3 text-sm font-semibold min-w-[8.5rem] text-center" style={{ color: 'var(--ink)' }}>
              {mName} {year}
            </p>
            <button onClick={() => onSelectMonth(monthKeys[idx + 1])} disabled={idx < 0 || idx >= monthKeys.length - 1}
              aria-label="Mes siguiente"
              className="w-11 h-11 rounded-xl flex items-center justify-center disabled:opacity-30"
              style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button onClick={() => onUploadBill(null)}
            className="inline-flex items-center gap-1.5 px-4 min-h-[44px] text-sm font-bold rounded-xl active:scale-[.97] transition-transform flex-shrink-0"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}>
            <Upload className="w-4 h-4" strokeWidth={2.5} /> Subir boleta
          </button>
        </div>

        <h2 className="font-display text-2xl lg:text-4xl font-extrabold mt-5 mb-4 leading-tight" style={{ color: 'var(--ink)' }}>
          {headline}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatusTile who="Arrendatario" tone={model.tenantTone} text={model.tenantText} />
          <StatusTile who="Tú" tone={model.ownerTone} text={model.ownerText} />
        </div>
      </div>

      {/* ── Paga el arrendatario ────────────────────────────────────────── */}
      {presentTenant > 0 && (
        <section aria-labelledby="sec-tenant" className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <h3 id="sec-tenant" className="text-base font-bold" style={{ color: 'var(--ink)' }}>Paga el arrendatario</h3>
            <div className="flex items-center gap-2" aria-label={`${model.paidTenantCount} de ${presentTenant} pagadas`}>
              <div className="flex gap-1">
                {model.tenantCards.map(t => (
                  <span key={t.kind} className="h-1.5 w-8 rounded-full"
                    style={{ background: t.charge ? TONE_DOT[cellTone(t.charge, today)] : 'var(--border)' }} />
                ))}
              </div>
              <span className="text-xs tabular-nums" style={{ color: 'var(--ink-3)' }}>
                {model.paidTenantCount} de {presentTenant} pagadas
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {model.tenantCards.map(({ kind, charge }) => (
              <TenantCard key={kind} kind={kind} charge={charge} today={today}
                onOpen={onOpen} onPay={onPay} onUnpay={onUnpay} busy={busy}
                onUploadBill={() => onUploadBill(kind === 'electricity' || kind === 'water' || kind === 'gastos_comunes' ? kind : null)} />
            ))}
          </div>

          {model.tenantOverdueOther.length > 0 && (
            <div className="card p-4" style={{ borderColor: tint('var(--coral)', 30) }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Vencido de otros meses</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--coral)' }}>
                    {model.tenantOverdueOther.length} {model.tenantOverdueOther.length === 1 ? 'cobro' : 'cobros'} ·{' '}
                    {formatCLP(model.tenantOverdueOther.reduce((s, c) => s + chargeOutstanding(c), 0))}
                  </p>
                </div>
                {model.tenantOverdueOther.some(c => c.direction === 'in') && model.tenantOverdueOther.length > 1 && (
                  <button onClick={onBulkCollect} disabled={busy}
                    className="px-3 min-h-[44px] rounded-xl text-xs font-semibold border disabled:opacity-50"
                    style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                    Marcar todo cobrado
                  </button>
                )}
              </div>
              <div className="divide-y mt-2" style={{ borderColor: 'var(--border)' }}>
                {model.tenantOverdueOther.map(c => (
                  <SimpleRow key={c.id} charge={c} today={today} onOpen={onOpen}
                    action={c.direction === 'in' ? 'Cobré' : 'Pagó'} onAction={() => onPay(c)} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Pagas tú ────────────────────────────────────────────────────── */}
      {(showAseo || otherOwner.length > 0) && (
        <section aria-labelledby="sec-owner" className="space-y-3">
          <h3 id="sec-owner" className="text-base font-bold" style={{ color: 'var(--ink)' }}>Pagas tú</h3>

          {showAseo && (
            <div className="card p-5 lg:p-6 lg:grid gap-6 items-start space-y-5 lg:space-y-0"
              style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{KIND_LABEL.aseo}</p>
                  <Badge tone={aseoOverdue.length > 0 ? 'overdue' : aseoMonthPending.length > 0 ? 'soon' : 'paid'}
                    text={aseoOverdue.length > 0 ? 'Vencido' : aseoMonthPending.length > 0 ? 'Por pagar' : 'Al día'} />
                </div>
                <p className="font-display text-xl lg:text-2xl font-extrabold mt-2 leading-tight tabular-nums" style={{ color: 'var(--ink)' }}>
                  {aseoOverdue.length === 1
                    ? `Debes la cuota de ${monthName(aseoOverdue[0].due_date.slice(0, 7))}: ${formatCLP(chargeOutstanding(aseoOverdue[0]))}`
                    : aseoOverdue.length > 1
                      ? `Debes ${aseoOverdue.length} cuotas: ${formatCLP(aseoOverdue.reduce((s, c) => s + chargeOutstanding(c), 0))}`
                      : aseoMonthPending.length > 0
                        ? `Cuota de ${monthName(selectedMonth)}: ${formatCLP(chargeOutstanding(aseoMonthPending[0]))}`
                        : 'Estás al día'}
                </p>
                <p className="text-sm mt-1.5" style={{ color: 'var(--ink-3)' }}>
                  {aseoHasThisMonth ? '' : `Este mes (${monthName(selectedMonth)}) no hay cuota nueva. `}{nextCuotaText}
                </p>
                {(aseoOverdue.length > 0 || aseoMonthPending.length > 0) && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    <button disabled={busy} onClick={() => onPay((aseoOverdue[0] ?? aseoMonthPending[0]))}
                      className="px-4 min-h-[44px] rounded-xl text-sm font-bold disabled:opacity-50"
                      style={aseoOverdue.length > 0
                        ? { background: 'var(--coral)', color: '#2A0A06' }
                        : { background: 'var(--primary)', color: 'var(--primary-ink)' }}>
                      Marcar como pagada
                    </button>
                    {aseoOverdue.length > 1 && (
                      <button disabled={busy} onClick={() => onBulkPay(aseoOverdue)}
                        className="px-4 min-h-[44px] rounded-xl text-sm font-semibold border disabled:opacity-50"
                        style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                        Marcar todas pagadas
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-3)' }}>Cuotas {year}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {aseoCuotas.map(q => (
                    <button key={q.charge.id} onClick={() => onOpen(q.charge)}
                      className="rounded-xl px-3 py-2.5 text-left min-h-[44px]"
                      style={{ background: q.tone === 'overdue' ? tint('var(--coral)', 16) : q.tone === 'paid' ? tint('var(--mint)', 8) : 'var(--surface-2)' }}>
                      <p className="text-sm font-semibold capitalize" style={{ color: 'var(--ink)' }}>{q.short}</p>
                      <p className="text-xs font-semibold" style={{ color: TONE_COLOR[q.tone] }}>{q.text}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {otherOwner.length > 0 && (
            <div className="card p-4">
              <p className="text-sm font-bold mb-1" style={{ color: 'var(--ink)' }}>Otros pagos tuyos</p>
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {otherOwner.map(c => (
                  <SimpleRow key={c.id} charge={c} today={today} onOpen={onOpen} action="Pagué" onAction={() => onPay(c)} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Últimos meses ───────────────────────────────────────────────── */}
      {grid.length > 0 && (
        <section aria-labelledby="sec-grid" className="space-y-3">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <h3 id="sec-grid" className="text-base font-bold" style={{ color: 'var(--ink)' }}>Últimos {monthKeys.length} meses</h3>
            <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--ink-3)' }}>
              {([['paid', 'Pagado'], ['soon', 'Por vencer'], ['pending', 'Pendiente'], ['overdue', 'Vencido']] as [Tone, string][]).map(([t, l]) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: TONE_DOT[t] }} /> {l}
                </span>
              ))}
            </div>
          </div>

          <div className="card p-2 sm:p-3 overflow-x-auto">
            <table className="w-full text-sm border-separate" style={{ borderSpacing: 0, minWidth: 460 }}>
              <thead>
                <tr>
                  <th className="w-[34%]" />
                  {monthKeys.map(k => (
                    <th key={k} scope="col" className="p-0 font-semibold text-xs">
                      <button onClick={() => onSelectMonth(k)} aria-pressed={k === selectedMonth}
                        className="w-full min-h-[44px] capitalize rounded-t-xl"
                        style={k === selectedMonth
                          ? { background: 'var(--primary-soft)', color: 'var(--ink)' }
                          : { color: 'var(--ink-3)' }}>
                        {monthName(k).slice(0, 3)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((row, ri) => (
                  <tr key={row.kind}>
                    <th scope="row" className="text-left font-medium py-3 pl-2 pr-2 border-t" style={{ color: 'var(--ink)', borderColor: 'var(--border)' }}>
                      {row.label}
                      {row.side === 'owner' && <span className="ml-2 text-[11px] font-normal" style={{ color: 'var(--ink-3)' }}>tú</span>}
                    </th>
                    {row.cells.map(cell => (
                      <td key={cell.monthKey} className="text-center border-t p-0"
                        style={{
                          borderColor: 'var(--border)',
                          background: cell.monthKey === selectedMonth ? 'var(--primary-soft)' : undefined,
                          borderBottomLeftRadius: ri === grid.length - 1 && cell.monthKey === selectedMonth ? 12 : undefined,
                          borderBottomRightRadius: ri === grid.length - 1 && cell.monthKey === selectedMonth ? 12 : undefined,
                        }}>
                        {cell.charge && cell.tone ? (
                          <button onClick={() => onOpen(cell.charge!)} className="w-full min-h-[44px] inline-flex items-center justify-center"
                            aria-label={`${row.label}, ${monthName(cell.monthKey)}: ${{ paid: 'pagado', overdue: 'vencido', soon: 'por vencer', pending: 'pendiente' }[cell.tone]}`}>
                            <span className="w-3 h-3 rounded-full" style={{ background: TONE_DOT[cell.tone] }} />
                          </button>
                        ) : <span className="block min-h-[44px]" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Cargos automáticos que nadie revisó en la cartola */}
      {unconfirmed.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
            <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Sin confirmar en la cartola</p>
          </div>
          <div className="space-y-1">
            {unconfirmed.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-3">
                <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
                  {KIND_LABEL[c.kind] ?? c.kind} · {shortDay(c.due_date)} · {formatCLP(chargeTotal(c))}
                </span>
                <button onClick={() => onConfirm(c.id)} disabled={busy}
                  className="text-xs font-bold px-3 min-h-[44px] rounded-lg flex-shrink-0 disabled:opacity-50"
                  style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                  Confirmar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Piezas ──────────────────────────────────────────────────────────────────

function Badge({ tone, text }: { tone: Tone | 'neutral'; text: string }) {
  const color = tone === 'neutral' ? 'var(--ink-2)' : TONE_COLOR[tone]
  return (
    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: tone === 'neutral' ? 'var(--surface-2)' : tint(tone === 'soon' ? 'var(--gold)' : color, 16), color }}>
      {text}
    </span>
  )
}

function StatusTile({ who, tone, text }: { who: string; tone: Tone; text: string }) {
  return (
    <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'var(--surface-2)' }}>
      <span className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: TONE_DOT[tone] }} aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>{who}</p>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ink)' }}>{text}</p>
      </div>
    </div>
  )
}

function TenantCard({ kind, charge, today, busy, onOpen, onPay, onUnpay, onUploadBill }: {
  kind: string; charge: Charge | null; today: string; busy: boolean
  onOpen: (c: Charge) => void; onPay: (c: Charge) => void; onUnpay: (c: Charge) => void; onUploadBill: () => void
}) {
  const title = KIND_LABEL[kind] ?? kind
  if (!charge) {
    return (
      <div className="card p-4 flex flex-col" style={{ minHeight: 168 }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>{title}</p>
        <p className="text-sm mt-3" style={{ color: 'var(--ink-3)' }}>Sin cobro este mes.</p>
      </div>
    )
  }
  const tone = cellTone(charge, today)
  const badge = badgeFor(charge, today)
  const isPaid = tone === 'paid'
  const note = charge.notes?.split('\n')[0]
  const sub = isPaid
    ? `Pagado el ${shortDay(charge.paid_date ?? charge.due_date)}`
    : charge.is_estimate
      ? `Monto estimado · la boleta real llega ${daysBetween(today, charge.due_date) >= 0 ? `en ~${daysBetween(today, charge.due_date)} días` : 'atrasada'}`
      : `Vence ${shortDay(charge.due_date)}${note ? ` · ${note}` : ''}`
  const rent = charge.kind === 'rent'

  return (
    <div className="card p-4 flex flex-col" style={{ minHeight: 168, borderColor: tone === 'soon' ? tint('var(--gold)', 30) : undefined }}>
      <button onClick={() => onOpen(charge)} className="text-left flex-1" aria-label={`Ver detalle de ${title}`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</p>
          <Badge tone={badge.tone} text={badge.text} />
        </div>
        <p className="font-display text-2xl font-extrabold mt-3 tabular-nums"
          style={{ color: isPaid || tone === 'pending' ? 'var(--ink)' : TONE_COLOR[tone] }}>
          {formatCLP(chargeTotal(charge))}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>{sub}</p>
      </button>
      <div className="mt-3">
        {isPaid ? (
          <button onClick={() => onUnpay(charge)} disabled={busy}
            className="text-xs min-h-[44px] -mb-2 disabled:opacity-50" style={{ color: 'var(--ink-3)' }}>
            Deshacer
          </button>
        ) : charge.is_estimate ? (
          <button onClick={onUploadBill}
            className="w-full min-h-[44px] rounded-xl text-sm font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}>
            Subir boleta real
          </button>
        ) : (
          <button onClick={() => onPay(charge)} disabled={busy}
            className="w-full min-h-[44px] rounded-xl text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}>
            {rent ? 'Marcar como cobrado' : 'Marcar como pagado'}
          </button>
        )}
      </div>
    </div>
  )
}

function SimpleRow({ charge, today, onOpen, action, onAction }: {
  charge: Charge; today: string; onOpen: (c: Charge) => void; action: string; onAction: () => void
}) {
  const tone = cellTone(charge, today)
  const days = daysBetween(today, charge.due_date)
  return (
    <div className="flex items-center gap-3 py-2">
      <button onClick={() => onOpen(charge)} className="flex-1 min-w-0 text-left min-h-[44px] flex items-center gap-3">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TONE_DOT[tone] }} aria-hidden />
        <span className="min-w-0">
          <span className="block text-sm font-semibold truncate capitalize" style={{ color: 'var(--ink)' }}>
            {KIND_LABEL[charge.kind] ?? charge.kind} · {monthName(charge.due_date.slice(0, 7))}
          </span>
          <span className="block text-xs" style={{ color: TONE_COLOR[tone] }}>
            {tone === 'overdue' ? `venció hace ${Math.abs(days)} d` : days === 0 ? 'vence hoy' : `vence en ${days} d`}
          </span>
        </span>
      </button>
      <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(chargeTotal(charge))}</span>
      <button onClick={onAction} className="px-3 min-h-[44px] rounded-xl text-xs font-bold"
        style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}>{action}</button>
    </div>
  )
}
