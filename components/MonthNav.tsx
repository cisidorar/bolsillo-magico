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
    <div className="flex items-center gap-0.5 rounded-xl p-0.5"
      style={{ background: 'var(--surface)' }}>
      <button
        onClick={() => navigate(-1)}
        className="flex items-center justify-center rounded-lg text-[color:var(--primary)] hover:bg-[var(--primary-soft)] transition-colors"
        style={{ minWidth: 44, minHeight: 44 }}
        aria-label="Mes anterior"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <button
        onClick={!isCurrentMonth ? goToCurrent : undefined}
        disabled={isCurrentMonth}
        title={!isCurrentMonth ? 'Ir al mes actual' : undefined}
        className="text-sm font-bold text-[color:var(--primary)] min-w-[112px] text-center capitalize px-1 rounded-lg transition-colors disabled:cursor-default hover:bg-[var(--primary-soft)] disabled:hover:bg-transparent"
        style={{ minHeight: 44 }}
      >
        {monthName(month)} {year !== now.getFullYear() ? year : ''}
        {isCurrentMonth && (
          <span className="block w-1 h-1 rounded-full mx-auto mt-0.5" style={{ backgroundColor: 'var(--primary)' }} />
        )}
      </button>

      <button
        onClick={() => navigate(1)}
        disabled={isCurrentMonth}
        className="flex items-center justify-center rounded-lg text-[color:var(--primary)] hover:bg-[var(--primary-soft)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ minWidth: 44, minHeight: 44 }}
        aria-label="Mes siguiente"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
