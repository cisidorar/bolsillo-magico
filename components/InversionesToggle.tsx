import Link from 'next/link'
import { TrendingUp, Timer, Landmark, Receipt, Wallet } from 'lucide-react'

export type InversionesView = 'acciones' | 'depositos' | 'ahorro' | 'ventas' | 'billetera'

/**
 * Toggle compartido de las vistas de /inversiones.
 * Único lugar donde se definen las tabs — no duplicar en los managers.
 */
export default function InversionesToggle({
  active,
}: {
  active: InversionesView
  /** @deprecated la tab Ventas ahora es siempre visible (su empty state explica el flujo) */
  showVentas?: boolean
}) {
  const tabs: { view: InversionesView; href: string; label: string; Icon: typeof TrendingUp }[] = [
    { view: 'acciones',   href: '/inversiones',                  label: 'Acciones',  Icon: TrendingUp },
    { view: 'ventas',     href: '/inversiones?view=ventas',      label: 'Ventas',    Icon: Receipt },
    { view: 'billetera',  href: '/inversiones?view=billetera',   label: 'Billetera', Icon: Wallet },
    { view: 'depositos',  href: '/inversiones?view=depositos',   label: 'Depósitos', Icon: Timer },
    { view: 'ahorro',     href: '/inversiones?view=ahorro',      label: 'Ahorro',    Icon: Landmark },
  ]
  return (
    <div className="view-toggle-wrap flex items-center gap-1 rounded-xl p-1">
      {tabs.map(({ view, href, label, Icon }) => (
        <Link
          key={view}
          href={href}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            active === view ? 'view-toggle-active-purchase' : 'view-toggle-btn'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </Link>
      ))}
    </div>
  )
}
