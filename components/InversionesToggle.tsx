import Link from 'next/link'
import { TrendingUp, Landmark, Wallet } from 'lucide-react'

// Ago 2026 (roadmap ROADMAP-ahorro-depositos.md, A1): Ahorro y Depósitos se
// fusionaron en una sola pestaña — ambos son "plata segura en pesos que
// rinde un interés conocido", a diferencia de Acciones/Billetera que son el
// mundo USD con riesgo. 'depositos' se mantiene como ALIAS de 'ahorro' en
// page.tsx (no como tab propia) para que links/bookmarks viejos no rompan.
export type InversionesView = 'acciones' | 'ahorro' | 'billetera'

/**
 * Toggle compartido de las vistas de /inversiones.
 * Único lugar donde se definen las tabs — no duplicar en los managers.
 */
export default function InversionesToggle({
  active,
}: {
  active: InversionesView
}) {
  const tabs: { view: InversionesView; href: string; label: string; Icon: typeof TrendingUp }[] = [
    { view: 'acciones',   href: '/inversiones',                  label: 'Acciones',           Icon: TrendingUp },
    { view: 'billetera',  href: '/inversiones?view=billetera',   label: 'Billetera',          Icon: Wallet },
    { view: 'ahorro',     href: '/inversiones?view=ahorro',      label: 'Ahorro y depósitos', Icon: Landmark },
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
