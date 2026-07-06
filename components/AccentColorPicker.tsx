'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ACCENT_COLORS, type AccentKey } from '@/lib/accent-colors'

interface Props {
  userId: string
  accentColor: AccentKey
}

/**
 * Selector de color de acento (Preferencias → Apariencia). Cambia --primary /
 * --primary-ink / --primary-soft en vivo (para light y dark) y persiste en
 * profiles.accent_color para que sincronice entre dispositivos.
 */
export default function AccentColorPicker({ userId, accentColor: initAccent }: Props) {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()
  const [accent, setAccent] = useState<AccentKey>(initAccent)

  function applyLive(key: AccentKey) {
    const cfg = ACCENT_COLORS[key]
    const root = document.documentElement.style
    root.setProperty('--accent-primary', cfg.light.primary)
    root.setProperty('--accent-ink', cfg.light.ink)
    root.setProperty('--accent-soft', cfg.light.soft)
    root.setProperty('--accent-primary-dark', cfg.dark.primary)
    root.setProperty('--accent-ink-dark', cfg.dark.ink)
    root.setProperty('--accent-soft-dark', cfg.dark.soft)
  }

  function save(key: AccentKey) {
    setAccent(key)
    applyLive(key)
    startTransition(async () => {
      await supabase.from('profiles').update({ accent_color: key }).eq('id', userId)
    })
  }

  return (
    <div className="flex items-center gap-4 px-4 py-4">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--primary-soft)' }}>
        <span className="w-4 h-4 rounded-full" style={{ background: 'var(--primary)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Color de acento</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Personaliza el color principal de la app.</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {(Object.keys(ACCENT_COLORS) as AccentKey[]).map(key => {
          const cfg = ACCENT_COLORS[key]
          const active = accent === key
          return (
            <button
              key={key}
              type="button"
              title={cfg.label}
              aria-label={cfg.label}
              disabled={isPending}
              onClick={() => save(key)}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90"
              style={{
                background: cfg.light.primary,
                boxShadow: active ? `0 0 0 2px var(--surface), 0 0 0 4px ${cfg.light.primary}` : 'none',
              }}
            >
              {active && <Check className="w-3.5 h-3.5" style={{ color: cfg.light.ink }} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
