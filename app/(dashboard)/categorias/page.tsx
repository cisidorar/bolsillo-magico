import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CategoryManager from '@/components/CategoryManager'

export const revalidate = 0

export default async function CategoriasPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const [{ data: categories }, { data: expCats }] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order'),
    // Lightweight: only fetch category_id to build count map
    supabase
      .from('expenses')
      .select('category_id')
      .eq('user_id', user.id)
      .not('category_id', 'is', null),
  ])

  const expenseCountMap = (expCats ?? []).reduce<Record<string, number>>((acc, e) => {
    if (e.category_id) acc[e.category_id] = (acc[e.category_id] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-6">
      <CategoryManager
        categories={categories ?? []}
        userId={user.id}
        expenseCountMap={expenseCountMap}
      />
    </div>
  )
}
