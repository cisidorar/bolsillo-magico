'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  name:      string
  email:     string
  avatarUrl: string | null
}

/**
 * Bloque de usuario al fondo del SideNav. Enlace directo a la vista
 * combinada "Perfil y cuenta" (/ajustes/perfil) — sin popover intermedio.
 * El botón "Ajustes" del menú principal cubre el resto de las preferencias.
 */
export default function UserMenu({ name, email, avatarUrl }: Props) {
  const pathname = usePathname()
  const active = pathname.startsWith('/ajustes/perfil')
  const initial = (name || email || '?').charAt(0).toUpperCase()

  return (
    <Link
      href="/ajustes/perfil"
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-all duration-150"
      style={active
        ? { background: 'var(--primary-soft)', color: 'var(--primary)' }
        : { color: 'var(--ink-2)' }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)' }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '' }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name} width={28} height={28}
          className="rounded-full flex-shrink-0 object-cover" style={{ width: 28, height: 28 }} />
      ) : (
        <div className="rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white"
          style={{ width: 28, height: 28, background: 'var(--primary)', fontSize: 12 }}>
          {initial}
        </div>
      )}
      <span className="flex-1 text-left truncate" style={{ color: active ? 'var(--primary)' : 'var(--ink)' }}>{name}</span>
    </Link>
  )
}
