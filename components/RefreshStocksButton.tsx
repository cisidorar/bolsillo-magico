'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

/**
 * Botón de una sola línea para el aviso "tus acciones no están sumadas" en
 * PatrimonioCards (F4). Antes esto era solo un link a /inversiones — abrir esa
 * página, esperar a que cargue, y volver a Análisis para recién ver el total
 * actualizado. Acá se llama directo a /api/stock-price (la misma ruta que usa
 * Radar) para refrescar price_cache, y luego router.refresh() vuelve a pedir
 * los datos del Server Component sin salir de la página.
 */
export default function RefreshStocksButton({ tickers }: { tickers: string[] }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

  async function refresh() {
    if (tickers.length === 0 || state === 'loading') return
    setState('loading')
    try {
      const res = await fetch(`/api/stock-price?symbols=${encodeURIComponent(tickers.join(','))}`)
      if (!res.ok) throw new Error('fetch failed')
      router.refresh()
      setState('idle')
    } catch {
      setState('error')
    }
  }

  return (
    <button
      onClick={refresh}
      disabled={state === 'loading'}
      className="font-semibold underline hover:opacity-70 transition-opacity disabled:opacity-60 inline-flex items-center gap-1"
    >
      <RefreshCw className={`w-3 h-3 ${state === 'loading' ? 'animate-spin' : ''}`} />
      {state === 'loading' ? 'Actualizando…' : state === 'error' ? 'No se pudo, reintentar' : 'Actualizar precios ahora'}
    </button>
  )
}
