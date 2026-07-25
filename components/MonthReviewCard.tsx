import { Sparkles } from 'lucide-react'

interface Props {
  title: string
  summary: string
}

/**
 * B4 — Informe de cierre de mes. Card narrativa (3-4 frases) generada por IA
 * para un mes YA CERRADO, primera card del bloque de análisis de ese mes.
 */
export default function MonthReviewCard({ title, summary }: Props) {
  return (
    <div className="card p-5" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-soft)' }}>
          <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} />
        </div>
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{title}</p>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>{summary}</p>
    </div>
  )
}
