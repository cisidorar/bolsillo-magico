'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { Check } from 'lucide-react'

interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastItem {
  id: number
  message: string
  action?: ToastAction
}

interface ToastContextValue {
  showToast: (message: string, opts?: { action?: ToastAction; duration?: number }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const showToast = useCallback((message: string, opts?: { action?: ToastAction; duration?: number }) => {
    const id = ++idRef.current
    setToasts(t => [...t, { id, message, action: opts?.action }])
    const duration = opts?.duration ?? (opts?.action ? 5000 : 3000)
    setTimeout(() => dismiss(id), duration)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed z-[200] left-0 right-0 bottom-20 lg:bottom-6 flex flex-col items-center lg:items-end gap-2 px-4 lg:pr-8 pointer-events-none"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map(t => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-3 pl-3.5 pr-2 py-2.5 rounded-2xl shadow-lg text-sm font-semibold max-w-sm w-full lg:w-auto animate-toast-in"
            style={{ background: '#0E2A52', color: '#FFFFFF' }}
          >
            <Check className="w-4 h-4 flex-shrink-0" style={{ color: '#1FBE8D' }} />
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                onClick={() => { t.action!.onClick(); dismiss(t.id) }}
                className="flex-shrink-0 font-bold px-2.5 py-1.5 rounded-lg transition-colors hover:bg-white/10"
                style={{ color: '#4D93FF', minHeight: 36 }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
