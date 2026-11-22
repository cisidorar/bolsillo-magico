'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { acceptJoinLink, ensureTripCategory } from '@/app/actions/shared'

/** Botón(es) de "Unirme" de la página /unirse/[token]. Solo se muestra con sesión iniciada. */
export default function JoinTripButton({ token, income }: { token: string; income: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<'show' | null>(null)
  const [error, setError] = useState('')

  async function join(consent: boolean) {
    setBusy('show'); setError('')
    // Tu parte cae en una categoría propia: "Vacaciones" se crea si no existe.
    const cat = await ensureTripCategory()
    const res = await acceptJoinLink(token, cat.ok ? cat.id : null, consent)
    if (!res.ok) { setBusy(null); setError(res.error); return }
    router.push(`/compartidos?g=${res.groupId}`)
    router.refresh()
  }

  const spinner = <Loader2 className="w-4 h-4 animate-spin" />
  return (
    <div className="space-y-2.5">
      <button onClick={() => join(income)} disabled={busy !== null}
        className="w-full min-h-[52px] rounded-2xl text-base font-bold flex items-center justify-center gap-2 transition-transform active:scale-[.98] disabled:opacity-60"
        style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 8px 18px var(--shadow)' }}>
        {busy === 'show' ? spinner : null}
        {income ? 'Unirme y mostrar mi %' : 'Unirme al viaje'}
      </button>
      {error && <p role="alert" className="text-sm font-semibold text-center" style={{ color: 'var(--coral-ink)' }}>{error}</p>}
    </div>
  )
}
