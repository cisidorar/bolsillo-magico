import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { formatCLP } from '@/lib/utils'
import { summarizeLink, type LinkView } from '@/lib/shared-link'

// Vista pública de solo lectura de un viaje (sin sesión). No muestra sueldos.
export const metadata: Metadata = { title: 'Viaje compartido', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })

export default async function SharedLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const { data } = await supabase.rpc('shared_link_view', { p_token: token })
  const view = data as LinkView | null

  if (!view) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg, #EEF4FF)' }}>
        <div className="card p-6 max-w-sm text-center space-y-2">
          <h1 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Este enlace ya no está disponible</h1>
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Venció o quien lo compartió lo desactivó. Pídele uno nuevo.</p>
        </div>
      </main>
    )
  }

  const s = summarizeLink(view)
  const nameOf = (id: string) => view.members.find(m => m.id === id)?.name ?? 'Alguien'
  const range = view.group.start_date
    ? `${fmtDay(view.group.start_date)}${view.group.end_date ? ` – ${fmtDay(view.group.end_date)}` : ''}`
    : null

  return (
    <main className="min-h-screen px-4 py-8" style={{ background: 'var(--bg, #EEF4FF)' }}>
      <div className="max-w-md mx-auto space-y-4">
        <div>
          <p className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Bolsillo Mágico · solo lectura</p>
          <h1 className="font-display text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>{view.group.name}</h1>
          {range && <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>{range}</p>}
        </div>

        <div className="card p-5 space-y-2">
          <p className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Cómo quedan las cuentas</p>
          {s.transfers.length === 0 ? (
            <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>Están a mano</p>
          ) : s.transfers.map((t, i) => (
            <p key={i} className="text-base font-bold" style={{ color: 'var(--ink)' }}>
              {t.from} le debe <span className="tabular-nums">{formatCLP(t.amount)}</span> a {t.to}
            </p>
          ))}
          <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Total gastado en el viaje: {formatCLP(s.total)}</p>
        </div>

        <div className="card p-5 space-y-2">
          <p className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
            {s.pct ? 'Reparto según lo que gana cada uno' : 'Reparto en partes iguales'}
          </p>
          {s.balances.map(b => {
            const p = s.pct?.find(x => x.id === b.id)
            return (
              <div key={b.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                  {b.name}{p ? ` · ${p.pct.toLocaleString('es-CL')}%` : ''}
                </span>
                <span className="tabular-nums text-xs" style={{ color: 'var(--ink-3)' }}>
                  puso {formatCLP(b.paid)} · le tocaba {formatCLP(b.share)}
                </span>
              </div>
            )
          })}
        </div>

        <div className="card p-5">
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-3)' }}>Gastos</p>
          {view.expenses.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Todavía no hay gastos.</p>}
          {view.expenses.map(e => (
            <div key={e.id} className="flex items-center justify-between gap-3 py-2 border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{e.description}</p>
                <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{fmtDay(e.date)} · pagó {nameOf(e.paid_by)}</p>
              </div>
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(e.amount)}</span>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-center" style={{ color: 'var(--ink-3)' }}>
          Vista de solo lectura. Vence el {new Date(view.expires_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}.
        </p>
      </div>
    </main>
  )
}
