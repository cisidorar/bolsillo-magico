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
    <div
      className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-none -mx-4 px-4 lg:mx-0 lg:px-0 pb-4 border-b flex-wrap"
      style={{ borderColor: 'var(--border)' }}
    >
      {SECTIONS.map(s => {
        const active = pathname === s.href
        return (
          <Link
            key={s.href}
            href={s.href}
            className={`px-4 py-[9px] rounded-full text-xs font-bold whitespace-nowrap transition-colors flex-shrink-0 ${
              active ? '' : 'hover:bg-[var(--surface)] hover:!text-[var(--ink)]'
            }`}
            style={active
              ? { background: 'var(--primary)', color: 'var(--primary-ink)' }
              : { background: 'transparent', color: 'var(--ink-2)' }}
          >
            {s.label}
          </Link>
        )
      })}
    </div>
  )
}
