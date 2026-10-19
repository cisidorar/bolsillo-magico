'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Minus, Plus } from 'lucide-react'
import { useToast } from '@/components/ToastProvider'
import { formatCLP } from '@/lib/utils'
import { setTripPlan } from '@/app/actions/shared'
import { TRIP_CATEGORIES, type TripCategory } from '@/lib/shared-split'
import { budgetTotal, type TripBudget } from '@/lib/trip-plan'
import { SheetShell, FieldLabel, InputRow, inputClass, PrimaryButton } from './SheetParts'

const HINTS: Record<TripCategory, string> = {
  alojamiento: 'Hotel, cabaña, Airbnb',
  transporte:  'Pasajes, bencina, peajes, arriendo de auto',
  comida:      'Restoranes y supermercado',
  actividades: 'Tours, entradas, excursiones',
  compras:     'Recuerdos, ropa',
  otros:       'Seguro de viaje, imprevistos',
}

function fmtNum(raw: string): string {
  return raw.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export default function TripBudgetSheet({
  groupId, budget, people: p0, minPeople, onClose,
}: {
  groupId:   string
  budget:    TripBudget
  people:    number
  /** Los que ya aceptaron: no se puede planificar con menos */
  minPeople: number
  onClose:   () => void
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [people, setPeople] = useState(Math.max(p0, minPeople, 1))
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(TRIP_CATEGORIES.map(c => [c.key, budget[c.key] ? fmtNum(String(budget[c.key])) : ''])),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const parsed: TripBudget = {}
  for (const c of TRIP_CATEGORIES) {
    const n = parseInt((vals[c.key] ?? '').replace(/\D/g, ''), 10)
    if (n > 0) parsed[c.key] = n
  }
  const total = budgetTotal(parsed)

  async function save() {
    setSaving(true); setError('')
    const res = await setTripPlan(groupId, parsed, people)
    setSaving(false)
    if (!res.ok) { setError(res.error); return }
    showToast('Presupuesto guardado')
    router.refresh()
    onClose()
  }

  return (
    <SheetShell title="¿Cuánto costaría?" subtitle="Un estimado alcanza. Lo ajustas cuando sepas más." label="Presupuesto del viaje" onClose={onClose}>
      <div>
        <FieldLabel hint={minPeople > 1 ? `Ya hay ${minPeople} en el viaje.` : 'Aunque todavía no invites a nadie.'}>¿Cuántos van?</FieldLabel>
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Menos" disabled={people <= Math.max(1, minPeople)} onClick={() => setPeople(p => p - 1)}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 text-gray-600 disabled:opacity-40">
            <Minus className="w-4 h-4" />
          </button>
          <span className="text-2xl font-bold text-gray-900 tabular-nums w-10 text-center">{people}</span>
          <button type="button" aria-label="Más" disabled={people >= 50} onClick={() => setPeople(p => p + 1)}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 text-gray-600 disabled:opacity-40">
            <Plus className="w-4 h-4" />
          </button>
          <span className="text-xs text-gray-400">{people === 1 ? 'persona' : 'personas'}</span>
        </div>
      </div>

      <div className="space-y-2.5">
        <FieldLabel hint="Montos totales del grupo, no por persona.">Costos estimados</FieldLabel>
        {TRIP_CATEGORIES.map(c => (
          <div key={c.key} className="flex items-center gap-3">
            <div className="w-32 flex-shrink-0">
              <p className="text-sm font-semibold text-gray-700">{c.label}</p>
              <p className="text-[10px] text-gray-400 leading-tight">{HINTS[c.key]}</p>
            </div>
            <div className="flex-1">
              <InputRow icon={<span className="text-sm font-bold">$</span>}>
                <input inputMode="numeric" value={vals[c.key]} placeholder="0"
                  onChange={e => setVals(v => ({ ...v, [c.key]: fmtNum(e.target.value).slice(0, 13) }))}
                  className={inputClass + ' tabular-nums'} />
              </InputRow>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Total del viaje</span>
          <span className="font-bold text-gray-900 tabular-nums">{formatCLP(total)}</span>
        </div>
        {people > 1 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Por persona (parejo)</span>
            <span className="font-bold text-gray-900 tabular-nums">{formatCLP(Math.ceil(total / people))}</span>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      <PrimaryButton onClick={save} disabled={saving}>
        {saving ? 'Guardando…' : <><Check className="w-4 h-4" /> Guardar presupuesto</>}
      </PrimaryButton>
    </SheetShell>
  )
}
