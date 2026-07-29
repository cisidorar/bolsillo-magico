'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, X, PiggyBank, Trash2, Check, Loader2 } from 'lucide-react'
import { formatCLP, getNowChile } from '@/lib/utils'
import {
  progressPct, amountRemaining, requiredMonthlyContribution,
  isOnTrack, projectedCompletionMonth, type SavingsGoal as SavingsGoalCalc,
} from '@/lib/savings-goals'

export interface SavingsGoalRow {
  id: string
  name: string
  target_amount: number
  current_amount: number
  target_date: string | null
  color: string
}

interface Props {
  userId: string
  goals: SavingsGoalRow[]
  /** Ahorro mensual real del usuario (para "¿vas a tiempo?") — opcional, sin esto solo se muestra el % avanzado. */
  monthlySavingsRate?: number | null
}

const MONTH_NAMES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const COLORS = ['#1FBE8D', '#2B7CF6', '#F59E0B', '#EF5B52', '#7C3AED', '#0D9488']

function fmtInput(raw: string): string {
  const n = raw.replace(/\D/g, '')
  if (!n) return ''
  return parseInt(n).toLocaleString('es-CL')
}

function monthLabel(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

interface FormState {
  name: string
  targetAmount: string
  currentAmount: string
  targetDate: string
  color: string
}
const emptyForm: FormState = { name: '', targetAmount: '', currentAmount: '', targetDate: '', color: COLORS[0] }

/**
 * E3 — metas de ahorro con nombre y fecha, en vez de solo una tasa de ahorro
 * abstracta. current_amount se actualiza a mano (no está ligada a ninguna
 * cuenta real) — mismo principio que month_sweeps: seguimiento explícito,
 * no mueve plata por sí sola.
 */
export default function SavingsGoalsManager({ userId, goals: initGoals, monthlySavingsRate = null }: Props) {
  const supabase = createClient()
  const router = useRouter()

  const [goals, setGoals] = useState<SavingsGoalRow[]>(initGoals)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const todayStr = getNowChile().dateStr

  function openAdd() {
    setForm(emptyForm); setEditingId(null); setError(''); setDeleteConfirm(false); setShowForm(true)
  }
  function openEdit(g: SavingsGoalRow) {
    setForm({
      name: g.name,
      targetAmount: String(g.target_amount),
      currentAmount: String(g.current_amount),
      targetDate: g.target_date ?? '',
      color: g.color,
    })
    setEditingId(g.id); setError(''); setDeleteConfirm(false); setShowForm(true)
  }
  function close() {
    setShowForm(false); setEditingId(null); setForm(emptyForm); setError(''); setDeleteConfirm(false)
  }

  const save = useCallback(async () => {
    const name = form.name.trim()
    const targetAmount = parseInt(form.targetAmount.replace(/\D/g, '') || '0')
    const currentAmount = parseInt(form.currentAmount.replace(/\D/g, '') || '0')

    if (!name) { setError('Ponle un nombre a tu meta'); return }
    if (!targetAmount || targetAmount < 1) { setError('Ingresa el monto a juntar'); return }

    setSaving(true); setError('')
    const payload = {
      name, target_amount: targetAmount, current_amount: currentAmount,
      target_date: form.targetDate || null, color: form.color,
      updated_at: new Date().toISOString(),
    }

    if (editingId) {
      const { error: err } = await supabase.from('savings_goals').update(payload).eq('id', editingId).eq('user_id', userId)
      setSaving(false)
      if (err) { setError(err.message); return }
      setGoals(prev => prev.map(g => g.id === editingId ? { ...g, ...payload } : g))
    } else {
      const { data, error: err } = await supabase.from('savings_goals')
        .insert({ ...payload, user_id: userId, icon: 'PiggyBank' }).select().single()
      setSaving(false)
      if (err) { setError(err.message); return }
      setGoals(prev => [...prev, data as SavingsGoalRow])
    }
    router.refresh(); close()
  }, [form, editingId, userId, supabase, router])

  async function deleteGoal() {
    if (!editingId) return
    setDeleting(true)
    await supabase.from('savings_goals').delete().eq('id', editingId).eq('user_id', userId)
    setGoals(prev => prev.filter(g => g.id !== editingId))
    setDeleting(false)
    router.refresh(); close()
  }

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-3 px-0.5">
        <div className="flex items-center gap-2">
          <PiggyBank className="w-4 h-4" style={{ color: 'var(--mint)' }} />
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Metas de ahorro</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--primary)' }}>
          <Plus className="w-3.5 h-3.5" /> Nueva meta
        </button>
      </div>

      {goals.length === 0 ? (
        <button onClick={openAdd} className="card w-full flex items-center gap-3 px-4 py-4 text-left transition-colors hover:opacity-90">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(31,190,141,0.12)' }}>
            <PiggyBank className="w-5 h-5" style={{ color: 'var(--mint)' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Crea tu primera meta</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>ej. "Notebook nuevo" — $900.000 para diciembre</p>
          </div>
        </button>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map(g => {
            const calc: SavingsGoalCalc = { targetAmount: g.target_amount, currentAmount: g.current_amount, targetDate: g.target_date }
            const pct = progressPct(calc)
            const remaining = amountRemaining(calc)
            const required = requiredMonthlyContribution(calc, todayStr)
            const onTrack = monthlySavingsRate != null ? isOnTrack(calc, monthlySavingsRate, todayStr) : null
            const projected = monthlySavingsRate != null && onTrack === false
              ? projectedCompletionMonth(calc, monthlySavingsRate, todayStr)
              : null
            const achieved = remaining === 0

            return (
              <button key={g.id} onClick={() => openEdit(g)} className="card p-4 text-left transition-colors hover:opacity-90">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${g.color}22` }}>
                    <PiggyBank className="w-4 h-4" style={{ color: g.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{g.name}</p>
                    {g.target_date && (
                      <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                        para {new Date(g.target_date + 'T12:00:00').toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>

                <div className="h-1.5 rounded-full overflow-hidden mb-1.5" style={{ background: 'var(--surface-2)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: achieved ? 'var(--mint)' : g.color }} />
                </div>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>
                  {formatCLP(g.current_amount)} <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>de {formatCLP(g.target_amount)} ({pct}%)</span>
                </p>

                {achieved ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(31,190,141,0.14)', color: 'var(--mint)' }}>
                    <Check className="w-2.5 h-2.5" /> ¡Lograda!
                  </span>
                ) : required !== null ? (
                  <p className="text-[11px]" style={{ color: onTrack === false ? 'var(--gold, #B45309)' : 'var(--ink-3)' }}>
                    {formatCLP(required)}/mes para llegar a tiempo
                    {onTrack === false && projected && <> · a tu ritmo, {monthLabel(projected)}</>}
                  </p>
                ) : (
                  <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Sin fecha objetivo</p>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Sheet ── */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center bg-black/50" onClick={close}>
          <div className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl max-h-[92vh] overflow-y-auto" style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />
            <div className="flex items-center justify-between px-5 pt-3 pb-3 lg:px-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>{editingId ? 'Editar meta' : 'Nueva meta de ahorro'}</h2>
              <button onClick={close} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-2)' }}>
                <X className="w-4 h-4" style={{ color: 'var(--ink-3)' }} />
              </button>
            </div>

            <div className="px-5 pt-4 pb-5 lg:px-6 flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-3)' }}>Nombre</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ej: Notebook nuevo, Viaje, Fondo de emergencia" maxLength={50} autoFocus
                  className="sheet-input w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-3)' }}>Meta</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none" style={{ color: 'var(--ink-3)' }}>$</span>
                    <input type="text" inputMode="numeric" value={form.targetAmount ? fmtInput(form.targetAmount) : ''}
                      onChange={e => setForm(f => ({ ...f, targetAmount: e.target.value.replace(/\D/g, '') }))}
                      placeholder="0" className="sheet-input w-full rounded-xl pl-7 pr-4 py-2.5 text-sm outline-none transition-colors"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-3)' }}>Ahorrado hasta ahora</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none" style={{ color: 'var(--ink-3)' }}>$</span>
                    <input type="text" inputMode="numeric" value={form.currentAmount ? fmtInput(form.currentAmount) : ''}
                      onChange={e => setForm(f => ({ ...f, currentAmount: e.target.value.replace(/\D/g, '') }))}
                      placeholder="0" className="sheet-input w-full rounded-xl pl-7 pr-4 py-2.5 text-sm outline-none transition-colors"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--ink-3)' }}>Fecha objetivo (opcional)</label>
                <input type="date" value={form.targetDate} min={todayStr}
                  onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))}
                  className="sheet-input w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
              </div>

              <div>
                <label className="text-xs font-semibold block mb-2" style={{ color: 'var(--ink-3)' }}>Color</label>
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                      className="w-8 h-8 rounded-full flex-shrink-0 transition-transform"
                      style={{ background: c, transform: form.color === c ? 'scale(1.15)' : 'scale(1)', boxShadow: form.color === c ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : 'none' }} />
                  ))}
                </div>
              </div>

              {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{error}</p>}

              {deleteConfirm ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-center" style={{ color: 'var(--ink-2)' }}>¿Eliminar esta meta?</p>
                  <div className="flex gap-2">
                    <button onClick={() => setDeleteConfirm(false)} className="flex-1 py-2.5 border text-sm font-semibold rounded-xl transition-colors" style={{ borderColor: 'var(--border)', color: 'var(--ink-2)' }}>Cancelar</button>
                    <button onClick={deleteGoal} disabled={deleting} className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5">
                      {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trash2 className="w-4 h-4" /> Eliminar</>}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  {editingId && (
                    <button onClick={() => setDeleteConfirm(true)} className="p-2.5 border text-red-400 rounded-xl transition-colors" style={{ borderColor: 'var(--border)' }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={close} className="flex-1 py-2.5 border text-sm font-semibold rounded-xl transition-colors" style={{ borderColor: 'var(--border)', color: 'var(--ink-2)' }}>Cancelar</button>
                  <button onClick={save} disabled={saving} className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5" style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />{editingId ? 'Guardar' : 'Crear meta'}</>}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
