'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, BookOpen, BarChart2, Settings, Plus, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import ExpenseSheet from './ExpenseSheet'
import Image from 'next/image'

const navItems = [
  { href: '/inicio',      icon: Home,      label: 'Inicio'      },
  { href: '/historial',   icon: BookOpen,  label: 'Historial'   },
  { href: '/analisis',    icon: BarChart2, label: 'Análisis'    },
  { href: '/recurrentes', icon: RefreshCw, label: 'Recurrentes' },
  { href: '/ajustes',     icon: Settings,  label: 'Ajustes'     },
]

export default function SideNav() {
  const pathname   = usePathname()
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      <aside
        className="hidden lg:flex flex-col fixed top-0 left-0 h-screen w-60 z-40 bg-white border-r-2 border-blue-100 py-6 px-4"
        style={{ boxShadow: '4px 0 24px rgba(0,0,0,0.08)' }}
      >
        {/* ── Logo ───────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 mb-7 px-1">
          <Image src="/camapana.png" alt="Bolsillo Mágico" width={32} height={32} />
          <span className="text-[15px] font-extrabold text-brand-900 tracking-tight leading-tight">
            Bolsillo Mágico
          </span>
        </div>

        {/* ── Nav items ──────────────────────────────────────── */}
        <nav className="flex flex-col gap-0.5 flex-1">
          {navItems.map(item => {
            const Icon   = item.icon
            const active = pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-semibold transition-all duration-150',
                  active
                    ? 'text-white shadow-md'
                    : 'text-gray-500 hover:bg-brand-50 hover:text-brand-700'
                )}
                style={active
                  ? { background: '#1B6DD4', boxShadow: '0 4px 12px rgba(27,109,212,.30)' }
                  : {}
                }
              >
                <Icon
                  className={cn(
                    'w-[18px] h-[18px] flex-shrink-0 transition-colors',
                    active ? 'text-white' : 'text-gray-400'
                  )}
                />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* ── Divider ────────────────────────────────────────── */}
        <div className="border-t border-gray-100 mb-4" />

        {/* ── Add expense button ──────────────────────────────── */}
        <button
          onClick={() => setSheetOpen(true)}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-white text-sm font-bold transition-all active:scale-[.98] hover:opacity-90"
          style={{ background: '#1B6DD4', boxShadow: '0 6px 20px rgba(27,109,212,.40)' }}
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
