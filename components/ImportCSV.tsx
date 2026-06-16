'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle, AlertCircle, X, FileText } from 'lucide-react'

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

  function reset() {
    setState('idle'); setResult(null); setErrMsg(''); setFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f); setState('idle'); setResult(null); setErrMsg('')
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
        onClick={() => { setOpen(true); reset() }}
        className="flex items-center justify-between w-full px-4 py-3.5 hover:bg-brand-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
            <Upload className="w-4 h-4 text-brand-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900">Importar desde CSV</p>
            <p className="text-xs text-gray-400">Carga tus gastos desde Excel u otra app</p>
          </div>
        </div>
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Bottom sheet / Desktop modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/50"
          onClick={() => { setOpen(false); reset() }}
        >
          {/* Sheet */}
          <div
            className="relative w-full lg:max-w-md bg-white rounded-t-3xl lg:rounded-3xl px-5 pt-5 pb-10 lg:pb-6"
            style={{ boxShadow: '0 -8px 40px rgba(0,0,0,.15)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle (mobile only) */}
            <div className="w-8 h-1 bg-gray-200 rounded-full mx-auto mb-5 lg:hidden" />
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-extrabold text-brand-900">Importar gastos</h2>
              <button
                onClick={() => { setOpen(false); reset() }}
                className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-brand-600" />
              </button>
            </div>

            {/* Formato esperado */}
            <div className="bg-brand-50 border border-brand-100 rounded-2xl p-3.5 mb-5">
              <p className="text-xs font-bold text-brand-700 mb-2">Tu CSV debe tener estas columnas:</p>
              <div className="flex flex-wrap gap-1.5">
                {['Fecha', 'Monto', 'Descripción ✓opcional', 'Categoría ✓opcional', 'Método de pago ✓opcional'].map(c => (
                  <span
                    key={c}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg"
                    style={{
                      background: c.includes('✓') ? '#EEF4FF' : '#1B6DD4',
                      color:      c.includes('✓') ? '#155BB0' : '#fff',
                    }}
                  >
                    {c.replace(' ✓opcional', '')}
                    {c.includes('✓') && <span style={{ opacity:.6 }}> (opcional)</span>}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-brand-400 mt-2 font-medium">
                Fechas: DD/MM/YYYY o YYYY-MM-DD · Montos: 8900 o 8.900
              </p>
            </div>

            {/* Estado: idle / cargado / loading / success / error */}
            {state === 'idle' && !file && (
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full border-2 border-dashed border-brand-200 rounded-2xl py-8 flex flex-col items-center gap-2 hover:border-brand-400 hover:bg-brand-50 transition-colors"
              >
                <FileText className="w-8 h-8 text-brand-300" />
                <p className="text-sm font-bold text-brand-600">Selecciona tu archivo .csv</p>
                <p className="text-xs text-brand-300">o arrástralo aquí</p>
              </button>
            )}

            {file && state === 'idle' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 bg-brand-50 rounded-2xl px-4 py-3 border border-brand-100">
                  <FileText className="w-5 h-5 text-brand-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-brand-900 truncate">{file.name}</p>
                    <p className="text-xs text-brand-400">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button onClick={reset} className="text-brand-300 hover:text-brand-600 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={handleImport}
                  className="w-full py-3.5 rounded-2xl text-white font-extrabold text-sm"
                  style={{ background: '#1B6DD4', boxShadow: '0 4px 16px rgba(27,109,212,.35)' }}
                >
                  Importar gastos →
                </button>
              </div>
            )}

            {state === 'loading' && (
              <div className="flex flex-col items-center gap-3 py-8">
                <div
                  className="w-10 h-10 rounded-full border-4 border-brand-100"
                  style={{ borderTopColor: '#1B6DD4', animation: 'spin 1s linear infinite' }}
                />
                <p className="text-sm font-bold text-brand-600">Importando...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              </div>
            )}

            {state === 'success' && result && (
              <div className="flex flex-col gap-4">
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-extrabold text-emerald-800">
                      {result.imported} gastos importados
                    </p>
                    {result.newCategories > 0 && (
                      <p className="text-xs text-emerald-600 mt-0.5">{result.newCategories} categoría{result.newCategories > 1 ? 's' : ''} nueva{result.newCategories > 1 ? 's' : ''} creada{result.newCategories > 1 ? 's' : ''}</p>
                    )}
                    {result.skipped > 0 && (
                      <p className="text-xs text-emerald-600 mt-0.5">{result.skipped} filas omitidas (fecha o monto inválido)</p>
                    )}
                    <p className="text-xs text-emerald-500 mt-1.5">
                      Columnas detectadas: {[result.columns.date, result.columns.amount, result.columns.desc, result.columns.cat].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setOpen(false); reset() }}
                  className="w-full py-3.5 rounded-2xl text-white font-extrabold text-sm"
                  style={{ background: '#1B6DD4', boxShadow: '0 4px 16px rgba(27,109,212,.35)' }}
                >
                  Listo ✓
                </button>
              </div>
            )}

            {state === 'error' && (
              <div className="flex flex-col gap-4">
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-extrabold text-red-700">No se pudo importar</p>
                    <p className="text-xs text-red-500 mt-0.5">{errMsg}</p>
                  </div>
                </div>
                <button
                  onClick={reset}
                  className="w-full py-3.5 rounded-2xl font-extrabold text-sm text-brand-600"
                  style={{ background: '#EEF4FF', border: '1.5px solid #D5E6FF' }}
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
      )}
    </>
  )
}

