'use client'

import { useState } from 'react'
import { FileText, Download, Eye, Loader2 } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { getRentAdjustmentPdfUrl } from '@/app/actions/property'

export interface RentNotice {
  id:               string
  adjustment_month: string
  previous_rent:    number
  new_rent:         number
  cumulative_pct:   number
  floored:          boolean
  applied_at:       string | null
}

const day = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '')
const monthYear = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })

/**
 * El aviso de reajuste como lo que es: un documento. Dice de qué mes es y cuánto cambia la renta, y sus dos
 * acciones (ver y descargar) están siempre juntas. Es la misma fila en «Estado» y en «Información».
 */
export default function RentNoticeDoc({ notice, detail, extra, stacked = false }: {
  notice:  RentNotice
  /** Botones debajo del texto (columnas angostas). */
  stacked?: boolean
  /** Segunda línea opcional (IPC acumulado, si se mandó por correo…). */
  detail?: React.ReactNode
  /** Acciones secundarias bajo el documento (ej. «Aplicar ahora»). */
  extra?:  React.ReactNode
}) {
  const [busy, setBusy] = useState<'view' | 'download' | null>(null)
  const [error, setError] = useState('')

  async function open(download: boolean) {
    setError(''); setBusy(download ? 'download' : 'view')
    // La pestaña se abre ANTES de pedir la dirección: los navegadores de celular bloquean la que se abre después
    // de esperar al servidor, y «Ver PDF» no hacía nada.
    const tab = download ? null : window.open('', '_blank')
    if (tab) tab.opener = null
    const r = await getRentAdjustmentPdfUrl(notice.id, download)
    setBusy(null)
    if (!r.ok) { tab?.close(); setError(r.error); return }
    if (tab) tab.location.href = r.url
    else window.location.href = r.url
  }

  const pending = !notice.applied_at
  const pct = Number(notice.cumulative_pct).toLocaleString('es-CL', { maximumFractionDigits: 2 })

  return (
    <div>
      <div className={`flex flex-col gap-3 ${stacked ? '' : 'sm:flex-row sm:items-center'}`}>
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-soft)' }}>
            <FileText className="w-5 h-5" style={{ color: 'var(--primary-text)' }} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Aviso de reajuste · {monthYear(notice.adjustment_month)}</p>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={pending
                  ? { background: 'color-mix(in srgb, var(--gold) 16%, transparent)', color: 'var(--gold-ink)' }
                  : { background: 'color-mix(in srgb, var(--mint) 14%, transparent)', color: 'var(--mint-ink)' }}>
                {pending ? `Rige el ${day(notice.adjustment_month)}` : 'Aplicado'}
              </span>
            </div>
            <p className="text-sm tabular-nums mt-0.5" style={{ color: 'var(--ink-2)' }}>
              {notice.floored
                ? <>El IPC fue negativo: la renta se mantiene en {formatCLP(notice.new_rent)}</>
                : <>{formatCLP(notice.previous_rent)} → <strong style={{ color: 'var(--ink)' }}>{formatCLP(notice.new_rent)}</strong> <span style={{ color: 'var(--ink-3)' }}>(+{pct}%)</span></>}
            </p>
            {detail && <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>{detail}</p>}
          </div>
        </div>

        <div className={`flex items-center gap-2 flex-shrink-0 ${stacked ? 'sm:pl-14' : ''}`}>
          <button type="button" onClick={() => open(false)} disabled={busy !== null}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-xl text-sm font-bold disabled:opacity-60 transition-transform active:scale-[.98]"
            // El azul es solo para el que está pendiente: así no compiten dos botones principales en la lista.
            style={pending ? { background: 'var(--primary)', color: 'var(--primary-ink)' } : { background: 'var(--surface-2)', color: 'var(--ink)' }}>
            {busy === 'view' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
            Ver PDF
          </button>
          <button type="button" onClick={() => open(true)} disabled={busy !== null}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-xl text-sm font-semibold disabled:opacity-60 transition-transform active:scale-[.98]"
            style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
            {busy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Download className="w-4 h-4" aria-hidden />}
            Descargar
          </button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm font-semibold mt-2" style={{ color: 'var(--coral-ink)' }}>{error}</p>}
      {extra}
    </div>
  )
}
