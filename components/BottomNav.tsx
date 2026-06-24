'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, List, Settings, Plus, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import ExpenseSheet from './ExpenseSheet'

const navItems = [
  { href: '/inicio',    icon: Home,      label: 'Inicio'    },
  { href: '/historial', icon: List,      label: 'Historial' },
  null, // FAB
  { href: '/analisis',  icon: BarChart2, label: 'Análisis'  },
  { href: '/ajustes',   icon: Settings,  label: 'Ajustes'   },
]

export default function BottomNav() {
  const pathname = usePathname()
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 glass-nav safe-bottom max-w-lg mx-auto lg:hidden">
        <div className="flex items-center justify-around py-2 px-1">
          {navItems.map((item, i) => {
            if (!item) {
              return (
                <button
                  key="fab"
                  onClick={() => setSheetOpen(true)}
                  aria-label="Agregar gasto"
                  className="w-14 h-14 -mt-7 fab-gradient rounded-full flex items-center justify-center active:scale-95 transition-transform"
                >
                  <Plus className="w-7 h-7 text-white" strokeWidth={2.5} />
                </button>
              )
            }

            const Icon = item.icon
            const active = pathname === item.href

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200',
                  active
                    ? 'text-brand-700'
                    : 'text-stone-400 dark:text-slate-500 hover:text-stone-500'
                )}
              >
                <div className={cn(
                  'p-1.5 rounded-xl transition-all',
                  active ? 'bg-brand-50' : ''
                )}>
                  <Icon className={cn('w-5 h-5', active ? 'text-brand-700' : '')} />
                </div>
                <span className={cn(
                  'text-[10px] font-medium transition-all',
                  active ? 'text-brand-700' : 'text-gray-400 dark:text-slate-600'
                )}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

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
