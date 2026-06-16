import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CategoryManager from '@/components/CategoryManager'

export const revalidate = 0

export default async function CategoriasPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order')

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-4 lg:max-w-xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-5">Categorías</h1>
      <CategoryManager categories={categories ?? []} userId={user.id} />
    </div>
  )
}
