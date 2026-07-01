'use client'

import { useState } from 'react'
import ExpenseSheet from '@/components/ExpenseSheet'
import type { Category, PaymentMethod } from '@/types'

interface Props {
  categories: Category[]
  paymentMethods: PaymentMethod[]
}

export default function EmptyStateCTA({ categories, paymentMethods }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 text-xs font-bold rounded-xl transition-all hover:opacity-90 active:scale-[.97]"
        style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 4px 14px var(--shadow)' }}
      >
        Registrar primer gasto
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
