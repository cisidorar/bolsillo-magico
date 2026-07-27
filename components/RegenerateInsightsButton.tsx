'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Fuerza una nueva llamada a /api/analyze-month ignorando el cache por hash
 * (que solo regenera cuando cambian los datos del mes). Sin esto, un ajuste
 * al prompt/lógica del motor no se ve reflejado hasta que algo del mes
 * cambie o pasen 6h — el usuario queda mirando insights viejos sin saber
 * por qué. Respeta igual el cooldown de 10 min del lado del servidor.
 */
export default function RegenerateInsightsButton({ month, year }: { month: number; year: number }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')

  async function handleClick(e: React.MouseEvent) {
    // Vive dentro de un <summary> en la variante colapsable — sin esto, el
    // click además abre/cierra el <details> en vez de solo regenerar.
    e.preventDefault()
    e.stopPropagation()
    if (state === 'loading') return
    setState('loading')
    try {
      const res  = await fetch('/api/analyze-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year, force: true }),
      })
      const data = res.ok ? await res.json() : null
      setState('done')
      if (data?.opportunities !== undefined) router.refresh()
      setTimeout(() => setState('idle'), 2000)
    } catch {
      setState('idle')
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      title="Volver a analizar este mes"
      className={cn(
        'text-[10px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded-full transition-opacity',
        state === 'loading' ? 'opacity-60 cursor-wait' : 'hover:opacity-70'
      )}
      style={{ color: 'var(--primary)' }}
    >
      <RefreshCw className={cn('w-3 h-3', state === 'loading' && 'animate-spin')} />
      {state === 'loading' ? 'Analizando…' : state === 'done' ? 'Listo' : 'Regenerar'}
    </button>
  )
}
