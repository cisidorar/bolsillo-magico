'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
import { cn, formatCLP, isEmoji } from '@/lib/utils'
import type { Category, CategoryBudget } from '@/types'

interface Props {
  categories: Category[]
  budgets: CategoryBudget[]        // budgets actuales del usuario
  userId: string
  month: number
  year: number
}

type Row = {
  category: Category
  current: number | null   // amount guardado en DB (null = sin límite)
  draft: string            // valor en el input
  saving: boolean
  saved: boolean           // flash de confirmación
}

function buildRows(categories: Category[], budgets: CategoryBudget[]): Row[] {
  const map = new Map(budgets.map(b => [b.category_id, b.amount]))
  return categories.map(c => ({
    category: c,
    current: map.get(c.id) ?? null,
    draft: map.has(c.id) ? String(map.get(c.id)) : '',
    saving: false,
    saved: false,
  }))
}

export default function CategoryBudgetManager({ categories, budgets, userId, month, year }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>(() => buildRows(categories, budgets))
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  function updateRow(catId: string, patch: Partial<Row>) {
    setRows(prev => prev.map(r => r.category.id === catId ? { ...r, ...patch } : r))
  }

  function flashSaved(catId: string) {
    updateRow(catId, { saved: true })
    clearTimeout(timers.current[catId])
    timers.current[catId] = setTimeout(() => {
      updateRow(catId, { saved: false })
    }, 1500)
  }

  async function syncMonthlyBudget(catId: string, newCurrent: number | null) {
    // Calcula el nuevo total sumando todas las categorías con el valor actualizado
    const newTotal = rows.reduce((s, r) => {
      const val = r.category.id === catId ? (newCurrent ?? 0) : (r.current ?? 0)
      return s + val
    }, 0)

    if (newTotal > 0) {
      await supabase.from('budgets').upsert(
        { user_id: userId, month, year, amount: newTotal },
        { onConflict: 'user_id,month,year' }
      )
    } else {
      await supabase.from('budgets').delete()
        .eq('user_id', userId).eq('month', month).eq('year', year)
    }
  }

  async function save(row: Row) {
    const amt = parseInt(row.draft)
    const catId = row.category.id

    // Limpiar si input vacío o cero
    if (!row.draft.trim() || !amt || amt <= 0) {
      if (row.current !== null) {
        updateRow(catId, { saving: true })
        await supabase.from('category_budgets').delete()
          .eq('user_id', userId).eq('category_id', catId)
        updateRow(catId, { saving: false, current: null, draft: '' })
        await syncMonthlyBudget(catId, null)
        router.refresh()
      }
      return
    }

    // Sin cambio
    if (amt === row.current) return

    updateRow(catId, { saving: true })
    await supabase.from('category_budgets').upsert({
      user_id: userId,
      category_id: catId,
      amount: amt,
    }, { onConflict: 'user_id,category_id' })

    updateRow(catId, { saving: false, current: amt, draft: String(amt) })
    flashSaved(catId)
    await syncMonthlyBudget(catId, amt)
    router.refresh()
  }

  const totalBudgeted = rows.reduce((s, r) => s + (r.current ?? 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-brand-200 divide-y divide-brand-100">
        {rows.map(row => {
          const c = row.category
          return (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              {/* Icono */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                style={{ background: c.bg_color }}
              >
                {isEmoji(c.icon) ? c.icon : '📦'}
              </div>

              {/* Nombre */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                <p className="text-xs text-brand-400">
                  {row.current ? `Límite: ${formatCLP(row.current)}` : 'Sin límite'}
                </p>
              </div>

              {/* Input de monto */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-brand-400 pointer-events-none">$</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={row.draft}
                    onChange={e => updateRow(c.id, { draft: e.target.value })}
                    onBlur={() => save(row)}
                    onKeyDown={e => e.key === 'Enter' && save(row)}
                    placeholder="0"
                    min="0"
                    className="w-28 pl-6 pr-3 py-2 bg-brand-50 border border-brand-200 rounded-xl text-sm text-gray-900 placeholder-brand-300 outline-none focus:border-brand-600 transition-colors text-right"
                  />
                </div>

                {/* Feedback */}
                <div className="w-6 flex items-center justify-center">
                  {row.saving ? (
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-brand-600 rounded-full animate-spin" />
                  ) : row.saved ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : row.current && !row.draft ? (
                    <button
                      onClick={() => { updateRow(c.id, { draft: '' }); save({ ...row, draft: '' }) }}
                      className="text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Total presupuestado */}
      {totalBudgeted > 0 && (
        <div className="bg-white rounded-xl border border-brand-200 px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-bold text-brand-600">Total presupuestado</span>
          <span className="text-sm font-bold text-brand-900">{formatCLP(totalBudgeted)}</span>
        </div>
      )}

      <p className="text-xs text-center text-brand-400 px-2">
        Los cambios se guardan al salir del campo · deja vacío para quitar el límite
      </p>
    </div>
  )
}
