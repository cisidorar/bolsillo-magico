'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { runAutoRegister } from '@/app/actions/auto-register'
import { RefreshCw, X } from 'lucide-react'

export default function AutoRegister() {
  const router = useRouter()
  const [toast, setToast] = useState<string[] | null>(null)

  useEffect(() => {
    // sep 2026 (Cas: "no se cobró automáticamente" — Apple, billing_day 8,
    // reportado el 12, con la app usada a diario en el medio): este
    // componente vive en el layout del dashboard, que en Next.js NO se
    // remonta al navegar entre páginas del mismo grupo — solo se monta una
    // vez por carga real de la app. En una PWA instalada, "abrir la app"
    // casi nunca es una carga real: el sistema operativo la retoma desde
    // background (mismo proceso, mismo montaje de React, useEffect([]) que
    // ya se disparó hace días) — así que el catch-up de runAutoRegister()
    // (agregado en la corrección del bug de Spotify, ago 2026) nunca llega a
    // ejecutarse de nuevo mientras la pestaña/app no se cierra de verdad. El
    // cobro queda pendiente indefinidamente aunque la ventana de catch-up lo
    // cubra de sobra.
    //
    // Fix: además del mount inicial, reintentar cuando la pestaña/PWA vuelve
    // a primer plano (visibilitychange/focus) — que es la señal real de
    // "la persona está usando la app ahora", no solo el montaje de React.
    // runAutoRegister() ya es idempotente por día (cookie server-side), así
    // que llamarlo de más no duplica nada ni genera trabajo extra.
    function check() {
      runAutoRegister().then(({ registered }) => {
        if (registered.length > 0) {
          setToast(registered)
          // Re-renderiza los Server Components para que la página refleje los
          // gastos recién creados (paidThisMonthSet, flujo de caja, etc.) sin
          // forzar una recarga completa — importante para /recurrentes, que
          // calcula overdueItems server-side con los datos del momento del render.
          router.refresh()
        }
      })
    }

    check()

    function onVisible() {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
    }
  }, [])

  // Auto-dismiss después de 6s
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

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
          <RefreshCw className="w-4 h-4" style={{ color: 'var(--primary)' }} />
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
