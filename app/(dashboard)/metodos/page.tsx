import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PaymentMethodManager from '@/components/PaymentMethodManager'
import { currentStatementRange, billingPeriod } from '@/lib/utils'
import type { PaymentMethod } from '@/types'

export const revalidate = 0

export default async function MetodosPage() {
  const [user, supabase] = await Promise.all([getServerSession(), createClient()])
  if (!user) redirect('/login')

  const { data: paymentMethods } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order')

  const methods = (paymentMethods ?? []) as PaymentMethod[]

  // Para tarjetas de crédito, calcular el saldo del período actual
  const creditCards = methods.filter(m => m.card_type === 'credit' && m.billing_day)

  const statementTotals: Record<string, { total: number; start: string; end: string }> = {}

  if (creditCards.length > 0) {
    // Fetch expenses de los últimos 2 meses para cubrir cualquier período abierto
    const now = new Date()
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    const fetchStart = `${twoMonthsAgo.getFullYear()}-${String(twoMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`
    const today = now.toISOString().split('T')[0]

    const { data: expenses } = await supabase
      .from('expenses')
      .select('amount, date, payment_method_id')
      .eq('user_id', user.id)
      .gte('date', fetchStart)
      .lte('date', today)

    for (const card of creditCards) {
      const range = currentStatementRange(card.billing_day!)
      const inPeriod = (expenses ?? []).filter(e => {
        if (e.payment_method_id !== card.id) return false
        const bp = billingPeriod(e.date, card.billing_day!)
        return bp.month === range.month && bp.year === range.year
      })
      statementTotals[card.id] = {
        total: inPeriod.reduce((s, e) => s + e.amount, 0),
        start: range.start,
        end: range.end,
      }
    }
  }

  return (
    <div className="px-4 lg:px-8 pt-2 lg:pt-8 pb-4">
      <h1 className="text-xl font-bold text-brand-900 mb-5">Métodos de pago</h1>
      <PaymentMethodManager
        paymentMethods={methods}
        userId={user.id}
        statementTotals={statementTotals}
      />
    </div>
  )
}
