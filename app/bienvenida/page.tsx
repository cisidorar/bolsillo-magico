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
  // Si el nombre guardado es solo lo que sale del correo (nadie lo escribió), el campo
  // empieza vacío: así la persona pone su nombre en vez de aceptar «ca_retr0» sin darse cuenta.
  const raw = ((profile?.display_name as string | null) ?? '').trim()
  const fromEmail = (user.email ?? '').split('@')[0].toLowerCase()
  const initialName = !raw || raw.includes('@') || raw.toLowerCase() === fromEmail ? '' : raw
  return <WelcomeProfileForm userId={user.id} initialName={initialName} initialUsername={(username as string | null) ?? ''} />
}
