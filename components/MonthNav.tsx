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

  const now = new Date()
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()

  return (
    <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-xl shadow-sm p-0.5">
      <button
        onClick={() => navigate(-1)}
        className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 transition-colors"
        aria-label="Mes anterior"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-xs font-bold text-brand-700 min-w-[96px] text-center capitalize px-1">
        {monthName(month)} {year !== now.getFullYear() ? year : ''}
      </span>
      <button
        onClick={() => navigate(1)}
        disabled={isCurrentMonth}
        className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Mes siguiente"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
