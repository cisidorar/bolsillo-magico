'use client'

import React, { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search, X, ShoppingCart, CreditCard, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { cn, isEmoji } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import type { Category } from '@/types'

interface Props {
  categories: Category[]
  month: number
  year: number
}

export default function HistorialFilters({ categories, month, year }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const initialQ    = searchParams.get('q')    ?? ''
  const initialCats = (searchParams.get('cats') ?? '').split(',').filter(Boolean)
  const initialView = (searchParams.get('view') ?? 'purchase') as 'purchase' | 'billing'

  const [query,   setQuery]   = useState(initialQ)
  const [catIds,  setCatIds]  = useState<string[]>(initialCats)
  const [view,    setView]    = useState<'purchase' | 'billing'>(initialView)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef  = useRef<HTMLDivElement>(null)

  // Sync state if searchParams change externally (e.g., MonthNav navigation)
  useEffect(() => {
    setQuery(searchParams.get('q') ?? '')
    setCatIds((searchParams.get('cats') ?? '').split(',').filter(Boolean))
    setView((searchParams.get('view') ?? 'purchase') as 'purchase' | 'billing')
  }, [searchParams])

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const pushParams = useCallback((q: string, cats: string[], v: 'purchase' | 'billing') => {
    const params = new URLSearchParams()
    params.set('month', String(month))
    params.set('year',  String(year))
    if (q)            params.set('q',    q)
    if (cats.length)  params.set('cats', cats.join(','))
    if (v === 'billing') params.set('view', 'billing')
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }, [router, pathname, month, year])

  function handleSearch(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => pushParams(val, catIds, view), 300)
  }

  function toggleCat(id: string) {
    const next = catIds.includes(id)
      ? catIds.filter(c => c !== id)
      : [...catIds, id]
    setCatIds(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    pushParams(query, next, view)
    // Keep dropdown open to allow adding more
  }

  function removeCat(id: string) {
    const next = catIds.filter(c => c !== id)
    setCatIds(next)
    pushParams(query, next, view)
  }

  function handleView(v: 'purchase' | 'billing') {
    setView(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    pushParams(query, catIds, v)
  }

  function clearAll() {
    setQuery(''); setCatIds([]); setView('purchase')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const params = new URLSearchParams()
    params.set('month', String(month))
    params.set('year',  String(year))
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  const hasFilters = query.length > 0 || catIds.length > 0 || view === 'billing'

  // Category objects for active chips
  const catMap = Object.fromEntries(categories.map(c => [c.id, c]))
  const activeCatObjs = catIds.map(id => catMap[id]).filter(Boolean) as Category[]
  const inactiveCats  = categories.filter(c => !catIds.includes(c.id))

  return (
    <div className="card overflow-visible">
      {/* ── Mobile: stacked layout ───────────────────────────────── */}
      <div className="lg:hidden p-3 space-y-2.5 border-b border-gray-50">
        {/* View toggle — full width */}
        <div className="flex bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => handleView('purchase')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all',
              view === 'purchase' ? 'tab-active text-gray-800 shadow-sm' : 'text-gray-500'
            )}
          >
            <ShoppingCart className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Por compra</span>
          </button>
          <button
            onClick={() => handleView('billing')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all',
              view === 'billing' ? 'tab-active text-indigo-700 shadow-sm' : 'text-gray-500'
            )}
          >
            <CreditCard className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Por facturación</span>
          </button>
        </div>
        {/* Search — full width */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar gasto o comercio..."
            className="w-full bg-gray-50 border border-gray-100 rounded-xl pl-9 pr-9 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-brand-300 transition-colors"
          />
          {query && (
            <button onClick={() => handleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Desktop: single row ──────────────────────────────────── */}
      <div className="hidden lg:flex items-center gap-3 p-4 border-b border-gray-50">
        {/* View toggle */}
        <div className="flex bg-gray-100 rounded-xl p-1 flex-shrink-0">
          <button
            onClick={() => handleView('purchase')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
              view === 'purchase' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <ShoppingCart className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Compra</span>
          </button>
          <button
            onClick={() => handleView('billing')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
              view === 'billing' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <CreditCard className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Facturación</span>
          </button>
        </div>
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar gasto, comercio o categoría..."
            className="w-full bg-gray-50 border border-gray-100 rounded-xl pl-9 pr-9 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-brand-300 focus:bg-white transition-colors"
          />
          {query && (
            <button onClick={() => handleSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Row 2: active chips + Filtros button ─────────────────── */}
      <div className="flex items-center gap-2 px-3 lg:px-4 py-2.5 flex-wrap min-h-[44px]">

        {/* Active category chips */}
        {activeCatObjs.map(cat => {
          const CatIcon = isEmoji(cat.icon) ? null : getCategoryIcon(cat.icon)
          return (
            <button
              key={cat.id}
              onClick={() => removeCat(cat.id)}
              className="cat-badge inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all hover:opacity-80 flex-shrink-0"
              style={{ '--cat-bg': cat.bg_color, '--cat-color': cat.color, borderColor: `${cat.color}40` } as React.CSSProperties}
            >
              {isEmoji(cat.icon)
                ? <span className="text-xs leading-none">{cat.icon}</span>
                : CatIcon ? <CatIcon className="w-3 h-3 flex-shrink-0" /> : null
              }
              {cat.name}
              <X className="w-3 h-3 opacity-60" />
            </button>
          )
        })}

        {/* + Filtros dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(o => !o)}
            className={cn(
              'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all flex-shrink-0',
              inactiveCats.length === 0
                ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-default'
                : dropdownOpen
                  ? 'border-brand-400 bg-brand-50 text-brand-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            )}
            disabled={inactiveCats.length === 0}
          >
            <SlidersHorizontal className="w-3 h-3" />
            {catIds.length === 0 ? '+ Filtros' : '+ Agregar'}
            {inactiveCats.length > 0 && <ChevronDown className={cn('w-3 h-3 transition-transform', dropdownOpen && 'rotate-180')} />}
          </button>

          {dropdownOpen && inactiveCats.length > 0 && (
            <div
              className="absolute left-0 top-full mt-1.5 z-[200] bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 min-w-[180px] max-h-60 overflow-y-auto"
              style={{ boxShadow: '0 8px 32px rgba(0,0,0,.12)' }}
            >
              {inactiveCats.map(cat => {
                const CatIcon = isEmoji(cat.icon) ? null : getCategoryIcon(cat.icon)
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggleCat(cat.id)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div
                      className="cat-icon-bg w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ '--cat-bg': cat.bg_color, '--cat-color': cat.color } as React.CSSProperties}
                    >
                      {isEmoji(cat.icon)
                        ? <span className="text-xs">{cat.icon}</span>
                        : CatIcon ? <CatIcon className="w-3.5 h-3.5" style={{ color: cat.color }} /> : null
                      }
                    </div>
                    {cat.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Clear all */}
        {hasFilters && (
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 hover:text-red-600 transition-colors ml-auto flex-shrink-0"
          >
            <X className="w-3 h-3" />
            Limpiar
          </button>
        )}
      </div>
    </div>
  )
}
