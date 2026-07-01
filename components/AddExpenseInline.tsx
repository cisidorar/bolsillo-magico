'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import ExpenseSheet from '@/components/ExpenseSheet'
import type { Category, PaymentMethod } from '@/types'

interface Props {
  categories: Category[]
  paymentMethods: PaymentMethod[]
}

export default function AddExpenseInline({ categories, paymentMethods }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:opacity-80 active:scale-95"
        style={{ background: 'var(--primary)', boxShadow: '0 3px 10px var(--shadow)' }}
        aria-label="Agregar gasto"
      >
        <Plus className="w-3.5 h-3.5" style={{ color: 'var(--primary-ink)' }} />
      </button>

      {open && (
        <ExpenseSheet
          categories={categories}
          paymentMethods={paymentMethods}
          isOpen={open}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
