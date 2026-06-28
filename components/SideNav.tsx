'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, BookOpen, BarChart2, Settings, Plus, RefreshCw, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import ExpenseSheet from './ExpenseSheet'

const navItems = [
  { href: '/inicio',      icon: Home,      label: 'Inicio'      },
  { href: '/historial',   icon: BookOpen,  label: 'Historial'   },
  { href: '/analisis',    icon: BarChart2, label: 'Análisis'    },
  { href: '/ingresos',    icon: Wallet,    label: 'Ingresos'    },
  { href: '/recurrentes', icon: RefreshCw, label: 'Recurrentes' },
  { href: '/ajustes',     icon: Settings,  label: 'Ajustes'     },
]

export default function SideNav() {
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
          {/* Ícono "El Bolsillo" */}
          <div
            className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center relative overflow-hidden"
            style={{ background: 'var(--primary)' }}
          >
            {/* Destello dorado 4 puntas */}
            <div
              className="absolute w-3 h-3"
              style={{
                background: 'var(--gold)',
                clipPath: 'polygon(50% 0,61% 39%,100% 50%,61% 61%,50% 100%,39% 61%,0 50%,39% 39%)',
                top: '5px',
                left: '50%',
                transform: 'translateX(-50%)',
              }}
            />
            {/* Bolsillo (medio disco blanco) */}
            <div
              className="absolute"
              style={{
                width: '18px',
                height: '9px',
                bottom: '5px',
                left: '50%',
                transform: 'translateX(-50%)',
                overflow: 'hidden',
                borderRadius: '0 0 9px 9px',
              }}
            >
              <div style={{ width: '18px', height: '18px', background: 'white', borderRadius: '50%', marginTop: '-9px' }} />
            </div>
          </div>
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
            const active = pathname.startsWith(item.href)

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
