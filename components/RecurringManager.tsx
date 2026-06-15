'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Pencil, Check, X, RefreshCw, Pause, Play, CreditCard } from 'lucide-react'
import { cn, formatCLP, isEmoji } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import { detectDomain } from '@/lib/services'
import ServiceLogo from './ServiceLogo'
import type { RecurringExpense, Category, PaymentMethod } from '@/types'

/** Formatea dígitos con punto de miles: "100000" → "100.000" */
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
  // cuotas
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

export default function RecurringManager({ items: init, categories, paymentMethods, userId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [items, setItems]                     = useState<RecurringExpense[]>(init)

  // Sincronizar cuando el server refresca (ej: después de registrar una cuota)
  useEffect(() => { setItems(init) }, [init])
  const [mode, setMode]                       = useState<'list' | 'new' | 'edit'>('list')
  const [editTarget, setEditTarget]           = useState<RecurringExpense | null>(null)
  const [form, setForm]                       = useState<Form>(DEFAULT)
  const [saving, setSaving]               = useState(false)
  const [deleting, setDeleting]           = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [error, setError]                 = useState('')

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  // Computed monthly amount when in cuotas mode
  const computedMonthly = useMemo(() => {
    if (!form.cuotas) return null
    const total = parseInt(form.totalAmount)
    const n = parseInt(form.numCuotas)
    if (!total || !n || n < 1) return null
    return Math.round(total / n)
  }, [form.cuotas, form.totalAmount, form.numCuotas])

  function openNew() {
    setForm(DEFAULT); setError(''); setMode('new')
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
    setEditTarget(item); setError(''); setMode('edit')
  }

  function cancel() {
    setMode('list'); setForm(DEFAULT); setEditTarget(null); setError('')
  }

  async function save() {
    if (!form.name.trim()) { setError('Escribe un nombre'); return }
    const day = parseInt(form.billing_day)
    if (!day || day < 1 || day > 28) { setError('Día de cobro debe ser entre 1 y 28'); return }
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

    if (mode === 'new') {
      const { data, error: err } = await supabase
        .from('recurring_expenses')
        .insert({ user_id: userId, ...payload, paid_installments: 0 })
        .select('*, category:categories(*), payment_method:payment_methods(*)')
        .single()
      setSaving(false)
      if (err) { setError(`Error: ${err.message}`); return }
      setItems(prev => [...prev, data].sort((a, b) => a.billing_day - b.billing_day))
    } else if (mode === 'edit' && editTarget) {
      const { error: err } = await supabase
        .from('recurring_expenses').update(payload).eq('id', editTarget.id)
      setSaving(false)
      if (err) { setError(`Error: ${err.message}`); return }
      setItems(prev =>
        prev.map(i => i.id === editTarget.id ? { ...i, ...payload } : i)
          .sort((a, b) => a.billing_day - b.billing_day)
      )
    }
    router.refresh(); cancel()
  }

  async function deleteItem(id: string) {
    setDeleting(id)
    await supabase.from('recurring_expenses').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    setDeleting(null); setPendingDelete(null)
    router.refresh()
  }

  async function toggleActive(item: RecurringExpense) {
    const next = !item.is_active
    await supabase.from('recurring_expenses').update({ is_active: next }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: next } : i))
    router.refresh()
  }

  // ── Lista ────────────────────────────────────────────────────────────────
  if (mode === 'list') return (
    <div className="flex flex-col gap-4">
      <div className="card overflow-hidden divide-y divide-gray-50">
        {items.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">Sin gastos recurrentes aún</p>
        )}
        {items.map(item => {
          const isCuotas = item.total_installments != null && item.total_installments > 0
          const progress = isCuotas
            ? Math.min((item.paid_installments ?? 0) / item.total_installments!, 1)
            : null
          const isCompleted = isCuotas && (item.paid_installments ?? 0) >= (item.total_installments ?? 0)

          return (
            <div key={item.id} className={cn('px-4 py-3.5', !item.is_active && 'opacity-50')}>
              <div className="flex items-center gap-3">
                <ServiceLogo domain={item.domain} name={item.name} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800 truncate">{item.name}</span>
                    {isCuotas ? (
                      <span className="text-[10px] bg-brand-50 text-brand-700 border border-brand-100 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                        {item.paid_installments ?? 0}/{item.total_installments} cuotas
                      </span>
                    ) : item.auto_register ? (
                      <span className="text-[10px] bg-brand-50 text-brand-700 border border-brand-100 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">auto</span>
                    ) : null}
                    {!item.is_active && (
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        {isCompleted ? 'completado' : 'pausado'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    Día {item.billing_day} · {item.payment_method?.name ?? 'Sin método'}
                  </p>
                  {isCuotas && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${(progress ?? 0) * 100}%`, backgroundColor: '#1B6DD4' }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 tabular-nums flex-shrink-0">
                        {Math.round((progress ?? 0) * 100)}%
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCLP(item.amount)}</p>
                  <p className="text-xs text-gray-400">{isCuotas ? '/ cuota' : '/ mes'}</p>
                </div>
              </div>
              {/* Acciones */}
              <div className="flex items-center gap-1 mt-2">
                {!item.is_active && pendingDelete !== item.id && !isCompleted && (
                  <button
                    onClick={() => toggleActive(item)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    <Play className="w-3 h-3 fill-emerald-700" />
                    Reactivar
                  </button>
                )}

                <div className="flex items-center gap-1 ml-auto">
                  {pendingDelete === item.id ? (
                    <>
                      <span className="text-xs text-red-500 font-medium mr-1">¿Eliminar?</span>
                      <button onClick={() => setPendingDelete(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteItem(item.id)} disabled={deleting === item.id} className="p-1.5 rounded-lg text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-60">
                        {deleting === item.id
                          ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : <Check className="w-3.5 h-3.5" />
                        }
                      </button>
                    </>
                  ) : (
                    <>
                      {item.is_active && (
                        <button onClick={() => toggleActive(item)} className="p-2 text-gray-300 hover:text-amber-500 transition-colors" title="Pausar">
                          <Pause className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => openEdit(item)} className="p-2 text-gray-300 hover:text-brand-600 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setPendingDelete(item.id)} className="p-2 text-gray-300 hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {items.length > 0 && (
          <div className="px-4 py-3 flex items-center justify-between bg-brand-50 border-t border-brand-100">
            <span className="text-sm font-bold text-gray-600">Total mensual</span>
            <span className="text-sm font-bold text-brand-900 tabular-nums">
              {formatCLP(items.filter(i => i.is_active).reduce((s, i) => s + i.amount, 0))}
            </span>
          </div>
        )}
      </div>

      <button
        onClick={openNew}
        className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-brand-200 rounded-2xl text-sm font-bold text-brand-600 hover:border-brand-400 hover:bg-brand-50 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Agregar recurrente
      </button>
    </div>
  )

  // ── Formulario ────────────────────────────────────────────────────────────
  const previewDomain = detectDomain(form.name) ?? null
  const previewAmount = form.cuotas ? (computedMonthly ?? 0) : (parseInt(form.amount) || 0)

  return (
    <div className="card p-5 flex flex-col gap-4">

      {/* Preview */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
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
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-brand-400 transition-colors"
        />
      </div>

      {/* Toggle cuotas */}
      <button
        onClick={() => set('cuotas', !form.cuotas)}
        className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left',
          form.cuotas ? 'bg-brand-50 border-brand-200' : 'bg-gray-50 border-gray-200'
        )}
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

      {/* Monto — cuotas vs mensual */}
      {form.cuotas ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1.5">Total a pagar</label>
              <input
                type="text" inputMode="numeric"
                value={form.totalAmount ? fmtNum(form.totalAmount) : ''}
                onChange={e => set('totalAmount', e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-brand-400 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1.5">Número de cuotas</label>
              <input
                type="number" inputMode="numeric" value={form.numCuotas}
                onChange={e => set('numCuotas', e.target.value)}
                placeholder="ej: 12" min="2" max="120"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-brand-400 transition-colors"
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
          <input
            type="text" inputMode="numeric"
            value={form.amount ? fmtNum(form.amount) : ''}
            onChange={e => set('amount', e.target.value.replace(/\D/g, ''))}
            placeholder="0"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-brand-400 transition-colors"
          />
        </div>
      )}

      {/* Día de cobro */}
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1.5">Día de cobro</label>
        <input
          type="number" inputMode="numeric" value={form.billing_day}
          onChange={e => set('billing_day', e.target.value)}
          placeholder="1–28" min="1" max="28"
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-brand-400 transition-colors"
        />
      </div>

      {/* Categoría */}
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-2">Categoría</label>
        <div className="flex flex-wrap gap-2">
          {categories.map(c => (
            <button key={c.id}
              onClick={() => set('category_id', form.category_id === c.id ? '' : c.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all',
                form.category_id === c.id
                  ? 'border-brand-600 bg-brand-50 text-brand-800 font-semibold'
                  : 'border-gray-200 bg-gray-50 text-gray-600'
              )}
            >
              {isEmoji(c.icon)
                ? <span className="text-base">{c.icon}</span>
                : (() => { const Icon = getCategoryIcon(c.icon); return <Icon className="w-3.5 h-3.5" style={{ color: form.category_id === c.id ? c.color : '#9CA3AF' }} /> })()
              }
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Método de pago */}
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-2">
          Método de pago <span className="text-red-400">*</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {paymentMethods.map(p => (
            <button key={p.id}
              onClick={() => set('payment_method_id', form.payment_method_id === p.id ? '' : p.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs border transition-all',
                form.payment_method_id === p.id
                  ? 'border-brand-600 bg-brand-50 text-brand-800 font-semibold'
                  : 'border-gray-200 bg-gray-50 text-gray-600'
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Auto-registrar (solo cuando no es cuotas) */}
      {!form.cuotas && (
        <button
          onClick={() => set('auto_register', !form.auto_register)}
          className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left',
            form.auto_register ? 'bg-brand-50 border-brand-200' : 'bg-gray-50 border-gray-200'
          )}
        >
          <RefreshCw className={cn('w-4 h-4 flex-shrink-0', form.auto_register ? 'text-brand-600' : 'text-gray-300')} />
          <div>
            <p className="text-sm font-semibold text-gray-800">Registrar automáticamente</p>
            <p className="text-xs text-gray-400">La app crea el gasto sola el día de cobro</p>
          </div>
          <div className={cn('ml-auto w-9 h-5 rounded-full relative transition-colors flex-shrink-0', form.auto_register ? 'bg-brand-600' : 'bg-gray-200')}>
            <div className={cn('absolute top-0.5 w-4 h-4 rounded-full shadow transition-transform', form.auto_register ? 'bg-white translate-x-4' : 'bg-white translate-x-0.5')} />
          </div>
        </button>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2">
        <button onClick={cancel} className="flex-1 py-2.5 border border-brand-200 text-brand-700 text-sm font-semibold rounded-xl hover:bg-brand-50 transition-colors flex items-center justify-center gap-1.5">
          <X className="w-4 h-4" /> Cancelar
        </button>
        <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5">
          {saving
            ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : <><Check className="w-4 h-4" />{mode === 'edit' ? 'Guardar cambios' : 'Agregar'}</>
          }
        </button>
      </div>
    </div>
  )
}
