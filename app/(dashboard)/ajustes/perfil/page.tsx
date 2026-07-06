import React from 'react'
import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileEditor from '@/components/ProfileEditor'
import { Mail, LogOut, User, Shield, type LucideIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PerfilPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  return (
    <div className="px-4 lg:px-8 pt-2 lg:pt-8 pb-10">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-3xl font-semibold leading-tight" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>Perfil y cuenta</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>Tu información personal y datos de acceso.</p>
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-5 lg:space-y-0">

        {/* ── Columna izquierda: Perfil (avatar, nombre, seguridad) ── */}
        <div>
          <SectionHeader icon={User} label="Perfil" color="#1B6DD4" />
          <ProfileEditor
            userId={user.id}
            displayName={profile?.display_name ?? null}
            email={user.email ?? ''}
            avatarUrl={profile?.avatar_url ?? null}
          />
        </div>

        {/* ── Columna derecha: Cuenta (sesión, cerrar sesión) ─────── */}
        <div>
          <SectionHeader icon={Shield} label="Cuenta" color="#2B7CF6" />
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
        </div>

      </div>
    </div>
  )
}

function SectionHeader({ icon: Icon, label, color }: { icon: LucideIcon; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 px-0.5">
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{label}</p>
    </div>
  )
}
