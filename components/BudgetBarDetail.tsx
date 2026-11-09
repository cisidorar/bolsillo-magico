'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { SheetShell } from '@/components/SheetParts'
import ServiceLogo from '@/components/ServiceLogo'

// ── Detalle de la barra de presupuesto (nov 2026) ───────────────────────────
// Cas: «la barra gris son recurrentes y cosas así, ¿puedo ver el detalle?».
// Tocar la barra o las líneas "+$X por cobrar" / "+$Y vienen este mes" abre
// una hoja con los cobros concretos detrás de cada tramo: qué es, qué día y
// cuánto. Las cifras son las mismas que dibujan la barra (el servidor las
// calcula una sola vez y pasa la lista).

export interface BarItem {
  id: string
  name: string
  amount: number
  day: number               // día del mes en que se cobra
  domain: string | null
  installment: string | null  // "cuota 3 de 12"
}

type Layout = 'inline' | 'stacked'

export default function BudgetBarDetail({
  pending, upcoming, bar, layout, progressPct, daysRemaining, isOver, monthLabel,
}: {
  pending: BarItem[]
  upcoming: BarItem[]
  bar: ReactNode
  layout: Layout
  progressPct: number
  daysRemaining: number
  isOver: boolean
  monthLabel: string
}) {
  const [open, setOpen] = useState(false)
  const pendingTotal  = pending.reduce((s, i) => s + i.amount, 0)
  const upcomingTotal = upcoming.reduce((s, i) => s + i.amount, 0)
  const hasDetail = !isOver && (pending.length > 0 || upcoming.length > 0)

  const pendingBtn = !isOver && pendingTotal > 0 && (
    <button type="button" onClick={() => setOpen(true)} className="font-semibold text-white underline decoration-dotted underline-offset-2 inline-flex items-center gap-0.5">
      +{formatCLP(pendingTotal)} por cobrar <ChevronRight className="w-3 h-3" />
    </button>
  )
  const upcomingBtn = !isOver && upcomingTotal > 0 && (
    <button type="button" onClick={() => setOpen(true)} className="text-white underline decoration-dotted underline-offset-2 inline-flex items-center gap-0.5">
      +{formatCLP(upcomingTotal)} vienen este mes <ChevronRight className="w-3 h-3" />
    </button>
  )

  return (
    <>
      {hasDetail ? (
        <div role="button" tabIndex={0} aria-label="Ver detalle de lo que viene este mes"
          onClick={() => setOpen(true)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true) } }}
          className="cursor-pointer">
          {bar}
        </div>
      ) : bar}

      {layout === 'inline' ? (
        <div className="flex justify-between mt-2">
          <span className="text-xs text-white flex items-center flex-wrap gap-x-1.5 gap-y-0.5">
            {progressPct}% usado
            {pendingBtn && <><span>·</span>{pendingBtn}</>}
            {upcomingBtn && <><span>·</span>{upcomingBtn}</>}
          </span>
          <span className="text-xs text-white flex-shrink-0">{daysRemaining} días restantes</span>
        </div>
      ) : (
        <>
          <div className="flex justify-between mt-1.5">
            <span className="text-xs text-white">{progressPct}% usado</span>
            <span className="text-xs text-white">{daysRemaining} días restantes</span>
          </div>
          {pendingBtn && <p className="text-xs mt-1">{pendingBtn}</p>}
          {upcomingBtn && <p className="text-xs mt-1">{upcomingBtn}</p>}
        </>
      )}

      {open && (
        <SheetShell
          title="Lo que se suma a tu gasto"
          subtitle={`${monthLabel} · cobros que aún no están en «gastado»`}
          label="Detalle de cobros pendientes del mes"
          onClose={() => setOpen(false)}
        >
          <div className="space-y-5">
            <Group
              title="Por cobrar" total={pendingTotal} items={pending}
              hint="Su día de cobro ya llegó y todavía no se registran como gasto."
              empty="Nada pendiente de registrar."
            />
            <Group
              title="Vienen este mes" total={upcomingTotal} items={upcoming}
              hint="Aún no vencen, pero se van a cobrar antes de fin de mes."
              empty="No hay más cobros programados este mes."
            />
            <div className="rounded-2xl px-4 py-3 flex items-center justify-between" style={{ background: 'var(--surface-2)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>Total que se suma</span>
              <span className="text-base font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(pendingTotal + upcomingTotal)}</span>
            </div>
            <Link href="/recurrentes" onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 text-sm font-semibold py-2" style={{ color: 'var(--primary)' }}>
              Administrar en Recurrentes <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </SheetShell>
      )}
    </>
  )
}

function Group({ title, total, items, hint, empty }: {
  title: string; total: number; items: BarItem[]; hint: string; empty: string
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{title}</h3>
        <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(total)}</span>
      </div>
      <p className="text-[11px] mt-0.5 mb-2" style={{ color: 'var(--ink-3)' }}>{hint}</p>
      {items.length === 0 ? (
        <p className="text-xs py-2" style={{ color: 'var(--ink-3)' }}>{empty}</p>
      ) : (
        <ul className="[&>*+*]:border-t [&>*+*]:border-[color-mix(in_srgb,var(--border)_55%,transparent)]">
          {items.map(i => (
            <li key={i.id} className="flex items-center gap-3 py-2.5">
              <ServiceLogo domain={i.domain} name={i.name} size={32} className="flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{i.name}</p>
                <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                  Día {i.day}{i.installment ? ` · ${i.installment}` : ''}
                </p>
              </div>
              <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>{formatCLP(i.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
