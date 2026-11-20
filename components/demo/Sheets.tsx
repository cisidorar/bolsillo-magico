'use client'

import { useEffect, useRef, useState } from 'react'
import { X, FileText, Check, Trash2, Sparkles, Users } from 'lucide-react'
import { formatCLP, isEmoji } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import {
  CATEGORIES, METHODS, PEOPLE_POOL, addDays, catOf, methodOf, longDate, suggestCategoryId,
  type DDebt, type DExpense,
} from './data'
import { statementNote } from './parts'
import type { MonthCtx } from './calc'

function Overlay({ onClose, label, children }: { onClose: () => void; label: string; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 lp-backdrop" style={{ background: 'rgba(5,12,28,0.55)' }} onClick={onClose} />
      <div className="lp-sheet relative w-full sm:max-w-[560px] max-h-[92svh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 sm:p-6" style={{ background: 'var(--surface)', boxShadow: '0 24px 60px rgba(5,12,28,0.35)' }}>
        {children}
      </div>
    </div>
  )
}

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>{title}</h2>
      <button type="button" onClick={onClose} aria-label="Cerrar" className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center" style={{ color: 'var(--ink-2)' }}>
        <X className="w-5 h-5" />
      </button>
    </div>
  )
}

const chipCls = (on: boolean) =>
  `inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-full text-sm border transition-all active:scale-[.97] ${on ? 'sheet-chip-active' : 'sheet-chip'}`

export function NuevoGastoSheet({ ctx, existingPeople, onClose, onSave }: {
  ctx: MonthCtx
  existingPeople: string[]
  onClose: () => void
  onSave: (e: DExpense, debts: DDebt[]) => void
}) {
  const [description, setDescription] = useState('')
  const [digits, setDigits] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [auto, setAuto] = useState(false)
  const [methodId, setMethodId] = useState('vis')
  const [ago, setAgo] = useState(0)
  const [others, setOthers] = useState(false)
  const [n, setN] = useState(2)
  const manualCat = useRef(false)

  const amount = Number(digits || 0)
  const date = addDays(ctx.dateStr, -ago)
  const share = others ? Math.round(amount / n) : amount
  const owed = others ? amount - share : 0
  const note = statementNote({ id: 'x', date, amount, description, categoryId: categoryId ?? 'cue', methodId })
  const ready = amount > 0 && categoryId !== null

  function onDescription(v: string) {
    setDescription(v)
    if (manualCat.current) return
    const s = suggestCategoryId(v)
    setCategoryId(s); setAuto(s !== null)
  }

  function save() {
    if (!ready || !categoryId) return
    const id = `n${Date.now()}`
    const expense: DExpense = { id, date, amount: share, description: description.trim() || catOf(categoryId).name, categoryId, methodId }
    const free = PEOPLE_POOL.filter(p => !existingPeople.includes(p))
    const each = n > 1 ? Math.round(owed / (n - 1)) : 0
    const debts: DDebt[] = others
      ? Array.from({ length: n - 1 }, (_, i) => ({
          id: `${id}-${i}`, person: free[i] ?? PEOPLE_POOL[i], concept: expense.description,
          amount: i === n - 2 ? owed - each * (n - 2) : each, date, paid: false,
        }))
      : []
    onSave(expense, debts)
  }

  return (
    <Overlay onClose={onClose} label="Nuevo gasto">
      <SheetHeader title="Nuevo gasto" onClose={onClose} />
      <div className="space-y-4">
        <label className="flex items-center gap-2.5 px-3.5 min-h-[48px] rounded-2xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--primary)', borderWidth: 1.5 }}>
          <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
          <input autoFocus value={description} onChange={e => onDescription(e.target.value)} maxLength={60}
            placeholder="Descripción (opcional): Netflix, Almuerzo, Metro…"
            className="flex-1 bg-transparent outline-none text-sm min-w-0" style={{ color: 'var(--ink)' }} />
        </label>

        <label className="flex items-center gap-2 px-4 min-h-[60px] rounded-2xl" style={{ background: 'var(--surface-2)' }}>
          <span className="text-2xl font-bold" style={{ color: 'var(--ink-3)' }}>$</span>
          <input inputMode="numeric" value={digits ? new Intl.NumberFormat('es-CL').format(Number(digits)) : ''} placeholder="0"
            onChange={e => setDigits(e.target.value.replace(/\D/g, '').slice(0, 8))} aria-label="Monto"
            className="flex-1 bg-transparent outline-none text-2xl font-extrabold tabular-nums min-w-0" style={{ color: 'var(--ink)' }} />
        </label>

        <div>
          <p className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }}>
            Categoría
            {auto && <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: 'var(--primary-text)' }}><Sparkles className="w-3 h-3" /> sugerida</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => {
              const Icon = isEmoji(c.icon) ? null : getCategoryIcon(c.icon)
              return (
                <button key={c.id} type="button" aria-pressed={categoryId === c.id}
                  onClick={() => { manualCat.current = true; setAuto(false); setCategoryId(c.id) }} className={chipCls(categoryId === c.id)}>
                  {Icon && <Icon className="w-3.5 h-3.5" />}{c.name}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>Método</p>
            <div className="flex flex-wrap gap-2">
              {METHODS.map(m => (
                <button key={m.id} type="button" aria-pressed={methodId === m.id} onClick={() => setMethodId(m.id)} className={chipCls(methodId === m.id)}>{m.name}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>Fecha</p>
            <div className="flex flex-wrap gap-2">
              {[[2, 'Anteayer'], [1, 'Ayer'], [0, 'Hoy']].map(([v, l]) => (
                <button key={l} type="button" aria-pressed={ago === v} onClick={() => setAgo(v as number)} className={chipCls(ago === v)}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        {note && amount > 0 && (
          <p key={note.due} className="sd-flip text-sm rounded-2xl px-4 py-3" style={{ background: 'var(--primary-soft)', color: 'var(--primary-text)' }}>
            <span className="font-bold">Entra al estado que cierra el {longDate(note.close)}</span> y lo pagas el {longDate(note.due)}.
          </p>
        )}

        <div>
          <button type="button" aria-pressed={others} onClick={() => setOthers(o => !o)} className={chipCls(others)}>
            <Users className="w-3.5 h-3.5" /> Pagué por otros
          </button>
          {others && (
            <div className="mt-3 rounded-2xl p-4 sd-flip" style={{ background: 'var(--surface-2)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>Se divide en partes iguales entre</p>
              <div className="flex gap-2">
                {[2, 3, 4].map(k => <button key={k} type="button" aria-pressed={n === k} onClick={() => setN(k)} className={chipCls(n === k)}>{k} personas</button>)}
              </div>
              {amount > 0 && (
                <p className="text-sm mt-3" style={{ color: 'var(--ink)' }}>
                  Tu gasto real: <b className="tabular-nums">{formatCLP(share)}</b> · te deben <b className="tabular-nums">{formatCLP(owed)}</b>
                  <span style={{ color: 'var(--ink-2)' }}>{methodOf(methodId).type === 'credit' ? `. La Visa cobra los ${formatCLP(amount)}.` : '.'}</span>
                </p>
              )}
            </div>
          )}
        </div>

        <button type="button" onClick={save} disabled={!ready}
          className="w-full min-h-[52px] rounded-2xl text-base font-bold transition-all active:scale-[.98] disabled:opacity-45"
          style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: ready ? '0 8px 18px var(--shadow)' : 'none' }}>
          Guardar gasto
        </button>
        {!ready && <p className="text-xs text-center -mt-2" style={{ color: 'var(--ink-3)' }}>Escribe un monto y elige una categoría. Prueba con «Uber» o «Jumbo».</p>}
      </div>
    </Overlay>
  )
}

export function ExpenseDetail({ e, ctx, onClose, onDelete }: { e: DExpense; ctx: MonthCtx; onClose: () => void; onDelete: (e: DExpense) => void }) {
  const c = catOf(e.categoryId), m = methodOf(e.methodId)
  const note = statementNote(e)
  void ctx
  const rows: [string, string][] = [['Categoría', c.name], ['Método', m.name], ['Fecha', longDate(e.date)]]
  return (
    <Overlay onClose={onClose} label="Detalle del gasto">
      <SheetHeader title="Gasto" onClose={onClose} />
      <p className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>{e.description}</p>
      <p className="text-4xl font-extrabold tabular-nums mt-1" style={{ color: 'var(--ink)', fontFamily: 'var(--font-fredoka), sans-serif' }}>{formatCLP(e.amount)}</p>
      <dl className="mt-5 space-y-3">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between text-sm">
            <dt style={{ color: 'var(--ink-3)' }}>{k}</dt><dd className="font-semibold" style={{ color: 'var(--ink)' }}>{v}</dd>
          </div>
        ))}
      </dl>
      {note && (
        <p className="text-sm rounded-2xl px-4 py-3 mt-4" style={{ background: 'var(--primary-soft)', color: 'var(--primary-text)' }}>
          <span className="font-bold">Estado que cierra el {longDate(note.close)}</span> · lo pagas el {longDate(note.due)}.
        </p>
      )}
      <div className="flex gap-2.5 mt-6">
        <button type="button" onClick={() => onDelete(e)}
          className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl text-sm font-bold" style={{ color: 'var(--coral-ink)', background: 'color-mix(in srgb, var(--coral) 12%, var(--surface))' }}>
          <Trash2 className="w-4 h-4" /> Eliminar
        </button>
        <button type="button" onClick={onClose} className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl text-sm font-bold"
          style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
          <Check className="w-4 h-4" /> Listo
        </button>
      </div>
    </Overlay>
  )
}
