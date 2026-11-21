import { redirect } from 'next/navigation'
import { getServerSession, getUserAccess } from '@/lib/supabase/server'
import { loadAdminData } from '@/app/actions/admin'
import AdminPanel from '@/components/AdminPanel'
import LoadErrorNotice from '@/components/LoadErrorNotice'

export const dynamic = 'force-dynamic'

// Acceso por invitación (nov 2026): quien pide acceso en la landing queda en la
// lista de espera; acá se aprueba, se invita y se decide qué módulos ve cada
// cuenta. Solo para admins — el chequeo real está en cada acción del servidor.
export default async function AdminPage() {
  const user = await getServerSession()
  if (!user) redirect('/login')
  const access = await getUserAccess()
  if (!access?.isAdmin) redirect('/inicio')

  const data = await loadAdminData()

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-12">
      <div className="mb-6">
        <h1 className="font-display text-2xl lg:text-3xl font-bold leading-tight" style={{ color: 'var(--ink)' }}>
          Acceso
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
          Quién pidió entrar, quién ya está y qué ve cada persona.
        </p>
      </div>
      {data.ok ? (
        <AdminPanel waitlist={data.waitlist} accounts={data.accounts} cap={data.cap} myId={user.id} />
      ) : (
        <>
          <LoadErrorNotice what="el panel de acceso" />
          <p className="text-xs mt-3" style={{ color: 'var(--ink-3)' }}>{data.error}</p>
        </>
      )}
    </div>
  )
}
