import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileEditor from '@/components/ProfileEditor'
import SecurityCard from '@/components/SecurityCard'
import { User, Shield, type LucideIcon } from 'lucide-react'

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

      {/* Una tarjeta por columna: Perfil (identidad) a la izquierda,
          Seguridad (correo, contraseña, cerrar sesión) a la derecha — antes
          "Perfil" cargaba DOS tarjetas apiladas mientras la columna derecha
          traía una sola tarjeta chica que repetía el correo ya mostrado a
          la izquierda, desbalanceando el grid de dos columnas en desktop. */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-5 lg:space-y-0">

        <div>
          <SectionHeader icon={User} label="Perfil" color="#1B6DD4" />
          <ProfileEditor
            userId={user.id}
            displayName={profile?.display_name ?? null}
            email={user.email ?? ''}
            avatarUrl={profile?.avatar_url ?? null}
          />
        </div>

        <div>
          <SectionHeader icon={Shield} label="Seguridad" color="#2B7CF6" />
          <SecurityCard userId={user.id} email={user.email ?? ''} />
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
