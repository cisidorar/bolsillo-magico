'use client'

import { useState, useEffect, useCallback } from 'react'
import { Home, List, BarChart2, Settings, Plus, X, Delete, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Tipos ──────────────────────────────────────────────────────────────────

type Category = { id: string; name: string; icon: string; color: string; bg: string }
type PaymentMethod = { id: string; name: string }
type Expense = {
  id: string; amount: number; categoryId: string; paymentMethodId: string
  description: string; date: string; createdAt: string
}

// ─── Constantes ─────────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  { id: 'comida',      name: 'Comida',      icon: '🍽️', color: '#0F6E56', bg: '#E1F5EE' },
  { id: 'transporte',  name: 'Transporte',  icon: '🚗', color: '#185FA5', bg: '#E6F1FB' },
  { id: 'hogar',       name: 'Hogar',       icon: '🏠', color: '#854F0B', bg: '#FAEEDA' },
  { id: 'ocio',        name: 'Ocio',        icon: '🎮', color: '#993556', bg: '#FBEAF0' },
  { id: 'salud',       name: 'Salud',       icon: '❤️', color: '#3B6D11', bg: '#EAF3DE' },
  { id: 'ropa',        name: 'Ropa',        icon: '👕', color: '#3C3489', bg: '#EEEDFE' },
  { id: 'educacion',   name: 'Educación',   icon: '📚', color: '#A32D2D', bg: '#FCEBEB' },
  { id: 'mascotas',    name: 'Mascotas',    icon: '🐾', color: '#854F0B', bg: '#FAEEDA' },
  { id: 'otros',       name: 'Otros',       icon: '📦', color: '#5F5E5A', bg: '#F1EFE8' },
]

const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'debito',   name: 'Débito'   },
  { id: 'credito',  name: 'Crédito'  },
  { id: 'efectivo', name: 'Efectivo' },
  { id: 'digital',  name: 'Digital'  },
]

const SEED_EXPENSES: Expense[] = [
  { id: '1', amount: 8500,  categoryId: 'comida',     paymentMethodId: 'debito',   description: 'Almuerzo',     date: today(0),  createdAt: today(0)  },
  { id: '2', amount: 850,   categoryId: 'transporte', paymentMethodId: 'debito',   description: 'Metro',        date: today(0),  createdAt: today(0)  },
  { id: '3', amount: 35000, categoryId: 'transporte', paymentMethodId: 'debito',   description: 'Bencina',      date: today(-1), createdAt: today(-1) },
  { id: '4', amount: 67200, categoryId: 'comida',     paymentMethodId: 'debito',   description: 'Supermercado', date: today(-2), createdAt: today(-2) },
  { id: '5', amount: 8990,  categoryId: 'ocio',       paymentMethodId: 'credito',  description: 'Netflix',      date: today(-3), createdAt: today(-3) },
  { id: '6', amount: 15000, categoryId: 'salud',      paymentMethodId: 'debito',   description: 'Farmacia',     date: today(-4), createdAt: today(-4) },
  { id: '7', amount: 45000, categoryId: 'hogar',      paymentMethodId: 'debito',   description: 'Gas',          date: today(-5), createdAt: today(-5) },
  { id: '8', amount: 12000, categoryId: 'ropa',       paymentMethodId: 'credito',  description: 'Calcetines',   date: today(-6), createdAt: today(-6) },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function today(offset = 0): string {
  const d = new Date(); d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

function relDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const t = new Date(); t.setHours(0,0,0,0)
  const diff = Math.round((t.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  return d.toLocaleString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })
}

function getCat(id: string) { return CATEGORIES.find(c => c.id === id) ?? CATEGORIES[8] }
function getPM(id: string)  { return PAYMENT_METHODS.find(p => p.id === id) }

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// ─── Subcomponents ──────────────────────────────────────────────────────────

function BudgetBar({ spent, budget }: { spent: number; budget: number }) {
  const pct = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-teal-500'
  return (
    <div className="h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ─── Pantallas ───────────────────────────────────────────────────────────────

function HomeScreen({ expenses, budget, monthLabel }: { expenses: Expense[]; budget: number; monthLabel: string }) {
  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const byCat = CATEGORIES.map(c => ({
    ...c, total: expenses.filter(e => e.categoryId === c.id).reduce((s, e) => s + e.amount, 0)
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total).slice(0, 4)

  return (
    <div className="px-4 pt-6 pb-2">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Mis Gastos</h1>
        <span className="text-sm text-gray-500">{monthLabel}</span>
      </div>

      {/* Budget card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Gastado este mes</p>
        <p className="text-3xl font-semibold text-gray-900">{fmt(total)}</p>
        {budget > 0 && (
          <>
            <p className="text-sm text-gray-400 mt-0.5">de {fmt(budget)} · quedan {fmt(Math.max(0, budget - total))}</p>
            <BudgetBar spent={total} budget={budget} />
          </>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Gastos</p>
          <p className="text-xl font-semibold text-gray-900">{expenses.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Promedio</p>
          <p className="text-xl font-semibold text-gray-900">
            {expenses.length ? fmt(Math.round(total / expenses.length)) : '–'}
          </p>
        </div>
      </div>

      {/* By category */}
      {byCat.length > 0 && (
        <>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-3">Por categoría</p>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {byCat.map(c => (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-base" style={{ background: c.bg }}>{c.icon}</div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 truncate">{c.name}</p>
                  <p className="text-sm font-semibold text-gray-900">{fmt(c.total)}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Recent */}
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-3">Últimos gastos</p>
      <ExpenseListUI expenses={expenses.slice(0, 5)} />
      {expenses.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">💸</p>
          <p className="text-sm">Aún no hay gastos este mes</p>
          <p className="text-xs mt-1">Toca + para agregar el primero</p>
        </div>
      )}
    </div>
  )
}

function ExpenseListUI({ expenses, onDelete }: { expenses: Expense[]; onDelete?: (id: string) => void }) {
  if (expenses.length === 0) return (
    <div className="text-center py-12 text-gray-400">
      <p className="text-4xl mb-3">📋</p>
      <p className="text-sm">Sin gastos registrados</p>
    </div>
  )
  return (
    <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
      {expenses.map(e => {
        const cat = getCat(e.categoryId)
        const pm = getPM(e.paymentMethodId)
        return (
          <div key={e.id} className="flex items-center gap-3 px-4 py-3 group">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-base" style={{ background: cat.bg }}>
              {cat.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{e.description || cat.name}</p>
              <p className="text-xs text-gray-400">{cat.name}{pm ? ` · ${pm.name}` : ''}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold text-gray-900">{fmt(e.amount)}</p>
              <p className="text-xs text-gray-400">{relDate(e.date)}</p>
            </div>
            {onDelete && (
              <button
                onClick={() => onDelete(e.id)}
                className="ml-1 p-1.5 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                aria-label="Eliminar"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function HistorialScreen({ expenses, onDelete }: { expenses: Expense[]; onDelete: (id: string) => void }) {
  const [filter, setFilter] = useState<string | null>(null)
  const filtered = filter ? expenses.filter(e => e.categoryId === filter) : expenses

  return (
    <div className="px-4 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Historial</h1>
        <span className="text-sm text-gray-500">{filtered.length} gastos</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-3 mb-3 -mx-4 px-4 scrollbar-hide">
        <button
          onClick={() => setFilter(null)}
          className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
            !filter ? 'bg-brand-50 border-brand-600 text-brand-800' : 'bg-white border-gray-200 text-gray-500')}
        >
          Todo
        </button>
        {CATEGORIES.filter(c => expenses.some(e => e.categoryId === c.id)).map(c => (
          <button
            key={c.id}
            onClick={() => setFilter(filter === c.id ? null : c.id)}
            className={cn('flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
              filter === c.id ? 'bg-brand-50 border-brand-600 text-brand-800' : 'bg-white border-gray-200 text-gray-500')}
          >
            <span>{c.icon}</span>{c.name}
          </button>
        ))}
      </div>
      <ExpenseListUI expenses={filtered} onDelete={onDelete} />
    </div>
  )
}

function AnalisisScreen({ expenses }: { expenses: Expense[] }) {
  const total = expenses.reduce((s, e) => s + e.amount, 0)

  // Tendencia 6 meses (simulada)
  const now = new Date()
  const monthData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now); d.setMonth(d.getMonth() - (5 - i))
    const key = d.toISOString().substring(0, 7)
    const monthExpenses = i === 5
      ? expenses
      : SEED_EXPENSES.map(e => ({ ...e, amount: Math.round(e.amount * (0.7 + Math.random() * 0.6)) }))
    const t = monthExpenses.reduce((s, e) => s + e.amount, 0)
    return { label: d.toLocaleString('es-CL', { month: 'short' }), total: t, isCurrent: i === 5 }
  })
  const maxT = Math.max(...monthData.map(m => m.total), 1)

  const byCat = CATEGORIES.map(c => ({
    ...c, total: expenses.filter(e => e.categoryId === c.id).reduce((s, e) => s + e.amount, 0)
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total)

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-xl font-semibold text-gray-900 mb-5">Análisis</h1>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-4">Tendencia 6 meses</p>
        <div className="flex items-end gap-2 h-20">
          {monthData.map((m) => {
            const h = Math.max(4, Math.round((m.total / maxT) * 72))
            return (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t transition-all ${m.isCurrent ? 'bg-brand-600' : 'bg-brand-100'}`}
                  style={{ height: `${h}px` }}
                  title={`${m.label}: ${fmt(m.total)}`}
                />
                <span className="text-[10px] text-gray-400">{m.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-3">Distribución del mes</p>
      {byCat.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-8">Sin datos este mes</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
          {byCat.map(c => {
            const pct = total ? Math.round((c.total / total) * 100) : 0
            return (
              <div key={c.id} className="p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: c.bg }}>{c.icon}</div>
                  <span className="text-sm font-medium text-gray-800 flex-1">{c.name}</span>
                  <span className="text-sm font-semibold text-gray-900">{fmt(c.total)}</span>
                  <span className="text-xs text-gray-400 w-7 text-right">{pct}%</span>
                </div>
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: c.color }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AjustesScreen({ budget, onBudgetChange }: { budget: number; onBudgetChange: (v: number) => void }) {
  const [input, setInput] = useState(budget ? String(budget) : '')
  const [saved, setSaved] = useState(false)

  function save() {
    const v = parseInt(input.replace(/\D/g, '')) || 0
    onBudgetChange(v)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-xl font-semibold text-gray-900 mb-5">Ajustes</h1>

      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-brand-100 flex items-center justify-center">
          <span className="text-brand-800 font-semibold text-lg">D</span>
        </div>
        <div>
          <p className="font-medium text-gray-900">Demo User</p>
          <p className="text-sm text-gray-400">demo@gstos.app</p>
        </div>
      </div>

      <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-3">Presupuesto mensual</p>
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
        <input
          type="number"
          inputMode="numeric"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="ej: 1000000"
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-brand-400 transition-colors mb-3"
        />
        {parseInt(input) > 0 && <p className="text-xs text-gray-400 mb-3">{fmt(parseInt(input))}</p>}
        <button
          onClick={save}
          className="w-full py-2.5 bg-brand-600 text-white text-sm font-medium rounded-xl transition-colors active:bg-brand-800"
        >
          {saved ? '✓ Guardado' : 'Guardar presupuesto'}
        </button>
      </div>

      <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-3">Categorías</p>
      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
        {CATEGORIES.map(c => (
          <div key={c.id} className="flex items-center gap-3 p-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: c.bg }}>{c.icon}</div>
            <span className="text-sm text-gray-800">{c.name}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
        <p className="text-xs font-medium text-amber-800 mb-1">Modo demo activo</p>
        <p className="text-xs text-amber-700">Los datos se guardan en tu navegador (localStorage). Configura Supabase para persistencia real.</p>
      </div>
    </div>
  )
}

// ─── ExpenseSheet ────────────────────────────────────────────────────────────

function ExpenseSheet({ open, onClose, onSave }: {
  open: boolean
  onClose: () => void
  onSave: (e: Omit<Expense, 'id' | 'createdAt'>) => void
}) {
  const [amount, setAmount]  = useState('')
  const [catId, setCatId]    = useState<string | null>(null)
  const [pmId, setPmId]      = useState('debito')
  const [dateOff, setDateOff]= useState(0)
  const [desc, setDesc]      = useState('')
  const [error, setError]    = useState('')

  function reset() {
    setAmount(''); setCatId(null); setPmId('debito'); setDateOff(0); setDesc(''); setError('')
  }

  function close() { reset(); onClose() }

  function numpad(k: string) {
    setError('')
    if (k === 'del') { setAmount(a => a.slice(0, -1)); return }
    if (amount.length >= 9) return
    setAmount(a => a + k)
  }

  function save() {
    if (!amount || parseInt(amount) === 0) { setError('Ingresa un monto'); return }
    if (!catId) { setError('Elige una categoría'); return }
    const d = new Date(); d.setDate(d.getDate() + dateOff)
    onSave({ amount: parseInt(amount), categoryId: catId, paymentMethodId: pmId, description: desc, date: d.toISOString().split('T')[0] })
    reset(); onClose()
  }

  if (!open) return null

  const n = parseInt(amount) || 0

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 max-w-lg mx-auto" onClick={e => { if (e.target === e.currentTarget) close() }}>
      <div className="w-full bg-white rounded-t-3xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full absolute left-1/2 -translate-x-1/2 top-3" />
          <h2 className="text-base font-semibold text-gray-900 mt-1">Nuevo gasto</h2>
          <button onClick={close} className="p-2 -mr-2 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Amount */}
        <div className="text-center py-3 px-5 border-b border-gray-100">
          <p className={cn('text-4xl font-semibold transition-colors', error && !amount ? 'text-red-500' : 'text-gray-900')}>
            {n > 0 ? fmt(n) : '$0'}
          </p>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>

        {/* Categories */}
        <div className="px-5 pt-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Categoría</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <button key={c.id} onClick={() => { setCatId(c.id); setError('') }}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all',
                  catId === c.id ? 'border-brand-600 bg-brand-50 text-brand-800 font-medium' : 'border-gray-200 bg-gray-50 text-gray-600'
                )}>
                <span>{c.icon}</span>{c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Payment + date */}
        <div className="px-5 pt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Método</p>
            <div className="flex flex-wrap gap-1.5">
              {PAYMENT_METHODS.map(pm => (
                <button key={pm.id} onClick={() => setPmId(pm.id)}
                  className={cn('px-3 py-1.5 rounded-full text-xs border transition-all',
                    pmId === pm.id ? 'border-brand-600 bg-brand-50 text-brand-800 font-medium' : 'border-gray-200 bg-gray-50 text-gray-600'
                  )}>
                  {pm.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Fecha</p>
            <div className="flex gap-1.5">
              {[{ l: 'Ayer', o: -1 }, { l: 'Hoy', o: 0 }].map(d => (
                <button key={d.o} onClick={() => setDateOff(d.o)}
                  className={cn('px-3 py-1.5 rounded-full text-xs border transition-all',
                    dateOff === d.o ? 'border-brand-600 bg-brand-50 text-brand-800 font-medium' : 'border-gray-200 bg-gray-50 text-gray-600'
                  )}>
                  {d.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Desc */}
        <div className="px-5 pt-3">
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descripción (opcional)..."
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-brand-400 transition-colors" />
        </div>

        {/* Numpad */}
        <div className="mt-3 border-t border-gray-100 grid grid-cols-3">
          {['1','2','3','4','5','6','7','8','9','000','0','del'].map(k => (
            <button key={k} onClick={() => k === 'del' ? numpad('del') : numpad(k)}
              className={cn('py-4 text-xl font-medium active:bg-gray-100 transition-colors border-r border-b border-gray-100 text-gray-800',
                k === 'del' && 'text-gray-400')}>
              {k === 'del' ? <Delete className="w-5 h-5 mx-auto" /> : k}
            </button>
          ))}
        </div>

        <div className="px-5 pt-3 pb-8">
          <button onClick={save} className="w-full py-4 bg-brand-600 text-white font-semibold rounded-2xl active:bg-brand-800 transition-colors text-base">
            Guardar gasto
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── App principal ────────────────────────────────────────────────────────────

type Screen = 'home' | 'historial' | 'analisis' | 'ajustes'

const LS_KEY = 'gstos_demo_expenses'
const LS_BUDGET = 'gstos_demo_budget'

export default function DemoPage() {
  const now = new Date()
  const [screen, setScreen]   = useState<Screen>('home')
  const [sheetOpen, setSheet] = useState(false)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [budget, setBudget]   = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)
  const [hydrated, setHydrated] = useState(false)

  // Cargar desde localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY)
      setExpenses(saved ? JSON.parse(saved) : SEED_EXPENSES)
      const b = localStorage.getItem(LS_BUDGET)
      setBudget(b ? parseInt(b) : 1260000)
    } catch {
      setExpenses(SEED_EXPENSES)
      setBudget(1260000)
    }
    setHydrated(true)
  }, [])

  function persist(next: Expense[]) {
    setExpenses(next)
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)) } catch {}
  }

  function addExpense(e: Omit<Expense, 'id' | 'createdAt'>) {
    const next = [{ ...e, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...expenses]
    persist(next)
  }

  function deleteExpense(id: string) {
    persist(expenses.filter(e => e.id !== id))
  }

  function saveBudget(v: number) {
    setBudget(v)
    try { localStorage.setItem(LS_BUDGET, String(v)) } catch {}
  }

  // Filtrar por mes seleccionado
  const viewDate = new Date(now)
  viewDate.setMonth(viewDate.getMonth() + monthOffset)
  const viewMonth = viewDate.getMonth() + 1
  const viewYear  = viewDate.getFullYear()
  const monthLabel = `${MONTH_NAMES[viewDate.getMonth()]} ${viewYear}`

  const monthExpenses = expenses.filter(e => {
    const d = new Date(e.date + 'T12:00:00')
    return d.getMonth() + 1 === viewMonth && d.getFullYear() === viewYear
  })

  if (!hydrated) return <div className="min-h-screen bg-gray-50" />

  const navItems = [
    { key: 'home',      icon: Home,     label: 'Inicio'   },
    { key: 'historial', icon: List,     label: 'Historial'},
    null,
    { key: 'analisis',  icon: BarChart2,label: 'Análisis' },
    { key: 'ajustes',   icon: Settings, label: 'Ajustes'  },
  ] as const

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto relative">
      {/* Demo badge */}
      <div className="fixed top-3 right-3 z-40 bg-amber-100 border border-amber-300 text-amber-800 text-xs font-medium px-2.5 py-1 rounded-full">
        Modo demo
      </div>

      {/* Month nav — solo en home y analisis */}
      {(screen === 'home' || screen === 'analisis') && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2">
          <button onClick={() => setMonthOffset(o => o - 1)} className="p-1 text-gray-400 hover:text-gray-700">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-medium text-gray-600 min-w-24 text-center">{monthLabel}</span>
          <button onClick={() => setMonthOffset(o => Math.min(0, o + 1))} disabled={monthOffset === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-24 pt-2">
        {screen === 'home'      && <HomeScreen     expenses={monthExpenses} budget={budget} monthLabel={monthLabel} />}
        {screen === 'historial' && <HistorialScreen expenses={monthExpenses} onDelete={deleteExpense} />}
        {screen === 'analisis'  && <AnalisisScreen  expenses={monthExpenses} />}
        {screen === 'ajustes'   && <AjustesScreen   budget={budget} onBudgetChange={saveBudget} />}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 max-w-lg mx-auto">
        <div className="flex items-center justify-around py-2 px-2">
          {navItems.map((item, i) => {
            if (!item) return (
              <button key="fab" onClick={() => setSheet(true)}
                className="w-14 h-14 -mt-6 bg-brand-600 rounded-full flex items-center justify-center shadow-lg shadow-brand-600/30 active:scale-95 transition-transform"
                aria-label="Agregar gasto">
                <Plus className="w-6 h-6 text-white" />
              </button>
            )
            const Icon = item.icon
            return (
              <button key={item.key} onClick={() => setScreen(item.key as Screen)}
                className={cn('flex flex-col items-center gap-1 px-4 py-1 rounded-lg transition-colors',
                  screen === item.key ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600')}>
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      <ExpenseSheet open={sheetOpen} onClose={() => setSheet(false)} onSave={addExpense} />
    </div>
  )
}
