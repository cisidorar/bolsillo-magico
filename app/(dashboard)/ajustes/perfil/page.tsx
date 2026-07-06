import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileEditor from '@/components/ProfileEditor'

export const dynamic = 'force-dynamic'

export default async function PerfilPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  return (
    <ProfileEditor
      userId={user.id}
      displayName={profile?.display_name ?? null}
      email={user.email ?? ''}
      avatarUrl={profile?.avatar_url ?? null}
    />
  )
}
