'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, BookOpen, BarChart2, Plus, RefreshCw, Wallet, TrendingUp, Settings } from 'lucide-react'
import { useState } from 'react'
import ExpenseSheet from './ExpenseSheet'
import UserMenu from './UserMenu'

const navItems = [
  { href: '/inicio',      icon: Home,      label: 'Inicio'      },
  { href: '/historial',   icon: BookOpen,  label: 'Historial'   },
  { href: '/analisis',    icon: BarChart2, label: 'Análisis'    },
  { href: '/ingresos',     icon: Wallet,     label: 'Ingresos'     },
  { href: '/inversiones',  icon: TrendingUp, label: 'Inversiones'  },
  { href: '/recurrentes',  icon: RefreshCw,  label: 'Recurrentes'  },
  { href: '/ajustes',      icon: Settings,   label: 'Ajustes'      },
]

interface Props {
  userName:  string
  userEmail: string
  avatarUrl: string | null
}

export default function SideNav({ userName, userEmail, avatarUrl }: Props) {
  const pathname   = usePathname()
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      <aside
        className="hidden lg:flex flex-col fixed top-0 left-0 h-screen w-60 z-40 py-6 px-3"
        style={{
          background:   'var(--surface)',
          borderRight:  '1px solid var(--border)',
          boxShadow:    '2px 0 16px var(--shadow)',
        }}
      >
        {/* ── Logo ───────────────────────────────────────────── */}
        <Link
          href="/inicio"
          className="flex items-center gap-2.5 mb-8 px-2 cursor-pointer hover:opacity-80 transition-opacity"
        >
          {/* Ícono — mismo en light y dark */}
          <img
            src="/bolsillo-magico-icono.svg"
            alt="Bolsillo Mágico"
            width={36} height={36}
            className="flex-shrink-0 rounded-xl"
          />
          {/* Wordmark */}
          <span className="font-display text-[15px] font-semibold leading-tight" style={{ color: 'var(--ink)' }}>
            <span style={{ color: 'var(--ink)' }}>Bolsillo </span>
            <span style={{ color: 'var(--primary)' }}>Mágico</span>
          </span>
        </Link>

        {/* ── Label menú ──────────────────────────────────────── */}
        <p className="text-[10px] font-semibold uppercase tracking-widest px-2 mb-2" style={{ color: 'var(--ink-3)' }}>
          Menú
        </p>

        {/* ── Nav items ──────────────────────────────────────── */}
        <nav className="flex flex-col gap-0.5 flex-1">
          {navItems.map(item => {
            const Icon   = item.icon
            // /ajustes/perfil tiene su propia entrada (el bloque de usuario),
            // así que no debe marcar "Ajustes" como activo también.
            const active = item.href === '/ajustes'
              ? pathname.startsWith('/ajustes') && !pathname.startsWith('/ajustes/perfil')
              : pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-all duration-150 relative"
                style={active ? {
                  background:  'var(--primary-soft)',
                  color:       'var(--primary)',
                  boxShadow:   'inset 3px 0 0 var(--primary)',
                } : {
                  color: 'var(--ink-2)',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)' }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '' }}
              >
                <Icon
                  className="w-[18px] h-[18px] flex-shrink-0"
                  style={{ color: active ? 'var(--primary)' : 'var(--ink-3)' }}
                />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* ── Usuario y configuración ────────────────────────── */}
        <UserMenu name={userName} email={userEmail} avatarUrl={avatarUrl} />

        {/* ── Divider ────────────────────────────────────────── */}
        <div className="mb-3 mt-2" style={{ borderTop: '1px solid var(--border)' }} />

        {/* ── Nuevo gasto ────────────────────────────────────── */}
        <button
          onClick={() => setSheetOpen(true)}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[.98] hover:brightness-110"
          style={{
            background:  'var(--primary)',
            color:       'var(--primary-ink)',
            boxShadow:   '0 8px 18px var(--shadow)',
          }}
        >
          <Plus className="w-4 h-4 flex-shrink-0" strokeWidth={2.5} />
          Nuevo gasto
        </button>
      </aside>

      {sheetOpen && (
        <ExpenseSheet
          isOpen={sheetOpen}
          onClose={() => setSheetOpen(false)}
          fetchData
        />
      )}
    </>
  )
}
