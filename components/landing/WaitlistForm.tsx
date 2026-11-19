'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { joinWaitlist } from '@/app/(marketing)/actions'

// Va sobre el azul sólido del cierre (.hero-gradient), por eso usa blanco y
// los acentos "on-brand" en vez de --ink / --mint-ink.
export default function WaitlistForm({ source = 'landing' }: { source?: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState('sending'); setError('')
    const res = await joinWaitlist(new FormData(e.currentTarget))
    if (res.ok) setState('done')
    else { setState('error'); setError(res.error) }
  }

  if (state === 'done') {
    return (
      <p role="status" className="inline-flex items-center gap-2 text-base font-bold" style={{ color: 'var(--mint-on-brand)' }}>
        <Check className="w-5 h-5" aria-hidden /> Listo. Te escribimos si hay un lugar para ti.
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md" noValidate>
      <div className="flex flex-col sm:flex-row gap-2">
        <label htmlFor="wl-email" className="sr-only">Tu correo</label>
        <input
          id="wl-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="tucorreo@gmail.com"
          className="flex-1 min-h-[52px] rounded-2xl px-4 text-base outline-none"
          style={{ background: 'rgba(255,255,255,0.96)', color: '#0E2A52', border: '2px solid transparent' }}
          onFocus={e => (e.currentTarget.style.borderColor = '#FFFFFF')}
          onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
        />
        {/* Campo trampa: invisible para personas, los bots lo llenan. */}
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
        <input type="hidden" name="source" value={source} />
        <button
          type="submit"
          disabled={state === 'sending'}
          className="min-h-[52px] px-6 rounded-2xl text-base font-bold inline-flex items-center justify-center gap-2 transition-transform active:scale-[.98] disabled:opacity-70"
          style={{ background: '#0E2A52', color: '#FFFFFF' }}
        >
          {state === 'sending' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
          {state === 'sending' ? 'Enviando…' : 'Pedir acceso'}
        </button>
      </div>
      {state === 'error' && (
        <p role="alert" className="text-sm font-bold mt-2" style={{ color: '#FFFFFF' }}>{error}</p>
      )}
      <p className="text-sm mt-3" style={{ color: 'rgba(255,255,255,0.9)' }}>
        Solo usamos tu correo para responderte. Nada de spam.
      </p>
    </form>
  )
}
