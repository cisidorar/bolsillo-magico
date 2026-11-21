'use client'

import { Check } from 'lucide-react'
import { AVATARS, avatarUrl } from '@/lib/avatars'

/** Grilla de fotos de perfil prediseñadas. `value` es la ruta guardada (`/avatars/gato.svg`) o null. */
export default function AvatarPicker({ value, onChange, size = 56 }: {
  value: string | null
  onChange: (url: string) => void
  size?: number
}) {
  return (
    <div role="radiogroup" aria-label="Elige tu foto de perfil" className="grid grid-cols-4 gap-3 justify-items-center">
      {AVATARS.map(a => {
        const url = avatarUrl(a.id)
        const on = value === url
        return (
          <button key={a.id} type="button" role="radio" aria-checked={on} aria-label={a.label}
            onClick={() => onChange(url)}
            className="relative rounded-full transition-transform active:scale-95"
            style={{ width: size, height: size, boxShadow: on ? '0 0 0 3px var(--primary)' : 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" width={size} height={size} className="w-full h-full rounded-full" draggable={false} />
            {on && (
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: 'var(--primary)' }}>
                <Check className="w-3 h-3 text-white" aria-hidden />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
