'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plane, Mail, Check } from 'lucide-react'
import { createSharedGroup, ensureTripCategory } from '@/app/actions/shared'
import type { SplitMode } from '@/lib/shared-split'
import { SheetShell, FieldLabel, InputRow, inputClass, Chip, PrimaryButton } from './SheetParts'

const MODES: { key: SplitMode; title: string; hint: string }[] = [
  { key: 'income', title: 'Según sueldo', hint: 'Cada uno paga en proporción a lo que gana. Nadie ve el sueldo del otro, solo el porcentaje.' },
  { key: 'equal',  title: '50 / 50',      hint: 'Mitad y mitad, sin mirar ingresos.' },
  { key: 'fixed',  title: '% fijo',       hint: 'Un porcentaje que acuerdan a mano.' },
]

export default function NewTripSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter()

  const [name,  setName]  = useState('')
  const [start, setStart] = useState('')
  const [end,   setEnd]   = useState('')
  const [email, setEmail] = useState('')
  const [mode,  setMode]  = useState<SplitMode>('income')
  const [myPct, setMyPct] = useState('50')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const pct = parseFloat(myPct.replace(',', '.'))
  const pctOk = Number.isFinite(pct) && pct >= 0 && pct <= 100

  async function submit() {
    if (!name.trim())  { setError('Ponle un nombre al viaje.'); return }
    if (!email.trim()) { setError('Escribe el correo de la otra persona.'); return }
    if (mode === 'fixed' && !pctOk) { setError('El porcentaje tiene que estar entre 0 y 100.'); return }
    setSaving(true); setError('')

    // Tu parte cae en una categoría propia: "Vacaciones" se crea si no existe.
    const cat = await ensureTripCategory()
    const res = await createSharedGroup({
      name: name.trim(), startDate: start || null, endDate: end || null,
      splitMode: mode, fixedRatio: mode === 'fixed' ? pct / 100 : null,
      email: email.trim(), categoryId: cat.ok ? cat.id : null,
    })
    setSaving(false)
    if (!res.ok) { setError(res.error); return }
    router.push(`/compartidos?g=${res.id}`)
    router.refresh()
    onClose()
  }

  return (
    <SheetShell title="Nuevo viaje" subtitle="Lo comparten dos personas que usan la app." label="Nuevo viaje" onClose={onClose}>
      <InputRow icon={<Plane className="w-4 h-4" />} invalid={!!error && !name.trim()}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre — Ej: Vacaciones Chiloé"
          className={inputClass} maxLength={60} autoFocus />
      </InputRow>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Salida</FieldLabel>
          <InputRow>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} className={inputClass} />
          </InputRow>
        </div>
        <div>
          <FieldLabel>Vuelta</FieldLabel>
          <InputRow>
            <input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)} className={inputClass} />
          </InputRow>
        </div>
      </div>

      <div>
        <FieldLabel hint="Tiene que tener cuenta en la app con ese mismo correo. Verá la invitación al entrar.">
          Con quién
        </FieldLabel>
        <InputRow icon={<Mail className="w-4 h-4" />} invalid={!!error && !email.trim()}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com"
            className={inputClass} autoCapitalize="none" />
        </InputRow>
      </div>

      <div>
        <FieldLabel hint={MODES.find(m => m.key === mode)!.hint}>Cómo se reparte</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {MODES.map(m => (
            <Chip key={m.key} active={mode === m.key} onClick={() => setMode(m.key)}>{m.title}</Chip>
          ))}
        </div>
        {mode === 'fixed' && (
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-gray-500">Tu parte</span>
            <div className="w-24">
              <InputRow>
                <input type="number" inputMode="decimal" min={0} max={100} value={myPct}
                  onChange={e => setMyPct(e.target.value)} className={inputClass + ' text-right tabular-nums'} />
              </InputRow>
            </div>
            <span className="text-xs text-gray-500">%</span>
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-2">
          El reparto queda acordado cuando la otra persona acepta la invitación.
        </p>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <PrimaryButton onClick={submit} disabled={saving}>
        {saving ? 'Creando…' : <><Check className="w-4 h-4" /> Crear e invitar</>}
      </PrimaryButton>
    </SheetShell>
  )
}
