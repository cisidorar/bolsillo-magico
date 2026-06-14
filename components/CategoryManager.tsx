'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Check, X, Pencil } from 'lucide-react'
import { cn, isEmoji } from '@/lib/utils'
import { ICON_OPTIONS, COLORS, getCategoryIconOption, getCategoryIcon } from '@/lib/category-icons'
import type { Category } from '@/types'

interface Props {
  categories: Category[]
  userId: string
}

type FormState = { name: string; iconName: string; colorIdx: number }

function colorIdxFromHex(bg: string): number {
  const idx = COLORS.findIndex(c => c.bg === bg)
  return idx >= 0 ? idx : 0
}

function iconNameFromCategory(c: Category): string {
  // backward compat: emoji → default icon
  if (isEmoji(c.icon)) return 'Package'
  return c.icon || 'Package'
}

const DEFAULT_FORM: FormState = { name: '', iconName: 'Package', colorIdx: 5 }

export default function CategoryManager({ categories: init, userId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [cats, setCats]             = useState<Category[]>(init)
  const [mode, setMode]             = useState<'list' | 'new' | 'edit'>('list')
  const [editTarget, setEditTarget] = useState<Category | null>(null)
  const [form, setForm]             = useState<FormState>(DEFAULT_FORM)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [error, setError]           = useState('')

  function openNew() {
    setForm(DEFAULT_FORM); setError(''); setMode('new')
  }

  function openEdit(c: Category) {
    setForm({
      name: c.name,
      iconName: iconNameFromCategory(c),
      colorIdx: colorIdxFromHex(c.bg_color),
    })
    setEditTarget(c); setError(''); setMode('edit')
  }

  function cancel() {
    setMode('list'); setForm(DEFAULT_FORM); setEditTarget(null); setError('')
  }

  function pickIcon(name: string) {
    const opt = getCategoryIconOption(name)
    // auto-apply the icon's default color
    const autoColorIdx = COLORS.findIndex(c => c.color === opt.defaultColor)
    setForm(f => ({
      ...f,
      iconName: name,
      colorIdx: autoColorIdx >= 0 ? autoColorIdx : f.colorIdx,
    }))
  }

  async function save() {
    if (!form.name.trim()) { setError('Ponle un nombre a la categoría'); return }
    setSaving(true); setError('')
    const chosen = COLORS[form.colorIdx]

    const payload = {
      name: form.name.trim(),
      icon: form.iconName,
      color: chosen.color,
      bg_color: chosen.bg,
    }

    if (mode === 'new') {
      const { data, error: err } = await supabase
        .from('categories')
        .insert({ user_id: userId, ...payload, is_default: false, sort_order: cats.length + 1 })
        .select().single()
      setSaving(false)
      if (err) { setError(`Error: ${err.message}`); return }
      setCats(prev => [...prev, data])
    } else if (mode === 'edit' && editTarget) {
      const { error: err } = await supabase
        .from('categories').update(payload).eq('id', editTarget.id)
      setSaving(false)
      if (err) { setError(`Error: ${err.message}`); return }
      setCats(prev => prev.map(c => c.id === editTarget.id ? { ...c, ...payload } : c))
    }

    router.refresh(); cancel()
  }

  async function deleteCategory(id: string) {
    setDeleting(id)
    const { error: err } = await supabase.from('categories').delete().eq('id', id)
    if (!err) setCats(prev => prev.filter(c => c.id !== id))
    setDeleting(null); setPendingDelete(null)
    router.refresh()
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function renderCatIcon(c: Category, size = 40) {
    const sz = `${size}px`
    if (isEmoji(c.icon)) {
      return (
        <div
          className="rounded-xl flex items-center justify-center text-xl flex-shrink-0"
          style={{ width: sz, height: sz, backgroundColor: c.bg_color }}
        >
          {c.icon}
        </div>
      )
    }
    const Icon = getCategoryIcon(c.icon)
    const iconSize = Math.round(size * 0.48)
    return (
      <div
        className="rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ width: sz, height: sz, backgroundColor: c.bg_color }}
      >
        <Icon style={{ width: iconSize, height: iconSize, color: c.color }} />
      </div>
    )
  }

  // ── Lista ────────────────────────────────────────────────────────────────
  if (mode === 'list') return (
    <div className="flex flex-col gap-4">
      <div className="card divide-y divide-gray-50 overflow-hidden">
        {cats.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">Sin categorías aún</p>
        )}
        {cats.map(c => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3">
            {/* Color accent */}
            <div className="w-1 h-8 rounded-full flex-shrink-0 -ml-1" style={{ backgroundColor: c.color }} />
            {renderCatIcon(c, 36)}
            <span className="flex-1 text-sm font-semibold text-gray-900">{c.name}</span>
            <div className="flex items-center gap-1">
              {pendingDelete === c.id ? (
                <>
                  <span className="text-xs text-red-500 font-medium mr-1">¿Eliminar?</span>
                  <button onClick={() => setPendingDelete(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteCategory(c.id)}
                    disabled={deleting === c.id}
                    className="p-1.5 rounded-lg text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-60"
                  >
                    {deleting === c.id
                      ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <Check className="w-3.5 h-3.5" />}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => openEdit(c)} className="p-2 text-gray-300 hover:text-brand-600 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => setPendingDelete(c.id)} className="p-2 text-gray-300 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={openNew}
        className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-brand-200 rounded-2xl text-sm font-bold text-brand-600 hover:border-brand-400 hover:bg-brand-50 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Nueva categoría
      </button>
    </div>
  )

  // ── Formulario ────────────────────────────────────────────────────────────
  const chosen    = COLORS[form.colorIdx]
  const previewOpt = getCategoryIconOption(form.iconName)
  const PreviewIcon = previewOpt.icon

  return (
    <div className="card p-5 flex flex-col gap-5">

      {/* Preview */}
      <div
        className="flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all"
        style={{ backgroundColor: `${chosen.bg}80`, borderColor: `${chosen.color}30` }}
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
          style={{ backgroundColor: chosen.bg }}
        >
          <PreviewIcon className="w-6 h-6 transition-all" style={{ color: chosen.color }} />
        </div>
        <div>
          <p className="font-bold text-gray-900 text-sm leading-tight">
            {form.name || 'Nueva categoría'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: chosen.color }}>
            {previewOpt.label}
          </p>
        </div>
      </div>

      {/* Nombre */}
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1.5">Nombre</label>
        <input
          type="text"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="ej: Mascotas, Gimnasio, Viajes..."
          maxLength={24}
          autoFocus
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand-400 transition-colors"
        />
      </div>

      {/* Ícono */}
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-2">Ícono</label>
        <div className="grid grid-cols-8 gap-1.5">
          {ICON_OPTIONS.map(opt => {
            const Icon = opt.icon
            const isSelected = form.iconName === opt.name
            return (
              <button
                key={opt.name}
                onClick={() => pickIcon(opt.name)}
                title={opt.label}
                className={cn(
                  'w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                  isSelected
                    ? 'ring-2 ring-offset-1 ring-brand-600'
                    : 'hover:bg-gray-100'
                )}
                style={isSelected ? { backgroundColor: chosen.bg } : {}}
              >
                <Icon
                  className="w-[18px] h-[18px]"
                  style={{ color: isSelected ? chosen.color : '#9CA3AF' }}
                />
              </button>
            )
          })}
        </div>
      </div>

      {/* Color */}
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-2">Color</label>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c, i) => (
            <button
              key={i}
              onClick={() => setForm(f => ({ ...f, colorIdx: i }))}
              title={`Color ${i + 1}`}
              className={cn(
                'w-8 h-8 rounded-full transition-all flex items-center justify-center',
                form.colorIdx === i && 'ring-2 ring-offset-2 ring-gray-400'
              )}
              style={{ backgroundColor: c.bg, border: `2.5px solid ${c.color}` }}
            >
              {form.colorIdx === i && (
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={cancel}
          className="flex-1 py-2.5 border border-brand-200 text-brand-700 text-sm font-semibold rounded-xl hover:bg-brand-50 transition-colors flex items-center justify-center gap-1.5"
        >
          <X className="w-4 h-4" /> Cancelar
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
        >
          {saving
            ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : <><Check className="w-4 h-4" />{mode === 'edit' ? 'Guardar cambios' : 'Crear categoría'}</>
          }
        </button>
      </div>
    </div>
  )
}
