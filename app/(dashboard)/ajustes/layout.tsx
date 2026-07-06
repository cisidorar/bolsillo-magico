import React from 'react'
import AjustesNav from '@/components/AjustesNav'

export default function AjustesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 lg:px-8 pt-2 lg:pt-8 pb-10">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="mb-4">
        <h1 className="text-3xl font-semibold leading-tight" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>Ajustes</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>Administra tu cuenta, finanzas y preferencias.</p>
      </div>

      {/* ── Navegación entre vistas ──────────────────────────────── */}
      <AjustesNav />

      {children}
    </div>
  )
}
