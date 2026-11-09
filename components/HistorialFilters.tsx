'use client'

import React, { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search, X, ShoppingCart, CreditCard, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { cn, isEmoji } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import type { Category } from '@/types'
import InfoTap from './InfoTap'

const VIEW_EXPLANATION = '"Por compra" agrupa el gasto en el mes en que lo hiciste. "Por facturación" lo agrupa en el mes del estado de cuenta de tu tarjeta de crédito.'

interface Props {
  categories: Category[]
  month: number
  year: number
  defaultView?: 'purchase' | 'billing'
}

const inputStyle = {
  background: 'var(--surface-2)', color: 'var(--ink)', border: '1.5px solid var(--border)',
  transition: 'border-color 150ms, box-shadow 150ms',
} as const
function focusOn(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'var(--primary)'
  e.currentTarget.style.boxShadow = '0 0 0 3px var(--primary-soft)'
}
function focusOff(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'var(--border)'
  e.currentTarget.style.boxShadow = 'none'
}
const filterBtnStyle = (active: boolean) => active
  ? { borderColor: 'var(--primary)', background: 'var(--primary-soft)', color: 'var(--primary)' }
  : { borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--ink-2)' }

export default function HistorialFilters({ categories, month, year, defaultView = 'purchase' }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const initialQ    = searchParams.get('q')    ?? ''
  const initialCats = (searchParams.get('cats') ?? '').split(',').filter(Boolean)
  const initialView = (searchParams.get('view') ?? defaultView) as 'purchase' | 'billing'

  const [query,   setQuery]   = useState(initialQ)
  const [catIds,  setCatIds]  = useState<string[]>(initialCats)
  const [view,    setView]    = useState<'purchase' | 'billing'>(initialView)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const debounceRef        = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mobileDropdownRef  = useRef<HTMLDivElement>(null)
  const desktopDropdownRef = useRef<HTMLDivElement>(null)

  // Sync state if searchParams change externally (e.g., MonthNav navigation)
  useEffect(() => {
    setQuery(searchParams.get('q') ?? '')
    setCatIds((searchParams.get('cats') ?? '').split(',').filter(Boolean))
    setView((searchParams.get('view') ?? defaultView) as 'purchase' | 'billing')
  }, [searchParams])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  // Close dropdown on outside click (handles both mobile and desktop refs)
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      const t = e.target as Node
      const inMobile  = mobileDropdownRef.current?.contains(t)
      const inDesktop = desktopDropdownRef.current?.contains(t)
      if (!inMobile && !inDesktop) setDropdownOpen(false)
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
    if (v !== defaultView) params.set('view', v)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }, [router, pathname, month, year, defaultView])

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
  }

  function handleView(v: 'purchase' | 'billing') {
    setView(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (v === 'billing') {
      // Al cambiar a billing, omitir month/year para que el server
      // detecte el período de estado ABIERTO automáticamente
      const params = new URLSearchParams()
      if (defaultView !== 'billing') params.set('view', 'billing')
      if (query) params.set('q', query)
      if (catIds.length) params.set('cats', catIds.join(','))
      startTransition(() => router.push(`${pathname}?${params.toString()}`))
    } else {
      pushParams(query, catIds, v)
    }
  }

  function clearAll() {
    setQuery(''); setCatIds([])
    if (debounceRef.current) clearTimeout(debounceRef.current)
    pushParams('', [], view)
  }

  const hasFilters = query.length > 0 || catIds.length > 0 || view !== defaultView
  const hasCatOrQuery = query.length > 0 || catIds.length > 0
  const catMap = Object.fromEntries(categories.map(c => [c.id, c]))

  return (
    <div className="card overflow-visible">
      {/* ── Mobile layout ─────────────────────────────────── */}
      <div className="lg:hidden p-3 space-y-2">
        {/* View toggle */}
        <div className="flex items-center gap-1.5">
        <div className="view-toggle-wrap flex rounded-xl p-1 flex-1">
          <button
            onClick={() => handleView('purchase')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
              view === 'purchase' ? 'view-toggle-active-purchase' : 'view-toggle-btn'
            )}
          >
            <ShoppingCart className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Por compra</span>
          </button>
          <button
            onClick={() => handleView('billing')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
              view === 'billing' ? 'view-toggle-active-billing' : 'view-toggle-btn'
            )}
          >
            <CreditCard className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Por facturación</span>
          </button>
        </div>
        <InfoTap explanation={VIEW_EXPLANATION} />
        </div>
        {/* Search + filter button */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--ink-3)' }} />
            <input
              type="text"
              value={query}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Buscar gasto o comercio..."
              aria-label="Buscar gasto"
              style={inputStyle} onFocus={focusOn} onBlur={focusOff}
              className="w-full rounded-xl pl-9 pr-9 py-2.5 text-sm outline-none placeholder:text-[var(--ink-3)]"
            />
            {query && (
              <button onClick={() => handleSearch('')} aria-label="Borrar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-3)' }}>
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="relative flex-shrink-0" ref={mobileDropdownRef}>
            <button
              onClick={() => setDropdownOpen(o => !o)}
              aria-label="Filtrar por categoría"
              aria-expanded={dropdownOpen}
              className="relative flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all"
              style={filterBtnStyle(catIds.length > 0)}
            >
              <SlidersHorizontal className="w-4 h-4" />
              {catIds.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center"
                  style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
                  {catIds.length}
                </span>
              )}
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-[200] rounded-2xl border py-1.5 min-w-[200px] max-h-60 overflow-y-auto"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 8px 18px var(--shadow)' }}>
                {categories.map(cat => {
                  const CatIcon = isEmoji(cat.icon) ? null : getCategoryIcon(cat.icon)
                  const active  = catIds.includes(cat.id)
                  return (
                    <button key={cat.id} onClick={() => toggleCat(cat.id)}
                      aria-pressed={active}
                      style={active ? { background: 'var(--surface-2)' } : undefined}
                      className="w-full flex items-center gap-2.5 px-3.5 min-h-[44px] text-sm font-medium transition-colors text-left hover:bg-[var(--surface-2)]">
                      <div className="cat-icon-bg w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ '--cat-bg': cat.bg_color, '--cat-color': cat.color } as React.CSSProperties}>
                        {isEmoji(cat.icon)
                          ? <span className="text-xs">{cat.icon}</span>
                          : CatIcon ? <CatIcon className="w-3.5 h-3.5" style={{ color: cat.color }} /> : null}
                      </div>
                      <span className="flex-1" style={{ color: 'var(--ink)' }}>{cat.name}</span>
                      {active && <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: cat.color }} />}
                    </button>
                  )
                })}
                {hasCatOrQuery && (
                  <div className="border-t mt-1 pt-1 px-3.5 pb-1" style={{ borderColor: 'var(--border)' }}>
                    <button onClick={() => { clearAll(); setDropdownOpen(false) }}
                      className="text-xs font-semibold hover:opacity-70 transition-opacity py-2.5" style={{ color: 'var(--coral-ink)' }}>
                      Limpiar filtros
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Desktop: single row ──────────────────────────────────── */}
      <div className="hidden lg:flex items-center gap-3 px-3 py-2.5">
        {/* View toggle */}
        <div className="view-toggle-wrap flex rounded-xl p-0.5 flex-shrink-0">
          <button
            onClick={() => handleView('purchase')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
              view === 'purchase' ? 'view-toggle-active-purchase' : 'view-toggle-btn'
            )}
          >
            <ShoppingCart className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Compra</span>
          </button>
          <button
            onClick={() => handleView('billing')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
              view === 'billing' ? 'view-toggle-active-billing' : 'view-toggle-btn'
            )}
          >
            <CreditCard className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Facturación</span>
          </button>
        </div>
        <InfoTap explanation={VIEW_EXPLANATION} />

        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--ink-3)' }} />
          <input
            type="text"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar gasto, comercio o categoría..."
            aria-label="Buscar gasto"
            style={inputStyle} onFocus={focusOn} onBlur={focusOff}
            className="w-full rounded-xl pl-9 pr-9 py-2.5 text-sm outline-none placeholder:text-[var(--ink-3)]"
          />
          {query && (
            <button onClick={() => handleSearch('')} aria-label="Borrar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-70" style={{ color: 'var(--ink-3)' }}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter button + dropdown */}
        <div className="relative flex-shrink-0" ref={desktopDropdownRef}>
          <button
            onClick={() => setDropdownOpen(o => !o)}
            aria-expanded={dropdownOpen}
            className="relative flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-sm font-semibold transition-all whitespace-nowrap"
            style={filterBtnStyle(catIds.length > 0)}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filtros</span>
            {catIds.length > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold"
                style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
                {catIds.length}
              </span>
            )}
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', dropdownOpen && 'rotate-180')} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1.5 z-[200] rounded-2xl border py-1.5 min-w-[200px] max-h-72 overflow-y-auto"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 8px 18px var(--shadow)' }}>
              {categories.map(cat => {
                const CatIcon = isEmoji(cat.icon) ? null : getCategoryIcon(cat.icon)
                const active  = catIds.includes(cat.id)
                return (
                  <button key={cat.id} onClick={() => toggleCat(cat.id)}
                    aria-pressed={active}
                    style={active ? { background: 'var(--surface-2)' } : undefined}
                    className="w-full flex items-center gap-2.5 px-3.5 min-h-[44px] text-sm font-medium transition-colors text-left hover:bg-[var(--surface-2)]">
                    <div className="cat-icon-bg w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ '--cat-bg': cat.bg_color, '--cat-color': cat.color } as React.CSSProperties}>
                      {isEmoji(cat.icon)
                        ? <span className="text-xs">{cat.icon}</span>
                        : CatIcon ? <CatIcon className="w-3.5 h-3.5" style={{ color: cat.color }} /> : null}
                    </div>
                    <span className="flex-1" style={{ color: 'var(--ink)' }}>{cat.name}</span>
                    {active && <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: cat.color }} />}
                  </button>
                )
              })}
              {hasFilters && (
                <div className="border-t mt-1 pt-1 px-3.5 pb-1" style={{ borderColor: 'var(--border)' }}>
                  <button onClick={() => { clearAll(); setDropdownOpen(false) }}
                    className="text-xs font-semibold hover:opacity-70 transition-opacity py-2.5" style={{ color: 'var(--coral-ink)' }}>
                    Limpiar filtros
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Clear search shortcut */}
        {hasFilters && !dropdownOpen && (
          <button onClick={clearAll}
            aria-label="Limpiar filtros" className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold hover:opacity-70 transition-opacity" style={{ color: 'var(--coral-ink)' }}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
