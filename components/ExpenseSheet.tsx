'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { X, Delete, CalendarDays, ChevronDown, Trash2, Check, FileText, SlidersHorizontal, CreditCard } from 'lucide-react'
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

function CatChip({ c, selected, onSelect }: { c: Category; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(c.id)}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all',
        selected
          ? 'border-brand-600 bg-brand-50 text-brand-800 font-medium'
          : 'border-gray-200 bg-gray-50 text-gray-600'
      )}
    >
      {isEmoji(c.icon)
        ? <span className="text-base">{c.icon}</span>
        : (() => { const Icon = getCategoryIcon(c.icon); return <Icon className="w-4 h-4" style={{ color: selected ? c.color : '#9CA3AF' }} /> })()
      }
      {c.name}
    </button>
  )
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
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting]   = useState(false)

  const [cats, setCats]         = useState<Category[]>(initCats)
  const [pms, setPMs]           = useState<PaymentMethod[]>(initPMs)
  const [topCatIds, setTopCatIds] = useState<string[]>([])
  const [catsExpanded, setCatsExpanded] = useState(false)
  const [catPickerOpen, setCatPickerOpen] = useState(false)

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

  // Calcular las 3 categorías más usadas en los últimos 30 días
  useEffect(() => {
    if (!isOpen || isEditing) return
    const since = new Date()
    since.setDate(since.getDate() - 30)
    supabase
      .from('expenses')
      .select('category_id')
      .gte('date', since.toISOString().split('T')[0])
      .not('category_id', 'is', null)
      .then(({ data }) => {
        if (!data?.length) return
        const freq: Record<string, number> = {}
        for (const e of data) {
          if (e.category_id) freq[e.category_id] = (freq[e.category_id] ?? 0) + 1
        }
        const top = Object.entries(freq)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([id]) => id)
        setTopCatIds(top)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isEditing])

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
    setDesc(''); setError(''); setCatsExpanded(false); setDeleteConfirm(false); setCatPickerOpen(false)
    pmUserPicked.current = false
    if (onClose) onClose()
    else setInternalOpen(false)
  }, [onClose, todayStr])

  async function handleDelete() {
    if (!editExpense) return
    setDeleting(true)
    await supabase.from('expenses').delete().eq('id', editExpense.id)
    setDeleting(false)
    router.refresh()
    close()
  }

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

  // ─── Shared sub-components ────────────────────────────────────────────────
  const methodChips = (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => { pmUserPicked.current = true; setPmId(null) }}
        className={cn('px-3 py-1.5 rounded-full text-xs border transition-all',
          pmId === null ? 'border-brand-600 bg-brand-50 text-brand-800 font-medium' : 'border-gray-200 bg-gray-50 text-gray-600')}
      >Efectivo</button>
      {pms.map(pm => (
        <button key={pm.id}
          onClick={() => { pmUserPicked.current = true; setPmId(pm.id) }}
          className={cn('px-3 py-1.5 rounded-full text-xs border transition-all',
            pmId === pm.id ? 'border-brand-600 bg-brand-50 text-brand-800 font-medium' : 'border-gray-200 bg-gray-50 text-gray-600')}
        >{pm.name}</button>
      ))}
    </div>
  )

  const dateChips = (
    <>
      <div className="flex flex-wrap gap-1.5">
        {quickDates.map(d => (
          <button key={d.value}
            onClick={() => { setDateStr(d.value); setShowDatePicker(false) }}
            className={cn('px-3 py-1.5 rounded-full text-xs border transition-all',
              dateStr === d.value && !showDatePicker
                ? 'border-brand-600 bg-brand-50 text-brand-800 font-medium'
                : 'border-gray-200 bg-gray-50 text-gray-600')}
          >{d.label}</button>
        ))}
        <button
          onClick={() => setShowDatePicker(v => !v)}
          className={cn('px-2.5 py-1.5 rounded-full text-xs border transition-all',
            showDatePicker || !isQuickDate
              ? 'border-brand-600 bg-brand-50 text-brand-800 font-medium'
              : 'border-gray-200 bg-gray-50 text-gray-600')}
        ><CalendarDays className="w-3.5 h-3.5" /></button>
      </div>
      {(showDatePicker || !isQuickDate) && (
        <input type="date" value={dateStr} max={todayStr}
          onChange={e => { setDateStr(e.target.value); setShowDatePicker(false) }}
          className="mt-2 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-800 outline-none focus:border-brand-400"
        />
      )}
    </>
  )

  // ─── EDIT MODE — layout compacto, sin numpad ──────────────────────────────
  if (isEditing) {
    const selectedCat = cats.find(c => c.id === catId)
    const selectedPm  = pms.find(p => p.id === pmId)

    const isCustom = dateStr !== todayStr && dateStr !== yesterdayStr

    const formattedDate = (() => {
      try {
        return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-CL', {
          day: 'numeric', month: 'long', year: 'numeric',
        })
      } catch { return dateStr }
    })()

    return (
      <div
        className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center bg-black/50"
        onClick={e => { if (e.target === e.currentTarget) close() }}
      >
        <div className="w-full lg:max-w-md bg-white rounded-t-3xl lg:rounded-3xl">
          {/* Handle */}
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1 lg:hidden" />

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">Editar gasto</h2>
            <button onClick={close} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors" aria-label="Cerrar">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 pt-4 space-y-4" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 16px))' }}>

            {/* Amount */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">Monto</p>
              <div className={cn(
                'flex items-center gap-3 border rounded-2xl px-4 py-3 transition-colors focus-within:border-brand-400 focus-within:bg-white',
                error && !amount ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
              )}>
                <div className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <span className="text-base font-bold text-gray-400">$</span>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={amount ? parseInt(amount).toLocaleString('es-CL') : ''}
                  onChange={e => {
                    const raw = e.target.value.replace(/\./g, '').replace(/\D/g, '')
                    if (raw.length <= 9) { setAmount(raw); setError('') }
                  }}
                  className="flex-1 text-2xl font-bold text-gray-900 bg-transparent outline-none min-w-0"
                  placeholder="0"
                />
              </div>
              {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
            </div>

            {/* Category */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">Categoría</p>
              <div className="flex gap-2">
                {/* Selector principal — tappable */}
                <button
                  type="button"
                  onClick={() => setCatPickerOpen(v => !v)}
                  className={cn(
                    'flex-1 flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border transition-all text-left',
                    catPickerOpen
                      ? 'border-brand-400 bg-brand-50'
                      : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                  )}
                >
                  {selectedCat ? (
                    <>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: selectedCat.bg_color }}>
                        {isEmoji(selectedCat.icon)
                          ? <span className="text-sm">{selectedCat.icon}</span>
                          : (() => { const I = getCategoryIcon(selectedCat.icon); return <I className="w-4 h-4" style={{ color: selectedCat.color }} /> })()
                        }
                      </div>
                      <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{selectedCat.name}</span>
                    </>
                  ) : (
                    <span className="flex-1 text-sm text-gray-400">Sin categoría</span>
                  )}
                  <ChevronDown className={cn('w-4 h-4 text-gray-400 flex-shrink-0 transition-transform', catPickerOpen && 'rotate-180')} />
                </button>
                {/* Botón cambiar */}
                <button
                  type="button"
                  onClick={() => setCatPickerOpen(v => !v)}
                  className={cn(
                    'flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl border text-sm font-semibold transition-all',
                    catPickerOpen
                      ? 'border-brand-400 bg-brand-50 text-brand-700'
                      : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                  )}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Cambiar
                </button>
              </div>
              {catPickerOpen && (
                <div className="mt-2.5 p-3 bg-gray-50 rounded-2xl border border-gray-100 flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                  {cats.map(c => (
                    <CatChip key={c.id} c={c} selected={catId === c.id}
                      onSelect={id => { setCatId(id); setError(''); setCatPickerOpen(false) }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Method + Date — 2 cols de chips, date field full-width abajo */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">Método de pago</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => { pmUserPicked.current = true; setPmId(null) }}
                    className={cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                      pmId === null ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-gray-200 bg-white text-gray-600')}
                  >Efectivo</button>
                  {pms.map(pm => (
                    <button key={pm.id}
                      onClick={() => { pmUserPicked.current = true; setPmId(pm.id) }}
                      className={cn('flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                        pmId === pm.id ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-gray-200 bg-white text-gray-600')}
                    >
                      {pm.card_type === 'credit' || pm.card_type === 'debit'
                        ? <CreditCard className="w-3 h-3 flex-shrink-0" />
                        : null
                      }
                      {pm.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">Fecha del gasto</p>
                {/* Muestra la fecha actual; tap para cambiarla */}
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('edit-date-input') as HTMLInputElement | null
                    el?.showPicker?.() ?? el?.click()
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-2xl text-xs font-medium border border-gray-200 bg-white text-gray-700 hover:border-brand-400 hover:bg-brand-50 transition-all text-left"
                >
                  <CalendarDays className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                  <span className="truncate">{formattedDate}</span>
                </button>
                <input
                  id="edit-date-input"
                  type="date"
                  value={dateStr}
                  max={todayStr}
                  onChange={e => setDateStr(e.target.value)}
                  className="sr-only"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">
                Descripción <span className="font-normal text-gray-400">(opcional)</span>
              </p>
              <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5 focus-within:border-brand-400 transition-colors">
                <FileText className="w-4 h-4 text-gray-300 flex-shrink-0" />
                <input
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="Ej: Pizza con pareja"
                  className="flex-1 text-sm text-gray-800 placeholder-gray-400 bg-transparent outline-none"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Agrega un detalle para recordar mejor este gasto.</p>
            </div>

            {/* Actions */}
            {deleteConfirm ? (
              <div className="pt-1 space-y-2">
                <p className="text-sm text-center text-gray-500">¿Seguro que quieres eliminar este gasto?</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    className="flex-1 py-3 text-sm font-semibold text-gray-600 bg-gray-100 rounded-2xl hover:bg-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold text-white bg-red-500 rounded-2xl hover:bg-red-600 transition-colors disabled:opacity-60"
                  >
                    <Trash2 className="w-4 h-4" />
                    {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-red-500 bg-red-50 border border-red-100 rounded-2xl hover:bg-red-100 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                  Eliminar gasto
                </button>
                <button
                  onClick={save}
                  disabled={saving || deleting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold text-white rounded-2xl disabled:opacity-60 transition-colors"
                  style={{ backgroundColor: '#1B6DD4' }}
                >
                  {saving
                    ? 'Guardando...'
                    : <><Check className="w-4 h-4" /> Guardar cambios</>
                  }
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── NEW EXPENSE MODE — layout con numpad ─────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) close() }}
    >
      <div className="w-full lg:max-w-md bg-white rounded-t-3xl lg:rounded-3xl overflow-y-auto" style={{ maxHeight: '92dvh' }}>
        {/* Handle + header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-3 lg:hidden" />
          <h2 className="text-base font-semibold text-gray-900 mt-2">Nuevo gasto</h2>
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
          {(() => {
            if (topCatIds.length === 0) {
              return (
                <div className="flex flex-wrap gap-2">
                  {cats.map(c => (
                    <CatChip key={c.id} c={c} selected={catId === c.id} onSelect={id => { setCatId(id); setError('') }} />
                  ))}
                </div>
              )
            }
            const pinnedCats = topCatIds.map(id => cats.find(c => c.id === id)).filter(Boolean) as Category[]
            const otherCats  = cats.filter(c => !topCatIds.includes(c.id))
            const selInOther = catId && otherCats.some(c => c.id === catId)
            return (
              <>
                <div className="flex flex-wrap gap-2">
                  {pinnedCats.map(c => (
                    <CatChip key={c.id} c={c} selected={catId === c.id} onSelect={id => { setCatId(id); setError('') }} />
                  ))}
                  {!catsExpanded && selInOther && (() => {
                    const selCat = otherCats.find(c => c.id === catId)
                    return selCat ? <CatChip key={selCat.id} c={selCat} selected onSelect={() => {}} /> : null
                  })()}
                </div>
                {otherCats.length > 0 && (
                  <>
                    {catsExpanded && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {otherCats.map(c => (
                          <CatChip key={c.id} c={c} selected={catId === c.id}
                            onSelect={id => { setCatId(id); setError(''); setCatsExpanded(false) }} />
                        ))}
                      </div>
                    )}
                    {!catsExpanded && (
                      <button type="button" onClick={() => setCatsExpanded(true)}
                        className="mt-2 flex items-center gap-1 text-xs font-semibold text-brand-500 hover:text-brand-700 transition-colors">
                        <ChevronDown className="w-3.5 h-3.5" />
                        Ver {otherCats.length} más
                      </button>
                    )}
                  </>
                )}
              </>
            )
          })()}
        </div>

        {/* Payment + date */}
        <div className="px-5 pt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium text-gray-400 mb-2">Método</p>
            {methodChips}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 mb-2">Fecha</p>
            {dateChips}
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

        {/* Numpad */}
        <div className="mt-2 border-t border-gray-100 grid grid-cols-3">
          {['1','2','3','4','5','6','7','8','9','000','0','del'].map(k => (
            <button key={k}
              onClick={() => k === 'del' ? numpad('del') : numpad(k)}
              className={cn('py-3 text-lg text-gray-800 font-medium active:bg-gray-100 transition-colors border-r border-b border-gray-100',
                k === 'del' && 'text-gray-400')}
            >
              {k === 'del' ? <Delete className="w-5 h-5 mx-auto" /> : k}
            </button>
          ))}
        </div>

        {/* Save button */}
        <div className="px-5 pt-2" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 16px))' }}>
          <button
            onClick={save}
            disabled={saving}
            className="w-full py-3.5 text-white font-semibold rounded-2xl transition-colors disabled:opacity-60 text-base"
            style={{ backgroundColor: '#1B6DD4' }}
          >
            {saving ? 'Guardando...' : 'Guardar gasto'}
          </button>
        </div>
      </div>
    </div>
  )
}
