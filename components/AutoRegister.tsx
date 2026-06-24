'use client'

import { useEffect, useState } from 'react'
import { runAutoRegister } from '@/app/actions/auto-register'
import { RefreshCw, X } from 'lucide-react'

export default function AutoRegister() {
  const [toast, setToast] = useState<string[] | null>(null)

  useEffect(() => {
    runAutoRegister().then(({ registered }) => {
      if (registered.length > 0) {
        setToast(registered)
      }
    })
  }, [])

  if (!toast) return null

  return (
    <div
      className="fixed bottom-24 lg:bottom-6 right-4 lg:right-6 z-[200] max-w-xs w-full animate-in slide-in-from-bottom-4 fade-in duration-300"
      role="alert"
    >
      <div className="card p-4 flex items-start gap-3 border-brand-200 shadow-lg">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: '#EEF4FF' }}
        >
          <RefreshCw className="w-4 h-4" style={{ color: '#1B6DD4' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-800 mb-0.5">Gastos registrados automáticamente</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            {toast.length === 1
              ? toast[0]
              : toast.slice(0, 3).join(', ') + (toast.length > 3 ? ` y ${toast.length - 3} más` : '')}
          </p>
        </div>
        <button
          onClick={() => setToast(null)}
          className="text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0 -mt-0.5"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
