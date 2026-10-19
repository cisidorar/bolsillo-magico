'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plane, Check } from 'lucide-react'
import { useToast } from '@/components/ToastProvider'
import { updateSharedGroup } from '@/app/actions/shared'
import { SheetShell, FieldLabel, InputRow, inputClass, PrimaryButton } from './SheetParts'

export default function TripSettingsSheet({
  groupId, name: n0, start: s0, end: e0, onClose,
}: { groupId: string; name: string; start: string | null; end: string | null; onClose: () => void }) {
  const router = useRouter()
  const { showToast } = useToast()
  const [name, setName] = useState(n0)
  const [start, setStart] = useState(s0 ?? '')
  const [end, setEnd] = useState(e0 ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) { setError('Ponle un nombre al viaje.'); return }
    setSaving(true); setError('')
    const res = await updateSharedGroup(groupId, name.trim(), start || null, end || null)
    setSaving(false)
    if (!res.ok) { setError(res.error); return }
    showToast('Viaje actualizado')
    router.refresh()
    onClose()
  }

  return (
    <SheetShell title="Editar viaje" label="Editar viaje" onClose={onClose}>
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
      {error && <p className="text-xs text-red-500">{error}</p>}
      <PrimaryButton onClick={save} disabled={saving}>
        {saving ? 'Guardando…' : <><Check className="w-4 h-4" /> Guardar</>}
      </PrimaryButton>
    </SheetShell>
  )
}
