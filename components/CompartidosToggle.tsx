import Link from 'next/link'
import { Plane, HandCoins } from 'lucide-react'

export type CompartidosTab = 'viajes' | 'cobrar'

/** Separa los viajes compartidos de lo que te deben tus amigos (Por cobrar). */
export default function CompartidosToggle({ active, viajes, cobrar }: {
  active: CompartidosTab
  /** Viajes en curso o por pagar (insignia) */
  viajes: number
  /** Cobros pendientes (insignia) */
  cobrar: number
}) {
  const tabs: { tab: CompartidosTab; href: string; label: string; Icon: typeof Plane; n: number }[] = [
    { tab: 'viajes', href: '/compartidos',              label: 'Viajes',     Icon: Plane,     n: viajes },
    { tab: 'cobrar', href: '/compartidos?tab=cobrar',   label: 'Por cobrar', Icon: HandCoins, n: cobrar },
  ]
  return (
    <div className="view-toggle-wrap inline-flex items-center gap-1 rounded-xl p-1">
      {tabs.map(({ tab, href, label, Icon, n }) => (
        <Link key={tab} href={href} aria-current={active === tab ? 'page' : undefined}
          className="group inline-flex items-center min-h-[44px] -my-2.5 focus-visible:outline-none">
          <span className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all group-focus-visible:ring-2 group-focus-visible:ring-[var(--primary)] ${
            active === tab ? 'view-toggle-active-purchase' : 'view-toggle-btn'
          }`}>
            <Icon className="w-3.5 h-3.5" />
            {label}
            {n > 0 && <span className="tabular-nums opacity-70">{n}</span>}
          </span>
        </Link>
      ))}
    </div>
  )
}
