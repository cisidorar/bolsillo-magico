'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Check, X, Loader2, ShieldCheck, Ban } from 'lucide-react'
import { useToast } from '@/components/ToastProvider'
import {
  inviteFromWaitlist, rejectWaitlist, setAccountFeature, setAccountBlocked,
  type WaitlistRow, type AccountRow, type AdminResult,
} from '@/app/actions/admin'
import { FEATURE_KEYS, FEATURE_LABELS, type FeatureKey } from '@/lib/features'

function when(iso: string | null): string {
  if (!iso) return 'nunca'
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Santiago' })
}

export default function AdminPanel({ waitlist, accounts, cap, myId }: {
  waitlist: WaitlistRow[]; accounts: AccountRow[]; cap: number; myId: string
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)

  const pending  = waitlist.filter(w => w.status === 'pending')
  const resolved = waitlist.filter(w => w.status !== 'pending')
  const active   = accounts.filter(a => !a.banned).length

  async function run(key: string, action: () => Promise<AdminResult>, okMessage?: string) {
    setBusy(key)
    try {
      const res = await action()
      if (!res.ok) { showToast(res.error); return }
      const msg = okMessage ?? res.message
      if (msg) showToast(msg)
      startTransition(() => router.refresh())
    } catch {
      showToast('No se pudo completar. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">

      {/* ── Solicitudes ── */}
      <section className="card p-5 lg:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Solicitudes</h2>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full tabular-nums"
                style={active >= cap
                  ? { color: 'var(--gold-ink)', background: 'color-mix(in srgb, var(--gold) 16%, var(--surface))' }
                  : { color: 'var(--ink-2)', background: 'var(--surface-2)' }}>
            {active} de {cap} cuentas activas
          </span>
        </div>

        {pending.length === 0 ? (
          <p className="text-sm mt-4" style={{ color: 'var(--ink-3)' }}>
            No hay solicitudes pendientes. Quien deje su correo en la landing aparece acá.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {pending.map(w => (
              <li key={w.id} className="rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-3" style={{ background: 'var(--surface-2)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold flex items-center gap-2 break-all" style={{ color: 'var(--ink)' }}>
                    <Mail className="w-4 h-4 shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden /> {w.email}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Pidió acceso el {when(w.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy !== null || active >= cap}
                    onClick={() => run(`i-${w.id}`, () => inviteFromWaitlist(w.id, window.location.origin))}
                    className="min-h-[44px] px-4 rounded-xl text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50"
                    style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
                  >
                    {busy === `i-${w.id}` ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Check className="w-4 h-4" aria-hidden />}
                    Invitar
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => run(`r-${w.id}`, () => rejectWaitlist(w.id))}
                    aria-label={`Rechazar a ${w.email}`}
                    className="min-h-[44px] px-3 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                    style={{ color: 'var(--ink-2)', background: 'var(--surface)' }}
                  >
                    <X className="w-4 h-4" aria-hidden /> Rechazar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {active >= cap && pending.length > 0 && (
          <p className="text-xs mt-3 font-semibold" style={{ color: 'var(--gold-ink)' }}>
            Llegaste al tope. Bloquea una cuenta o sube MAX_ACTIVE_USERS para invitar a más personas.
          </p>
        )}

        {resolved.length > 0 && (
          <details className="mt-5">
            <summary className="text-xs font-semibold cursor-pointer min-h-[44px] flex items-center" style={{ color: 'var(--ink-2)' }}>
              Ya resueltas ({resolved.length})
            </summary>
            <ul className="space-y-1.5 mt-1">
              {resolved.map(w => (
                <li key={w.id} className="flex items-center justify-between gap-3 text-xs" style={{ color: 'var(--ink-3)' }}>
                  <span className="break-all">{w.email}</span>
                  <span className="shrink-0">{w.status === 'invited' ? `Invitada el ${when(w.invited_at)}` : 'Rechazada'}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* ── Cuentas ── */}
      <section className="card p-5 lg:p-6">
        <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Cuentas</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
          Las cuentas nuevas parten solo con lo básico. Enciende un módulo cuando esa persona lo necesite.
        </p>
        <ul className="mt-4 space-y-4">
          {accounts.map(a => {
            const me = a.id === myId
            return (
              <li key={a.id} className="rounded-2xl p-4" style={{ background: 'var(--surface-2)', opacity: a.banned ? 0.7 : 1 }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold break-all flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                      {a.display_name && !a.display_name.includes('@') ? a.display_name : a.email}
                      {a.is_admin && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                              style={{ color: 'var(--primary)', background: 'var(--primary-soft)' }}>
                          <ShieldCheck className="w-3 h-3" aria-hidden /> admin
                        </span>
                      )}
                      {a.banned && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: 'var(--ink-2)', background: 'var(--surface)' }}>bloqueada</span>
                      )}
                    </p>
                    <p className="text-xs mt-0.5 break-all" style={{ color: 'var(--ink-3)' }}>
                      {a.email} · última vez {when(a.last_sign_in_at)}
                    </p>
                  </div>
                  {!me && !a.is_admin && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => run(`b-${a.id}`, () => setAccountBlocked(a.id, !a.banned),
                        a.banned ? 'Cuenta desbloqueada.' : 'Cuenta bloqueada: ya no puede entrar.')}
                      className="min-h-[44px] px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                      style={{ color: a.banned ? 'var(--primary)' : 'var(--coral-ink)', background: 'var(--surface)' }}
                    >
                      <Ban className="w-3.5 h-3.5" aria-hidden /> {a.banned ? 'Desbloquear' : 'Bloquear'}
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mt-3" role="group" aria-label={`Módulos de ${a.email}`}>
                  {FEATURE_KEYS.map((k: FeatureKey) => {
                    const on = a.features[k]
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={on}
                        disabled={busy !== null}
                        onClick={() => run(`f-${a.id}-${k}`, () => setAccountFeature(a.id, k, !on))}
                        title={FEATURE_LABELS[k].hint}
                        className={`min-h-[44px] px-3.5 rounded-2xl border text-xs font-bold transition-colors disabled:opacity-60 ${on ? 'sheet-toggle-active' : 'sheet-toggle'}`}
                        style={{ color: on ? 'var(--primary)' : 'var(--ink-2)', borderWidth: 1.5 }}
                      >
                        {FEATURE_LABELS[k].title}
                      </button>
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
