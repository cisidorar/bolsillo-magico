'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail } from 'lucide-react'
import { useToast } from '@/components/ToastProvider'
import { acceptSharedInvite, declineSharedInvite, ensureTripCategory } from '@/app/actions/shared'
import type { SplitMode } from '@/lib/shared-split'

/** Invitación pendiente. En modo sueldo, aceptar incluye el consentimiento (con opción de no darlo). */
export default function SharedInviteCard({
  groupId, groupName, inviter, mode,
}: {
  groupId:   string
  groupName: string
  inviter:   string
  mode:      SplitMode
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function accept(consent: boolean) {
    setBusy(true); setError('')
    const cat = await ensureTripCategory()
    const res = await acceptSharedInvite(groupId, cat.ok ? cat.id : null, consent)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    showToast('Te uniste al viaje')
    router.push(`/compartidos?g=${groupId}`)
    router.refresh()
  }

  async function decline() {
    setBusy(true); setError('')
    const res = await declineSharedInvite(groupId)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    router.refresh()
  }

  const income = mode === 'income'

  return (
    <div className="card p-4" style={{ borderColor: 'var(--primary)' }}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-soft)' }}>
          <Mail className="w-5 h-5" style={{ color: 'var(--primary)' }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{inviter} te invitó a «{groupName}»</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-2)' }}>
            {income
              ? 'El reparto es según sueldo: cada uno paga en proporción a lo que gana. Nadie ve el sueldo de otro, solo el porcentaje. Si prefieres no compartirlo, puedes entrar igual y el grupo repartirá parejo hasta que cambies de opinión.'
              : 'El reparto es parejo entre todos.'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
            En tus gastos solo aparecerá tu parte; tus ingresos y gastos personales siguen siendo privados.
          </p>
          {error && <p className="text-xs font-medium mt-2" style={{ color: 'var(--coral)' }}>{error}</p>}
          <div className="flex flex-wrap gap-2 mt-3">
            <button disabled={busy} onClick={() => accept(income)}
              className="px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
              {income ? 'Aceptar y compartir mi porcentaje' : 'Aceptar'}
            </button>
            {income && (
              <button disabled={busy} onClick={() => accept(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold border disabled:opacity-50"
                style={{ borderColor: 'var(--border)', color: 'var(--ink-2)', background: 'var(--surface)' }}>
                Entrar sin compartirlo
              </button>
            )}
            <button disabled={busy} onClick={decline}
              className="px-4 py-2 rounded-xl text-xs font-semibold border disabled:opacity-50"
              style={{ borderColor: 'var(--border)', color: 'var(--ink-2)', background: 'var(--surface-2)' }}>Rechazar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
