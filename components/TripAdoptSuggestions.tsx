'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ToastProvider'
import { adoptManyIntoTrip } from '@/app/actions/shared'
import { guessTripCategory, type SplitKind } from '@/lib/shared-split'
import { formatCLP } from '@/lib/utils'

export interface AdoptCandidate { id: string; description: string | null; amount: number; date: string }

/**
 * Gastos tuyos de las fechas del viaje que aún no están en él. Sirve sobre todo
 * para un viaje que ya pasó: marcas los que fueron del viaje y los pasas de una vez.
 */
export default function TripAdoptSuggestions({ groupId, candidates, splitKind, today }: {
  groupId:    string
  candidates: AdoptCandidate[]
  splitKind:  SplitKind
  today:      string
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  void today

  if (candidates.length === 0) return null
  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const total = candidates.filter(c => picked.has(c.id)).reduce((s, c) => s + c.amount, 0)

  async function submit() {
    setBusy(true); setError('')
    const items = candidates.filter(c => picked.has(c.id))
      .map(c => ({ expenseId: c.id, tripCategory: guessTripCategory(c.description ?? '') ?? 'otros' }))
    const r = await adoptManyIntoTrip(groupId, items, splitKind)
    setBusy(false)
    if (!r.ok) { setError(r.error); router.refresh(); return }
    showToast(`${r.done} ${r.done === 1 ? 'gasto pasado' : 'gastos pasados'} al viaje`)
    setPicked(new Set()); setOpen(false)
    router.refresh()
  }

  return (
    <div className="card p-4">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 text-left min-h-[44px]">
        <span>
          <span className="block text-sm font-bold" style={{ color: 'var(--ink)' }}>
            {candidates.length} {candidates.length === 1 ? 'gasto tuyo' : 'gastos tuyos'} de estas fechas
          </span>
          <span className="block text-xs" style={{ color: 'var(--ink-3)' }}>¿Alguno fue de este viaje? Pásalos de una vez.</span>
        </span>
        <span className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>{open ? 'Ocultar' : 'Revisar'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-1">
          {candidates.map(c => (
            <label key={c.id} className="flex items-center gap-3 py-2 min-h-[44px] cursor-pointer">
              <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="w-4 h-4" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{c.description || 'Sin descripción'}</span>
                <span className="block text-xs" style={{ color: 'var(--ink-3)' }}>{fmt(c.date)}</span>
              </span>
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(c.amount)}</span>
            </label>
          ))}
          {error && <p className="text-xs" style={{ color: 'var(--coral)' }}>{error}</p>}
          <button disabled={busy || picked.size === 0} onClick={submit}
            className="w-full mt-2 py-2.5 text-xs font-bold rounded-lg disabled:opacity-50"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
            {picked.size === 0 ? 'Marca los del viaje' : `Pasar ${picked.size} al viaje · ${formatCLP(total)}`}
          </button>
          <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
            Cada uno se reparte entre todos según el reparto del viaje; en tus gastos queda solo tu parte.
          </p>
        </div>
      )}
    </div>
  )
}
