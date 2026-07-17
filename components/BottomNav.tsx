'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, List, LayoutGrid, Plus, BarChart2 } from 'lucide-react'
import { useState } from 'react'
import ExpenseSheet from './ExpenseSheet'
import MoreSheet from './MoreSheet'

const navItems = [
  { href: '/inicio',    icon: Home,      label: 'Inicio'    },
  { href: '/historial', icon: List,      label: 'Historial' },
  null, // FAB
  { href: '/analisis',  icon: BarChart2, label: 'Análisis'  },
  // "Más" no navega directo — abre un sheet con Ingresos, Inversiones,
  // Recurrentes, Presupuesto, Categorías, Métodos y Ajustes. Antes esas
  // secciones solo eran alcanzables entrando primero a Ajustes.
  { href: '/ajustes',   icon: LayoutGrid, label: 'Más', isMore: true },
]

// Rutas que conceptualmente cuelgan de una pestaña del BottomNav pero viven
// fuera de su prefijo (ej. /categorias no empieza con /ajustes). Se resuelven
// en orden: la primera coincidencia de prefijo gana.
const ROUTE_TAB_MAP: { prefix: string; tab: string }[] = [
  { prefix: '/ajustes',      tab: '/ajustes'   },
  { prefix: '/categorias',   tab: '/ajustes'   },
  { prefix: '/metodos',      tab: '/ajustes'   },
  { prefix: '/presupuesto',  tab: '/ajustes'   },
  { prefix: '/ingresos',     tab: '/ajustes'   },
  { prefix: '/inversiones',  tab: '/ajustes'   },
  { prefix: '/recurrentes',  tab: '/ajustes'   },
  { prefix: '/cuenta',       tab: '/historial' },
  { prefix: '/analisis',     tab: '/analisis'  },
  { prefix: '/historial',    tab: '/historial' },
  { prefix: '/inicio',       tab: '/inicio'    },
]

function activeTabFor(pathname: string): string | null {
  const match = ROUTE_TAB_MAP.find(r => pathname.startsWith(r.prefix))
  return match?.tab ?? null
}

export default function BottomNav() {
  const pathname = usePathname()
  const activeTab = activeTabFor(pathname)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 glass-nav safe-bottom lg:hidden">
        <div className="flex items-center justify-around py-2 px-1 max-w-lg mx-auto">
          {navItems.map((item, i) => {
            if (!item) {
              return (
                <button
                  key="fab"
                  onClick={() => setSheetOpen(true)}
                  aria-label="Agregar gasto"
                  className="w-14 h-14 -mt-7 fab-gradient rounded-full flex items-center justify-center active:scale-95 transition-transform"
                >
                  <Plus className="w-7 h-7" style={{ color: 'var(--primary-ink)' }} strokeWidth={2.5} />
                </button>
              )
            }

            const Icon   = item.icon
            const active = activeTab === item.href

            const content = (
              <>
                <div
                  className="p-1.5 rounded-xl transition-all"
                  style={active ? { background: 'var(--primary-soft)' } : {}}
                >
                  <Icon
                    className="w-5 h-5"
                    style={{ color: active ? 'var(--primary)' : 'var(--ink-3)' }}
                  />
                </div>
                <span
                  className="text-[10px] font-semibold transition-all"
                  style={{ color: active ? 'var(--primary)' : 'var(--ink-3)' }}
                >
                  {item.label}
                </span>
              </>
            )

            if (item.isMore) {
              return (
                <button
                  key={item.href}
                  onClick={() => setMoreOpen(true)}
                  aria-current={active ? 'page' : undefined}
                  aria-haspopup="dialog"
                  className="flex flex-col items-center justify-center gap-0.5 px-3 rounded-xl transition-all duration-200"
                  style={{ minWidth: 44, minHeight: 44 }}
                >
                  {content}
                </button>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="flex flex-col items-center justify-center gap-0.5 px-3 rounded-xl transition-all duration-200"
                style={{ minWidth: 44, minHeight: 44 }}
              >
                {content}
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

      <MoreSheet isOpen={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  )
}
