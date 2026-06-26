'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Fires POST /api/analyze-month in the background when the monthly view loads.
 * If the API returns new insights (not "cached"), refreshes the page so the
 * server component re-fetches and displays the AI oportunidades.
 */
export default function AnalyzeTrigger({ month, year }: { month: number; year: number }) {
  const router = useRouter()
  const ran    = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    fetch('/api/analyze-month', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, year }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        // Only refresh when the API actually generated new insights
        if (data && data.opportunities !== undefined) router.refresh()
      })
      .catch(() => {/* silent fail — AI is optional */})
  }, [month, year, router])

  return null
}
