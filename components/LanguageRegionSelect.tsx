'use client'

import { useState, useTransition } from 'react'
import { Globe, ChevronDown, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  userId:     string
  language:   string
  dateFormat: string
}

const LANGUAGES = [
  { value: 'es-CL', label: 'Español (Chile)',    enabled: true },
  { value: 'en-US', label: 'English (US)',        enabled: false },
  { value: 'pt-BR', label: 'Português (Brasil)',  enabled: false },
]

const DATE_FORMATS = [
  { value: 'DD/MM/AAAA', label: 'DD/MM/AAAA' },
  { value: 'MM/DD/AAAA', label: 'MM/DD/AAAA' },
  { value: 'AAAA-MM-DD', label: 'AAAA-MM-DD' },
]

/**
 * Idioma y formato de fecha. Solo 'es-CL' tiene textos reales hoy — el resto
 * se ofrece deshabilitado ("Próximamente") para no prometer una traducción
 * que no existe. El formato de fecha sí es funcional: alimenta relativeDate()
 * en lib/utils.ts, usado por ExpenseList y StatementView.
 */
export default function LanguageRegionSelect({ userId, language: initLang, dateFormat: initFormat }: Props) {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()
  const [language, setLanguage]     = useState(initLang)
  const [dateFormat, setDateFormat] = useState(initFormat)
  const [saved, setSaved]           = useState(false)

  function save(next: { language?: string; date_format?: string }) {
    if (next.language) setLanguage(next.language)
    if (next.date_format) setDateFormat(next.date_format)
    setSaved(false)
    startTransition(async () => {
      await supabase.from('profiles').update(next).eq('id', userId)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  const selectClass = "w-full appearance-none rounded-2xl px-3.5 py-3 text-sm font-semibold outline-none cursor-pointer border-0"

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-4 px-4 pt-4 pb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-soft)' }}>
          <Globe className="w-5 h-5" style={{ color: 'var(--primary)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Idioma y región</p>
            {saved && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: 'var(--mint)' }}>
                <Check className="w-3 h-3" /> Guardado
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Idioma de la app y formato de fecha.</p>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-2.5">
        <div className="relative">
          <select
            value={language}
            disabled={isPending}
            onChange={e => save({ language: e.target.value })}
            className={selectClass}
            style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}
          >
            {LANGUAGES.map(l => (
              <option key={l.value} value={l.value} disabled={!l.enabled}>
                {l.label}{!l.enabled ? ' · Próximamente' : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ink-3)' }} />
        </div>

        <div className="relative">
          <select
            value={dateFormat}
            disabled={isPending}
            onChange={e => save({ date_format: e.target.value })}
            className={selectClass}
            style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}
          >
            {DATE_FORMATS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ink-3)' }} />
        </div>
      </div>
    </div>
  )
}
