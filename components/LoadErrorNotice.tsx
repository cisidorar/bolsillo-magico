'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

// Una consulta que falla no es lo mismo que "no tienes nada": mostrar el
// estado vacío ahí haría creer que se perdieron las posiciones. Gold (chip +
// nota, no banner coral: no es algo que se arregle hoy, solo reintentar).
export default function LoadErrorNotice({ what }: { what: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <div className="card px-5 py-6 mt-4 flex flex-col items-start gap-3" role="alert">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={{ color: 'var(--gold-ink)', background: 'color-mix(in srgb, var(--gold) 14%, var(--surface))' }}>
        <AlertTriangle className="w-3 h-3" /> No pudimos cargar {what}
      </span>
      <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
        Tus datos siguen guardados: esto es un problema de conexión, no se perdió nada. Reintenta en unos segundos.
      </p>
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl text-sm font-bold disabled:opacity-60"
        style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
      >
        <RefreshCw className={`w-4 h-4 ${pending ? 'animate-spin' : ''}`} />
        {pending ? 'Reintentando…' : 'Reintentar'}
      </button>
    </div>
  )
}
