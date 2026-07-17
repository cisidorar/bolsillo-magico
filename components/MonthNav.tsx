'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthName } from '@/lib/utils'

interface Props {
  month: number
  year: number
  basePath: string
  extraParams?: Record<string, string>
}

export default function MonthNav({ month, year, basePath, extraParams }: Props) {
  const router = useRouter()

  function navigate(delta: number) {
    let m = month + delta, y = year
    if (m < 1)  { m = 12; y-- }
    if (m > 12) { m = 1;  y++ }
    const params = new URLSearchParams({ month: String(m), year: String(y), ...extraParams })
    router.push(`${basePath}?${params.toString()}`)
  }

  function goToCurrent() {
    const now = new Date()
    const params = new URLSearchParams({
      month: String(now.getMonth() + 1),
      year:  String(now.getFullYear()),
      ...extraParams,
    })
    router.push(`${basePath}?${params.toString()}`)
  }

  const now = new Date()
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()

  return (
    <div className="flex items-center gap-0.5 bg-white dark:bg-[#1a2744] border border-gray-200 dark:border-[#2d4f7a] rounded-xl shadow-sm dark:shadow-none p-0.5">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center justify-center rounded-lg text-brand-600 dark:text-blue-300 hover:bg-brand-50 dark:hover:bg-[#0d1b2e] transition-colors"
        style={{ minWidth: 40, minHeight: 40 }}
        aria-label="Mes anterior"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <button
        onClick={!isCurrentMonth ? goToCurrent : undefined}
        disabled={isCurrentMonth}
        title={!isCurrentMonth ? 'Ir al mes actual' : undefined}
        className="text-xs font-bold text-brand-700 dark:text-blue-300 min-w-[96px] text-center capitalize px-1 rounded-lg transition-colors disabled:cursor-default hover:bg-brand-50 dark:hover:bg-[#0d1b2e] disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
        style={{ minHeight: 40 }}
      >
        {monthName(month)} {year !== now.getFullYear() ? year : ''}
        {isCurrentMonth && (
          <span className="block w-1 h-1 rounded-full mx-auto mt-0.5" style={{ backgroundColor: 'var(--primary)' }} />
        )}
      </button>

      <button
        onClick={() => navigate(1)}
        disabled={isCurrentMonth}
        className="flex items-center justify-center rounded-lg text-brand-600 dark:text-blue-300 hover:bg-brand-50 dark:hover:bg-[#0d1b2e] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ minWidth: 40, minHeight: 40 }}
        aria-label="Mes siguiente"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
