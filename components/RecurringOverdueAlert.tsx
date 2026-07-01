'use client'

import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface Props {
  count: number
  names: string[]
}

export default function RecurringOverdueAlert({ count, names }: Props) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const nameStr = names.length === 0
    ? ''
    : names.length <= 2
      ? names.join(' y ')
      : `${names.slice(0, 2).join(', ')} y ${names.length - 2} más`

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-2xl mb-5"
      style={{
        background: 'rgba(239,91,82,0.08)',
        border: '1.5px solid rgba(239,91,82,0.25)',
      }}
    >
      <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: 'var(--coral)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold" style={{ color: 'var(--coral)' }}>
          {count} gasto{count !== 1 ? 's' : ''} atrasado{count !== 1 ? 's' : ''}
        </p>
        {nameStr && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>{nameStr}</p>
        )}
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 rounded-full transition-opacity hover:opacity-60 flex-shrink-0"
        style={{ color: 'var(--ink-3)' }}
        aria-label="Cerrar alerta"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
