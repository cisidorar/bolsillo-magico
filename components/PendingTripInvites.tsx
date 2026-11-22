import { createClient } from '@/lib/supabase/server'
import SharedInviteCard from '@/components/SharedInviteCard'
import type { SplitMode } from '@/lib/shared-split'
import { hasTripIncome } from '@/lib/trip-income'

/**
 * Invitaciones a viajes sin responder, arriba de Inicio: quien las recibe las ve al entrar y las
 * acepta o rechaza ahí mismo, sin tener que buscar «Compartidos». No pinta nada si no hay ninguna.
 */
export default async function PendingTripInvites({ userId }: { userId: string }) {
  const supabase = await createClient()
  const { data: mine } = await supabase
    .from('shared_group_members').select('group_id').eq('user_id', userId).eq('status', 'pending')
  const ids = (mine ?? []).map(m => m.group_id as string)
  if (ids.length === 0) return null

  const { data: groups } = await supabase.from('shared_groups').select('id, name, split_mode').in('id', ids)
  if (!groups || groups.length === 0) return null

  const needsIncome = groups.some(g => g.split_mode === 'income') && !(await hasTripIncome(supabase, userId))
  const named = await Promise.all(groups.map(async g => {
    const { data } = await supabase.rpc('shared_inviter_name', { p_group: g.id })
    return { id: g.id as string, name: g.name as string, mode: g.split_mode as SplitMode, inviter: (data as string | null) ?? 'Alguien' }
  }))

  return (
    <div className="px-4 lg:px-8 pt-4 lg:pt-6 space-y-3">
      {named.map(g => <SharedInviteCard key={g.id} groupId={g.id} groupName={g.name} inviter={g.inviter} mode={g.mode} needsIncome={needsIncome} />)}
    </div>
  )
}
