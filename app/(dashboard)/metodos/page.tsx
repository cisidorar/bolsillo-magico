import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PaymentMethodManager from '@/components/PaymentMethodManager'

export const revalidate = 0

export default async function MetodosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: paymentMethods } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order')

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-xl font-bold text-brand-900 mb-5">Métodos de pago</h1>
      <PaymentMethodManager paymentMethods={paymentMethods ?? []} userId={user.id} />
    </div>
  )
}
