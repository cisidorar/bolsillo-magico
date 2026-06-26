export type Category = {
  id: string
  user_id: string
  name: string
  icon: string
  color: string
  bg_color: string
  is_default: boolean
  sort_order: number
  created_at: string
}

export type CardType = 'debit' | 'credit' | 'cash' | 'digital'

export type PaymentMethod = {
  id: string
  user_id: string
  name: string
  icon: string
  card_type: CardType
  billing_day: number | null
  last_four: string | null
  is_default: boolean
  sort_order: number
  domain: string | null
  admin_fee: number | null
  created_at: string
}

export type Budget = {
  id: string
  user_id: string
  amount: number
  month: number
  year: number
  created_at: string
}

export type CategoryBudget = {
  id: string
  user_id: string
  category_id: string
  amount: number
  created_at: string
}

export type RecurringExpense = {
  id: string
  user_id: string
  name: string
  amount: number
  category_id: string | null
  payment_method_id: string | null
  billing_day: number
  auto_register: boolean
  is_active: boolean
  notes: string | null
  domain: string | null
  total_installments: number | null   // null = indefinido, N = cuotas fijas
  paid_installments: number           // cuántas se han pagado
  created_at: string
  // joins
  category?: Category | null
  payment_method?: PaymentMethod | null
}

export type Expense = {
  id: string
  user_id: string
  amount: number
  category_id: string | null
  payment_method_id: string | null
  recurring_expense_id: string | null
  description: string | null
  date: string
  tags: string[]
  created_at: string
  // joins
  category?: Category
  payment_method?: PaymentMethod
}

export type Profile = {
  id: string
  display_name: string | null
  avatar_url: string | null
  currency: string
  updated_at: string
}

export type ExpenseWithRelations = Expense & {
  category: Category | null
  payment_method: PaymentMethod | null
  recurring_expense?: { id: string; name: string; domain: string | null } | null
}

export type MonthSummary = {
  total: number
  budget: number | null
  count: number
  byCategory: { category: Category; total: number; count: number }[]
}
