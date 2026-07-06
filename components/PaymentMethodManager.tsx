'use client'

import React, { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, Check, X, Star, CreditCard, Landmark, Smartphone,
  ChevronRight, ChevronDown, ChevronUp
} from 'lucide-react'
import { cn, formatCLP } from '@/lib/utils'
import ServiceLogo from './ServiceLogo'
import Link from 'next/link'
import type { PaymentMethod, CardType } from '@/types'

const CARD_TYPES: { value: CardType; label: string; Icon: React.ElementType; desc: string }[] = [
  { value: 'debit',   label: 'Débito',  Icon: CreditCard,  desc: 'Descuenta directo de tu cuenta' },
  { value: 'credit',  label: 'Crédito', Icon: Landmark,    desc: 'Pago diferido, con fecha de cierre' },
  { value: 'digital', label: 'Digital', Icon: Smartphone,  desc: 'Transferencia, Mach, Fintual, etc.' },
]

const TYPE_COLORS: Record<CardType, { bg: string; text: string; border: string; bgHex: string; textHex: string }> = {
  debit:   { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   bgHex: '#EFF6FF', textHex: '#1D4ED8' },
  credit:  { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', bgHex: '#EEF2FF', textHex: '#4338CA' },
  cash:    { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  bgHex: '#F0FDF4', textHex: '#15803D' },
  digital: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', bgHex: '#FFF7ED', textHex: '#C2410C' },
}

const BANK_OPTIONS: { name: string; domain: string; color: string }[] = [
  { name: 'BancoEstado',    domain: 'bancoestado.cl',    color: '#005B9A' },
  { name: 'BCI',            domain: 'bci.cl',            color: '#E3001B' },
  { name: 'Santander',      domain: 'santander.cl',      color: '#EC0000' },
  { name: 'Banco de Chile', domain: 'bancochile.cl',     color: '#003087' },
  { name: 'Falabella',      domain: 'falabella.com',     color: '#C8102E' },
  { name: 'Ripley',         domain: 'bancoripley.com',   color: '#6B1D8B' },
  { name: 'Scotiabank',     domain: 'scotiabank.cl',     color: '#EC111A' },
  { name: 'BBVA',           domain: 'bbva.cl',           color: '#004481' },
  { name: 'Itaú',           domain: 'itau.cl',           color: '#EC7000' },
  { name: 'Security',       domain: 'bancosecurity.cl',  color: '#1A3A5C' },
  { name: 'BICE',           domain: 'bice.cl',           color: '#003366' },
  { name: 'Consorcio',      domain: 'bancoconsorcio.cl', color: '#0057A8' },
]

const WALLET_OPTIONS: { name: string; domain: string; color: string }[] = [
  { name: 'MACH',         domain: 'mach.life',      color: '#00C2B3' },
  { name: 'Tenpo',        domain: 'tenpo.cl',       color: '#6C2BD9' },
  { name: 'Mercado Pago', domain: 'mercadopago.cl', color: '#009EE3' },
  { name: 'Fintual',      domain: 'fintual.com',    color: '#FF5A36' },
  { name: 'PayPal',       domain: 'paypal.com',     color: '#003087' },
  { name: 'Apple Pay',    domain: 'apple.com',      color: '#1D1D1F' },
  { name: 'Google Pay',   domain: 'google.com',     color: '#4285F4' },
  { name: 'Samsung Pay',  domain: 'samsung.com',    color: '#1428A0' },
]

const ALL_OPTIONS = [...BANK_OPTIONS, ...WALLET_OPTIONS]

/** Formatea dígitos en estilo CLP: 4980 → "4.980" */
function fmtCLPInput(raw: string): string {
  if (!raw) return ''
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

interface Props {
  paymentMethods: PaymentMethod[]
  userId: string
  statementTotals?: Record<string, { total: number; start: string; end: string }>
}

type FormState = {
  name: string
  card_type: CardType
  billing_day: string
  last_four: string
  is_default: boolean
  domain: string
  selectedBank: string | null
  admin_fee: string
}

const DEFAULT_FORM: FormState = {
  name: '',
  card_type: 'debit',
  billing_day: '',
  last_four: '',
  is_default: false,
  domain: '',
  selectedBank: null,
  admin_fee: '',
}

function methodToForm(m: PaymentMethod): FormState {
  return {
    name: m.name,
    card_type: m.card_type ?? 'debit',
    billing_day: m.billing_day?.toString() ?? '',
    last_four: m.last_four ?? '',
    is_default: m.is_default,
    domain: m.domain ?? '',
    selectedBank: ALL_OPTIONS.find(b => b.domain === m.domain)?.domain ?? null,
    admin_fee: m.admin_fee?.toString() ?? '',
  }
}

// ─── Form panel (shared between inline + sidebar) ──────────────────────────
interface FormPanelProps {
  form: FormState
  saving: boolean
  deleting: boolean
  deleteConfirm: boolean
  error: string
  isNew: boolean
  onChange: <K extends keyof FormState>(k: K, v: FormState[K]) => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
}

function FormPanel({
  form, saving, deleting, deleteConfirm, error, isNew,
  onChange, onSave, onCancel, onDelete, onDeleteConfirm, onDeleteCancel,
}: FormPanelProps) {
  const selectedType = CARD_TYPES.find(t => t.value === form.card_type)!
  const colors = TYPE_COLORS[form.card_type]

  function changeType(type: CardType) {
    onChange('card_type', type)
    if (type === 'cash') {
      onChange('name', 'Efectivo')
      onChange('domain', '')
      onChange('selectedBank', null)
      onChange('last_four', '')
      onChange('billing_day', '')
      onChange('admin_fee', '')
    } else {
      onChange('name', '')
      onChange('domain', '')
      onChange('selectedBank', null)
      onChange('last_four', '')
      onChange('billing_day', '')
      onChange('admin_fee', '')
    }
  }

  const inputCls = 'w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors'
  const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)' }
  const labelCls  = 'text-[10px] font-bold uppercase tracking-widest block mb-1.5'

  return (
    <div className="flex flex-col gap-4">
      {/* Tipo */}
      <div>
        <label className={labelCls} style={{ color: 'var(--ink-3)' }}>Tipo</label>
        <div className="grid grid-cols-3 gap-1.5">
          {CARD_TYPES.map(t => {
            const active = form.card_type === t.value
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => changeType(t.value)}
                className={cn(
                  'flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-center transition-all',
                  active ? 'ring-1 ring-blue-500 border-blue-500' : 'hover:border-blue-300'
                )}
                style={{ background: active ? 'var(--primary-soft)' : 'var(--surface-2)', borderColor: active ? undefined : 'var(--border)' }}
              >
                <t.Icon className="w-4 h-4" style={{ color: active ? 'var(--primary)' : 'var(--ink-3)' }} />
                <p className="text-[11px] font-semibold" style={{ color: 'var(--ink-2)' }}>{t.label}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Banco / wallet */}
      {form.card_type !== 'cash' && (
        <div>
          <label className={labelCls} style={{ color: 'var(--ink-3)' }}>
            {form.card_type === 'digital' ? 'Plataforma' : 'Banco'}
          </label>
          <div className="relative">
            <select
              value={form.selectedBank ?? ''}
              onChange={e => {
                const val = e.target.value
                if (!val) {
                  onChange('selectedBank', null); onChange('domain', ''); onChange('name', '')
                } else {
                  const opts = form.card_type === 'digital' ? WALLET_OPTIONS : BANK_OPTIONS
                  const bank = opts.find(b => b.domain === val)
                  if (bank) {
                    onChange('selectedBank', bank.domain)
                    onChange('domain', bank.domain)
                    onChange('name', bank.name)
                  }
                }
              }}
              className="w-full appearance-none border rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors pr-9 cursor-pointer"
              style={inputStyle}
            >
              <option value="">
                {form.card_type === 'digital' ? '— Wallet —' : '— Selecciona banco —'}
              </option>
              {(form.card_type === 'digital' ? WALLET_OPTIONS : BANK_OPTIONS).map(b => (
                <option key={b.domain} value={b.domain}>{b.name}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-3)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Nombre */}
      {form.card_type !== 'cash' && (
        <div>
          <label className={labelCls} style={{ color: 'var(--ink-3)' }}>
            Nombre{' '}
            <span className="font-normal normal-case tracking-normal" style={{ color: 'var(--ink-3)', opacity: 0.55 }}>(personaliza)</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={e => onChange('name', e.target.value)}
            placeholder={form.card_type === 'digital' ? 'ej: MACH, Mercado Pago...' : 'ej: Tarjeta BCI...'}
            maxLength={32}
            className={inputCls}
            style={inputStyle}
          />
        </div>
      )}

      {/* Últimos 4 dígitos */}
      {(form.card_type === 'debit' || form.card_type === 'credit') && (
        <div>
          <label className={labelCls} style={{ color: 'var(--ink-3)' }}>
            Últimos 4 dígitos{' '}
            <span className="font-normal normal-case tracking-normal" style={{ color: 'var(--ink-3)', opacity: 0.55 }}>(opcional)</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={form.last_four}
            onChange={e => onChange('last_four', e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="1234"
            className={inputCls}
            style={inputStyle}
          />
        </div>
      )}

      {/* Día de cierre */}
      {form.card_type === 'credit' && (
        <div>
          <label className={labelCls} style={{ color: 'var(--ink-3)' }}>
            Día de cierre <span className="font-normal normal-case tracking-normal text-red-400">*</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={form.billing_day}
            onChange={e => onChange('billing_day', e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="ej: 5"
            className={inputCls}
            style={inputStyle}
          />
          <p className="text-[10px] mt-1" style={{ color: 'var(--ink-3)' }}>Entre 1 y 28</p>
        </div>
      )}

      {/* Cargo de administración */}
      {form.card_type === 'credit' && (
        <div>
          <label className={labelCls} style={{ color: 'var(--ink-3)' }}>
            Cargo de administración <span className="font-normal normal-case tracking-normal text-red-400">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium pointer-events-none" style={{ color: 'var(--ink-3)' }}>$</span>
            <input
              type="text"
              inputMode="numeric"
              value={fmtCLPInput(form.admin_fee)}
              onChange={e => onChange('admin_fee', e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className={cn(inputCls, 'pl-7')}
              style={inputStyle}
            />
          </div>
          <p className="text-[10px] mt-1" style={{ color: 'var(--ink-3)' }}>Ingresa 0 si no aplica · se registra el día de cierre</p>
        </div>
      )}

      {/* Predeterminado */}
      <button
        type="button"
        onClick={() => onChange('is_default', !form.is_default)}
        className="flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all text-left"
        style={{
          background:   form.is_default ? 'rgba(251,191,36,0.15)' : 'var(--surface-2)',
          borderColor:  form.is_default ? 'rgba(251,191,36,0.45)' : 'var(--border)',
        }}
      >
        <Star className="w-4 h-4 flex-shrink-0" style={{ color: form.is_default ? '#F59E0B' : 'var(--ink-3)', fill: form.is_default ? '#F59E0B' : 'none' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Método predeterminado</p>
          <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Se selecciona por defecto al registrar gastos</p>
        </div>
      </button>

      {error && (
        <p className="text-xs text-red-500 rounded-xl px-3.5 py-2.5 border" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)' }}>{error}</p>
      )}

      {/* Acciones */}
      {deleteConfirm ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-center" style={{ color: 'var(--ink)' }}>¿Eliminar este método?</p>
          <div className="flex gap-2">
            <button
              onClick={onDeleteCancel}
              className="flex-1 py-2.5 border text-sm font-semibold rounded-xl transition-opacity hover:opacity-70"
              style={{ borderColor: 'var(--border)', color: 'var(--ink-2)', background: 'var(--surface-2)' }}
            >
              Cancelar
            </button>
            <button
              onClick={onDeleteConfirm}
              disabled={deleting}
              className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {deleting
                ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <><Trash2 className="w-4 h-4" /> Eliminar</>
              }
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          {!isNew && (
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 px-3.5 py-2.5 border text-sm font-semibold rounded-xl transition-colors hover:border-red-400 hover:text-red-500"
              style={{ borderColor: 'var(--border)', color: 'var(--ink-3)', background: 'var(--surface-2)' }}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 border text-sm font-semibold rounded-xl transition-opacity hover:opacity-70"
            style={{ borderColor: 'var(--border)', color: 'var(--ink-2)', background: 'var(--surface-2)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex-1 py-2.5 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            {saving
              ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <><Check className="w-4 h-4" />{isNew ? 'Agregar' : 'Guardar'}</>
            }
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────
export default function PaymentMethodManager({ paymentMethods: init, userId, statementTotals = {} }: Props) {
  const router  = useRouter()
  const supabase = createClient()

  const [methods, setMethods]           = useState<PaymentMethod[]>(init)
  const [expandedId, setExpandedId]     = useState<string | 'new' | null>(null)
  const [form, setForm]                 = useState<FormState>(DEFAULT_FORM)
  const [saving, setSaving]             = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [error, setError]               = useState('')

  function openEdit(m: PaymentMethod) {
    if (expandedId === m.id) { closeAll(); return }
    setForm(methodToForm(m))
    setExpandedId(m.id)
    setError('')
    setDeleteConfirm(false)
  }

  function openNew() {
    if (expandedId === 'new') { closeAll(); return }
    setForm(DEFAULT_FORM)
    setExpandedId('new')
    setError('')
    setDeleteConfirm(false)
  }

  function closeAll() {
    setExpandedId(null)
    setForm(DEFAULT_FORM)
    setError('')
    setDeleteConfirm(false)
  }

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function validate(): string {
    if (!form.name.trim()) return 'Ponle un nombre al método'
    if (form.card_type === 'credit') {
      if (!form.billing_day) return 'El día de cierre es obligatorio para tarjetas de crédito'
      const d = parseInt(form.billing_day)
      if (isNaN(d) || d < 1 || d > 28) return 'Día de cierre debe ser entre 1 y 28'
      if (form.admin_fee === '') return 'El cargo de administración es obligatorio (ingresa 0 si no aplica)'
      const f = parseInt(form.admin_fee)
      if (isNaN(f) || f < 0) return 'El cargo de administración debe ser 0 o un valor positivo'
    }
    if (form.last_four && !/^\d{4}$/.test(form.last_four)) return 'Los últimos 4 dígitos deben ser 4 números'
    return ''
  }

  async function save() {
    const err = validate()
    if (err) { setError(err); return }
    setSaving(true); setError('')

    const payload = {
      name:        form.name.trim(),
      card_type:   form.card_type,
      billing_day: form.card_type === 'credit' && form.billing_day ? parseInt(form.billing_day) : null,
      last_four:   form.last_four || null,
      is_default:  form.is_default,
      icon:        '💳',
      domain:      form.domain.trim() || null,
      admin_fee:   form.card_type === 'credit' && form.admin_fee ? parseInt(form.admin_fee) : null,
    }

    if (form.is_default) {
      await supabase.from('payment_methods').update({ is_default: false })
        .eq('user_id', userId)
        .neq('id', expandedId ?? '00000000-0000-0000-0000-000000000000')
    }

    if (expandedId === 'new') {
      const { data, error: e } = await supabase
        .from('payment_methods')
        .insert({ user_id: userId, ...payload, sort_order: methods.length + 1 })
        .select().single()
      setSaving(false)
      if (e) { setError(`Error: ${e.message}`); return }
      setMethods(prev => {
        const updated = form.is_default ? prev.map(m => ({ ...m, is_default: false })) : prev
        return [...updated, data]
      })
    } else {
      const { error: e } = await supabase
        .from('payment_methods').update(payload).eq('id', expandedId!)
      setSaving(false)
      if (e) { setError(`Error: ${e.message}`); return }
      setMethods(prev => prev.map(m => {
        if (m.id === expandedId) return { ...m, ...payload }
        if (form.is_default) return { ...m, is_default: false }
        return m
      }))
    }

    router.refresh()
    closeAll()
  }

  async function deleteMethod() {
    setDeleting(true)
    await supabase.from('payment_methods').delete().eq('id', expandedId!)
    setMethods(prev => prev.filter(m => m.id !== expandedId))
    setDeleting(false)
    router.refresh()
    closeAll()
  }

  const fmtDate = (s: string) =>
    new Date(s + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="lg:grid lg:grid-cols-[1fr_400px] lg:gap-6 lg:items-start space-y-4 lg:space-y-0">

      {/* ── Columna izquierda: lista ── */}
      <div className="flex flex-col gap-3">
        {methods.length === 0 ? (
          <div className="card text-center py-14 flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-1" style={{ background: 'var(--primary-soft)' }}>
              <CreditCard className="w-6 h-6" style={{ color: 'var(--primary)' }} />
            </div>
            <p className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>Sin métodos de pago</p>
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Agrega tu primera tarjeta o cuenta</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            {methods.map((m, idx) => {
              const ct = m.card_type ?? 'debit'
              const displayCt = ct === 'cash' ? 'digital' : ct
              const c = TYPE_COLORS[displayCt as CardType] ?? TYPE_COLORS.debit
              const type = CARD_TYPES.find(t => t.value === displayCt)
                ?? (ct === 'cash' ? { label: 'Efectivo' } : CARD_TYPES[0])
              const fallbackColor = ALL_OPTIONS.find(b => b.domain === m.domain)?.color
              const stmt = m.card_type === 'credit' ? statementTotals[m.id] : undefined
              const isOpen = expandedId === m.id

              return (
                <div key={m.id} style={idx > 0 ? { borderTop: '1px solid var(--border)' } : undefined}>
                  {/* Fila del método — clicable */}
                  <button
                    onClick={() => openEdit(m)}
                    className="w-full flex items-center gap-3 px-4 py-4 text-left transition-colors"
                    style={{ background: isOpen ? 'var(--primary-soft)' : undefined }}
                    onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)' }}
                    onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = '' }}
                  >
                    <ServiceLogo
                      domain={m.domain}
                      name={m.name}
                      size={44}
                      fallbackColor={fallbackColor}
                      className="flex-shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900 truncate">{m.name}</span>
                        {m.last_four && (
                          <span className="text-xs text-gray-400 font-medium tabular-nums">···{m.last_four}</span>
                        )}
                        {m.is_default && (
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ backgroundColor: c.bgHex, color: c.textHex }}
                        >
                          {type.label}
                        </span>
                        {m.card_type === 'credit' && m.billing_day && (
                          <span className="text-[11px] text-gray-400">Cierra día {m.billing_day}</span>
                        )}
                        {m.card_type === 'credit' && m.admin_fee && m.admin_fee > 0 && (
                          <span className="text-[11px] text-gray-400">Admin {formatCLP(m.admin_fee)}</span>
                        )}
                        {stmt && (
                          <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--primary)' }}>
                            {formatCLP(stmt.total)}
                          </span>
                        )}
                      </div>
                    </div>

                    {isOpen
                      ? <ChevronUp className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    }
                  </button>

                  {/* Estado de cuenta — crédito, solo cuando NO está expandido */}
                  {!isOpen && stmt && (
                    <Link
                      href="/historial?view=billing"
                      onClick={e => e.stopPropagation()}
                      className="mx-4 mb-3 flex items-center justify-between rounded-2xl px-3.5 py-2.5 transition-colors"
                      style={{ background: 'var(--primary-soft)' }}
                    >
                      <div>
                        <p className="text-[11px] font-medium" style={{ color: 'var(--ink-3)' }}>
                          Período {fmtDate(stmt.start)} – {fmtDate(stmt.end)}
                        </p>
                        <p className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--primary)' }}>
                          {formatCLP(stmt.total)}
                        </p>
                        <p className="text-[10px]" style={{ color: 'var(--ink-3)' }}>acumulado hasta hoy</p>
                      </div>
                      <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} />
                    </Link>
                  )}

                  {/* Formulario inline — solo en mobile (lg oculto) */}
                  {isOpen && (
                    <div className="lg:hidden px-4 pb-5 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                      <FormPanel
                        form={form}
                        saving={saving}
                        deleting={deleting}
                        deleteConfirm={deleteConfirm}
                        error={error}
                        isNew={false}
                        onChange={setField}
                        onSave={save}
                        onCancel={closeAll}
                        onDelete={() => setDeleteConfirm(true)}
                        onDeleteConfirm={deleteMethod}
                        onDeleteCancel={() => setDeleteConfirm(false)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Botón agregar */}
        <button
          onClick={openNew}
          className={cn(
            'flex items-center justify-center gap-2 w-full py-3.5 border-2 border-dashed rounded-3xl text-sm font-bold transition-colors',
            expandedId === 'new' ? 'border-blue-400 bg-blue-50/40' : 'hover:bg-blue-50/30'
          )}
          style={{ borderColor: expandedId === 'new' ? 'var(--primary)' : 'var(--border)', color: 'var(--primary)' }}
        >
          <Plus className="w-4 h-4" />
          Agregar método de pago
        </button>

        {/* Formulario nuevo — inline mobile */}
        {expandedId === 'new' && (
          <div className="lg:hidden card p-5">
            <p className="text-sm font-bold mb-4" style={{ color: 'var(--ink)' }}>Nuevo método</p>
            <FormPanel
              form={form}
              saving={saving}
              deleting={deleting}
              deleteConfirm={deleteConfirm}
              error={error}
              isNew={true}
              onChange={setField}
              onSave={save}
              onCancel={closeAll}
              onDelete={() => {}}
              onDeleteConfirm={() => {}}
              onDeleteCancel={() => setDeleteConfirm(false)}
            />
          </div>
        )}
      </div>

      {/* ── Columna derecha: panel desktop ── */}
      <div className="hidden lg:block sticky top-8">
        {expandedId ? (
          <div className="card p-5">
            <p className="text-sm font-bold mb-4" style={{ color: 'var(--ink)' }}>
              {expandedId === 'new' ? 'Nuevo método de pago' : 'Editar método'}
            </p>
            <FormPanel
              form={form}
              saving={saving}
              deleting={deleting}
              deleteConfirm={deleteConfirm}
              error={error}
              isNew={expandedId === 'new'}
              onChange={setField}
              onSave={save}
              onCancel={closeAll}
              onDelete={() => setDeleteConfirm(true)}
              onDeleteConfirm={deleteMethod}
              onDeleteCancel={() => setDeleteConfirm(false)}
            />
          </div>
        ) : (
          <div className="card flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'var(--primary-soft)' }}>
              <CreditCard className="w-6 h-6" style={{ color: 'var(--primary)' }} />
            </div>
            <p className="text-sm font-bold mb-1" style={{ color: 'var(--ink-2)' }}>Selecciona un método</p>
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Haz clic en una tarjeta para editarla</p>
          </div>
        )}
      </div>

    </div>
  )
}
