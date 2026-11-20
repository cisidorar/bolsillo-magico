'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plane, Check, Lock, Unlock, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ToastProvider'
import { updateSharedGroup, setMySharedCategory, setSharedGroupClosed, deleteSharedGroup } from '@/app/actions/shared'
import type { Category } from '@/types'
import { SheetShell, FieldLabel, InputRow, inputClass, PrimaryButton } from './SheetParts'

export default function TripSettingsSheet({
  groupId, name: n0, start: s0, end: e0, closed, categories, myCategoryId, onClose, canDelete = false, deleteBlocked = false,
}: {
  /** Solo quien creó el viaje */
  canDelete?: boolean
  /** Otras personas ya tienen gastos: se archiva, no se elimina */
  deleteBlocked?: boolean
  groupId: string; name: string; start: string | null; end: string | null
  closed: boolean; categories: Category[]; myCategoryId: string | null; onClose: () => void
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [name, setName] = useState(n0)
  const [start, setStart] = useState(s0 ?? '')
  const [end, setEnd] = useState(e0 ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [cat, setCat] = useState(myCategoryId ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save() {
    if (!name.trim()) { setError('Ponle un nombre al viaje.'); return }
    setSaving(true); setError('')
    if (!closed) {
      const res = await updateSharedGroup(groupId, name.trim(), start || null, end || null)
      if (!res.ok) { setSaving(false); setError(res.error); return }
    }
    if (cat && cat !== myCategoryId) {
      const r2 = await setMySharedCategory(groupId, cat)
      if (!r2.ok) { setSaving(false); setError(r2.error); return }
    }
    setSaving(false)
    showToast('Viaje actualizado')
    router.refresh()
    onClose()
  }

  return (
    <SheetShell title="Ajustes del viaje" label="Ajustes del viaje" onClose={onClose}>
      <InputRow icon={<Plane className="w-4 h-4" />} invalid={!!error && !name.trim()}>
        <input value={name} onChange={e => setName(e.target.value)} className={inputClass} maxLength={60} />
      </InputRow>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Salida</FieldLabel>
          <InputRow><input type="date" value={start} onChange={e => setStart(e.target.value)} className={inputClass} /></InputRow>
        </div>
        <div>
          <FieldLabel>Vuelta</FieldLabel>
          <InputRow><input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)} className={inputClass} /></InputRow>
        </div>
      </div>
      <p className="text-[11px] text-[color:var(--ink-3)]">Déjalas vacías si todavía no las defines.</p>

      <div>
        <FieldLabel hint="En tu historial cada gasto del viaje aparece solo con tu parte, en esta categoría. Cada persona elige la suya.">
          Categoría en tus gastos
        </FieldLabel>
        <InputRow>
          <select value={cat} onChange={e => setCat(e.target.value)} className={inputClass}>
            {!cat && <option value="">Sin categoría</option>}
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </InputRow>
      </div>
      {error && <p className="text-xs text-[color:var(--coral-ink)]">{error}</p>}
      <PrimaryButton onClick={save} disabled={saving}>
        {saving ? 'Guardando…' : <><Check className="w-4 h-4" /> Guardar</>}
      </PrimaryButton>

      <div className="pt-2">
        <button disabled={saving} onClick={async () => {
          setSaving(true); setError('')
          const r = await setSharedGroupClosed(groupId, !closed)
          setSaving(false)
          if (!r.ok) { setError(r.error); return }
          showToast(closed ? 'Viaje reabierto' : 'Viaje cerrado')
          router.refresh(); onClose()
        }} className="w-full inline-flex items-center justify-center gap-1.5 py-2 min-h-[44px] text-xs font-semibold text-[color:var(--ink-3)]">
          {closed ? <><Unlock className="w-3.5 h-3.5" /> Reabrir viaje</> : <><Lock className="w-3.5 h-3.5" /> Cerrar viaje (ya no se pueden agregar gastos)</>}
        </button>
      </div>

      {canDelete && (
        <div className="space-y-2">
          {deleteBlocked ? (
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
              Otras personas ya tienen gastos en este viaje, así que no se puede eliminar. Ciérralo para archivarlo.
            </p>
          ) : confirmDelete ? (
            <div className="rounded-2xl p-4 space-y-3" style={{ background: 'color-mix(in srgb, var(--coral) 10%, var(--surface))' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>¿Eliminar «{n0}»?</p>
              <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
                Se borran el plan, los gastos y las invitaciones. No se puede deshacer. Si ya no va, esto es lo que quieres; si solo terminó, mejor ciérralo.
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={saving} onClick={() => setConfirmDelete(false)}
                  className="flex-1 min-h-[44px] rounded-xl text-sm font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>Mejor no</button>
                <button type="button" disabled={saving} onClick={async () => {
                  setSaving(true); setError('')
                  const r = await deleteSharedGroup(groupId)
                  if (!r.ok) { setSaving(false); setError(r.error); setConfirmDelete(false); return }
                  showToast('Viaje eliminado')
                  router.push('/compartidos'); router.refresh()
                }} className="flex-1 min-h-[44px] rounded-xl text-sm font-bold disabled:opacity-60" style={{ background: 'var(--coral-ink)', color: '#fff' }}>
                  {saving ? 'Eliminando…' : 'Sí, eliminar'}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 min-h-[44px] text-xs font-semibold" style={{ color: 'var(--coral-ink)' }}>
              <Trash2 className="w-3.5 h-3.5" /> Eliminar viaje (ya no va)
            </button>
          )}
        </div>
      )}
    </SheetShell>
  )
}
