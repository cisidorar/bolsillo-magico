'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Check, X, Pencil, Search, ChevronDown, Loader2 } from 'lucide-react'
import { cn, isEmoji } from '@/lib/utils'
import { ICON_OPTIONS, COLORS, getCategoryIconOption, getCategoryIcon } from '@/lib/category-icons'
import type { Category } from '@/types'

interface Props {
  categories: Category[]
  userId: string
  expenseCountMap: Record<string, number>
}

type FormState  = { name: string; iconName: string; colorIdx: number }
type SortKey    = 'name_asc' | 'name_desc' | 'count_desc' | 'count_asc' | 'default'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'default',    label: 'Predeterminado'  },
  { key: 'name_asc',   label: 'Nombre (A–Z)'    },
  { key: 'name_desc',  label: 'Nombre (Z–A)'    },
  { key: 'count_desc', label: 'Más gastos'       },
  { key: 'count_asc',  label: 'Menos gastos'     },
]

const PAGE_SIZES = [10, 20, 50]

function colorIdxFromHex(bg: string) {
  const idx = COLORS.findIndex(c => c.bg === bg)
  return idx >= 0 ? idx : 0
}
function iconNameFromCategory(c: Category) {
  return isEmoji(c.icon) ? 'Package' : (c.icon || 'Package')
}
const DEFAULT_FORM: FormState = { name: '', iconName: 'Package', colorIdx: 5 }

export default function CategoryManager({ categories: init, userId, expenseCountMap }: Props) {
  const router   = useRouter()
  const supabase = createClient()

  // ── Local categories state (optimistic) ──────────────────────
  const [cats, setCats]             = useState<Category[]>(init)

  // ── Form / sheet state ───────────────────────────────────────
  const [sheetOpen, setSheetOpen]   = useState(false)
  const [editTarget, setEditTarget] = useState<Category | null>(null)
  const [form, setForm]             = useState<FormState>(DEFAULT_FORM)
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState('')

  // ── Delete state ─────────────────────────────────────────────
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [deleting, setDeleting]           = useState<string | null>(null)

  // ── List controls ─────────────────────────────────────────────
  const [search, setSearch]       = useState('')
  const [sort, setSort]           = useState<SortKey>('default')
  const [sortOpen, setSortOpen]   = useState(false)
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState(20)

  // ── Derived list ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...cats]
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c => c.name.toLowerCase().includes(q))
    }
    list.sort((a, b) => {
      if (sort === 'name_asc')   return a.name.localeCompare(b.name)
      if (sort === 'name_desc')  return b.name.localeCompare(a.name)
      if (sort === 'count_desc') return (expenseCountMap[b.id] ?? 0) - (expenseCountMap[a.id] ?? 0)
      if (sort === 'count_asc')  return (expenseCountMap[a.id] ?? 0) - (expenseCountMap[b.id] ?? 0)
      return a.sort_order - b.sort_order  // default
    })
    return list
  }, [cats, search, sort, expenseCountMap])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  // ── Handlers ──────────────────────────────────────────────────
  function openNew() {
    setForm(DEFAULT_FORM); setFormError(''); setEditTarget(null); setSheetOpen(true)
  }
  function openEdit(c: Category) {
    setForm({ name: c.name, iconName: iconNameFromCategory(c), colorIdx: colorIdxFromHex(c.bg_color) })
    setEditTarget(c); setFormError(''); setSheetOpen(true)
  }
  function closeSheet() {
    setSheetOpen(false); setForm(DEFAULT_FORM); setEditTarget(null); setFormError('')
  }
  function pickIcon(name: string) {
    const opt = getCategoryIconOption(name)
    const autoIdx = COLORS.findIndex(c => c.color === opt.defaultColor)
    setForm(f => ({ ...f, iconName: name, colorIdx: autoIdx >= 0 ? autoIdx : f.colorIdx }))
  }

  async function save() {
    if (!form.name.trim()) { setFormError('Ponle un nombre a la categoría'); return }
    setSaving(true); setFormError('')
    const chosen  = COLORS[form.colorIdx]
    const payload = { name: form.name.trim(), icon: form.iconName, color: chosen.color, bg_color: chosen.bg }
    if (!editTarget) {
      const { data, error: err } = await supabase
        .from('categories')
        .insert({ user_id: userId, ...payload, is_default: false, sort_order: cats.length + 1 })
        .select().single()
      setSaving(false)
      if (err) { setFormError(`Error: ${err.message}`); return }
      setCats(prev => [...prev, data])
    } else {
      const { error: err } = await supabase.from('categories').update(payload).eq('id', editTarget.id)
      setSaving(false)
      if (err) { setFormError(`Error: ${err.message}`); return }
      setCats(prev => prev.map(c => c.id === editTarget.id ? { ...c, ...payload } : c))
    }
    router.refresh(); closeSheet()
  }

  async function deleteCategory(id: string) {
    setDeleting(id)
    const { error: err } = await supabase.from('categories').delete().eq('id', id)
    if (!err) setCats(prev => prev.filter(c => c.id !== id))
    setDeleting(null); setPendingDelete(null)
    router.refresh()
  }

  // ── Icon renderer ─────────────────────────────────────────────
  function CatIcon({ c, size = 40 }: { c: Category; size?: number }) {
    const sz = `${size}px`
    if (isEmoji(c.icon)) return (
      <div className="rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ width: sz, height: sz, backgroundColor: c.bg_color }}>
        {c.icon}
      </div>
    )
    const Icon = getCategoryIcon(c.icon)
    const iconSize = Math.round(size * 0.48)
    return (
      <div className="rounded-xl flex items-center justify-center flex-shrink-0" style={{ width: sz, height: sz, backgroundColor: c.bg_color }}>
        <Icon style={{ width: iconSize, height: iconSize, color: c.color }} />
      </div>
    )
  }

  const currentSortLabel = SORT_OPTIONS.find(o => o.key === sort)?.label ?? 'Ordenar'

  // ──────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Page header ─────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-brand-900">Categorías</h1>
          <p className="text-sm text-gray-400 mt-0.5">Organiza y personaliza tus categorías de gastos.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white flex-shrink-0 shadow-sm hover:opacity-90 active:scale-[.98] transition-all"
          style={{ background: '#1B6DD4', boxShadow: '0 4px 14px rgba(27,109,212,.35)' }}
        >
          <Plus className="w-4 h-4" />
          Nueva categoría
        </button>
      </div>

      {/* ── Controls row ────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar categorías"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-brand-400 transition-colors"
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(1) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Sort dropdown */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setSortOpen(o => !o)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm font-medium text-gray-700 hover:border-gray-300 transition-colors whitespace-nowrap"
          >
            <span className="hidden sm:inline text-xs text-gray-400 font-normal">Ordenar por:</span>
            {currentSortLabel}
            <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', sortOpen && 'rotate-180')} />
          </button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
              <div className="absolute right-0 top-full mt-1.5 z-20 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden min-w-[160px]">
                {SORT_OPTIONS.map(o => (
                  <button
                    key={o.key}
                    onClick={() => { setSort(o.key); setSortOpen(false); setPage(1) }}
                    className={cn(
                      'w-full text-left px-4 py-2.5 text-sm transition-colors',
                      sort === o.key
                        ? 'bg-brand-50 text-brand-700 font-semibold'
                        : 'text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 2-column grid ───────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="card text-center py-16 flex flex-col items-center gap-3">
          <p className="text-sm font-medium text-gray-500">
            {search ? 'Sin resultados para esa búsqueda' : 'Sin categorías aún'}
          </p>
          {!search && (
            <button onClick={openNew} className="text-sm font-semibold text-brand-600 hover:text-brand-700">
              + Nueva categoría
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          {paginated.map(c => {
            const count       = expenseCountMap[c.id] ?? 0
            const isPending   = pendingDelete === c.id
            const isDeleting  = deleting === c.id

            return (
              <div
                key={c.id}
                className={cn(
                  'card flex items-center gap-3 px-4 py-3.5 group transition-colors',
                  isPending && 'bg-red-50/60'
                )}
              >
                {/* Color accent */}
                <div className="w-1 h-10 rounded-full flex-shrink-0 -ml-0.5" style={{ backgroundColor: c.color }} />

                {/* Icon */}
                <CatIcon c={c} size={40} />

                {/* Name + count */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate leading-tight">{c.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {count > 0 ? `${count} gasto${count !== 1 ? 's' : ''}` : 'Sin gastos'}
                  </p>
                </div>

                {/* Actions */}
                {isPending ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs text-red-500 font-semibold">¿Eliminar?</span>
                    <button onClick={() => setPendingDelete(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteCategory(c.id)}
                      disabled={isDeleting}
                      className="p-1.5 rounded-lg text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-60"
                    >
                      {isDeleting
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Check className="w-3.5 h-3.5" />
                      }
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(c)}
                      className="p-2 text-gray-300 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPendingDelete(c.id)}
                      className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Pagination ──────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between mt-5 gap-4 flex-wrap">
          {/* Info */}
          <p className="text-xs text-gray-400 font-medium">
            Mostrando {((safePage - 1) * pageSize) + 1}–{Math.min(safePage * pageSize, filtered.length)} de {filtered.length} categoría{filtered.length !== 1 ? 's' : ''}
          </p>

          {/* Pages */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    'w-8 h-8 rounded-xl text-sm font-semibold transition-colors',
                    p === safePage
                      ? 'text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  )}
                  style={p === safePage ? { background: '#1B6DD4' } : {}}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* Page size */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Mostrar:</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
              className="text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 outline-none focus:border-brand-400 transition-colors cursor-pointer"
            >
              {PAGE_SIZES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── Form sheet — bottom on mobile / modal on desktop ── */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center bg-black/50"
          onClick={closeSheet}
        >
          <div
            className="relative w-full lg:max-w-md bg-white rounded-t-3xl lg:rounded-3xl px-5 pt-5 pb-10 lg:pb-6 max-h-[90vh] overflow-y-auto"
            style={{ boxShadow: '0 -8px 40px rgba(0,0,0,.15)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle (mobile only) */}
            <div className="w-8 h-1 bg-gray-200 rounded-full mx-auto mb-5 lg:hidden" />

            {/* Sheet header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-extrabold text-brand-900">
                {editTarget ? 'Editar categoría' : 'Nueva categoría'}
              </h2>
              <button onClick={closeSheet} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <FormBody
              form={form}
              setForm={setForm}
              formError={formError}
              saving={saving}
              isEdit={!!editTarget}
              onPickIcon={pickIcon}
              onSave={save}
              onCancel={closeSheet}
            />
          </div>
        </div>
      )}
    </>
  )
}

// ── Formulario extraído ────────────────────────────────────────────────────────
function FormBody({
  form, setForm, formError, saving, isEdit, onPickIcon, onSave, onCancel,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  formError: string
  saving: boolean
  isEdit: boolean
  onPickIcon: (name: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const chosen     = COLORS[form.colorIdx]
  const previewOpt = getCategoryIconOption(form.iconName)
  const PreviewIcon = previewOpt.icon

  return (
    <div className="flex flex-col gap-5">
      {/* Preview */}
      <div
        className="flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all"
        style={{ backgroundColor: `${chosen.bg}80`, borderColor: `${chosen.color}30` }}
      >
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: chosen.bg }}>
          <PreviewIcon className="w-6 h-6" style={{ color: chosen.color }} />
        </div>
        <div>
          <p className="font-bold text-gray-900 text-sm leading-tight">
            {form.name || 'Nueva categoría'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: chosen.color }}>{previewOpt.label}</p>
        </div>
      </div>

      {/* Nombre */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Nombre</label>
        <input
          type="text"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="ej: Mascotas, Gimnasio, Viajes…"
          maxLength={24}
          autoFocus
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand-400 focus:bg-white transition-colors"
        />
      </div>

      {/* Ícono */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Ícono</label>
        <div className="grid grid-cols-8 gap-1.5">
          {ICON_OPTIONS.map(opt => {
            const Icon = opt.icon
            const isSelected = form.iconName === opt.name
            return (
              <button
                key={opt.name}
                onClick={() => onPickIcon(opt.name)}
                title={opt.label}
                className={cn(
                  'w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                  isSelected ? 'ring-2 ring-offset-1 ring-brand-600' : 'hover:bg-gray-100'
                )}
                style={isSelected ? { backgroundColor: chosen.bg } : {}}
              >
                <Icon className="w-[18px] h-[18px]" style={{ color: isSelected ? chosen.color : '#9CA3AF' }} />
              </button>
            )
          })}
        </div>
      </div>

      {/* Color */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Color</label>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c, i) => (
            <button
              key={i}
              onClick={() => setForm(f => ({ ...f, colorIdx: i }))}
              className={cn('w-8 h-8 rounded-full transition-all flex items-center justify-center', form.colorIdx === i && 'ring-2 ring-offset-2 ring-gray-400')}
              style={{ backgroundColor: c.bg, border: `2.5px solid ${c.color}` }}
            >
              {form.colorIdx === i && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />}
            </button>
          ))}
        </div>
      </div>

      {formError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{formError}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 border border-brand-200 text-brand-700 text-sm font-semibold rounded-xl hover:bg-brand-50 transition-colors flex items-center justify-center gap-1.5"
        >
          <X className="w-4 h-4" /> Cancelar
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
        >
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <><Check className="w-4 h-4" />{isEdit ? 'Guardar cambios' : 'Crear categoría'}</>
          }
        </button>
      </div>
    </div>
  )
}
