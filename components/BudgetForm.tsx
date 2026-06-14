'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { formatCLP } from '@/lib/utils'

interface Props {
  userId: string
  month: number
  year: number
  current: number | null
}

export default function BudgetForm({ userId, month, year, current }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [value, setValue] = useState(String(current ?? ''))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  async function save() {
    const amount = parseInt(value.replace(/\D/g, ''))
    if (!amount || amount < 1000) return
    setSaving(true)

    await supabase.from('budgets').upsert(
      { user_id: userId, month, year, amount },
      { onConflict: 'user_id,month,year' }
    )

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  const displayNum = parseInt(value.replace(/\D/g, '')) || 0

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">Límite mensual</label>
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="ej: 1000000"
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-brand-400 transition-colors"
        />
        {displayNum > 0 && (
          <p className="text-xs text-gray-400 mt-1">{formatCLP(displayNum)}</p>
        )}
      </div>
      <button
        onClick={save}
        disabled={saving || !value}
        className="py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-60"
      >
        {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar presupuesto'}
      </button>
    </div>
  )
}
