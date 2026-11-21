'use client'

import React, { useState } from 'react'
import { useBackdropClose } from '@/components/useBackdropClose'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, Check, X, Star, CreditCard, Landmark, Smartphone, Banknote,
  ChevronRight
} from 'lucide-react'
import { cn, formatCLP, daysBetween } from '@/lib/utils'
import ServiceLogo from './ServiceLogo'
import Link from 'next/link'
import type { PaymentMethod, CardType } from '@/types'

const CARD_TYPES: { value: CardType; label: string; Icon: React.ElementType; desc: string }[] = [
  { value: 'debit',   label: 'Débito',  Icon: CreditCard,  desc: 'Descuenta directo de tu cuenta' },
  { value: 'credit',  label: 'Crédito', Icon: Landmark,    desc: 'Pago diferido, con fecha de cierre' },
  { value: 'digital', label: 'Digital', Icon: Smartphone,  desc: 'Transferencia, Mach, Fintual, etc.' },
  { value: 'cash',    label: 'Efectivo', Icon: Banknote,   desc: 'Dinero en mano, sin banco' },
]

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
  usage?: Record<string, { expenses: number; recurring: number }>
  /** Hoy (YYYY-MM-DD, Santiago) para calcular cuánto falta para el cierre */
  today?: string
}

type FormState = {
  name: string
  card_type: CardType
  billing_day: string
  payment_due_day: string
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
  payment_due_day: '',
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
    payment_due_day: m.payment_due_day?.toString() ?? '',
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
  impact: { expenses: number; recurring: number }
  onChange: <K extends keyof FormState>(k: K, v: FormState[K]) => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
}

function FormPanel({
  form, saving, deleting, deleteConfirm, error, isNew, impact,
  onChange, onSave, onCancel, onDelete, onDeleteConfirm, onDeleteCancel,
}: FormPanelProps) {
  // Débito y crédito comparten catálogo de bancos: al alternar entre ambos se
  // conserva nombre, banco y últimos 4. Al cruzar a digital/efectivo (otro
  // catálogo) se limpia lo que ya no aplica.
  function changeType(type: CardType) {
    const prev = form.card_type
    const sameCatalog = (prev === 'debit' || prev === 'credit') && (type === 'debit' || type === 'credit')
    onChange('card_type', type)
    if (!sameCatalog) {
      onChange('name', type === 'cash' ? 'Efectivo' : '')
      onChange('domain', '')
      onChange('selectedBank', null)
      onChange('last_four', '')
    }
    if (type !== 'credit') {
      onChange('billing_day', '')
      onChange('payment_due_day', '')
      onChange('admin_fee', '')
    }
  }

  const inputCls = 'w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none'
  const inputStyle = {
    background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)',
    transition: 'border-color 150ms, box-shadow 150ms',
  }
  const focusOn = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = 'var(--primary)'
    e.currentTarget.style.boxShadow = '0 0 0 3px var(--primary-soft)'
  }
  const focusOff = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = 'var(--border)'
    e.currentTarget.style.boxShadow = 'none'
  }
  const focusProps = { onFocus: focusOn, onBlur: focusOff }
  const labelCls  = 'text-xs font-semibold block mb-1.5'

  return (
    <div className="flex flex-col gap-4">
      {/* Tipo */}
      <div>
        <span className={labelCls} style={{ color: 'var(--ink-3)' }}>Tipo</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5" role="group" aria-label="Tipo de método">
          {CARD_TYPES.map(t => {
            const active = form.card_type === t.value
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => changeType(t.value)}
                aria-pressed={active}
                className="flex flex-col items-center justify-center gap-1 px-2 min-h-[56px] rounded-xl border text-center transition-all"
                style={{
                  background: active ? 'var(--primary-soft)' : 'var(--surface-2)',
                  borderColor: active ? 'var(--primary)' : 'var(--border)',
                  boxShadow: active ? '0 0 0 1px var(--primary)' : 'none',
                }}
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
          <label htmlFor="pm-bank" className={labelCls} style={{ color: 'var(--ink-3)' }}>
            {form.card_type === 'digital' ? 'Plataforma' : 'Banco'}
          </label>
          <div className="relative">
            <select
              id="pm-bank"
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
              className="w-full appearance-none border rounded-xl px-3.5 py-2.5 text-sm outline-none pr-9 cursor-pointer"
              style={inputStyle}
              {...focusProps}
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
          <label htmlFor="pm-name" className={labelCls} style={{ color: 'var(--ink-3)' }}>
            Nombre{' '}
            <span className="font-normal normal-case tracking-normal" style={{ color: 'var(--ink-3)', opacity: 0.55 }}>(personaliza)</span>
          </label>
          <input
            id="pm-name"
            type="text"
            value={form.name}
            onChange={e => onChange('name', e.target.value)}
            placeholder={form.card_type === 'digital' ? 'ej: MACH, Mercado Pago...' : 'ej: Tarjeta BCI...'}
            maxLength={32}
            className={inputCls}
            style={inputStyle}
            {...focusProps}
          />
        </div>
      )}

      {/* Últimos 4 dígitos */}
      {(form.card_type === 'debit' || form.card_type === 'credit') && (
        <div>
          <label htmlFor="pm-last4" className={labelCls} style={{ color: 'var(--ink-3)' }}>
            Últimos 4 dígitos{' '}
            <span className="font-normal normal-case tracking-normal" style={{ color: 'var(--ink-3)', opacity: 0.55 }}>(opcional)</span>
          </label>
          <input
            id="pm-last4"
            type="text"
            inputMode="numeric"
            value={form.last_four}
            onChange={e => onChange('last_four', e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="1234"
            className={inputCls}
            style={inputStyle}
            {...focusProps}
          />
        </div>
      )}

      {/* Día de cierre */}
      {form.card_type === 'credit' && (
        <div>
          <label htmlFor="pm-billing" className={labelCls} style={{ color: 'var(--ink-3)' }}>
            Día de cierre <span className="font-normal normal-case tracking-normal" style={{ color: 'var(--coral-ink)' }} aria-hidden="true">*</span>
          </label>
          <input
            id="pm-billing"
            type="text"
            inputMode="numeric"
            value={form.billing_day}
            onChange={e => onChange('billing_day', e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="ej: 5"
            className={inputCls}
            style={inputStyle}
            {...focusProps}
          />
          <p className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>Entre 1 y 28</p>
        </div>
      )}

      {/* Día de pago (vencimiento del estado ya cerrado) */}
      {form.card_type === 'credit' && (
        <div>
          <label htmlFor="pm-due" className={labelCls} style={{ color: 'var(--ink-3)' }}>
            Día de pago{' '}
            <span className="font-normal normal-case tracking-normal" style={{ color: 'var(--ink-3)', opacity: 0.55 }}>(opcional)</span>
          </label>
          <input
            id="pm-due"
            type="text"
            inputMode="numeric"
            value={form.payment_due_day}
            onChange={e => onChange('payment_due_day', e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="ej: 5"
            className={inputCls}
            style={inputStyle}
            {...focusProps}
          />
          <p className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>
            Día del mes siguiente en que vence el pago (ej: cierra el 24, vence el 5). Activa la card &quot;Ciclo de sueldo&quot; en Inicio.
          </p>
        </div>
      )}

      {/* Cargo de administración */}
      {form.card_type === 'credit' && (
        <div>
          <label htmlFor="pm-fee" className={labelCls} style={{ color: 'var(--ink-3)' }}>
            Cargo de administración <span className="font-normal normal-case tracking-normal" style={{ color: 'var(--coral-ink)' }} aria-hidden="true">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium pointer-events-none" style={{ color: 'var(--ink-3)' }}>$</span>
            <input
              id="pm-fee"
              type="text"
              inputMode="numeric"
              value={fmtCLPInput(form.admin_fee)}
              onChange={e => onChange('admin_fee', e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className={cn(inputCls, 'pl-7')}
              style={inputStyle}
              {...focusProps}
            />
          </div>
          <p className="text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>Ingresa 0 si no aplica · se registra el día de cierre</p>
        </div>
      )}

      {/* Predeterminado */}
      <button
        type="button"
        role="switch"
        aria-checked={form.is_default}
        onClick={() => onChange('is_default', !form.is_default)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${form.is_default ? 'sheet-toggle-active' : 'sheet-toggle'}`}
      >
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Método predeterminado</p>
          <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Se selecciona por defecto al registrar gastos</p>
        </div>
        <div className="w-9 h-5 rounded-full relative transition-colors flex-shrink-0" style={{ background: form.is_default ? 'var(--primary)' : 'var(--border)' }}>
          <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" style={{ transform: form.is_default ? 'translateX(1.125rem)' : 'translateX(0.125rem)' }} />
        </div>
      </button>

      {error && (
        <p role="alert" className="text-xs font-semibold rounded-xl px-3.5 py-2.5 border" style={{ color: 'var(--coral-ink)', background: 'color-mix(in srgb, var(--coral) 12%, var(--surface))', borderColor: 'color-mix(in srgb, var(--coral) 35%, var(--surface))' }}>{error}</p>
      )}

      {/* Acciones */}
      {deleteConfirm ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-center" style={{ color: 'var(--ink)' }}>¿Eliminar este método?</p>
          <p className="text-xs text-center" style={{ color: 'var(--ink-3)' }}>
            {impact.expenses + impact.recurring > 0
              ? `Tiene ${impact.expenses} gasto${impact.expenses !== 1 ? 's' : ''} y ${impact.recurring} recurrente${impact.recurring !== 1 ? 's' : ''}: quedarán sin método de pago. No se puede deshacer.`
              : 'No tiene gastos asociados. No se puede deshacer.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onDeleteCancel}
              className="flex-1 min-h-[44px] border text-sm font-semibold rounded-xl transition-opacity hover:opacity-70"
              style={{ borderColor: 'var(--border)', color: 'var(--ink-2)', background: 'var(--surface)' }}
            >
              Cancelar
            </button>
            <button
              onClick={onDeleteConfirm}
              disabled={deleting}
              className="flex-1 min-h-[44px] text-sm font-semibold rounded-xl transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-1.5"
              style={{ background: 'var(--coral-ink)', color: 'white' }}
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
              aria-label="Eliminar método"
              className="flex items-center justify-center min-w-[44px] min-h-[44px] border rounded-xl transition-colors hover:border-[var(--coral)] hover:text-[var(--coral-ink)]"
              style={{ borderColor: 'var(--border)', color: 'var(--ink-3)', background: 'var(--surface)' }}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[44px] text-sm font-semibold rounded-xl transition-opacity hover:opacity-70"
            style={{ color: 'var(--ink-2)', background: 'var(--surface-2)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex-1 min-h-[44px] text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-ink)' }}
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
export default function PaymentMethodManager({ paymentMethods: init, userId, statementTotals = {}, usage = {}, today }: Props) {
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
    setForm(methodToForm(m))
    setExpandedId(m.id)
    setError('')
    setDeleteConfirm(false)
  }

  function openNew() {
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
  // Hook llamado siempre — el modal es condicional (`{expandedId && ...}`)
  // más abajo, pero el hook no puede serlo sin romper el orden de hooks (bug
  // real: crasheaba al abrir el modal, reportado por Cas).
  const backdropClose = useBackdropClose(closeAll)

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function validate(): string {
    if (!form.name.trim()) return 'Ponle un nombre al método'
    if (form.card_type === 'credit') {
      if (!form.billing_day) return 'El día de cierre es obligatorio para tarjetas de crédito'
      const d = parseInt(form.billing_day)
      if (isNaN(d) || d < 1 || d > 28) return 'Día de cierre debe ser entre 1 y 28'
      if (form.payment_due_day) {
        const p = parseInt(form.payment_due_day)
        if (isNaN(p) || p < 1 || p > 31) return 'Día de pago debe ser entre 1 y 31'
      }
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
      payment_due_day: form.card_type === 'credit' && form.payment_due_day ? parseInt(form.payment_due_day) : null,
      last_four:   form.last_four || null,
      is_default:  form.is_default,
      icon:        '💳',
      domain:      form.domain.trim() || null,
      admin_fee:   form.card_type === 'credit' && form.admin_fee ? parseInt(form.admin_fee) : null,
    }

    // Primero la escritura principal; recién después se des-marcan los otros
    // favoritos, así un fallo nunca deja al usuario sin método predeterminado.
    async function unsetOtherDefaults(keepId: string): Promise<boolean> {
      const { error: de } = await supabase.from('payment_methods')
        .update({ is_default: false }).eq('user_id', userId).neq('id', keepId)
      if (de) { setError(`Se guardó, pero no se pudo quitar el predeterminado anterior: ${de.message}`); return false }
      return true
    }

    if (expandedId === 'new') {
      const { data, error: e } = await supabase
        .from('payment_methods')
        .insert({ user_id: userId, ...payload, sort_order: methods.length + 1 })
        .select().single()
      if (e) { setSaving(false); setError(`No se pudo guardar: ${e.message}`); return }
      if (form.is_default && !(await unsetOtherDefaults(data.id))) { setSaving(false); router.refresh(); return }
      setSaving(false)
      setMethods(prev => {
        const updated = form.is_default ? prev.map(m => ({ ...m, is_default: false })) : prev
        return [...updated, data]
      })
    } else {
      const { error: e } = await supabase
        .from('payment_methods').update(payload).eq('id', expandedId!)
      if (e) { setSaving(false); setError(`No se pudo guardar: ${e.message}`); return }
      if (form.is_default && !(await unsetOtherDefaults(expandedId!))) { setSaving(false); router.refresh(); return }
      setSaving(false)
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
    const { error: de } = await supabase.from('payment_methods').delete().eq('id', expandedId!)
    if (de) {
      setDeleting(false)
      setDeleteConfirm(false)
      setError(`No se pudo eliminar: ${de.message}`)
      return
    }
    setMethods(prev => prev.filter(m => m.id !== expandedId))
    setDeleting(false)
    router.refresh()
    closeAll()
  }

  const fmtDate = (s: string) =>
    new Date(s + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })

  // ── Render ─────────────────────────────────────────────────────────────────
  // Editar/crear siempre abre como popup (bottom sheet en mobile, modal
  // centrado en desktop) — mismo patrón que CategoryManager y
  // TermDepositManager, en vez del panel lateral sticky que tenía antes.
  const credit = methods.filter(m => m.card_type === 'credit')
  const others = methods.filter(m => m.card_type !== 'credit')
  const openTotal = credit.reduce((sum, m) => sum + (statementTotals[m.id]?.total ?? 0), 0)
  const hasOpen = credit.some(m => statementTotals[m.id])

  /** Fila de un método que no es crédito (o crédito sin período calculable). */
  const MethodRow = ({ m }: { m: PaymentMethod }) => {
    const type = CARD_TYPES.find(t => t.value === (m.card_type ?? 'debit')) ?? CARD_TYPES[0]
    return (
      <button onClick={() => openEdit(m)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left rounded-2xl transition-colors hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]">
        <ServiceLogo domain={m.domain} name={m.name} size={44} fallbackColor={ALL_OPTIONS.find(b => b.domain === m.domain)?.color} className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{m.name}</span>
            {m.last_four && <span className="text-xs font-medium tabular-nums" style={{ color: 'var(--ink-3)' }}>···{m.last_four}</span>}
            {m.is_default && <Star className="w-3.5 h-3.5 flex-shrink-0" aria-label="Predeterminado" style={{ color: 'var(--gold-ink)', fill: 'var(--gold-ink)' }} />}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{type.label}</p>
        </div>
        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
      </button>
    )
  }

  /** Tarjeta de crédito: el período abierto es lo que importa, con cuánto falta para el cierre. */
  const CreditCardTile = ({ m, i }: { m: PaymentMethod; i: number }) => {
    const stmt = statementTotals[m.id]
    const total = stmt ? stmt.total : null
    const daysLen = stmt ? daysBetween(stmt.start, stmt.end) + 1 : 0
    const elapsed = stmt && today ? Math.min(daysLen, Math.max(0, daysBetween(stmt.start, today) + 1)) : 0
    const left = stmt && today ? daysBetween(today, stmt.end) : null
    const soon = left != null && left >= 0 && left <= 3
    const closeText = left == null ? null : left < 0 ? 'Cerrado' : left === 0 ? 'Cierra hoy' : left === 1 ? 'Cierra mañana' : `Cierra en ${left} días`
    return (
      <div className="card p-4 lg:p-5 pr-in flex flex-col" style={{ ['--d' as string]: `${i * 70}ms` }}>
        <button onClick={() => openEdit(m)} className="w-full flex items-center gap-3 text-left min-h-[44px]" aria-label={`Editar ${m.name}`}>
          <ServiceLogo domain={m.domain} name={m.name} size={44} fallbackColor={ALL_OPTIONS.find(b => b.domain === m.domain)?.color} className="flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{m.name}</span>
              {m.last_four && <span className="text-xs font-medium tabular-nums" style={{ color: 'var(--ink-3)' }}>···{m.last_four}</span>}
              {m.is_default && <Star className="w-3.5 h-3.5 flex-shrink-0" aria-label="Predeterminado" style={{ color: 'var(--gold-ink)', fill: 'var(--gold-ink)' }} />}
            </div>
            <p className="text-xs mt-0.5" style={{ color: m.billing_day && !m.payment_due_day ? 'var(--gold-ink)' : 'var(--ink-3)' }}>
              {m.billing_day ? `Cierra día ${m.billing_day}` : 'Sin día de cierre'}
              {m.payment_due_day ? ` · Paga día ${m.payment_due_day}` : m.billing_day ? ' · sin día de pago, toca para configurar' : ''}
              {m.admin_fee != null && m.admin_fee > 0 ? ` · Admin ${formatCLP(m.admin_fee)}` : ''}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
        </button>

        {stmt && total != null && (
          <Link href="/historial?view=billing" className="block mt-4 rounded-2xl p-4 transition-colors hover:brightness-[.98] active:scale-[.99]" style={{ background: 'var(--surface-2)' }}>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Período abierto · {fmtDate(stmt.start)} al {fmtDate(stmt.end)}</p>
                <p className="font-display text-2xl font-extrabold tabular-nums mt-1 leading-none" style={{ color: 'var(--ink)' }}>{formatCLP(total)}</p>
              </div>
              {closeText && (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                  style={soon
                    ? { background: 'color-mix(in srgb, var(--gold) 16%, var(--surface))', color: 'var(--gold-ink)' }
                    : { background: 'var(--surface)', color: 'var(--ink-2)' }}>
                  {closeText}
                </span>
              )}
            </div>
            {today && daysLen > 0 && (
              <div className="mt-3" role="img" aria-label={`Día ${elapsed} de ${daysLen} del período`}>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface)' }}>
                  <div className="h-full rounded-full rc-grow" style={{ width: `${(elapsed / daysLen) * 100}%`, background: soon ? 'var(--gold)' : 'var(--primary)', ['--d' as string]: `${200 + i * 70}ms` }} />
                </div>
                <p className="text-[11px] mt-1.5 tabular-nums" style={{ color: 'var(--ink-3)' }}>Día {elapsed} de {daysLen} · acumulado hasta hoy</p>
              </div>
            )}
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-7">
      {methods.length === 0 ? (
        <div className="card text-center py-14 flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-1" style={{ background: 'var(--primary-soft)' }}>
            <CreditCard className="w-6 h-6" style={{ color: 'var(--primary)' }} />
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>Sin métodos de pago</p>
          <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Agrega tu primera tarjeta o cuenta</p>
        </div>
      ) : (
        <>
          {credit.length > 0 && (
            <section aria-labelledby="pm-credit">
              <div className="flex items-baseline justify-between gap-3 mb-2.5">
                <h2 id="pm-credit" className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>Tarjetas de crédito</h2>
                {hasOpen && (
                  <span className="text-xs tabular-nums" style={{ color: 'var(--ink-3)' }}>
                    {formatCLP(openTotal)} en períodos abiertos
                  </span>
                )}
              </div>
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {credit.map((m, i) => <React.Fragment key={m.id}>{CreditCardTile({ m, i })}</React.Fragment>)}
              </div>
            </section>
          )}

          {others.length > 0 && (
            <section aria-labelledby="pm-others">
              <h2 id="pm-others" className="text-sm font-bold mb-2.5" style={{ color: 'var(--ink-2)' }}>
                {credit.length > 0 ? 'Débito, cuentas y efectivo' : 'Tus métodos'}
              </h2>
              <div className="card p-1.5 lg:max-w-2xl pr-in" style={{ ['--d' as string]: `${credit.length * 70}ms` }}>
                {others.map(m => <React.Fragment key={m.id}>{MethodRow({ m })}</React.Fragment>)}
              </div>
            </section>
          )}
        </>
      )}

      {/* Botón agregar */}
      <button
        onClick={openNew}
        className="flex items-center justify-center gap-2 w-full lg:w-auto lg:px-8 min-h-[48px] rounded-2xl text-sm font-bold transition-[background-color,transform] active:scale-[.98] hover:bg-[var(--primary-soft)]"
        style={{ background: 'var(--surface)', color: 'var(--primary)' }}
      >
        <Plus className="w-4 h-4" />
        Agregar método de pago
      </button>

      {/* ── Popup: nuevo / editar método — bottom sheet en mobile, modal centrado en desktop ── */}
      {expandedId && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center bg-black/50"
          role="dialog" aria-modal="true" aria-labelledby="pm-sheet-title"
          {...backdropClose}
        >
          <div
            className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-hidden"
            style={{ background: 'var(--surface)', maxHeight: '92dvh' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

            <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 id="pm-sheet-title" className="text-base font-bold" style={{ color: 'var(--ink)' }}>
                {expandedId === 'new' ? 'Nuevo método de pago' : 'Editar método'}
              </h2>
              <button
                onClick={closeAll}
                aria-label="Cerrar"
                className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full transition-colors"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-5 overflow-y-auto" style={{ maxHeight: 'calc(92dvh - 76px)' }}>
              <FormPanel
                form={form}
                saving={saving}
                deleting={deleting}
                deleteConfirm={deleteConfirm}
                error={error}
                isNew={expandedId === 'new'}
                impact={usage[expandedId] ?? { expenses: 0, recurring: 0 }}
                onChange={setField}
                onSave={save}
                onCancel={closeAll}
                onDelete={() => setDeleteConfirm(true)}
                onDeleteConfirm={deleteMethod}
                onDeleteCancel={() => setDeleteConfirm(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
