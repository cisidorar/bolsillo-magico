'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { X, Delete, CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { cn, formatCLP, isEmoji } from '@/lib/utils'
import { getCategoryIcon } from '@/lib/category-icons'
import type { Category, PaymentMethod, ExpenseWithRelations } from '@/types'

interface Props {
  categories?: Category[]
  paymentMethods?: PaymentMethod[]
  isOpen?: boolean
  onClose?: () => void
  fetchData?: boolean
  editExpense?: ExpenseWithRelations | null
}

export default function ExpenseSheet({
  categories: initCats = [],
  paymentMethods: initPMs = [],
  isOpen: externalOpen,
  onClose,
  fetchData,
  editExpense,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])
  const yesterdayStr = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] }, [])
  const dayBeforeStr = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 2); return d.toISOString().split('T')[0] }, [])

  const [amount, setAmount]   = useState('')
  const [catId, setCatId]     = useState<string | null>(null)
  const [pmId, setPmId]       = useState<string | null>(null)
  const [dateStr, setDateStr] = useState(todayStr)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [desc, setDesc]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const [cats, setCats] = useState<Category[]>(initCats)
  const [pms, setPMs]   = useState<PaymentMethod[]>(initPMs)

  // Indica si el usuario eligió el método manualmente (evita que el autoselect sobreescriba)
  const pmUserPicked = useRef(false)

  const isEditing = !!editExpense

  // Pre-fill when editing
  useEffect(() => {
    if (isOpen && editExpense) {
      setAmount(String(editExpense.amount))
      setCatId(editExpense.category_id)
      setPmId(editExpense.payment_method_id)
      setDateStr(editExpense.date)
      setDesc(editExpense.description ?? '')
      setError('')
      // if date isn't a quick option, show picker
      const quick = [todayStr, yesterdayStr, dayBeforeStr]
      setShowDatePicker(!quick.includes(editExpense.date))
    }
  }, [isOpen, editExpense, todayStr, yesterdayStr, dayBeforeStr])

  // Fetch data when opening (FAB mode or edit mode)
  // RLS filtra automáticamente por usuario autenticado — no necesita eq('user_id')
  useEffect(() => {
    if ((fetchData || isEditing) && isOpen) {
      supabase.from('categories').select('*').order('sort_order')
        .then(({ data }) => data && setCats(data))
      supabase.from('payment_methods').select('*').order('sort_order')
        .then(({ data }) => {
          if (data) {
            setPMs(data)
            if (!editExpense) {
              const def = data.find((p: PaymentMethod) => p.is_default)
              if (def) setPmId(def.id)
            }
          }
        })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fetchData, isEditing])

  // Preselect default PM para nuevos gastos — solo si el usuario NO eligió manualmente
  useEffect(() => {
    if (!isEditing && !pmUserPicked.current && pms.length) {
      const def = pms.find(p => p.is_default)
      if (def) setPmId(def.id)
      // Si no hay default → queda null (Efectivo)
    }
  }, [pms, isEditing])

  const close = useCallback(() => {
    setAmount(''); setCatId(null); setPmId(null); setDateStr(todayStr); setShowDatePicker(false)
    setDesc(''); setError('')
    pmUserPicked.current = false
    if (onClose) onClose()
    else setInternalOpen(false)
  }, [onClose, todayStr])

  function numpad(key: string) {
    setError('')
    if (key === 'del') { setAmount(a => a.slice(0, -1)); return }
    if (amount.length >= 9) return
    setAmount(a => a + key)
  }

  const displayAmount = amount ? formatCLP(parseInt(amount) || 0) : '$0'

  const quickDates = [
    { label: 'Anteayer', value: dayBeforeStr },
    { label: 'Ayer',     value: yesterdayStr },
    { label: 'Hoy',      value: todayStr },
  ]
  const isQuickDate = quickDates.some(q => q.value === dateStr)

  async function save() {
    if (!amount || parseInt(amount) === 0) { setError('Ingresa un monto'); return }
    if (!catId) { setError('Elige una categoría'); return }

    setSaving(true); setError('')

    if (isEditing && editExpense) {
      const { error: err } = await supabase
        .from('expenses')
        .update({
          amount: parseInt(amount),
          category_id: catId,
          payment_method_id: pmId,
          description: desc || null,
          date: dateStr,
        })
        .eq('id', editExpense.id)

      setSaving(false)
      if (err) { setError('Error al guardar. Intenta de nuevo.'); return }
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setSaving(false); setError('Sesión expirada. Recarga la página.'); return }

      const { error: err } = await supabase.from('expenses').insert({
        user_id: user.id,
        amount: parseInt(amount),
        category_id: catId,
        payment_method_id: pmId,
        description: desc || null,
        date: dateStr,
      })

      setSaving(false)
      if (err) { setError('Error al guardar. Intenta de nuevo.'); return }
    }

    router.refresh()
    close()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end bg-black/50 max-w-lg mx-auto"
      onClick={e => { if (e.target === e.currentTarget) close() }}
    >
      <div className="w-full bg-white rounded-t-3xl overflow-y-auto" style={{ maxHeight: '92dvh' }}>
        {/* Handle + header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-3" />
          <h2 className="text-base font-semibold text-gray-900 mt-2">
            {isEditing ? 'Editar gasto' : 'Nuevo gasto'}
          </h2>
          <button onClick={close} className="p-2 -mr-2 text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Amount display */}
        <div className="text-center py-3 px-5 border-b border-gray-100">
          <p className={cn('text-4xl font-semibold transition-colors', error && !amount ? 'text-red-500' : 'text-gray-900')}>
            {displayAmount}
          </p>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>

        {/* Categories */}
        <div className="px-5 pt-3">
          <p className="text-xs font-medium text-gray-400 mb-2">Categoría</p>
          <div className="flex flex-wrap gap-2">
            {cats.map(c => (
              <button
                key={c.id}
                onClick={() => { setCatId(c.id); setError('') }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all',
                  catId === c.id
                    ? 'border-brand-600 bg-brand-50 text-brand-800 font-medium'
                    : 'border-gray-200 bg-gray-50 text-gray-600'
                )}
              >
                {isEmoji(c.icon)
                  ? <span className="text-base">{c.icon}</span>
                  : (() => { const Icon = getCategoryIcon(c.icon); return <Icon className="w-4 h-4" style={{ color: catId === c.id ? c.color : '#9CA3AF' }} /> })()
                }
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Payment + date */}
        <div className="px-5 pt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium text-gray-400 mb-2">Método</p>
            <div className="flex flex-wrap gap-1.5">
              {/* Efectivo siempre disponible (pmId = null) */}
              <button
                onClick={() => { pmUserPicked.current = true; setPmId(null) }}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs border transition-all',
                  pmId === null ? 'border-brand-600 bg-brand-50 text-brand-800 font-medium' : 'border-gray-200 bg-gray-50 text-gray-600'
                )}
              >
                Efectivo
              </button>
              {pms.map(pm => (
                <button
                  key={pm.id}
                  onClick={() => { pmUserPicked.current = true; setPmId(pm.id) }}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs border transition-all',
                    pmId === pm.id ? 'border-brand-600 bg-brand-50 text-brand-800 font-medium' : 'border-gray-200 bg-gray-50 text-gray-600'
                  )}
                >
                  {pm.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 mb-2">Fecha</p>
            <div className="flex flex-wrap gap-1.5">
              {quickDates.map(d => (
                <button
                  key={d.value}
                  onClick={() => { setDateStr(d.value); setShowDatePicker(false) }}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs border transition-all',
                    dateStr === d.value && !showDatePicker
                      ? 'border-brand-600 bg-brand-50 text-brand-800 font-medium'
                      : 'border-gray-200 bg-gray-50 text-gray-600'
                  )}
                >
                  {d.label}
                </button>
              ))}
              <button
                onClick={() => setShowDatePicker(v => !v)}
                className={cn(
                  'px-2.5 py-1.5 rounded-full text-xs border transition-all',
                  showDatePicker || !isQuickDate
                    ? 'border-brand-600 bg-brand-50 text-brand-800 font-medium'
                    : 'border-gray-200 bg-gray-50 text-gray-600'
                )}
              >
                <CalendarDays className="w-3.5 h-3.5" />
              </button>
            </div>
            {(showDatePicker || !isQuickDate) && (
              <input
                type="date"
                value={dateStr}
                max={todayStr}
                onChange={e => { setDateStr(e.target.value); setShowDatePicker(false) }}
                className="mt-2 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-800 outline-none focus:border-brand-400"
              />
            )}
          </div>
        </div>

        {/* Description */}
        <div className="px-5 pt-3">
          <input
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Descripción (opcional)..."
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-brand-400 transition-colors"
          />
        </div>

        {/* Numpad + Save button — sticky al fondo */}
        <div className="mt-2 border-t border-gray-100 grid grid-cols-3">
          {['1','2','3','4','5','6','7','8','9','000','0','del'].map(k => (
            <button
              key={k}
              onClick={() => k === 'del' ? numpad('del') : numpad(k)}
              className={cn(
                'py-3 text-lg text-gray-800 font-medium active:bg-gray-100 transition-colors border-r border-b border-gray-100',
                k === 'del' && 'text-gray-400'
              )}
            >
              {k === 'del' ? <Delete className="w-5 h-5 mx-auto" /> : k}
            </button>
          ))}
        </div>

        {/* Save button */}
        <div className="px-5 pt-2 pb-24">
          <button
            onClick={save}
            disabled={saving}
            className="w-full py-3.5 bg-brand-600 text-white font-semibold rounded-2xl hover:bg-brand-700 transition-colors disabled:opacity-60 text-base"
            style={{ backgroundColor: '#00AEDC' }}
          >
            {saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Guardar gasto'}
          </button>
        </div>
      </div>
    </div>
  )
}
