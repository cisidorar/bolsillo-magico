'use client'

import Link from 'next/link'
import {
  X, ChevronRight, Wallet, TrendingUp, RefreshCw, Target, Tag, CreditCard, Settings,
  type LucideIcon,
} from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
}

interface Row {
  href: string
  icon: LucideIcon
  color: string
  bg: string
  title: string
  subtitle: string
}

// Las tres primeras son las que en mobile solo eran alcanzables desde Ajustes
// (2-3 taps) — acá quedan a un tap desde cualquier pantalla.
const financeRows: Row[] = [
  { href: '/ingresos',    icon: Wallet,     color: '#1FBE8D', bg: '#E6FAF3', title: 'Ingresos',    subtitle: 'Cuánto ganas cada mes' },
  { href: '/inversiones', icon: TrendingUp, color: '#2B7CF6', bg: '#EEF4FF', title: 'Inversiones', subtitle: 'Acciones, depósitos y ahorro' },
  { href: '/recurrentes', icon: RefreshCw,  color: '#0D9488', bg: '#F0FDFA', title: 'Recurrentes', subtitle: 'Suscripciones y cobros fijos' },
]

const otherRows: Row[] = [
  { href: '/presupuesto', icon: Target,     color: '#2B7CF6', bg: '#EEF4FF', title: 'Límite mensual', subtitle: 'Tu presupuesto del mes' },
  { href: '/categorias',  icon: Tag,        color: '#7C3AED', bg: '#F5F3FF', title: 'Categorías',     subtitle: 'Organiza tus gastos' },
  { href: '/metodos',     icon: CreditCard, color: '#16A34A', bg: '#F0FDF4', title: 'Métodos de pago', subtitle: 'Cuentas y tarjetas' },
]

function SheetRow({ row, onClose }: { row: Row; onClose: () => void }) {
  const Icon = row.icon
  return (
    <Link
      href={row.href}
      onClick={onClose}
      className="flex items-center gap-4 px-4 py-3.5 transition-colors active:bg-black/5"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: row.bg }}
      >
        <Icon className="w-5 h-5" style={{ color: row.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{row.title}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{row.subtitle}</p>
      </div>
      <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
    </Link>
  )
}

export default function MoreSheet({ isOpen, onClose }: Props) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 lg:hidden"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Más opciones"
    >
      <div
        className="w-full rounded-t-3xl overflow-y-auto"
        style={{ maxHeight: '85dvh', background: 'var(--surface)', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 16px))' }}
      >
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-1" />

        <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Más</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-11 h-11 flex items-center justify-center rounded-full"
            style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-1 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest px-4 mb-1" style={{ color: 'var(--ink-3)' }}>
            Finanzas
          </p>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {financeRows.map(r => <SheetRow key={r.href} row={r} onClose={onClose} />)}
          </div>

          <p className="text-[10px] font-semibold uppercase tracking-widest px-4 mt-4 mb-1" style={{ color: 'var(--ink-3)' }}>
            Configuración
          </p>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {otherRows.map(r => <SheetRow key={r.href} row={r} onClose={onClose} />)}
            <Link
              href="/ajustes"
              onClick={onClose}
              className="flex items-center gap-4 px-4 py-3.5 transition-colors active:bg-black/5"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)' }}>
                <Settings className="w-5 h-5" style={{ color: 'var(--ink-2)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Ajustes</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Perfil, notificaciones y datos</p>
              </div>
              <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
