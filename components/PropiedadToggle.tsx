import Link from 'next/link'
import { CircleCheck, Receipt } from 'lucide-react'

// P1 (PLAN_PROPIEDAD): por ahora dos vistas. Servicios (boletas de luz y agua)
// y Contrato llegan en P3 y P2 — se agregan acá, no en el manager.
export type PropiedadView = 'estado' | 'cobros'

/** Toggle compartido de las vistas de /propiedad. */
export default function PropiedadToggle({ active }: { active: PropiedadView }) {
  const tabs: { view: PropiedadView; href: string; label: string; Icon: typeof Receipt }[] = [
    { view: 'estado', href: '/propiedad',              label: 'Estado', Icon: CircleCheck },
    { view: 'cobros', href: '/propiedad?view=cobros',  label: 'Cobros', Icon: Receipt },
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
          <span>{label}</span>
        </Link>
      ))}
    </div>
  )
}
