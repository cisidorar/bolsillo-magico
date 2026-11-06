'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Check, Users, Undo2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCLP } from '@/lib/utils'
import { SheetShell, FieldLabel, InputRow, inputClass, Chip } from '@/components/SheetParts'
import { saveSplit, removeSplit, unforgiveReceivable } from '@/app/actions/receivables'
import { splitEvenly, myShareOf, cardDueDateFor, type Receivable } from '@/lib/receivables'
import type { PaymentMethod } from '@/types'

// ── Dividir un gasto que pagaste por otros (nov 2026) ───────────────────────
// Ej: pagaste $33.000 con la CMR por 3 amigas que te van a transferir. Acá
// anotas quién te debe cuánto: tu gasto queda en tu parte (presupuesto y
// análisis), la tarjeta sigue cuadrando con el total (card_extra) y lo
// pendiente aparece en "Te deben" hasta que marques que te pagaron.

export interface SplitTarget {
  id: string
  total: number          // lo que cobró la tarjeta (amount + card_extra)
  description: string | null
  date: string
  paymentMethod: Pick<PaymentMethod, 'card_type' | 'billing_day' | 'payment_due_day' | 'name'> | null
}

interface Row {
  key: string
  id: string | null
  name: string
  amount: string           // dígitos, sin puntos
  received_at: string | null
  forgiven: boolean
}

const digits = (s: string) => s.replace(/\D/g, '').slice(0, 9)
const fmtInput = (s: string) => (s ? parseInt(s, 10).toLocaleString('es-CL') : '')
const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
let keySeq = 0
const newKey = () => `r${++keySeq}`

export default function SplitSheet({ target, onClose, onDone }: {
  target: SplitTarget
  onClose: () => void
  onDone: (message: string) => void
}) {
  const supabase = createClient()
  const [rows, setRows]       = useState<Row[]>([])
  const [loaded, setLoaded]   = useState(false)
  const [hadSplit, setHadSplit] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    let cancelled = false
    supabase.from('expense_receivables').select('*').eq('expense_id', target.id).order('created_at')
      .then(({ data }) => {
        if (cancelled) return
        const existing = (data ?? []) as Receivable[]
        setHadSplit(existing.length > 0)
        setRows(existing.length > 0
          ? existing.map(r => ({ key: newKey(), id: r.id, name: r.person_name, amount: String(r.amount), received_at: r.received_at, forgiven: r.forgiven }))
          : [{ key: newKey(), id: null, name: '', amount: '', received_at: null, forgiven: false }])
        setLoaded(true)
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.id])

  const active     = rows.filter(r => !r.forgiven)
  const forgiven   = rows.filter(r => r.forgiven)
  const owedList   = active.map(r => parseInt(r.amount || '0', 10))
  const owed       = owedList.reduce((s, a) => s + a, 0)
  const mine       = myShareOf(target.total, owedList)
  const forgivenSum = forgiven.reduce((s, r) => s + parseInt(r.amount || '0', 10), 0)
  const dueDate    = useMemo(() => cardDueDateFor(target.date, target.paymentMethod), [target])

  function update(key: string, patch: Partial<Row>) {
    setError('')
    setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r))
  }

  // "Entre N" (contándote): cada uno paga total / N (los pesos sueltos quedan
  // de tu lado). Los que ya te transfirieron y los asumidos no se tocan.
  function splitAmong(n: number) {
    setError('')
    const others = n - 1
    const locked = rows.filter(r => r.received_at || r.forgiven)
    const editable = rows.filter(r => !r.received_at && !r.forgiven)
    const freeOthers = Math.max(0, others - locked.filter(r => !r.forgiven).length)
    const { each } = splitEvenly(target.total, others)
    const next: Row[] = []
    for (let i = 0; i < freeOthers; i++) {
      const prev = editable[i]
      next.push(prev ? { ...prev, amount: String(each) } : { key: newKey(), id: null, name: '', amount: String(each), received_at: null, forgiven: false })
    }
    setRows([...locked, ...next])
  }

  async function save() {
    const people = active
      .filter(r => r.name.trim() || r.amount)
      .map(r => ({ id: r.id, name: r.name, amount: parseInt(r.amount || '0', 10) }))
    setSaving(true); setError('')
    const res = people.length === 0 && hadSplit
      ? await removeSplit(target.id)
      : await saveSplit(target.id, target.total, people)
    setSaving(false)
    if (!res.ok) { setError(res.error); return }
    onDone(people.length === 0 ? 'Reparto quitado' : `Listo: te deben ${formatCLP(people.reduce((s, p) => s + p.amount, 0))}`)
  }

  async function undoForgive(r: Row) {
    if (!r.id) return
    setSaving(true)
    const res = await unforgiveReceivable(r.id)
    setSaving(false)
    if (!res.ok) { setError(res.error); return }
    update(r.key, { forgiven: false })
  }

  const othersCount = active.length

  return (
    <SheetShell
      title="Dividir gasto"
      subtitle={`${target.description || 'Gasto'} · ${fmtDay(target.date)} · cobró ${formatCLP(target.total)}`}
      onClose={onClose}
      label="Dividir gasto"
    >
      {!loaded ? (
        <div className="h-40 rounded-2xl animate-pulse" style={{ background: 'var(--surface-2)' }} />
      ) : (
        <>
          <div>
            <FieldLabel hint="Contándote a ti. Después puedes ajustar cada monto.">¿Entre cuántos se divide?</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {[2, 3, 4, 5, 6].map(n => (
                <Chip key={n} active={othersCount + 1 === n && owedList.every(a => a === owedList[0])} onClick={() => splitAmong(n)}>
                  {n}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel>Quién te debe</FieldLabel>
            <div className="space-y-2">
              {active.map(r => (
                <div key={r.key} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <InputRow icon={<Users className="w-4 h-4" />}>
                      <input
                        value={r.name}
                        onChange={e => update(r.key, { name: e.target.value.slice(0, 60) })}
                        placeholder="Nombre"
                        aria-label="Nombre"
                        className={inputClass}
                      />
                    </InputRow>
                  </div>
                  <div className="w-32 flex-shrink-0">
                    <InputRow>
                      <span className="text-sm text-gray-400">$</span>
                      <input
                        inputMode="numeric"
                        value={fmtInput(r.amount)}
                        onChange={e => update(r.key, { amount: digits(e.target.value) })}
                        disabled={!!r.received_at}
                        placeholder="0"
                        aria-label={`Monto de ${r.name || 'esta persona'}`}
                        className={`${inputClass} tabular-nums disabled:opacity-60`}
                      />
                    </InputRow>
                  </div>
                  {r.received_at ? (
                    <span className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0"
                      title={`Te pagó el ${fmtDay(r.received_at)}`}
                      style={{ background: 'color-mix(in srgb, var(--mint) 15%, var(--surface))', color: 'var(--mint-ink)' }}>
                      <Check className="w-4 h-4" />
                    </span>
                  ) : (
                    <button type="button" aria-label="Quitar persona"
                      onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}
                      className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 text-gray-400 hover:text-red-500 hover:bg-gray-100 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button"
                onClick={() => setRows(rs => [...rs, { key: newKey(), id: null, name: '', amount: '', received_at: null, forgiven: false }])}
                className="flex items-center gap-1.5 text-xs font-semibold py-1.5"
                style={{ color: 'var(--primary)' }}>
                <Plus className="w-3.5 h-3.5" /> Agregar persona
              </button>
            </div>
          </div>

          {forgiven.length > 0 && (
            <div className="space-y-1.5">
              {forgiven.map(r => (
                <div key={r.key} className="flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--ink-3)' }}>
                  <span className="truncate">{r.name} · {formatCLP(parseInt(r.amount || '0', 10))} · lo asumiste</span>
                  <button type="button" onClick={() => undoForgive(r)} disabled={saving}
                    className="flex items-center gap-1 font-semibold flex-shrink-0" style={{ color: 'var(--primary)' }}>
                    <Undo2 className="w-3 h-3" /> Volver a cobrar
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Resumen */}
          <div className="rounded-2xl px-4 py-3 space-y-1.5" style={{ background: 'var(--surface-2)' }}>
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: 'var(--ink-2)' }}>Tu parte <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>(cuenta en tu presupuesto)</span></span>
              <span className="font-bold tabular-nums" style={{ color: mine < 0 ? 'var(--coral-ink)' : 'var(--ink)' }}>{formatCLP(mine)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: 'var(--ink-2)' }}>Te deben</span>
              <span className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(owed)}</span>
            </div>
            {forgivenSum > 0 && (
              <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Incluye {formatCLP(forgivenSum)} que asumiste en tu parte.</p>
            )}
            <p className="text-[11px] leading-relaxed pt-1" style={{ color: 'var(--ink-3)' }}>
              {dueDate
                ? <>Tu {target.paymentMethod?.name ?? 'tarjeta'} te cobra los {formatCLP(target.total)} completos el <strong style={{ color: 'var(--ink-2)' }}>{fmtDay(dueDate)}</strong>: idealmente cobra antes de esa fecha.</>
                : <>Cuando te transfieran, márcalo en «Te deben». No cuenta como ingreso: solo cierra la deuda.</>}
            </p>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button onClick={save} disabled={saving}
            className="w-full py-3 font-semibold rounded-2xl transition-colors disabled:opacity-60 text-base flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-ink)' }}>
            {saving ? 'Guardando…' : <><Check className="w-4 h-4" /> {active.length === 0 && hadSplit ? 'Quitar reparto' : 'Guardar reparto'}</>}
          </button>
        </>
      )}
    </SheetShell>
  )
}
