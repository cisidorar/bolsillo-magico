'use client'

import React, { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Check, RefreshCw, AlertTriangle } from 'lucide-react'
import { formatCLP, isEmoji } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import type { Category, CategoryBudget } from '@/types'

interface Props {
  categories: Category[]
  budgets: CategoryBudget[]
  recurringByCategory: Record<string, number>
  userId: string
  month: number
  year: number
}

type Row = {
  category: Category
  current: number | null
  draft: string
  saving: boolean
  saved: boolean
}

function fmtDraft(n: number): string {
  return n.toLocaleString('es-CL')
}

function parseDraft(s: string): number {
  return parseInt(s.replace(/\./g, '').replace(/,/g, '')) || 0
}

function formatInput(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return parseInt(digits).toLocaleString('es-CL')
}

function buildRows(categories: Category[], budgets: CategoryBudget[]): Row[] {
  const map = new Map(budgets.map(b => [b.category_id, b.amount]))
  return categories.map(c => ({
    category: c,
    current: map.get(c.id) ?? null,
    draft: map.has(c.id) ? fmtDraft(map.get(c.id)!) : '',
    saving: false,
    saved: false,
  }))
}

export default function CategoryBudgetManager({ categories, budgets, recurringByCategory, userId, month, year }: Props) {
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
    timers.current[catId] = setTimeout(() => updateRow(catId, { saved: false }), 1500)
  }

  async function syncMonthlyBudget(catId: string, newCurrent: number | null) {
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
    const amt = parseDraft(row.draft)
    const catId = row.category.id

    if (!row.draft.trim() || amt <= 0) {
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

    if (amt === row.current) return

    updateRow(catId, { saving: true })
    await supabase.from('category_budgets').upsert(
      { user_id: userId, category_id: catId, amount: amt },
      { onConflict: 'user_id,category_id' }
    )
    updateRow(catId, { saving: false, current: amt, draft: fmtDraft(amt) })
    flashSaved(catId)
    await syncMonthlyBudget(catId, amt)
    router.refresh()
  }

  const totalBudgeted = rows.reduce((s, r) => s + (r.current ?? 0), 0)
  const withLimit = rows.filter(r => r.current !== null && r.current > 0).length

  return (
    <div className="flex flex-col gap-3">

      {/* Category rows */}
      <div className="card overflow-hidden !rounded-2xl divide-y divide-gray-100">
        {rows.map(row => {
          const c = row.category
          const CatIcon = isEmoji(c.icon) ? null : getCategoryIcon(c.icon)
          const hasBudget = row.current !== null && row.current > 0
          const recurringAmt = recurringByCategory[c.id] ?? 0
          const underBudget = hasBudget && recurringAmt > 0 && row.current! < recurringAmt

          return (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3.5 relative">

              {/* Left accent stripe when budget is set */}
              {hasBudget && (
                <div
                  className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full"
                  style={{ background: c.color }}
                />
              )}

              {/* Category icon */}
              <div
                className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                style={{ '--cat-bg': c.bg_color, '--cat-color': c.color } as React.CSSProperties}
              >
                {isEmoji(c.icon)
                  ? <span className="leading-none">{c.icon}</span>
                  : CatIcon
                    ? <CatIcon className="w-5 h-5" style={{ color: c.color }} />
                    : <span className="leading-none text-sm">{c.name[0]}</span>
                }
              </div>

              {/* Name + status */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {hasBudget ? (
                    <span
                      className="cat-badge inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{ '--cat-bg': c.bg_color, '--cat-color': c.color } as React.CSSProperties}
                    >
                      {formatCLP(row.current!)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-400 font-medium">Sin límite</span>
                  )}
                  {recurringAmt > 0 && (
                    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      underBudget ? 'recurring-chip-warn' : 'recurring-chip'
                    }`}>
                      {underBudget
                        ? <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
                        : <RefreshCw className="w-2.5 h-2.5 flex-shrink-0" />
                      }
                      {formatCLP(recurringAmt)}
                    </span>
                  )}
                </div>
              </div>

              {/* Amount input */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 pointer-events-none select-none">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={row.draft}
                    onChange={e => updateRow(c.id, { draft: formatInput(e.target.value) })}
                    onBlur={() => save(row)}
                    onKeyDown={e => e.key === 'Enter' && save(row)}
                    placeholder="0"
                    className="sheet-input w-32 pl-7 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 placeholder-gray-400 outline-none focus:border-brand-600 transition-colors text-right tabular-nums"
                  />
                </div>

                {/* Feedback */}
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  {row.saving ? (
                    <div className="w-4 h-4 border-2 border-gray-200 border-t-brand-600 rounded-full animate-spin" />
                  ) : row.saved ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary footer */}
      {totalBudgeted > 0 && (
        <div className="card !rounded-2xl px-4 py-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-sm font-bold text-gray-700">Total presupuestado</span>
            <span className="text-sm font-extrabold text-brand-900 tabular-nums">{formatCLP(totalBudgeted)}</span>
          </div>
          {/* Mini coverage bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-gray-400">{withLimit} de {rows.length} categorías</span>
              <span className="text-[11px] font-semibold text-gray-500">{Math.round(withLimit / rows.length * 100)}%</span>
            </div>
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.round(withLimit / rows.length * 100)}%`, background: 'var(--primary)' }}
              />
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-center text-gray-400 px-2">
        Guarda al salir del campo · deja vacío para quitar el límite
      </p>
    </div>
  )
}
