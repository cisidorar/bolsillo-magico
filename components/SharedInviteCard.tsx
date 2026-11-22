'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail } from 'lucide-react'
import { useToast } from '@/components/ToastProvider'
import { acceptSharedInvite, declineSharedInvite, ensureTripCategory, setMyTripIncome } from '@/app/actions/shared'
import TripIncomeField from '@/components/TripIncomeField'
import type { SplitMode } from '@/lib/shared-split'

/** Invitación pendiente. En modo sueldo, aceptar incluye el consentimiento (con opción de no darlo). */
export default function SharedInviteCard({
  groupId, groupName, inviter, mode, needsIncome = false,
}: {
  groupId:   string
  groupName: string
  inviter:   string
  mode:      SplitMode
  /** Reparto según sueldo y esta cuenta aún no tiene de dónde sacar su ingreso: se le pide al aceptar. */
  needsIncome?: boolean
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  // Qué botón se tocó: ese cambia su texto («Uniéndote…») para que se sienta que la app escuchó.
  const [pending, setPending] = useState<'accept' | 'accept-private' | 'decline' | null>(null)
  const [closing, setClosing] = useState(false)
  const [askIncome, setAskIncome] = useState(false)
  const [error, setError] = useState('')

  async function accept(consent: boolean) {
    setBusy(true); setError(''); setPending(consent ? 'accept' : 'accept-private')
    const cat = await ensureTripCategory()
    const res = await acceptSharedInvite(groupId, cat.ok ? cat.id : null, consent)
    if (!res.ok) { setBusy(false); setPending(null); setError(res.error); return }
    setBusy(false)
    showToast('Te uniste al viaje')
    router.push(`/compartidos?g=${groupId}`)
    router.refresh()
  }

  async function acceptWithIncome(amount: number) {
    setBusy(true); setError(''); setPending('accept')
    const saved = await setMyTripIncome(amount)
    if (!saved.ok) { setBusy(false); setPending(null); setError(saved.error); return }
    await accept(true)
  }

  async function decline() {
    setBusy(true); setError(''); setPending('decline')
    const res = await declineSharedInvite(groupId)
    setBusy(false)
    if (!res.ok) { setPending(null); setError(res.error); return }
    // La tarjeta se pliega antes de salir: lo de abajo sube suave en vez de saltar.
    setClosing(true)
    setTimeout(() => router.refresh(), 230)
  }

  const income = mode === 'income'

  return (
    <div className="rc-collapse ic-in" data-closed={closing || undefined} aria-hidden={closing || undefined}>
    <div style={closing ? { overflow: 'hidden' } : undefined}>
    <div className="card p-4 lg:p-5" style={{ background: 'color-mix(in srgb, var(--primary) 7%, var(--surface))' }}>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-soft)' }}>
          <Mail className="w-5 h-5" style={{ color: 'var(--primary-text)' }} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold leading-snug text-balance" style={{ color: 'var(--ink)' }}>
            {inviter} te invitó a «{groupName}»
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-2)' }}>
            {income
              ? 'Los gastos se reparten según lo que gana cada uno. Solo se comparte el porcentaje, nunca el sueldo.'
              : 'Los gastos se reparten en partes iguales entre todos.'}
          </p>
          <details className="pr-details mt-1">
            <summary className="inline-flex items-center min-h-[44px] text-sm font-bold cursor-pointer" style={{ color: 'var(--primary-text)' }}>
              ¿Qué pasa si acepto?
            </summary>
            <div className="text-sm space-y-1.5 pb-1" style={{ color: 'var(--ink-2)' }}>
              <p>En tus gastos solo aparecerá tu parte. Tus ingresos y tus gastos personales siguen siendo privados.</p>
              {income && <p>Si prefieres no compartir tu porcentaje, puedes entrar igual: el grupo repartirá parejo hasta que cambies de opinión.</p>}
            </div>
          </details>
          {error && <p role="alert" className="text-sm font-semibold mt-2" style={{ color: 'var(--coral-ink)' }}>{error}</p>}
          {askIncome && (
            <div className="mt-3 rounded-xl p-3.5" style={{ background: 'var(--surface)' }}>
              <TripIncomeField label="Guardar y unirme" busy={busy} onSubmit={acceptWithIncome} />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button disabled={busy} onClick={() => (income && needsIncome ? setAskIncome(true) : accept(income))}
              className="px-5 min-h-[44px] rounded-xl text-sm font-bold disabled:opacity-50 transition-transform active:scale-[.98]"
              style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
              {pending === 'accept' ? 'Uniéndote…' : income ? 'Aceptar y compartir mi %' : 'Aceptar'}
            </button>
            {income && (
              <button disabled={busy} onClick={() => accept(false)}
                className="px-4 min-h-[44px] rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ color: 'var(--ink-2)', background: 'var(--surface-2)' }}>
                {pending === 'accept-private' ? 'Uniéndote…' : 'Entrar sin compartir mi %'}
              </button>
            )}
            <button disabled={busy} onClick={decline}
              className="px-4 min-h-[44px] rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ color: 'var(--ink-2)' }}>
              {pending === 'decline' ? 'Rechazando…' : 'Rechazar'}
            </button>
          </div>
        </div>
      </div>
    </div>
    </div>
    </div>
  )
}
