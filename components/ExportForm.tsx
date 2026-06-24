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

  const selectClass = "sheet-input flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-400 transition-colors"

  return (
    <div className="px-4 py-4 space-y-3">
      {/* Toggle: todo vs rango */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFull(false)}
          className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-all ${!full ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'}`}
        >
          Por rango
        </button>
        <button
          onClick={() => setFull(true)}
          className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-all ${full ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'}`}
        >
          Todo el historial
        </button>
      </div>

      {/* Selectores de rango */}
      {!full && (
        <div className="flex items-center gap-2">
          <select value={from} onChange={e => setFrom(e.target.value)} className={selectClass}>
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="text-xs text-gray-400 flex-shrink-0">→</span>
          <select value={to} onChange={e => setTo(e.target.value)} className={selectClass}>
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}

      {/* Botón de descarga */}
      <a
        href={href}
        download
        className="flex items-center justify-center gap-2 w-full py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors"
      >
        <Download className="w-4 h-4" />
        Descargar CSV
      </a>
    </div>
  )
}
