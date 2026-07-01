'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { X, Check, Loader2 } from 'lucide-react'
import ServiceLogo from '@/components/ServiceLogo'
import { formatCLP } from '@/lib/utils'

export interface OverdueItem {
  id: string
  name: string
  amount: number
  domain: string | null
  daysLate: number
  category_id: string | null
  payment_method_id: string | null
}

interface Props {
  atrasado: OverdueItem
  userId: string
  dateStr: string
  borderTop?: boolean
  firstItem?: boolean
  buttonOnly?: boolean
}

export default function OverduePaySheet({ atrasado: r, userId, dateStr, borderTop, firstItem, buttonOnly }: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [open,   setOpen]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [done,   setDone]   = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open])

  async function markPaid() {
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('expenses').insert({
      user_id:              userId,
      amount:               r.amount,
      date:                 dateStr,
      description:          r.name,
      category_id:          r.category_id,
      payment_method_id:    r.payment_method_id,
      recurring_expense_id: r.id,
    })
    setSaving(false)
    if (err) { setError('Error al registrar'); return }
    setDone(true)
    setTimeout(() => { setOpen(false); router.refresh() }, 800)
  }

  return (
    <>
      {/* ── Botón full-width (buttonOnly mode) ── */}
      {buttonOnly ? (
        <div className="px-3 pb-3 pt-1">
          <button
            onClick={() => setOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-80 active:scale-[.98]"
            style={{
              background: 'rgba(239,91,82,0.28)',
              color: 'var(--coral)',
            }}
          >
            Registrar pago
          </button>
        </div>
      ) : (
      /* ── Fila clickable ── */
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-opacity hover:opacity-80 active:opacity-60"
        style={{
          borderTop: borderTop ? '1px solid #FAD3CF' : undefined,
          background: firstItem ? 'rgba(239,91,82,0.04)' : undefined,
        }}
      >
        <ServiceLogo domain={r.domain} name={r.name} size={32} className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{r.name}</p>
          <p className="text-[10px] font-semibold" style={{ color: 'var(--coral)' }}>
            Atrasado · hace {r.daysLate} día{r.daysLate !== 1 ? 's' : ''}
          </p>
        </div>
        <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--coral)' }}>
          {formatCLP(r.amount)}
        </p>
      </button>
      )}

      {/* ── Popup ── */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div
            className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-hidden"
            style={{ background: 'var(--surface)', maxHeight: '92dvh' }}
          >
            {/* Handle mobile */}
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

            {/* Header */}
            <div
              className="flex items-center justify-between px-5 pt-4 pb-3"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Registrar pago</h2>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full"
                style={{ background: 'var(--surface-2)' }}
              >
                <X className="w-4 h-4" style={{ color: 'var(--ink-3)' }} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-4">

              {/* Info del servicio */}
              <div className="flex items-center gap-3">
                <ServiceLogo domain={r.domain} name={r.name} size={44} className="flex-shrink-0" />
                <div>
                  <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>{r.name}</p>
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--coral)' }}>
                    Atrasado hace {r.daysLate} día{r.daysLate !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Monto */}
              <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--surface-2)' }}>
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mb-1"
                  style={{ color: 'var(--ink-3)' }}
                >
                  Monto a registrar
                </p>
                <p
                  className="text-2xl font-extrabold tabular-nums"
                  style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
                >
                  {formatCLP(r.amount)}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                  Se registrará con la fecha de hoy
                </p>
              </div>

              {/* Error */}
              {error && (
                <p className="text-xs font-semibold" style={{ color: 'var(--coral)' }}>{error}</p>
              )}

              {/* Acciones */}
              {done ? (
                <div
                  className="flex items-center justify-center gap-2 py-3 rounded-2xl"
                  style={{ background: 'rgba(31,190,141,0.1)' }}
                >
                  <Check className="w-4 h-4" style={{ color: 'var(--mint)' }} />
                  <p className="text-sm font-bold" style={{ color: 'var(--mint)' }}>¡Registrado!</p>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setOpen(false)}
                    className="flex-1 py-2.5 text-sm font-semibold rounded-2xl transition-all"
                    style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={markPaid}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-2xl transition-all disabled:opacity-60 active:scale-[.98]"
                    style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
                  >
                    {saving
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Check className="w-4 h-4" />
                    }
                    {saving ? 'Registrando…' : 'Marcar como pagado'}
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </>
  )
}
