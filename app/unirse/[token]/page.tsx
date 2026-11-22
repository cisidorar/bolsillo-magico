import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { SiteHeader, SiteFooter } from '@/components/site/SiteChrome'
import JoinTripButton from '@/components/JoinTripButton'

// Invitación a un viaje compartido por enlace (tipo Airbnb): vista previa SIN montos ni sueldos.
// Con sesión → "Unirme" entra directo. Sin sesión → entrar o pedir acceso (la app sigue por invitación).
export const metadata: Metadata = { title: 'Te invitaron a un viaje', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

type Preview = {
  group_id: string; name: string; start_date: string | null; end_date: string | null
  split_mode: 'equal' | 'income'; inviter: string; people: string[]; full: boolean
}

const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })

export default async function JoinTripPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const [{ data }, { data: { user } }] = await Promise.all([
    supabase.rpc('shared_join_preview', { p_token: token }),
    supabase.auth.getUser(),
  ])
  const view = data as Preview | null
  const year = new Date().getFullYear()

  const range = view?.start_date
    ? `${fmtDay(view.start_date)}${view.end_date ? ` al ${fmtDay(view.end_date)}` : ''}`
    : 'Fechas por definir'
  const others = view ? view.people.filter(n => n !== view.inviter) : []

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg, #EEF4FF)' }}>
      <SiteHeader />
      <main className="flex-1 px-4 py-8 lg:py-14">
        <div className="max-w-md mx-auto space-y-5">
          {!view ? (
            <div className="card p-7 text-center space-y-2">
              <h1 className="font-display text-xl font-bold" style={{ color: 'var(--ink)' }}>Esta invitación ya no está disponible</h1>
              <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
                Venció, quien la creó la desactivó o el viaje ya se cerró. Pídele un enlace nuevo.
              </p>
            </div>
          ) : (
            <>
              <div className="hero-gradient rounded-3xl p-6 lg:p-7 text-white">
                <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,.85)' }}>{view.inviter} te invitó a un viaje</p>
                <h1 className="font-display text-3xl lg:text-4xl font-extrabold leading-tight mt-2">{view.name}</h1>
                <p className="text-sm mt-1.5" style={{ color: 'rgba(255,255,255,.85)' }}>{range}</p>
                <div className="flex items-center gap-3 mt-6">
                  <div className="flex items-center">
                    {view.people.slice(0, 5).map((n, i) => (
                      <span key={i} className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ring-2"
                        style={{ marginLeft: i ? -10 : 0, background: '#fff', color: '#1B6DD4', ['--tw-ring-color' as string]: '#1B6DD4' }}>
                        {n[0]?.toUpperCase()}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm min-w-0" style={{ color: 'rgba(255,255,255,.9)' }}>
                    {others.length === 0 ? `Va ${view.inviter}` : `${view.inviter}, ${others.slice(0, 2).join(', ')}${others.length > 2 ? ` y ${others.length - 2} más` : ''}`}
                  </p>
                </div>
              </div>

              <div className="card p-5 space-y-4">
                {view.full ? (
                  <p className="text-sm font-semibold text-center" style={{ color: 'var(--ink-2)' }}>Este viaje ya llegó al máximo de personas.</p>
                ) : user ? (
                  <JoinTripButton token={token} income={view.split_mode === 'income'} />
                ) : (
                  <div className="space-y-3">
                    <Link href={`/login?next=${encodeURIComponent(`/unirse/${token}`)}`}
                      className="w-full min-h-[52px] rounded-2xl text-base font-bold flex items-center justify-center transition-transform active:scale-[.98]"
                      style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 8px 18px var(--shadow)' }}>
                      Entrar y unirme
                    </Link>
                    <p className="text-sm text-center" style={{ color: 'var(--ink-3)' }}>
                      ¿No tienes cuenta? Bolsillo Mágico se entra por invitación.{' '}
                      <Link href="/?landing=1#lista" className="font-semibold underline underline-offset-2" style={{ color: 'var(--primary)' }}>Pide acceso</Link>
                      {' '}y cuando te lo den, vuelve a este enlace.
                    </p>
                  </div>
                )}

                <div className="flex items-start gap-2.5 text-xs" style={{ color: 'var(--ink-3)' }}>
                  <Users className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
                  <p>
                    {view.split_mode === 'income'
                      ? 'Los gastos se reparten según lo que gana cada uno. Nadie ve el sueldo de otro, solo el porcentaje: en este viaje todos comparten el suyo.'
                      : 'Los gastos se reparten en partes iguales entre todos.'}
                  </p>
                </div>
                <div className="flex items-start gap-2.5 text-xs" style={{ color: 'var(--ink-3)' }}>
                  <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
                  <p>En tus gastos solo aparece tu parte. Tus ingresos y gastos personales siguen siendo privados.</p>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
      <SiteFooter year={year} />
    </div>
  )
}
