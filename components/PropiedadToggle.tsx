import Link from 'next/link'
import { CircleCheck, Receipt, Info } from 'lucide-react'

// P1 (PLAN_PROPIEDAD): por ahora tres vistas.
// sep 2026 (Cas: "quiero agregar en el toggle información, para ahí tener
// información detallada sobre la propiedad y el arrendatario en vez de que
// estén en el estado"): Estado dejó de cargar también los datos de
// referencia (contrato, arrendatario, ficha de la propiedad) — esos ahora
// viven en su propia pestaña, Estado queda solo con lo operativo del mes.
export type PropiedadView = 'estado' | 'cobros' | 'info'

/**
 * Toggle compartido de las vistas de /propiedad.
 *
 * `propId` viaja en el href porque la propiedad activa vive en la URL: sin
 * esto, cambiar de vista te devolvía a la primera propiedad.
 */
export default function PropiedadToggle({
  active, propId,
}: {
  active: PropiedadView
  propId?: string
}) {
  const href = (view: PropiedadView) => {
    const params = new URLSearchParams()
    if (propId) params.set('prop', propId)
    if (view !== 'estado') params.set('view', view)
    const qs = params.toString()
    return qs ? `/propiedad?${qs}` : '/propiedad'
  }

  const tabs: { view: PropiedadView; label: string; Icon: typeof Receipt }[] = [
    { view: 'estado', label: 'Estado', Icon: CircleCheck },
    { view: 'cobros', label: 'Cobros', Icon: Receipt },
    { view: 'info',   label: 'Información', Icon: Info },
  ]

  return (
    <div className="view-toggle-wrap flex items-center gap-1 rounded-xl p-1">
      {tabs.map(({ view, label, Icon }) => (
        <Link
          key={view}
          href={href(view)}
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
