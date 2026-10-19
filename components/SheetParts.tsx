'use client'

import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBackdropClose } from '@/components/useBackdropClose'

// Piezas compartidas por los sheets de Compartidos, con el mismo lenguaje
// visual que ExpenseSheet ("Nuevo gasto"): fondo oscuro/blanco con
// rounded-3xl, header con título a la izquierda y botón de cerrar redondo,
// campos .sheet-input con ícono, etiquetas text-xs y chips .sheet-chip.

export function SheetShell({
  title, subtitle, onClose, label, children,
}: {
  title:     string
  subtitle?: string
  onClose:   () => void
  label:     string
  children:  ReactNode
}) {
  const backdropClose = useBackdropClose(onClose)
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center bg-black/50"
      {...backdropClose}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="w-full lg:max-w-lg bg-white rounded-t-3xl lg:rounded-3xl overflow-y-auto overscroll-contain" style={{ maxHeight: '92dvh' }}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1 lg:hidden" />
        <div className="flex items-center justify-between px-5 pt-3 pb-3 lg:px-6 border-b border-gray-100">
          <div className="min-w-0 text-left">
            <h2 className="text-base font-bold text-gray-900 truncate">{title}</h2>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Cerrar"
            className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 lg:px-6 pt-4 space-y-4 text-left"
          style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 16px))' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-2">
      <p className="text-xs font-semibold text-gray-500">{children}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}

/** Campo de una línea con ícono, igual al de descripción de ExpenseSheet. */
export function InputRow({
  icon, children, invalid,
}: { icon?: ReactNode; children: ReactNode; invalid?: boolean }) {
  return (
    <div className={cn(
      'sheet-input flex items-center gap-3 border rounded-2xl px-4 py-2.5 transition-colors focus-within:border-brand-400',
      invalid ? 'border-red-300 bg-red-50' : 'bg-gray-50 border-gray-200',
    )}>
      {icon && <span className="text-gray-300 flex-shrink-0 flex">{icon}</span>}
      {children}
    </div>
  )
}

export const inputClass = 'flex-1 min-w-0 text-sm text-gray-800 placeholder-gray-400 bg-transparent outline-none'

export function Chip({
  active, onClick, children, className,
}: { active: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('px-3 py-1.5 rounded-full text-xs border transition-all', active ? 'sheet-chip-active' : 'sheet-chip', className)}>
      {children}
    </button>
  )
}

export function PrimaryButton({
  onClick, disabled, children,
}: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-full py-3 text-white font-semibold rounded-2xl transition-colors disabled:opacity-60 text-base flex items-center justify-center gap-2"
      style={{ backgroundColor: 'var(--primary)' }}>
      {children}
    </button>
  )
}
