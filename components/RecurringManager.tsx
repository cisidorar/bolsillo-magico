'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Check, X, RefreshCw, Pause, Play, CreditCard, ChevronRight, Lock, Info } from 'lucide-react'
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
  pastCuotas: string   // cuotas ya cobradas antes de hoy (para backfill)
}

const DEFAULT: Form = {
  name: '', amount: '', billing_day: '',
  category_id: '', payment_method_id: '',
  auto_register: false, is_active: true,
  cuotas: false, totalAmount: '', numCuotas: '3', pastCuotas: '0',
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
  const [showAllCats, setShowAllCats] = useState(false)

  const computedMonthly = useMemo(() => {
    if (!form.cuotas) return null
    const total = parseInt(form.totalAmount)
    const n = parseInt(form.numCuotas)
    if (!total || !n || n < 1) return null
    return Math.round(total / n)
  }, [form.cuotas, form.totalAmount, form.numCuotas])

  // Categorías ordenadas por uso (top 5 por defecto)
  const sortedCategories = useMemo(() => {
    const count: Record<string, number> = {}
    items.forEach(it => { if (it.category_id) count[it.category_id] = (count[it.category_id] || 0) + 1 })
    return [...categories].sort((a, b) => {
      const diff = (count[b.id] || 0) - (count[a.id] || 0)
      return diff !== 0 ? diff : ((a as Record<string, unknown>).sort_order as number ?? 99) - ((b as Record<string, unknown>).sort_order as number ?? 99)
    })
  }, [items, categories])

  // Cuotas: sólo tarjetas de crédito
  const creditCards = useMemo(() => paymentMethods.filter(p => p.card_type === 'credit'), [paymentMethods])
  const visiblePaymentMethods = useMemo(
    () => form.cuotas ? creditCards : paymentMethods,
    [form.cuotas, creditCards, paymentMethods]
  )

  // Tarjeta seleccionada y día de cobro automático
  const selectedCard = useMemo(
    () => paymentMethods.find(p => p.id === form.payment_method_id),
    [paymentMethods, form.payment_method_id]
  )
  const autoBillingDay = form.cuotas && selectedCard?.billing_day ? selectedCard.billing_day : null
  // El gasto se registra el primer día del período: billing_day + 1 (con wrap de mes)
  const chargeDay = autoBillingDay != null ? (autoBillingDay >= 28 ? 1 : autoBillingDay + 1) : null

  // Cuando cuotas=ON y cambia la tarjeta, sincronizar billing_day automáticamente
  useEffect(() => {
    if (!form.cuotas) return
    const card = paymentMethods.find(p => p.id === form.payment_method_id)
    if (card?.billing_day != null) {
      setForm(f => ({ ...f, billing_day: String(card.billing_day) }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.payment_method_id, form.cuotas])

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function handleCuotasToggle() {
    if (!form.cuotas) {
      // Activar: auto-seleccionar primera tarjeta de crédito
      const defaultCC = creditCards.find(c => c.is_default) ?? creditCards[0]
      setForm(f => ({
        ...f,
        cuotas: true,
        numCuotas: f.numCuotas || '3',
        payment_method_id: defaultCC?.id ?? f.payment_method_id,
        billing_day: defaultCC?.billing_day != null ? String(defaultCC.billing_day) : f.billing_day,
      }))
    } else {
      setForm(f => ({ ...f, cuotas: false }))
    }
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
      pastCuotas: '0', // en edición no se retroactúa
    })
    setEditTarget(item); setError(''); setDeleteConfirm(false); setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false); setForm(DEFAULT); setEditTarget(null); setError(''); setDeleteConfirm(false); setShowAllCats(false)
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
      const past = parseInt(form.pastCuotas) || 0
      if (!total || total <= 0) { setError('Ingresa el total a pagar'); return }
      if (!n || n < 2 || n > 120) { setError('El número de cuotas debe ser entre 2 y 120'); return }
      if (past >= n) { setError(`Las cuotas cobradas (${past}) deben ser menos que el total (${n})`); return }
      amt = Math.round(total / n)
      totalInstallments = n
    } else {
      amt = parseInt(form.amount)
      if (!amt || amt <= 0) { setError('Ingresa un monto válido'); return }
    }

    setSaving(true); setError('')
    const past = form.cuotas ? Math.max(0, Math.min(parseInt(form.pastCuotas) || 0, (totalInstallments ?? 1) - 1)) : 0

    const payload = {
      name: form.name.trim(),
      amount: amt,
      billing_day: day,
      category_id: form.category_id || null,
      payment_method_id: form.payment_method_id || null,
      auto_register: form.auto_register,
      is_active: form.is_active,
      domain: detectDomain(form.name.trim()) ?? null,
      total_installments: totalInstallments,
    }

    if (!editTarget) {
      const { data, error: err } = await supabase
        .from('recurring_expenses')
        .insert({ user_id: userId, ...payload, paid_installments: past })
        .select('*, category:categories(*), payment_method:payment_methods(*)')
        .single()
      setSaving(false)
      if (err) { setError(`Error: ${err.message}`); return }

      // Registrar cuotas: backfill de períodos anteriores + período actual de inmediato
      if (data && totalInstallments != null) {
        const today    = new Date()
        const todayStr = today.toISOString().split('T')[0]
        const { billingPeriod, billingPeriodRange } = await import('@/lib/utils')

        const { month: currM, year: currY } = billingPeriod(todayStr, day)
        const expensesToInsert: object[] = []

        // Backfill: cuotas anteriores (primer día de cada período)
        for (let i = past; i >= 1; i--) {
          let m = currM - i
          let y = currY
          while (m <= 0) { m += 12; y-- }
          const { start } = billingPeriodRange(m, y, day)
          expensesToInsert.push({
            user_id:              userId,
            amount:               amt,
            category_id:          form.category_id || null,
            payment_method_id:    form.payment_method_id || null,
            recurring_expense_id: data.id,
            description:          form.name.trim(),
            date:                 start,
          })
        }

        // Cuota del período actual — registrar de inmediato (primer día)
        const { start: currStart } = billingPeriodRange(currM, currY, day)
        expensesToInsert.push({
          user_id:              userId,
          amount:               amt,
          category_id:          form.category_id || null,
          payment_method_id:    form.payment_method_id || null,
          recurring_expense_id: data.id,
          description:          form.name.trim(),
          date:                 currStart,
        })

        await supabase.from('expenses').insert(expensesToInsert)

        // Actualizar paid_installments: backfill + cuota actual
        const newPaid = past + 1
        const isDone  = newPaid >= totalInstallments
        await supabase
          .from('recurring_expenses')
          .update({ paid_installments: newPaid, ...(isDone ? { is_active: false } : {}) })
          .eq('id', data.id)
      }

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
            const canRegister = item.is_active && !isCompleted && !item.auto_register

            return (
              <div
                key={item.id}
                onClick={() => openEdit(item)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && openEdit(item)}
                className={cn(
                  'w-full px-4 py-4 text-left transition-colors hover:bg-gray-50/60 active:bg-brand-50/40 cursor-pointer',
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
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-sm font-bold text-brand-600 transition-colors"
          style={{ background: 'var(--surface)', border: '1.5px dashed var(--border)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-soft)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
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
            <div className="flex items-start justify-between px-5 pt-3 pb-3 lg:px-6 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {editTarget ? 'Editar recurrente' : 'Nuevo recurrente'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Suscripciones y cuotas que se repiten cada mes</p>
              </div>
              <button onClick={closeSheet} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="px-5 pt-4 pb-5 lg:px-6 flex flex-col gap-4">
              {/* Preview */}
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <ServiceLogo domain={previewDomain} name={form.name || '?'} size={44} className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm truncate">{form.name || 'Nombre del servicio'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatCLP(previewAmount)}{form.cuotas ? ' / cuota' : ' / mes'}
                    {' · cobro día '}
                    {form.cuotas && chargeDay ? chargeDay : form.billing_day || '—'}
                    {form.cuotas && form.numCuotas ? ` · ${form.numCuotas} cuotas` : ''}
                  </p>
                </div>
                <span className="text-[10px] font-medium text-gray-400 flex-shrink-0">Vista previa</span>
              </div>

              {/* Nombre */}
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Nombre del servicio</label>
                <input
                  type="text" value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="ej: Netflix, Arriendo, Gimnasio…" maxLength={40} autoFocus
                  className="sheet-input w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-brand-400 transition-colors"
                />
              </div>

              {/* Toggle cuotas */}
              <button
                onClick={handleCuotasToggle}
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
                  {/* Monto total + N° cuotas en misma fila */}
                  <div className="grid grid-cols-[1fr_160px] gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1.5">Monto total</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400 pointer-events-none">$</span>
                        <input type="text" inputMode="numeric"
                          value={form.totalAmount ? fmtNum(form.totalAmount) : ''}
                          onChange={e => set('totalAmount', e.target.value.replace(/\D/g, ''))}
                          placeholder="0"
                          className="sheet-input w-full bg-gray-50 border border-gray-200 rounded-xl pl-7 pr-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-400 transition-colors"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1.5">N° de cuotas</label>
                      <div className="flex items-center rounded-xl overflow-hidden h-[42px]" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                        <button
                          type="button"
                          onClick={() => set('numCuotas', String(Math.max(2, (parseInt(form.numCuotas) || 3) - 1)))}
                          className="w-10 h-full flex items-center justify-center font-bold text-lg transition-colors flex-shrink-0"
                          style={{ color: 'var(--primary)' }}
                        >−</button>
                        <span className="flex-1 text-center text-sm font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>
                          {parseInt(form.numCuotas) || 3}
                        </span>
                        <button
                          type="button"
                          onClick={() => set('numCuotas', String(Math.min(120, (parseInt(form.numCuotas) || 3) + 1)))}
                          className="w-10 h-full flex items-center justify-center font-bold text-lg transition-colors flex-shrink-0"
                          style={{ color: 'var(--primary)' }}
                        >+</button>
                      </div>
                    </div>
                  </div>

                  {/* Cuota mensual calculada */}
                  <div
                    className="flex items-center justify-between px-4 py-2.5 rounded-xl transition-all"
                    style={computedMonthly != null
                      ? { background: 'var(--primary-soft)', border: '1px solid var(--primary)', borderColor: 'color-mix(in srgb, var(--primary) 40%, transparent)' }
                      : { background: 'var(--surface-2)', border: '1px solid var(--border)' }
                    }
                  >
                    <span className="text-xs font-semibold" style={{ color: computedMonthly != null ? 'var(--primary)' : 'var(--ink-3)' }}>Cuota mensual</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: computedMonthly != null ? 'var(--ink)' : 'var(--ink-3)' }}>
                      {computedMonthly != null ? formatCLP(computedMonthly) : '—'}
                    </span>
                  </div>

                  {/* Día de cobro — auto (bloqueado) */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Día de cobro</label>
                    <div
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
                      style={chargeDay
                        ? { background: 'var(--primary-soft)', border: '1px solid color-mix(in srgb, var(--primary) 35%, transparent)' }
                        : { background: 'var(--bg)', border: '1px solid var(--border)' }
                      }
                    >
                      <span className="flex-1 text-sm font-semibold" style={{ color: chargeDay ? 'var(--primary)' : 'var(--ink-3)' }}>
                        {chargeDay ? `Día ${chargeDay} de cada mes` : 'Selecciona una tarjeta primero'}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ color: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 15%, var(--surface-2))' }}>
                        <Lock className="w-2.5 h-2.5" /> auto
                      </span>
                    </div>
                  </div>

                  {/* Info box */}
                  {chargeDay != null && parseInt(form.numCuotas) >= 2 && (
                    <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl"
                      style={{ background: 'var(--primary-soft)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}>
                      <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--primary)' }} />
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                        La cuota del período actual se registra al guardar. Las siguientes se registrarán el{' '}
                        <strong style={{ color: 'var(--primary)' }}>día {chargeDay} de cada mes</strong> durante{' '}
                        <strong style={{ color: 'var(--primary)' }}>{form.numCuotas} meses</strong>.{' '}
                        Basado en el corte de {selectedCard?.name ?? 'la tarjeta'} (día {autoBillingDay}).
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                /* Monto mensual + Día de cobro en la misma fila */
                <div className="grid grid-cols-[1fr_120px] gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Monto mensual</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400 pointer-events-none">$</span>
                      <input type="text" inputMode="numeric"
                        value={form.amount ? fmtNum(form.amount) : ''}
                        onChange={e => set('amount', e.target.value.replace(/\D/g, ''))}
                        placeholder="0"
                        className="sheet-input w-full bg-gray-50 border border-gray-200 rounded-xl pl-7 pr-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-400 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Día de cobro</label>
                    <input type="number" inputMode="numeric" value={form.billing_day}
                      onChange={e => set('billing_day', e.target.value)}
                      placeholder="1–31" min="1" max="31"
                      className="sheet-input w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 text-center outline-none focus:border-brand-400 transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* Categoría */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-500">Categoría</label>
                  {categories.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setShowAllCats(v => !v)}
                      className="text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
                    >
                      {showAllCats ? 'Ver menos' : `Ver todas (${categories.length})`}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(showAllCats ? sortedCategories : sortedCategories.slice(0, 5)).map(c => {
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
                  {/* Si la categoría seleccionada no está visible, mostrarla igual */}
                  {!showAllCats && form.category_id && !sortedCategories.slice(0, 5).find(c => c.id === form.category_id) && (() => {
                    const c = categories.find(c => c.id === form.category_id)
                    if (!c) return null
                    return (
                      <button key={c.id}
                        onClick={() => set('category_id', '')}
                        className="cat-badge flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border-transparent font-semibold"
                        style={{ '--cat-bg': c.bg_color, '--cat-color': c.color } as React.CSSProperties}
                      >
                        {isEmoji(c.icon)
                          ? <span className="text-base">{c.icon}</span>
                          : (() => { const Icon = getCategoryIcon(c.icon); return <Icon className="w-3.5 h-3.5" style={{ color: c.color }} /> })()
                        }
                        {c.name}
                      </button>
                    )
                  })()}
                </div>
              </div>

              {/* Método de pago */}
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-2">
                  Método de pago{form.cuotas && <span className="text-brand-500 ml-1">· Solo tarjetas de crédito</span>}
                  <span className="text-red-400 ml-0.5">*</span>
                </label>
                {visiblePaymentMethods.length === 0 ? (
                  <a href="/metodos" className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-dashed border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors">
                    <CreditCard className="w-4 h-4 flex-shrink-0" />
                    <span className="text-xs font-semibold">
                      {form.cuotas ? 'Agrega una tarjeta de crédito para usar cuotas →' : 'Agrega un método de pago →'}
                    </span>
                  </a>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {visiblePaymentMethods.map(p => (
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

              {/* Cuotas ya cobradas — en creación de cuotas */}
              {form.cuotas && !editTarget && (() => {
                const total = parseInt(form.numCuotas) || 0
                const past  = parseInt(form.pastCuotas) || 0
                return (
                  <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    <div className="px-4 pt-3 pb-3" style={{ background: 'var(--surface-2)' }}>
                      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>¿Cuántas cuotas ya fueron cobradas?</p>
                      <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--ink-3)' }}>
                        Se registrarán en los estados de facturación anteriores.
                      </p>
                    </div>
                    <div className="flex items-center" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <button
                        type="button"
                        onClick={() => set('pastCuotas', String(Math.max(0, past - 1)))}
                        className="w-14 h-12 flex items-center justify-center font-bold text-xl transition-colors flex-shrink-0"
                        style={{ color: 'var(--primary)' }}
                      >−</button>
                      <div className="flex-1 text-center">
                        <span className="text-3xl font-extrabold tabular-nums" style={{ color: 'var(--primary)' }}>{past}</span>
                        {total > 0 && (
                          <span className="text-xs ml-1.5" style={{ color: 'var(--ink-3)' }}>de {total}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => set('pastCuotas', String(Math.min(total > 0 ? total - 1 : 99, past + 1)))}
                        className="w-14 h-12 flex items-center justify-center font-bold text-xl transition-colors flex-shrink-0"
                        style={{ color: 'var(--primary)' }}
                      >+</button>
                    </div>
                    <p className="text-[11px] font-semibold text-center px-4 py-2" style={{ color: 'var(--primary)', background: 'var(--primary-soft)', borderTop: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)' }}>
                      {past > 0
                        ? `${past} cuota${past > 1 ? 's' : ''} anterior${past > 1 ? 'es' : ''} + cuota actual → ${past + 1} gastos en total`
                        : 'Se registrará la cuota del período actual'}
                    </p>
                  </div>
                )
              })()}

              {/* Pausar/Reactivar (solo edición) */}
              {editTarget && (() => {
                const isCuotas    = editTarget.total_installments != null && editTarget.total_installments > 0
                const isCompleted = isCuotas && (editTarget.paid_installments ?? 0) >= (editTarget.total_installments ?? 0)
                if (isCuotas || isCompleted) return null
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
