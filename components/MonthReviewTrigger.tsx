'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Fires POST /api/month-review in the background when a CLOSED month loads
 * in /analisis. Mismo patrón que AnalyzeTrigger, pero solo tiene sentido en
 * meses ya cerrados (el mes en curso no tiene cierre que narrar — la propia
 * API lo rechaza igual, esto es solo para no llamarla en vano).
 */
export default function MonthReviewTrigger({ month, year }: { month: number; year: number }) {
  const router = useRouter()
  const ran    = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    fetch('/api/month-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, year }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.generated) router.refresh()
      })
      .catch(() => {/* silent fail — AI es opcional */})
  }, [month, year, router])

  return null
}
