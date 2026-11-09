'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'

function monthOptions() {
  const now    = new Date()
  const opts: { label: string; value: string }[] = []
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const label = d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
    opts.push({ label: label.charAt(0).toUpperCase() + label.slice(1), value: `${y}-${m}` })
  }
  return opts
}

function monthStart(ym: string) { return `${ym}-01` }
function monthEnd(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${ym}-${String(last).padStart(2, '0')}`
}

export default function ExportForm() {
  const now    = new Date()
  const curYM  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const opts   = monthOptions()

  const [from, setFrom] = useState(opts[opts.length - 1]?.value ?? curYM)
  const [to,   setTo]   = useState(curYM)
  const [full, setFull] = useState(false)

  const href = full
    ? '/api/export'
    : `/api/export?from=${monthStart(from)}&to=${monthEnd(to)}`

  const rangeInvalid = !full && from > to
  const selectClass = "sheet-input flex-1 min-w-0 min-h-[44px] rounded-xl px-3 py-2 text-sm outline-none"

  return (
    <div className="px-4 py-4 space-y-3">
      {/* Toggle: todo vs rango */}
      <div className="flex items-center gap-2" role="group" aria-label="Qué exportar">
        {([['Por rango', false], ['Todo el historial', true]] as const).map(([label, isFull]) => (
          <button
            key={label}
            type="button"
            onClick={() => setFull(isFull)}
            aria-pressed={full === isFull}
            className="flex-1 min-h-[44px] rounded-xl text-xs font-semibold border transition-all"
            style={full === isFull
              ? { background: 'var(--primary-soft)', borderColor: 'var(--primary)', color: 'var(--primary)' }
              : { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink-2)' }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Selectores de rango */}
      {!full && (
        <div className="flex items-center gap-2">
          <select aria-label="Desde" value={from} onChange={e => setFrom(e.target.value)} className={selectClass}>
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden="true">→</span>
          <select aria-label="Hasta" value={to} onChange={e => setTo(e.target.value)} className={selectClass}>
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}
      {rangeInvalid && (
        <p role="alert" className="text-xs font-semibold" style={{ color: 'var(--coral-ink)' }}>
          &quot;Desde&quot; no puede ser posterior a &quot;Hasta&quot;.
        </p>
      )}

      {/* Botón de descarga */}
      <a
        href={rangeInvalid ? undefined : href}
        download
        aria-disabled={rangeInvalid}
        className="flex items-center justify-center gap-2 w-full min-h-[44px] py-2.5 text-sm font-semibold rounded-xl transition-colors"
        style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-ink)', opacity: rangeInvalid ? 0.5 : 1, pointerEvents: rangeInvalid ? 'none' : undefined }}
      >
        <Download className="w-4 h-4" />
        Descargar CSV
      </a>
    </div>
  )
}
