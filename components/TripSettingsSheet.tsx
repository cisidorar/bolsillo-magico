'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plane, Check, Lock, Unlock } from 'lucide-react'
import { useToast } from '@/components/ToastProvider'
import { updateSharedGroup, setMySharedCategory, setSharedGroupClosed } from '@/app/actions/shared'
import type { Category } from '@/types'
import { SheetShell, FieldLabel, InputRow, inputClass, PrimaryButton } from './SheetParts'

export default function TripSettingsSheet({
  groupId, name: n0, start: s0, end: e0, closed, categories, myCategoryId, onClose,
}: {
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
      <p className="text-[11px] text-gray-400">Déjalas vacías si todavía no las defines.</p>

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
      {error && <p className="text-xs text-red-500">{error}</p>}
      <PrimaryButton onClick={save} disabled={saving}>
        {saving ? 'Guardando…' : <><Check className="w-4 h-4" /> Guardar</>}
      </PrimaryButton>

      <div className="pt-2 border-t border-gray-100">
        <button disabled={saving} onClick={async () => {
          setSaving(true); setError('')
          const r = await setSharedGroupClosed(groupId, !closed)
          setSaving(false)
          if (!r.ok) { setError(r.error); return }
          showToast(closed ? 'Viaje reabierto' : 'Viaje cerrado')
          router.refresh(); onClose()
        }} className="w-full inline-flex items-center justify-center gap-1.5 py-2 min-h-[44px] text-xs font-semibold text-gray-500">
          {closed ? <><Unlock className="w-3.5 h-3.5" /> Reabrir viaje</> : <><Lock className="w-3.5 h-3.5" /> Cerrar viaje (ya no se pueden agregar gastos)</>}
        </button>
      </div>
    </SheetShell>
  )
}
