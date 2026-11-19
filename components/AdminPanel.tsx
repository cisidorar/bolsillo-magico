'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Check, X, Loader2, ShieldCheck, Ban, Send } from 'lucide-react'
import { useToast } from '@/components/ToastProvider'
import {
  inviteFromWaitlist, inviteByEmail, rejectWaitlist, setAccountFeature, setAccountFeatures, setAccountBlocked,
  type WaitlistRow, type AccountRow, type AdminResult,
} from '@/app/actions/admin'
import { FEATURE_KEYS, FEATURE_LABELS, FEATURE_PRESETS, DEFAULT_FEATURES, type FeatureKey, type Features } from '@/lib/features'

function when(iso: string | null): string {
  if (!iso) return 'nunca'
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Santiago' })
}

/** "hoy", "ayer", "hace 5 días", "hace 3 semanas"… y la fecha solo si pasó mucho. */
function ago(iso: string | null): string {
  if (!iso) return 'nunca ha entrado'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'entró hoy'
  if (days === 1) return 'entró ayer'
  if (days < 14) return `entró hace ${days} días`
  if (days < 60) return `entró hace ${Math.round(days / 7)} semanas`
  return `última vez ${when(iso)}`
}

const sameFeatures = (a: Features, b: Features) => FEATURE_KEYS.every(k => a[k] === b[k])

/** Casillas de módulos para elegir con qué parte una invitación. */
function ModulePicker({ value, onChange, disabled }: { value: Features; onChange: (f: Features) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Módulos de la invitación">
      {FEATURE_KEYS.map(k => {
        const on = value[k]
        return (
          <button
            key={k} type="button" aria-pressed={on} disabled={disabled}
            onClick={() => onChange({ ...value, [k]: !on })}
            className="min-h-[44px] px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border disabled:opacity-60"
            style={on
              ? { color: 'var(--primary)', background: 'var(--primary-soft)', borderColor: 'var(--primary)' }
              : { color: 'var(--ink-3)', background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            {on ? <Check className="w-3.5 h-3.5" aria-hidden /> : <span className="w-3.5 h-3.5 rounded-full border" style={{ borderColor: 'var(--border)' }} aria-hidden />}
            {FEATURE_LABELS[k].title}
          </button>
        )
      })}
    </div>
  )
}

/** Interruptor con estado a la vista: encendido azul con check, apagado gris. */
function Switch({ on, disabled, label, onToggle }: { on: boolean; disabled: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onToggle}
      className="relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-60"
      style={{ background: on ? 'var(--primary)' : 'var(--border)' }}
    >
      <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
            style={{ transform: on ? 'translateX(20px)' : 'translateX(0)' }} />
    </button>
  )
}

export default function AdminPanel({ waitlist, accounts, cap, myId }: {
  waitlist: WaitlistRow[]; accounts: AccountRow[]; cap: number; myId: string
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  // Cambios de módulos que se ven al instante, antes de que el servidor responda.
  const [local, setLocal] = useState<Record<string, Features>>({})
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteFeatures, setInviteFeatures] = useState<Features>(DEFAULT_FEATURES)

  const pending  = waitlist.filter(w => w.status === 'pending')
  const resolved = waitlist.filter(w => w.status !== 'pending')
  const active   = accounts.filter(a => !a.banned).length
  const full     = active >= cap

  // Tú primero, luego los admins, luego el resto por antigüedad.
  const sorted = [...accounts].sort((a, b) =>
    Number(b.id === myId) - Number(a.id === myId) || Number(b.is_admin) - Number(a.is_admin) || a.created_at.localeCompare(b.created_at))

  async function run(key: string, action: () => Promise<AdminResult>, okMessage?: string) {
    setBusy(key)
    try {
      const res = await action()
      if (!res.ok) { showToast(res.error); return false }
      const msg = okMessage ?? res.message
      if (msg) showToast(msg)
      startTransition(() => router.refresh())
      return true
    } catch {
      showToast('No se pudo completar. Revisa tu conexión e inténtalo de nuevo.')
      return false
    } finally {
      setBusy(null)
    }
  }

  const featuresOf = (a: AccountRow): Features => local[a.id] ?? a.features

  async function toggle(a: AccountRow, k: FeatureKey) {
    const before = featuresOf(a)
    const next = { ...before, [k]: !before[k] }
    setLocal(l => ({ ...l, [a.id]: next }))
    const ok = await run(`f-${a.id}-${k}`, () => setAccountFeature(a.id, k, next[k]),
      `${FEATURE_LABELS[k].title} ${next[k] ? 'activado' : 'desactivado'}.`)
    if (!ok) setLocal(l => ({ ...l, [a.id]: before }))
  }

  async function preset(a: AccountRow, next: Features, name: string) {
    const before = featuresOf(a)
    setLocal(l => ({ ...l, [a.id]: next }))
    const ok = await run(`p-${a.id}`, () => setAccountFeatures(a.id, next), `Acceso ${name} para ${a.email}.`)
    if (!ok) setLocal(l => ({ ...l, [a.id]: before }))
  }

  async function sendInvite() {
    const ok = await run('invite', () => inviteByEmail(inviteEmail, window.location.origin, inviteFeatures))
    if (ok) { setInviteEmail(''); setInviteFeatures(DEFAULT_FEATURES) }
  }

  return (
    <div className="space-y-6 max-w-3xl">

      {/* ── Invitar ── */}
      <section className="card p-5 lg:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Invitar</h2>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full tabular-nums"
                style={full
                  ? { color: 'var(--gold-ink)', background: 'color-mix(in srgb, var(--gold) 16%, var(--surface))' }
                  : { color: 'var(--ink-2)', background: 'var(--surface-2)' }}>
            {active} de {cap} cuentas activas
          </span>
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
          Le llega un correo para elegir su clave. Eliges de antemano qué módulos ve; después puedes cambiarlos.
        </p>

        <form
          className="mt-4 space-y-3"
          onSubmit={e => { e.preventDefault(); if (inviteEmail.trim()) sendInvite() }}
        >
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email" inputMode="email" autoComplete="off" required
              value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
              placeholder="correo@ejemplo.com" aria-label="Correo de la persona a invitar"
              className="flex-1 min-h-[44px] rounded-xl px-3.5 text-sm border outline-none"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
            />
            <button
              type="submit" disabled={busy !== null || full || !inviteEmail.trim()}
              className="min-h-[44px] px-4 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
            >
              {busy === 'invite' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
              Invitar
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-1">
            <span className="text-[11px] font-bold uppercase tracking-wide mr-1" style={{ color: 'var(--ink-3)' }}>Rápido</span>
            {FEATURE_PRESETS.map(pr => (
              <button key={pr.id} type="button" disabled={busy !== null || sameFeatures(inviteFeatures, pr.features)}
                onClick={() => setInviteFeatures(pr.features)}
                className="min-h-[44px] px-2 text-xs font-semibold disabled:opacity-40" style={{ color: 'var(--primary)' }}>
                {pr.label}
              </button>
            ))}
          </div>
          <ModulePicker value={inviteFeatures} onChange={setInviteFeatures} disabled={busy !== null} />
        </form>
        {full && (
          <p className="text-xs mt-3 font-semibold" style={{ color: 'var(--gold-ink)' }}>
            Llegaste al tope. Bloquea una cuenta o sube MAX_ACTIVE_USERS para invitar a más personas.
          </p>
        )}
      </section>

      {/* ── Solicitudes ── */}
      <section className="card p-5 lg:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Solicitudes</h2>
          {pending.length > 0 && (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full tabular-nums"
                  style={{ color: 'var(--gold-ink)', background: 'color-mix(in srgb, var(--gold) 16%, var(--surface))' }}>
              {pending.length} {pending.length === 1 ? 'pendiente' : 'pendientes'}
            </span>
          )}
        </div>

        {pending.length === 0 ? (
          <p className="text-sm mt-3" style={{ color: 'var(--ink-3)' }}>
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
                    disabled={busy !== null || full}
                    onClick={() => run(`i-${w.id}`, () => inviteFromWaitlist(w.id, window.location.origin, inviteFeatures))}
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
        {pending.length > 0 && (
          <p className="text-[11px] mt-3" style={{ color: 'var(--ink-3)' }}>
            Al invitar desde aquí se usan los módulos elegidos arriba en &ldquo;Invitar&rdquo;.
          </p>
        )}

        {resolved.length > 0 && (
          <details className="mt-4">
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
          Apagar un módulo solo lo oculta: los datos de la persona se conservan y reaparecen al volver a encenderlo.
        </p>
        <ul className="mt-4 space-y-4">
          {sorted.map(a => {
            const me = a.id === myId
            const f = featuresOf(a)
            const count = FEATURE_KEYS.filter(k => f[k]).length
            const name = a.display_name && !a.display_name.includes('@') ? a.display_name : a.email.split('@')[0]
            return (
              <li key={a.id} className="rounded-2xl p-4" style={{ background: 'var(--surface-2)', opacity: a.banned ? 0.65 : 1 }}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold"
                       style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }} aria-hidden>
                    {(name[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold flex flex-wrap items-center gap-x-2 gap-y-1" style={{ color: 'var(--ink)' }}>
                      <span className="break-all">{name}</span>
                      {me && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: 'var(--ink-2)', background: 'var(--surface)' }}>tú</span>}
                      {a.is_admin && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                              style={{ color: 'var(--primary)', background: 'var(--primary-soft)' }}>
                          <ShieldCheck className="w-3 h-3" aria-hidden /> admin
                        </span>
                      )}
                      {a.banned && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: 'var(--coral-ink)', background: 'var(--surface)' }}>bloqueada</span>
                      )}
                    </p>
                    <p className="text-xs mt-0.5 break-all" style={{ color: 'var(--ink-3)' }}>
                      {a.email} · {ago(a.last_sign_in_at)}
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

                {/* Módulos: interruptores con estado explícito */}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
                    Módulos · {count} de {FEATURE_KEYS.length}
                  </p>
                  <div className="flex flex-wrap justify-end" role="group" aria-label={`Acceso rápido para ${a.email}`}>
                    {FEATURE_PRESETS.map(pr => (
                      <button key={pr.id} type="button" disabled={busy !== null || sameFeatures(f, pr.features)}
                        onClick={() => preset(a, pr.features, pr.label.toLowerCase())}
                        className="min-h-[44px] px-2 text-xs font-semibold disabled:opacity-40" style={{ color: 'var(--primary)' }}>
                        {pr.label}
                      </button>
                    ))}
                  </div>
                </div>
                <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {FEATURE_KEYS.map((k: FeatureKey) => (
                    <li key={k} className="flex items-center justify-between gap-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold" style={{ color: f[k] ? 'var(--ink)' : 'var(--ink-3)' }}>{FEATURE_LABELS[k].title}</p>
                        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{FEATURE_LABELS[k].hint}</p>
                      </div>
                      <Switch
                        on={f[k]} disabled={busy !== null}
                        label={`${FEATURE_LABELS[k].title} para ${a.email}`}
                        onToggle={() => toggle(a, k)}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
