import { redirect } from 'next/navigation'
import { createClient, getServerSession } from '@/lib/supabase/server'
import WelcomeProfileForm from '@/components/auth/WelcomeProfileForm'

// Primer paso después de crear la contraseña: cómo te ven los demás. El dashboard
// manda acá a quien aún no completa su perfil (profiles.onboarded_at null).
export const dynamic = 'force-dynamic'

export default async function BienvenidaPage() {
  const user = await getServerSession()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles').select('display_name, onboarded_at').eq('id', user.id).maybeSingle()
  if (profile?.onboarded_at) redirect('/inicio')

  // Todas las cuentas tienen un @usuario; la primera vez se genera acá.
  const { data: username } = await supabase.rpc('ensure_my_username')
  const raw = (profile?.display_name as string | null) ?? ''
  return <WelcomeProfileForm userId={user.id} initialName={raw.includes('@') ? raw.split('@')[0] : raw} initialUsername={(username as string | null) ?? ''} />
}
