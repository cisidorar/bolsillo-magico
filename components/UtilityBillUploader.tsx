'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Zap, Droplet, X, FileText } from 'lucide-react'
import { useBackdropClose } from '@/components/useBackdropClose'
import { extractUtilityBillDraft, saveUtilityBill } from '@/app/actions/property'
import type { ParsedUtilityBill } from '@/lib/utility-bill-parser'
import { detectConsumptionSpike } from '@/lib/utility-bill-parser'

const inputCls = 'w-full px-3 py-2.5 rounded-xl text-sm outline-none'
const inputStyle: React.CSSProperties = {
  background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--border)',
}

interface Props {
  propertyId: string
  /** Consumos anteriores por tipo, para detectar saltos. */
  priorConsumption: { electricity: number[]; water: number[] }
  onClose: () => void
}

/**
 * Subir boleta → parsear → REVISAR → confirmar.
 *
 * El paso de revisión no es opcional: el parser puede fallar con un formato
 * nuevo, y un monto mal leído que entra directo a la base es peor que pedir
 * dos clics más. Todos los campos quedan editables aunque el parser acierte.
 */
export default function UtilityBillUploader({ propertyId, priorConsumption, onClose }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile]     = useState<File | null>(null)
  const [draft, setDraft]   = useState<ParsedUtilityBill | null>(null)
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState<string | null>(null)

  // Campos editables del borrador
  const [kind, setKind]     = useState<'electricity' | 'water'>('electricity')
  const [amount, setAmount] = useState('')
  const [due, setDue]       = useState('')
  const [cons, setCons]     = useState('')
  const [ref, setRef]       = useState('')

  const backdrop = useBackdropClose(onClose)

  async function handleFile(f: File) {
    setFile(f); setBusy(true); setError(null)
    const fd = new FormData()
    fd.append('file', f)
    const res = await extractUtilityBillDraft(fd)
    setBusy(false)

    if (!res.ok) { setError(res.error); return }
    const d = res.draft
    setDraft(d)
    if (d.kind) setKind(d.kind)
    if (d.total)       setAmount(String(d.total))
    if (d.dueDate)     setDue(d.dueDate)
    if (d.consumption) setCons(String(d.consumption))
    if (d.clientNumber) setRef(d.clientNumber)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const fd = new FormData()
    if (file) fd.append('file', file)
    const res = await saveUtilityBill({
      propertyId, kind,
      amount: Number(amount.replace(/\D/g, '') || 0),
      dueDate: due,
      consumption: cons ? Number(cons) : null,
      externalRef: ref || null,
      notes: null,
    }, fd)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    router.refresh(); onClose()
  }

  const spike = cons
    ? detectConsumptionSpike(Number(cons), priorConsumption[kind])
    : null

  return (
    <div className="fixed inset-0 z-[110] flex items-end lg:items-center justify-center bg-black/50 p-0 lg:p-4"
         {...backdrop} role="dialog" aria-modal="true">
      <div className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-y-auto"
           style={{ maxHeight: '90dvh', background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0"
             style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Subir boleta</h2>
          <button onClick={onClose} aria-label="Cerrar"
                  className="w-9 h-9 flex items-center justify-center rounded-full"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {!draft ? (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="w-full py-10 rounded-2xl border-2 border-dashed flex flex-col items-center gap-2 disabled:opacity-50"
                style={{ borderColor: 'var(--border)', color: 'var(--ink-3)' }}
              >
                <Upload className="w-7 h-7" />
                <span className="text-sm font-semibold">
                  {busy ? 'Leyendo el PDF…' : 'Elegir la boleta en PDF'}
                </span>
                <span className="text-xs">Enel o Aguas Andinas</span>
              </button>
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
                     onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              {error && <p className="text-sm mt-3" style={{ color: 'var(--coral)' }}>{error}</p>}
            </>
          ) : (
            <form onSubmit={handleSave}>
              {/* Qué reconoció el parser — honesto sobre lo que no pudo leer */}
              <div className="flex items-center gap-2 p-3 rounded-xl mb-4"
                   style={{ background: 'var(--surface-2)' }}>
                <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
                <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
                  {draft.provider === 'unknown'
                    ? 'No reconocí el emisor — completa los datos a mano.'
                    : `Boleta de ${draft.provider === 'enel' ? 'Enel' : 'Aguas Andinas'}. Revisa antes de guardar.`}
                </p>
              </div>

              <div className="mb-3">
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--ink-2)' }}>Servicio</label>
                <div className="flex gap-2">
                  {([['electricity', 'Luz', Zap], ['water', 'Agua', Droplet]] as const).map(([k, label, Icon]) => (
                    <button key={k} type="button" onClick={() => setKind(k)}
                      className="flex-1 py-2 rounded-xl text-sm font-semibold border flex items-center justify-center gap-1.5"
                      style={kind === k ? {
                        background: 'var(--primary-soft)', color: 'var(--primary)', borderColor: 'var(--primary)',
                      } : { background: 'var(--surface)', color: 'var(--ink-2)', borderColor: 'var(--border)' }}>
                      <Icon className="w-4 h-4" /> {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--ink-2)' }}>Total</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none"
                          style={{ color: 'var(--ink-3)' }}>$</span>
                    <input className={inputCls} style={{ ...inputStyle, paddingLeft: '1.5rem' }}
                           value={amount ? Number(amount).toLocaleString('es-CL') : ''} inputMode="numeric" required
                           onChange={e => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="34.560" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--ink-2)' }}>Vence</label>
                  <input className={inputCls} style={inputStyle} type="date" value={due} required
                         onChange={e => setDue(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--ink-2)' }}>
                    Consumo ({kind === 'electricity' ? 'kWh' : 'm³'})
                  </label>
                  <input className={inputCls} style={inputStyle} value={cons} inputMode="numeric"
                         onChange={e => setCons(e.target.value.replace(/\D/g, ''))} placeholder="187" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--ink-2)' }}>N° boleta</label>
                  <input className={inputCls} style={inputStyle} value={ref}
                         onChange={e => setRef(e.target.value)} placeholder="opcional" />
                </div>
              </div>

              {/* Salto de consumo — gold: hay que mirarlo, no es una emergencia */}
              {spike?.isSpike && (
                <div className="p-3 rounded-xl mb-3"
                     style={{ background: 'color-mix(in srgb, var(--gold) 12%, var(--surface))' }}>
                  <p className="text-xs font-bold mb-0.5" style={{ color: 'var(--ink)' }}>
                    Consumo {Math.round(spike.pctAbove * 100)}% sobre el promedio
                  </p>
                  <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
                    Los períodos anteriores promediaban {spike.avg} {kind === 'electricity' ? 'kWh' : 'm³'}.
                    {kind === 'water' && ' En un depto donde no vives, un salto así suele ser una filtración.'}
                  </p>
                </div>
              )}

              <p className="text-xs mb-4" style={{ color: 'var(--ink-3)' }}>
                Se registra a nombre del arrendatario — no suma a tu deuda.
              </p>

              {error && <p className="text-sm mb-2" style={{ color: 'var(--coral)' }}>{error}</p>}

              <div className="flex gap-2">
                <button type="button" onClick={onClose}
                        className="flex-1 py-3 rounded-xl text-sm font-bold"
                        style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={busy}
                        className="flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-50"
                        style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
                  {busy ? 'Guardando…' : 'Guardar boleta'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
