'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plane, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ToastProvider'
import { adoptExpenseIntoTrip, releaseExpenseFromTrip } from '@/app/actions/shared'
import { guessTripCategory, TRIP_CATEGORIES, type TripCategory } from '@/lib/shared-split'

interface TripOpt { id: string; name: string; split_mode: 'equal' | 'income'; split_error: string | null }

/**
 * En el detalle de un gasto (Historial): pasarlo a uno de tus viajes abiertos o,
 * si ya está en uno y lo pagaste tú, sacarlo. Solo aparece si participas en algún viaje.
 */
export default function TripLinkAction({ expenseId, description, sharedExpenseId, onDone }: {
  expenseId:       string
  description:     string | null
  sharedExpenseId: string | null
  onDone:          () => void
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [trips, setTrips] = useState<TripOpt[]>([])
  const [canRelease, setCanRelease] = useState(false)
  const [open, setOpen] = useState(false)
  const [tripId, setTripId] = useState('')
  const [cat, setCat] = useState<TripCategory>(guessTripCategory(description ?? '') ?? 'otros')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      if (sharedExpenseId) {
        const { data } = await supabase.from('shared_expenses').select('paid_by').eq('id', sharedExpenseId).maybeSingle()
        if (!cancelled) setCanRelease(data?.paid_by === user.id)
        return
      }
      const { data } = await supabase.from('shared_groups').select('id, name, split_mode, split_error').is('closed_at', null)
      if (cancelled) return
      const list = (data ?? []) as TripOpt[]
      setTrips(list)
      if (list[0]) setTripId(list[0].id)
    })()
    return () => { cancelled = true }
  }, [sharedExpenseId])

  if (sharedExpenseId ? !canRelease : trips.length === 0) return null

  async function link() {
    const t = trips.find(x => x.id === tripId)
    if (!t) return
    setBusy(true); setError('')
    const r = await adoptExpenseIntoTrip({
      groupId: t.id, expenseId, tripCategory: cat,
      splitKind: t.split_mode === 'income' && !t.split_error ? 'group' : 'equal',
      participants: null, exact: null,
    })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    showToast(`Pasado a ${t.name}`)
    router.refresh(); onDone()
  }

  async function unlink() {
    if (!sharedExpenseId) return
    setBusy(true); setError('')
    const r = await releaseExpenseFromTrip(sharedExpenseId)
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    showToast('Sacado del viaje')
    router.refresh(); onDone()
  }

  const row = (title: string, sub: string, onClick: () => void) => (
    <button type="button" onClick={onClick} disabled={busy}
      className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-opacity hover:opacity-80 disabled:opacity-50"
      style={{ background: 'var(--surface-2)' }}>
      <Plane className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-gray-800">{title}</span>
        <span className="block text-[11px] text-gray-400">{sub}</span>
      </span>
      <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-300" />
    </button>
  )

  if (sharedExpenseId) {
    return (
      <div>
        {row('Sacar del viaje', 'Vuelve a ser un gasto normal por el total', unlink)}
        {error && <p className="text-xs mt-1" style={{ color: 'var(--coral)' }}>{error}</p>}
      </div>
    )
  }

  if (!open) return row('Pasar a un viaje', 'Se reparte entre las personas del viaje', () => setOpen(true))

  const sel = { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }
  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface-2)' }}>
      <select value={tripId} onChange={e => setTripId(e.target.value)} className="w-full px-3 py-2.5 text-sm rounded-lg border" style={sel}>
        {trips.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <select value={cat} onChange={e => setCat(e.target.value as TripCategory)} className="w-full px-3 py-2.5 text-sm rounded-lg border" style={sel}>
        {TRIP_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      {error && <p className="text-xs" style={{ color: 'var(--coral)' }}>{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="flex-1 py-2.5 text-xs font-semibold rounded-lg border"
          style={{ borderColor: 'var(--border)', color: 'var(--ink-2)', background: 'var(--surface)' }}>Cancelar</button>
        <button disabled={busy || !tripId} onClick={link} className="flex-1 py-2.5 text-xs font-bold rounded-lg disabled:opacity-50"
          style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>Pasar</button>
      </div>
    </div>
  )
}
