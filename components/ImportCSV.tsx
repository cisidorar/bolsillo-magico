'use client'

import React, { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Upload, CheckCircle, AlertCircle, AlertTriangle, X, FileText } from 'lucide-react'
import { useBackdropClose } from '@/components/useBackdropClose'

type State = 'idle' | 'loading' | 'success' | 'error'

interface Result {
  imported:      number
  skipped:       number
  newCategories: number
  columns:       { date: string; amount: string; desc: string | null; cat: string | null }
}

export default function ImportCSV() {
  const router    = useRouter()
  const inputRef  = useRef<HTMLInputElement>(null)
  const [state,   setState]   = useState<State>('idle')
  const [result,  setResult]  = useState<Result | null>(null)
  const [errMsg,  setErrMsg]  = useState('')
  const [file,    setFile]    = useState<File | null>(null)
  const [open,    setOpen]    = useState(false)
  const [dragging, setDragging] = useState(false)

  function reset() {
    setState('idle'); setResult(null); setErrMsg(''); setFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }
  // Hook llamado siempre (aunque el sheet esté cerrado) — el backdrop es
  // condicional (`{open && ...}`) más abajo, pero el hook no puede serlo.
  const backdropClose = useBackdropClose(() => { setOpen(false); reset() })

  function pickFile(f: File | undefined) {
    if (!f) return
    setFile(f); setState('idle'); setResult(null); setErrMsg('')
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    pickFile(e.target.files?.[0])
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    pickFile(e.dataTransfer.files?.[0])
  }

  async function handleImport() {
    if (!file) return
    setState('loading')
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res  = await fetch('/api/import', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setErrMsg(json.error ?? 'Error desconocido'); setState('error'); return }
      setResult(json)
      setState('success')
      router.refresh()
    } catch {
      setErrMsg('No se pudo conectar con el servidor'); setState('error')
    }
  }

  return (
    <>
      {/* Botón disparador */}
      <button
        type="button"
        onClick={() => { setOpen(true); reset() }}
        className="flex items-center gap-4 w-full px-4 py-4 hover:bg-[var(--surface-2)] transition-colors group text-left"
      >
        <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ '--cat-bg': 'var(--primary-soft)', '--cat-color': 'var(--primary)' } as React.CSSProperties}>
          <Upload className="w-5 h-5" style={{ color: 'var(--primary)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Importar desde CSV</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Carga tus gastos desde Excel u otra app</p>
        </div>
        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
      </button>

      {/* Bottom sheet / Desktop modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/50"
          {...backdropClose}
        >
          {/* Sheet */}
          <div
            role="dialog" aria-modal="true" aria-labelledby="import-title"
            className="w-full lg:max-w-lg rounded-t-3xl lg:rounded-3xl max-h-[92vh] overflow-y-auto"
            style={{ background: 'var(--surface)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle (mobile only) */}
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />
            <div className="flex items-center justify-between px-5 pt-3 pb-3 lg:px-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 id="import-title" className="text-base font-bold" style={{ color: 'var(--ink)' }}>Importar gastos</h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => { setOpen(false); reset() }}
                className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center transition-colors"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 pt-4 pb-5 lg:px-6">

            {/* Formato esperado */}
            <div className="rounded-2xl p-3.5 mb-5" style={{ background: 'var(--primary-soft)' }}>
              <p className="text-xs font-bold mb-2" style={{ color: 'var(--ink)' }}>Tu CSV debe tener estas columnas:</p>
              <div className="flex flex-wrap gap-1.5">
                {['Fecha', 'Monto', 'Descripción ✓opcional', 'Categoría ✓opcional', 'Método de pago ✓opcional'].map(c => (
                  <span
                    key={c}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg"
                    style={{
                      background: c.includes('✓') ? 'var(--surface)' : 'var(--primary)',
                      color:      c.includes('✓') ? 'var(--ink-2)' : 'var(--primary-ink)',
                    }}
                  >
                    {c.replace(' ✓opcional', '')}
                    {c.includes('✓') && <span style={{ opacity:.6 }}> (opcional)</span>}
                  </span>
                ))}
              </div>
              <p className="text-[11px] mt-2 font-medium" style={{ color: 'var(--ink-3)' }}>
                Fechas: DD/MM/YYYY o YYYY-MM-DD · Montos: 8900 o 8.900
              </p>
            </div>

            {/* Estado: idle / cargado / loading / success / error */}
            {state === 'idle' && !file && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className="w-full border-2 border-dashed rounded-2xl py-8 flex flex-col items-center gap-2 transition-colors"
                style={{ borderColor: dragging ? 'var(--primary)' : 'var(--border)', background: dragging ? 'var(--primary-soft)' : 'transparent' }}
              >
                <FileText className="w-8 h-8" style={{ color: 'var(--primary)' }} />
                <p className="text-sm font-bold" style={{ color: 'var(--primary)' }}>Selecciona tu archivo .csv</p>
                <p className="text-xs" style={{ color: 'var(--ink-3)' }}>o arrástralo aquí</p>
              </button>
            )}

            {file && state === 'idle' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: 'var(--primary-soft)' }}>
                  <FileText className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--primary)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{file.name}</p>
                    <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button type="button" onClick={reset} aria-label="Quitar archivo"
                    className="w-11 h-11 -mr-2 flex items-center justify-center hover:opacity-70 transition-opacity" style={{ color: 'var(--ink-3)' }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleImport}
                  className="w-full min-h-[44px] py-3.5 rounded-2xl font-extrabold text-sm"
                  style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
                >
                  Importar gastos →
                </button>
              </div>
            )}

            {state === 'loading' && (
              <div role="status" className="flex flex-col items-center gap-3 py-8">
                <div
                  className="w-10 h-10 rounded-full border-4"
                  style={{ borderColor: 'var(--primary-soft)', borderTopColor: 'var(--primary)', animation: 'spin 1s linear infinite' }}
                />
                <p className="text-sm font-bold" style={{ color: 'var(--primary)' }}>Importando...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              </div>
            )}

            {state === 'success' && result && (
              <div className="flex flex-col gap-4">
                <div role="status" className="rounded-2xl p-4 flex items-start gap-3"
                  style={{ background: 'color-mix(in srgb, var(--mint) 14%, var(--surface))' }}>
                  <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--mint-ink)' }} />
                  <div>
                    <p className="text-sm font-extrabold" style={{ color: 'var(--mint-ink)' }}>
                      {result.imported} {result.imported === 1 ? 'gasto importado' : 'gastos importados'}
                    </p>
                    {result.newCategories > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>{result.newCategories} categoría{result.newCategories > 1 ? 's' : ''} nueva{result.newCategories > 1 ? 's' : ''} creada{result.newCategories > 1 ? 's' : ''}</p>
                    )}
                    <p className="text-xs mt-1.5" style={{ color: 'var(--ink-3)' }}>
                      Columnas detectadas: {[result.columns.date, result.columns.amount, result.columns.desc, result.columns.cat].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                {result.skipped > 0 && (
                  <p className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full text-[11px] font-bold"
                    style={{ background: 'color-mix(in srgb, var(--gold) 18%, var(--surface))', color: 'var(--gold-ink)' }}>
                    <AlertTriangle className="w-3 h-3" />
                    {result.skipped} {result.skipped === 1 ? 'fila omitida' : 'filas omitidas'} (fecha o monto inválido)
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => { setOpen(false); reset() }}
                  className="w-full min-h-[44px] py-3.5 rounded-2xl font-extrabold text-sm"
                  style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
                >
                  Listo
                </button>
              </div>
            )}

            {state === 'error' && (
              <div className="flex flex-col gap-4">
                <div role="alert" className="rounded-2xl p-4 flex items-start gap-3"
                  style={{ background: 'color-mix(in srgb, var(--coral) 12%, var(--surface))' }}>
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--coral-ink)' }} />
                  <div>
                    <p className="text-sm font-extrabold" style={{ color: 'var(--coral-ink)' }}>No se pudo importar</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>{errMsg}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="w-full min-h-[44px] py-3.5 rounded-2xl font-extrabold text-sm border"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--primary)' }}
                >
                  Intentar de nuevo
                </button>
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              accept=".csv,.tsv,text/csv,text/plain"
              className="hidden"
              onChange={onFile}
            />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

