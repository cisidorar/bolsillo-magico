'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search, X, ShoppingCart, CreditCard } from 'lucide-react'
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
  const initialCat  = searchParams.get('cat')  ?? ''
  const initialView = (searchParams.get('view') ?? 'purchase') as 'purchase' | 'billing'

  const [query, setQuery]   = useState(initialQ)
  const [catId, setCatId]   = useState(initialCat)
  const [view,  setView]    = useState<'purchase' | 'billing'>(initialView)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync state if searchParams change externally (ej: MonthNav navigation)
  useEffect(() => {
    setQuery(searchParams.get('q')   ?? '')
    setCatId(searchParams.get('cat') ?? '')
    setView((searchParams.get('view') ?? 'purchase') as 'purchase' | 'billing')
  }, [searchParams])

  const pushParams = useCallback((q: string, cat: string, v: 'purchase' | 'billing') => {
    const params = new URLSearchParams()
    params.set('month', String(month))
    params.set('year',  String(year))
    if (q)              params.set('q',    q)
    if (cat)            params.set('cat',  cat)
    if (v === 'billing') params.set('view', 'billing')
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }, [router, pathname, month, year])

  function handleSearch(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => pushParams(val, catId, view), 300)
  }

  function handleCat(id: string) {
    const next = catId === id ? '' : id
    setCatId(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    pushParams(query, next, view)
  }

  function handleView(v: 'purchase' | 'billing') {
    setView(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    pushParams(query, catId, v)
  }

  function clearAll() {
    setQuery(''); setCatId(''); setView('purchase')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const params = new URLSearchParams()
    params.set('month', String(month))
    params.set('year',  String(year))
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  const hasFilters = query.length > 0 || catId !== '' || view === 'billing'

  return (
    <div className="space-y-2.5">

      {/* Toggle por compra / por facturación */}
      <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => handleView('purchase')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
            view === 'purchase'
              ? 'bg-white text-gray-800 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          Por compra
        </button>
        <button
          onClick={() => handleView('billing')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
            view === 'billing'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <CreditCard className="w-3.5 h-3.5" />
          Por facturación
        </button>
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Buscar gasto..."
          className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-9 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-brand-400 transition-colors"
        />
        {query && (
          <button
            onClick={() => handleSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Category pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {categories.map(c => {
          const active = catId === c.id
          return (
            <button
              key={c.id}
              onClick={() => handleCat(c.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition-all flex-shrink-0',
                active
                  ? 'border-brand-600 bg-brand-50 text-brand-800'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              )}
              style={active ? { borderColor: c.color, backgroundColor: c.bg_color, color: c.color } : {}}
            >
              {isEmoji(c.icon)
                ? <span className="text-sm leading-none">{c.icon}</span>
                : (() => {
                    const Icon = getCategoryIcon(c.icon)
                    return <Icon className="w-3.5 h-3.5" style={{ color: active ? c.color : '#9CA3AF' }} />
                  })()
              }
              {c.name}
            </button>
          )
        })}

        {hasFilters && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-red-200 bg-red-50 text-red-500 whitespace-nowrap flex-shrink-0 hover:bg-red-100 transition-colors"
          >
            <X className="w-3 h-3" />
            Limpiar
          </button>
        )}
      </div>
    </div>
  )
}
