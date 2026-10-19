'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plane, Check } from 'lucide-react'
import { createSharedGroup, ensureTripCategory } from '@/app/actions/shared'
import type { SplitMode } from '@/lib/shared-split'
import { SheetShell, FieldLabel, InputRow, inputClass, Chip, PrimaryButton } from './SheetParts'

export const MODES: { key: SplitMode; title: string; hint: string }[] = [
  { key: 'equal',  title: 'Parejo',       hint: 'Todos pagan lo mismo. Puedes cambiarlo después.' },
  { key: 'income', title: 'Según sueldo', hint: 'Cada uno paga en proporción a lo que gana. Nadie ve el sueldo de otro, solo el porcentaje, y cada persona tiene que aceptarlo.' },
]

export default function NewTripSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [name,  setName]  = useState('')
  const [start, setStart] = useState('')
  const [end,   setEnd]   = useState('')
  const [mode,  setMode]  = useState<SplitMode>('equal')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function submit() {
    if (!name.trim()) { setError('Ponle un nombre al viaje.'); return }
    setSaving(true); setError('')
    // Tu parte cae en una categoría propia: "Vacaciones" se crea si no existe.
    const cat = await ensureTripCategory()
    const res = await createSharedGroup({
      name: name.trim(), startDate: start || null, endDate: end || null,
      splitMode: mode, categoryId: cat.ok ? cat.id : null,
    })
    setSaving(false)
    if (!res.ok) { setError(res.error); return }
    router.push(`/compartidos?g=${res.id}`)
    router.refresh()
    onClose()
  }

  return (
    <SheetShell title="Nuevo viaje" subtitle="Empieza con lo que sepas. Fechas y personas se agregan después." label="Nuevo viaje" onClose={onClose}>
      <InputRow icon={<Plane className="w-4 h-4" />} invalid={!!error && !name.trim()}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre — Ej: Vacaciones Chiloé"
          className={inputClass} maxLength={60} autoFocus />
      </InputRow>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Salida (opcional)</FieldLabel>
          <InputRow>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} className={inputClass} />
          </InputRow>
        </div>
        <div>
          <FieldLabel>Vuelta (opcional)</FieldLabel>
          <InputRow>
            <input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)} className={inputClass} />
          </InputRow>
        </div>
      </div>

      <div>
        <FieldLabel hint={MODES.find(m => m.key === mode)!.hint}>Cómo se reparte</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {MODES.map(m => (
            <Chip key={m.key} active={mode === m.key} onClick={() => setMode(m.key)}>{m.title}</Chip>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        Puedes registrar gastos desde ya, aunque estés solo. Cuando invites a alguien, los gastos se recalculan.
      </p>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <PrimaryButton onClick={submit} disabled={saving}>
        {saving ? 'Creando…' : <><Check className="w-4 h-4" /> Crear viaje</>}
      </PrimaryButton>
    </SheetShell>
  )
}
