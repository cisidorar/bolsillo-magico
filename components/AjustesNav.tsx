'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const SECTIONS = [
  { href: '/ajustes/perfil',         label: 'Perfil' },
  { href: '/ajustes/preferencias',   label: 'Preferencias' },
  { href: '/ajustes/notificaciones', label: 'Notificaciones' },
  { href: '/ajustes/finanzas',       label: 'Finanzas' },
  { href: '/ajustes/datos',          label: 'Datos' },
  { href: '/ajustes/cuenta',         label: 'Cuenta' },
]

/**
 * Navegación por pestañas entre las vistas de /ajustes (cada sección es
 * ahora una ruta propia en vez de un ancla dentro de una página única).
 */
export default function AjustesNav() {
  const pathname = usePathname()

  return (
    <div className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-none -mx-4 px-4 lg:mx-0 lg:px-0">
      {SECTIONS.map(s => {
        const active = pathname === s.href
        return (
          <Link
            key={s.href}
            href={s.href}
            className="px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all flex-shrink-0"
            style={active
              ? { background: 'var(--primary)', border: '1.5px solid var(--primary)', color: 'var(--primary-ink)' }
              : { background: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--ink-2)' }}
          >
            {s.label}
          </Link>
        )
      })}
    </div>
  )
}
