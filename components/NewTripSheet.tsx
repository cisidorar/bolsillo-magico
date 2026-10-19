'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Check } from 'lucide-react'
import { useBackdropClose } from '@/components/useBackdropClose'
import { createSharedGroup, ensureTripCategory } from '@/app/actions/shared'
import type { SplitMode } from '@/lib/shared-split'

const label = 'text-[10px] font-bold uppercase tracking-widest block mb-1.5'
const input = 'w-full text-sm border px-3 py-2.5 rounded-xl outline-none'
const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)' }

const MODES: { key: SplitMode; title: string; hint: string }[] = [
  { key: 'income', title: 'Según sueldo',  hint: 'Cada uno paga en proporción a lo que gana. Nadie ve el sueldo del otro, solo el porcentaje.' },
  { key: 'equal',  title: '50 / 50',       hint: 'Mitad y mitad, sin mirar ingresos.' },
  { key: 'fixed',  title: '% fijo',        hint: 'Un porcentaje que acuerdan a mano.' },
]

export default function NewTripSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const backdropClose = useBackdropClose(onClose)

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
    if (!name.trim()) { setError('Ponle un nombre al viaje.'); return }
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
    <div className="fixed inset-0 z-[120] flex items-end lg:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }} {...backdropClose}>
      <div className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-y-auto overscroll-contain"
        style={{ background: 'var(--surface)', maxHeight: '92dvh' }}>
        <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />
        <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Nuevo viaje</h2>
            <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Lo comparten dos personas que usan la app.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <label className={label} style={{ color: 'var(--ink-3)' }}>Nombre</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Vacaciones Chiloé"
              className={input} style={inputStyle} maxLength={60} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} style={{ color: 'var(--ink-3)' }}>Salida</label>
              <input type="date" value={start} onChange={e => setStart(e.target.value)} className={input} style={inputStyle} />
            </div>
            <div>
              <label className={label} style={{ color: 'var(--ink-3)' }}>Vuelta</label>
              <input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)}
                className={input} style={inputStyle} />
            </div>
          </div>

          <div>
            <label className={label} style={{ color: 'var(--ink-3)' }}>Correo de la otra persona</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com"
              className={input} style={inputStyle} autoCapitalize="none" />
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-3)' }}>
              Tiene que tener cuenta en la app con ese mismo correo. Verá la invitación al entrar.
            </p>
          </div>

          <div>
            <label className={label} style={{ color: 'var(--ink-3)' }}>Cómo se reparte</label>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map(m => (
                <button key={m.key} type="button" onClick={() => setMode(m.key)}
                  className="py-2.5 rounded-xl text-xs font-semibold border transition-colors"
                  style={mode === m.key
                    ? { background: 'var(--primary-soft)', color: 'var(--primary)', borderColor: 'var(--primary)' }
                    : { background: 'var(--surface-2)', color: 'var(--ink-2)', borderColor: 'var(--border)' }}>
                  {m.title}
                </button>
              ))}
            </div>
            <p className="text-[11px] mt-2" style={{ color: 'var(--ink-3)' }}>{MODES.find(m => m.key === mode)!.hint}</p>
            {mode === 'fixed' && (
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs" style={{ color: 'var(--ink-2)' }}>Tu parte</span>
                <input type="number" inputMode="decimal" min={0} max={100} value={myPct}
                  onChange={e => setMyPct(e.target.value)} className={input + ' !w-24'} style={inputStyle} />
                <span className="text-xs" style={{ color: 'var(--ink-2)' }}>%</span>
              </div>
            )}
            <p className="text-[11px] mt-2" style={{ color: 'var(--ink-3)' }}>
              El reparto queda acordado cuando la otra persona acepta la invitación.
            </p>
          </div>

          {error && <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{error}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-3 text-sm font-semibold rounded-2xl border"
              style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
              Cancelar
            </button>
            <button onClick={submit} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-2xl disabled:opacity-50 active:scale-[.98]"
              style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}>
              <Check className="w-4 h-4" />
              {saving ? 'Creando…' : 'Crear e invitar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
