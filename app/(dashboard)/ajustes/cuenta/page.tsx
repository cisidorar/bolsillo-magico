import React from 'react'
import { Mail, LogOut } from 'lucide-react'
import { getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function CuentaPage() {
  const user = await getServerSession()
  if (!user) redirect('/login')

  return (
    <div className="card overflow-hidden">
      {/* Email de la sesión */}
      <div className="flex items-center gap-4 px-4 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ '--cat-bg': '#EEF4FF', '--cat-color': '#2B7CF6' } as React.CSSProperties}>
          <Mail className="w-5 h-5" style={{ color: '#2B7CF6' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{user.email}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Sesión iniciada con este correo.</p>
        </div>
      </div>
      {/* Cerrar sesión */}
      <form action="/api/auth/signout" method="post" className="p-3">
        <button
          type="submit"
          className="logout-btn w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-red-500 rounded-2xl border hover:bg-red-50 dark:hover:bg-red-900/10 active:scale-[0.99] transition-all"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </form>
    </div>
  )
}
