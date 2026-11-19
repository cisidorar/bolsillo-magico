'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface Props {
  id: string
  label: string
  type?: 'text' | 'email' | 'password'
  value: string
  onChange: (v: string) => void
  icon: React.ReactNode
  autoComplete?: string
  name?: string
  placeholder?: string
  inputMode?: 'email' | 'text'
  enterKeyHint?: 'go' | 'next' | 'done'
  /** Texto de ayuda siempre visible bajo el campo (ej. "Mínimo 8 caracteres"). */
  hint?: string
  invalid?: boolean
  describedBy?: string
  readOnly?: boolean
  /** Para contraseñas: botón para mostrar/ocultar. */
  revealable?: boolean
  /** Enlace u otro control bajo el campo (ej. "¿Olvidaste tu contraseña?"). */
  below?: React.ReactNode
}

export default function AuthField({
  id, label, type = 'text', value, onChange, icon, autoComplete, name, placeholder, inputMode,
  enterKeyHint, hint, invalid, describedBy, readOnly, revealable, below,
}: Props) {
  const [shown, setShown] = useState(false)
  const isEmail = type === 'email'
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--ink-2)' }}>{label}</label>
      <div className="auth-field" data-invalid={invalid ? 'true' : undefined}>
        <span className="shrink-0 flex" style={{ color: 'var(--ink-3)' }} aria-hidden>{icon}</span>
        <input
          id={id}
          name={name ?? id}
          type={revealable && shown ? 'text' : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          enterKeyHint={enterKeyHint}
          readOnly={readOnly}
          aria-invalid={invalid || undefined}
          aria-describedby={[hintId, describedBy].filter(Boolean).join(' ') || undefined}
          {...(isEmail ? { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } : {})}
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setShown(s => !s)}
            aria-label={shown ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={shown}
            className="w-11 h-11 -mr-3 flex items-center justify-center shrink-0 rounded-xl"
            style={{ color: 'var(--ink-2)' }}
          >
            {shown ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          </button>
        )}
      </div>
      {hint && <p id={hintId} className="text-xs mt-1.5" style={{ color: 'var(--ink-3)' }}>{hint}</p>}
      {below}
    </div>
  )
}
