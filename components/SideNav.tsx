'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, List, BarChart2, Settings, Plus, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import ExpenseSheet from './ExpenseSheet'
import Image from 'next/image'

const navItems = [
  { href: '/inicio',      icon: Home,       label: 'Inicio'      },
  { href: '/historial',   icon: List,       label: 'Historial'   },
  { href: '/analisis',    icon: BarChart2,  label: 'Análisis'    },
  { href: '/recurrentes', icon: RefreshCw,  label: 'Recurrentes' },
  { href: '/ajustes',     icon: Settings,   label: 'Ajustes'     },
]

export default function SideNav() {
  const pathname = usePathname()
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      <aside className="hidden lg:flex flex-col fixed top-0 left-0 h-screen w-60 z-40 border-r border-gray-100 py-6 px-3" style={{ backgroundColor: '#EEF4FF' }}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8 px-2">
          <Image src="/camapana.png" alt="Bolsillo Mágico" width={30} height={30} />
          <span className="text-sm font-extrabold text-brand-900 leading-tight">Bolsillo Mágico</span>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-0.5 flex-1">
          {navItems.map(item => {
            const Icon = item.icon
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
                  active
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-gray-500 hover:bg-white/60 hover:text-gray-700'
                )}
              >
                <Icon
                  className={cn('w-4 h-4 flex-shrink-0', active ? 'text-brand-600' : 'text-gray-400')}
                />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Add expense button */}
        <button
          onClick={() => setSheetOpen(true)}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-white text-sm font-bold transition-all active:scale-95 fab-gradient"
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
