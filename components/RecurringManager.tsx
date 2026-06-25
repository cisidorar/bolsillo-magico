'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Check, X, RefreshCw, Pause, Play, CreditCard, ChevronRight } from 'lucide-react'
import { cn, formatCLP, isEmoji } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import { detectDomain } from '@/lib/services'
import ServiceLogo from './ServiceLogo'
import type { RecurringExpense, Category, PaymentMethod } from '@/types'

function fmtNum(raw: string): string {
  if (!raw) return ''
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

interface Props {
  items: RecurringExpense[]
  categories: Category[]
  paymentMethods: PaymentMethod[]
  userId: string
}

type Form = {
  name: string
  amount: string
  billing_day: string
  category_id: string
  payment_method_id: string
  auto_register: boolean
  is_active: boolean
  cuotas: boolean
  totalAmount: string
  numCuotas: string
}

const DEFAULT: Form = {
  name: '', amount: '', billing_day: '',
  category_id: '', payment_method_id: '',
  auto_register: false, is_active: true,
  cuotas: false, totalAmount: '', numCuotas: '',
}

function nextBillingDate(billingDay: number): Date {
  const now  = new Date()
  const d    = now.getDate()
  const m    = now.getMonth() + 1
  const y    = now.getFullYear()
  const last = new Date(y, m, 0).getDate()
  const day  = Math.min(billingDay, last)
  if (day >= d) return new Date(y, m - 1, day)
  const nm   = m === 12 ? 1  : m + 1
  const ny   = m === 12 ? y + 1 : y
  const nLast = new Date(ny, nm, 0).getDate()
  return new Date(ny, nm - 1, Math.min(billingDay, nLast))
}

export default function RecurringManager({ items: init, categories, paymentMethods, userId }: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [items, setItems]           = useState<RecurringExpense[]>(init)
  useEffect(() => { setItems(init) }, [init])

  // Sheet state
  const [sheetOpen, setSheetOpen]   = useState(false)
  const [editTarget, setEditTarget] = useState<RecurringExpense | null>(null)
  const [form, setForm]             = useState<Form>(DEFAULT)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [error, setError]           = useState('')

  const computedMonthly = useMemo(() => {
    if (!form.cuotas) return null
    const total = parseInt(form.totalAmount)
    const n = parseInt(form.numCuotas)
    if (!total || !n || n < 1) return null
    return Math.round(total / n)
  }, [form.cuotas, form.totalAmount, form.numCuotas])

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function openNew() {
    const defaultPm = paymentMethods.find(p => p.is_default)
    setForm({ ...DEFAULT, payment_method_id: defaultPm?.id ?? '' })
    setEditTarget(null); setError(''); setDeleteConfirm(false); setSheetOpen(true)
  }

  function openEdit(item: RecurringExpense) {
    const isCuotas = item.total_installments != null && item.total_installments > 0
    setForm({
      name: item.name,
      amount: String(item.amount),
      billing_day: String(item.billing_day),
      category_id: item.category_id ?? '',
      payment_method_id: item.payment_method_id ?? '',
      auto_register: item.auto_register,
      is_active: item.is_active,
      cuotas: isCuotas,
      totalAmount: isCuotas ? String(item.amount * (item.total_installments ?? 0)) : '',
      numCuotas: isCuotas ? String(item.total_installments) : '',
    })
    setEditTarget(item); setError(''); setDeleteConfirm(false); setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false); setForm(DEFAULT); setEditTarget(null); setError(''); setDeleteConfirm(false)
  }

  async function save() {
    if (!form.name.trim()) { setError('Escribe un nombre'); return }
    const day = parseInt(form.billing_day)
    if (!day || day < 1 || day > 31) { setError('Día de cobro debe ser entre 1 y 31'); return }
    if (!form.payment_method_id) { setError('Selecciona un método de pago'); return }

    let amt: number
    let totalInstallments: number | null = null

    if (form.cuotas) {
      const total = parseInt(form.totalAmount)
      const n = parseInt(form.numCuotas)
      if (!total || total <= 0) { setError('Ingresa el total a pagar'); return }
      if (!n || n < 2 || n > 120) { setError('El número de cuotas debe ser entre 2 y 120'); return }
      amt = Math.round(total / n)
      totalInstallments = n
    } else {
      amt = parseInt(form.amount)
      if (!amt || amt <= 0) { setError('Ingresa un monto válido'); return }
    }

    setSaving(true); setError('')
    const payload = {
      name: form.name.trim(),
      amount: amt,
      billing_day: day,
      category_id: form.category_id || null,
      payment_method_id: form.payment_method_id || null,
      auto_register: form.cuotas ? false : form.auto_register,
      is_active: form.is_active,
      domain: detectDomain(form.name.trim()) ?? null,
      total_installments: totalInstallments,
    }

    if (!editTarget) {
      const { data, error: err } = await supabase
        .from('recurring_expenses')
        .insert({ user_id: userId, ...payload, paid_installments: 0 })
        .select('*, category:categories(*), payment_method:payment_methods(*)')
        .single()
      setSaving(false)
      if (err) { setError(`Error: ${err.message}`); return }
      setItems(prev => [...prev, data].sort((a, b) => a.billing_day - b.billing_day))
    } else {
      const { error: err } = await supabase
        .from('recurring_expenses').update(payload).eq('id', editTarget.id)
      setSaving(false)
      if (err) { setError(`Error: ${err.message}`); return }
      setItems(prev =>
        prev.map(i => i.id === editTarget.id ? { ...i, ...payload } : i)
          .sort((a, b) => a.billing_day - b.billing_day)
      )
    }
    router.refresh(); closeSheet()
  }

  async function deleteItem() {
    if (!editTarget) return
    setDeleting(true)
    await supabase.from('recurring_expenses').delete().eq('id', editTarget.id)
    setItems(prev => prev.filter(i => i.id !== editTarget.id))
    setDeleting(false)
    router.refresh(); closeSheet()
  }

  async function toggleActive(item: RecurringExpense, e: React.MouseEvent) {
    e.stopPropagation()
    const next = !item.is_active
    await supabase.from('recurring_expenses').update({ is_active: next }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: next } : i))
    router.refresh()
  }

  // "Registrar ahora" — per-item state: null | 'loading' | 'done'
  const [registerState, setRegisterState] = useState<Record<string, 'loading' | 'done'>>({})

  async function registerNow(item: RecurringExpense, e: React.MouseEvent) {
    e.stopPropagation()
    if (registerState[item.id]) return
    setRegisterState(prev => ({ ...prev, [item.id]: 'loading' }))

    const today     = new Date()
    const dateStr   = today.toISOString().split('T')[0]

    await supabase.from('expenses').insert({
      user_id:              userId,
      amount:               item.amount,
      category_id:          item.category_id ?? null,
      payment_method_id:    item.payment_method_id ?? null,
      recurring_expense_id: item.id,
      description:          item.name,
      date:                 dateStr,
    })

    setRegisterState(prev => ({ ...prev, [item.id]: 'done' }))
    router.refresh()
    setTimeout(() => setRegisterState(prev => {
      const next = { ...prev }; delete next[item.id]; return next
    }), 2500)
  }

  const previewDomain = detectDomain(form.name) ?? null
  const previewAmount = form.cuotas ? (computedMonthly ?? 0) : (parseInt(form.amount) || 0)

  return (
    <>
      {/* ── Lista ── */}
      <div className="flex flex-col gap-4">
        <div className="card overflow-hidden divide-y divide-gray-50">
          {items.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">Sin gastos recurrentes aún</p>
          )}

          {items.map(item => {
            const isCuotas    = item.total_installments != null && item.total_installments > 0
            const isCompleted = isCuotas && (item.paid_installments ?? 0) >= (item.total_installments ?? 0)
            const next        = nextBillingDate(item.billing_day)
            const nextLabel   = next.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
            const progress    = isCuotas
              ? Math.min((item.paid_installments ?? 0) / item.total_installments!, 1)
              : null
            const regState    = registerState[item.id] ?? null
            const canRegister = item.is_active && !isCompleted

            return (
              <div
                key={item.id}
                onClick={() => openEdit(item)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && openEdit(item)}
                className={cn(
                  'w-full px-4 py-4 text-left transition-colors hover:bg-gray-50/60 active:bg-gray-100/50 cursor-pointer',
                  !item.is_active && 'opacity-60'
                )}
              >
                <div className="flex items-center gap-3">
                  <ServiceLogo domain={item.domain} name={item.name} size={40} className="flex-shrink-0" />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {item.category && (
                        <span className="cat-badge text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ '--cat-bg': item.category.bg_color, '--cat-color': item.category.color } as React.CSSProperties}>
                          {item.category.name}
                        </span>
                      )}
                      {item.auto_register && !isCuotas && (
                        <span className="text-[10px] bg-brand-50 text-brand-600 border border-brand-100 px-1.5 py-0.5 rounded-full font-medium">auto</span>
                      )}
                    </div>
                  </div>

                  <div className="hidden sm:block text-right flex-shrink-0 min-w-[90px]">
                    <p className="text-xs font-medium text-gray-700 tabular-nums">{nextLabel}</p>
                    <p className="text-[11px] text-gray-400">Próximo cargo</p>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCLP(item.amount)}</p>
                    <p className="text-[11px] text-gray-400">{isCuotas ? '/ cuota' : '/ mes'}</p>
                  </div>

                  {/* Botón "Registrar ahora" */}
                  {canRegister && (
                    <button
                      onClick={e => registerNow(item, e)}
                      disabled={!!regState}
                      title="Registrar gasto hoy"
                      className={cn(
                        'hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-all flex-shrink-0',
                        regState === 'done'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : regState === 'loading'
                            ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-wait'
                            : 'bg-white border-gray-200 text-gray-500 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50'
                      )}
                    >
                      {regState === 'done' ? (
                        <><Check className="w-3 h-3" /> Registrado</>
                      ) : regState === 'loading' ? (
                        <><RefreshCw className="w-3 h-3 animate-spin" /> Guardando</>
                      ) : (
                        <><Plus className="w-3 h-3" /> Registrar</>
                      )}
                    </button>
                  )}

                  <span className={cn(
                    'hidden sm:inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0',
                    item.is_active && !isCompleted ? 'bg-emerald-50 text-emerald-700'
                      : isCompleted ? 'bg-gray-100 text-gray-500'
                      : 'bg-amber-50 text-amber-700'
                  )}>
                    {isCompleted ? 'Completado' : item.is_active ? 'Activo' : 'Pausado'}
                  </span>

                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </div>

                {isCuotas && (
                  <div className="mt-2.5 ml-[52px] flex items-center gap-2">
                    <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(progress ?? 0) * 100}%`, backgroundColor: '#1B6DD4' }} />
                    </div>
                    <span className="text-[10px] text-gray-400 tabular-nums flex-shrink-0">
                      {item.paid_installments ?? 0}/{item.total_installments} cuotas
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={openNew}
          className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-brand-200 rounded-2xl text-sm font-bold text-brand-600 hover:border-brand-400 hover:bg-brand-50 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Agregar recurrente
        </button>
      </div>

      {/* ── Sheet ── */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center bg-black/50"
          onClick={closeSheet}
        >
          <div
            className="w-full lg:max-w-lg bg-white rounded-t-3xl lg:rounded-3xl max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle mobile */}
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1 lg:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-3 pb-3 lg:px-6 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">
                {editTarget ? 'Editar recurrente' : 'Nuevo recurrente'}
              </h2>
              <button onClick={closeSheet} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="px-5 pt-4 pb-5 lg:px-6 flex flex-col gap-4">
              {/* Preview */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-[#1a2744]">
                <ServiceLogo domain={previewDomain} name={form.name || '?'} size={44} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm truncate">{form.name || 'Nombre del servicio'}</p>
                  <p className="text-xs text-gray-400">
                    {formatCLP(previewAmount)} · día {form.billing_day || '?'}
                    {form.cuotas && form.numCuotas && ` · ${form.numCuotas} cuotas`}
                  </p>
                </div>
              </div>

              {/* Nombre */}
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Nombre</label>
                <input
                  type="text" value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="ej: Netflix, Arriendo, Gimnasio…" maxLength={40} autoFocus
                  className="sheet-input w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-brand-400 transition-colors"
                />
              </div>

              {/* Toggle cuotas */}
              <button
                onClick={() => set('cuotas', !form.cuotas)}
                className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left', form.cuotas ? 'sheet-toggle-active' : 'sheet-toggle')}
              >
                <CreditCard className={cn('w-4 h-4 flex-shrink-0', form.cuotas ? 'text-brand-600' : 'text-gray-300')} />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Pago en cuotas</p>
                  <p className="text-xs text-gray-400">Divide el total en N pagos mensuales</p>
                </div>
                <div className={cn('ml-auto w-9 h-5 rounded-full relative transition-colors flex-shrink-0', form.cuotas ? 'bg-brand-600' : 'bg-gray-200')}>
                  <div className={cn('absolute top-0.5 w-4 h-4 rounded-full shadow transition-transform', form.cuotas ? 'bg-white translate-x-4' : 'bg-white translate-x-0.5')} />
                </div>
              </button>

              {/* Monto */}
              {form.cuotas ? (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1.5">Total a pagar</label>
                      <input type="text" inputMode="numeric"
                        value={form.totalAmount ? fmtNum(form.totalAmount) : ''}
                        onChange={e => set('totalAmount', e.target.value.replace(/\D/g, ''))}
                        placeholder="0"
                        className="sheet-input w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-400 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1.5">N° de cuotas</label>
                      <input type="number" inputMode="numeric" value={form.numCuotas}
                        onChange={e => set('numCuotas', e.target.value)}
                        placeholder="ej: 12" min="2" max="120"
                        className="sheet-input w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-400 transition-colors"
                      />
                    </div>
                  </div>
                  {computedMonthly != null && (
                    <div className="flex items-center justify-between px-4 py-2.5 bg-brand-50 border border-brand-100 rounded-xl">
                      <span className="text-xs font-semibold text-brand-700">Cuota mensual</span>
                      <span className="text-sm font-bold text-brand-900 tabular-nums">{formatCLP(computedMonthly)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">Monto mensual</label>
                  <input type="text" inputMode="numeric"
                    value={form.amount ? fmtNum(form.amount) : ''}
                    onChange={e => set('amount', e.target.value.replace(/\D/g, ''))}
                    placeholder="0"
                    className="sheet-input w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-400 transition-colors"
                  />
                </div>
              )}

              {/* Día de cobro */}
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Día de cobro</label>
                <input type="number" inputMode="numeric" value={form.billing_day}
                  onChange={e => set('billing_day', e.target.value)}
                  placeholder="1–31" min="1" max="31"
                  className="sheet-input w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-400 transition-colors"
                />
              </div>

              {/* Categoría */}
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-2">Categoría</label>
                <div className="flex flex-wrap gap-2">
                  {categories.map(c => {
                    const selected = form.category_id === c.id
                    return (
                      <button key={c.id}
                        onClick={() => set('category_id', selected ? '' : c.id)}
                        className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all',
                          selected ? 'cat-badge border-transparent font-semibold' : 'sheet-chip'
                        )}
                        style={selected ? { '--cat-bg': c.bg_color, '--cat-color': c.color } as React.CSSProperties : undefined}
                      >
                        {isEmoji(c.icon)
                          ? <span className="text-base">{c.icon}</span>
                          : (() => { const Icon = getCategoryIcon(c.icon); return <Icon className="w-3.5 h-3.5" style={{ color: selected ? c.color : undefined }} /> })()
                        }
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Método de pago */}
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-2">
                  Método de pago <span className="text-red-400">*</span>
                </label>
                {paymentMethods.length === 0 ? (
                  <a href="/metodos" className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-dashed border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors">
                    <CreditCard className="w-4 h-4 flex-shrink-0" />
                    <span className="text-xs font-semibold">Agrega un método de pago →</span>
                  </a>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {paymentMethods.map(p => (
                      <button key={p.id}
                        onClick={() => set('payment_method_id', form.payment_method_id === p.id ? '' : p.id)}
                        className={cn('px-3 py-1.5 rounded-full text-xs border transition-all',
                          form.payment_method_id === p.id ? 'sheet-chip-active' : 'sheet-chip'
                        )}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Auto-registrar */}
              <button
                onClick={() => set('auto_register', !form.auto_register)}
                className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left', form.auto_register ? 'sheet-toggle-active' : 'sheet-toggle')}
              >
                <RefreshCw className={cn('w-4 h-4 flex-shrink-0', form.auto_register ? 'text-brand-600' : 'text-gray-300')} />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Registrar automáticamente</p>
                  <p className="text-xs text-gray-400">
                    {form.cuotas
                      ? 'Cada cuota se registra sola al inicio del período de facturación'
                      : 'La app crea el gasto sola el día de cobro'}
                  </p>
                </div>
                <div className={cn('ml-auto w-9 h-5 rounded-full relative transition-colors flex-shrink-0', form.auto_register ? 'bg-brand-600' : 'bg-gray-200')}>
                  <div className={cn('absolute top-0.5 w-4 h-4 rounded-full shadow transition-transform', form.auto_register ? 'bg-white translate-x-4' : 'bg-white translate-x-0.5')} />
                </div>
              </button>

              {/* Pausar/Reactivar (solo edición) */}
              {editTarget && (() => {
                const isCuotas    = editTarget.total_installments != null && editTarget.total_installments > 0
                const isCompleted = isCuotas && (editTarget.paid_installments ?? 0) >= (editTarget.total_installments ?? 0)
                if (isCompleted) return null
                return (
                  <button
                    onClick={() => set('is_active', !form.is_active)}
                    className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left', !form.is_active ? 'sheet-toggle-warn' : 'sheet-toggle')}
                  >
                    {form.is_active
                      ? <Pause className="w-4 h-4 flex-shrink-0 text-gray-300" />
                      : <Play className="w-4 h-4 flex-shrink-0 text-amber-500" />
                    }
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{form.is_active ? 'Pausar suscripción' : 'Reactivar suscripción'}</p>
                      <p className="text-xs text-gray-400">{form.is_active ? 'No se registrará mientras esté pausada' : 'Volverá a registrarse normalmente'}</p>
                    </div>
                    <div className={cn('ml-auto w-9 h-5 rounded-full relative transition-colors flex-shrink-0', form.is_active ? 'bg-gray-200' : 'bg-amber-400')}>
                      <div className={cn('absolute top-0.5 w-4 h-4 rounded-full shadow transition-transform', form.is_active ? 'bg-white translate-x-0.5' : 'bg-white translate-x-4')} />
                    </div>
                  </button>
                )
              })()}

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{error}</p>
              )}

              {/* Acciones */}
              {deleteConfirm ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-700 text-center">¿Eliminar este recurrente?</p>
                  <div className="flex gap-2">
                    <button onClick={() => setDeleteConfirm(false)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors">
                      Cancelar
                    </button>
                    <button onClick={deleteItem} disabled={deleting} className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5">
                      {deleting ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <><Trash2 className="w-4 h-4" /> Eliminar</>}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  {editTarget && (
                    <button onClick={() => setDeleteConfirm(true)} className="logout-btn p-2.5 border text-red-400 rounded-xl transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={closeSheet} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={save} disabled={saving} className="flex-1 py-2.5 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5" style={{ backgroundColor: '#1B6DD4' }}>
                    {saving
                      ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <><Check className="w-4 h-4" />{editTarget ? 'Guardar' : 'Agregar'}</>
                    }
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
