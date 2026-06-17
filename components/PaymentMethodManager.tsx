'use client'

import React, { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Check, X, Pencil, Star, CreditCard, Landmark, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import ServiceLogo from './ServiceLogo'
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

// Bancos (débito/crédito)
const BANK_OPTIONS: { name: string; domain: string; color: string }[] = [
  { name: 'BancoEstado',    domain: 'bancoestado.cl',   color: '#005B9A' },
  { name: 'BCI',            domain: 'bci.cl',           color: '#E3001B' },
  { name: 'Santander',      domain: 'santander.cl',     color: '#EC0000' },
  { name: 'Banco de Chile', domain: 'bancochile.cl',    color: '#003087' },
  { name: 'Falabella',      domain: 'falabella.com',    color: '#C8102E' },
  { name: 'Ripley',         domain: 'bancoripley.com',  color: '#6B1D8B' },
  { name: 'Scotiabank',     domain: 'scotiabank.cl',    color: '#EC111A' },
  { name: 'BBVA',           domain: 'bbva.cl',          color: '#004481' },
  { name: 'Itaú',           domain: 'itau.cl',          color: '#EC7000' },
  { name: 'Security',       domain: 'bancosecurity.cl', color: '#1A3A5C' },
  { name: 'BICE',           domain: 'bice.cl',          color: '#003366' },
  { name: 'Consorcio',      domain: 'bancoconsorcio.cl',color: '#0057A8' },
]

// Wallets / pagos digitales
const WALLET_OPTIONS: { name: string; domain: string; color: string }[] = [
  { name: 'MACH',         domain: 'mach.life',       color: '#00C2B3' },
  { name: 'Tenpo',        domain: 'tenpo.cl',        color: '#6C2BD9' },
  { name: 'Mercado Pago', domain: 'mercadopago.cl',  color: '#009EE3' },
  { name: 'Fintual',      domain: 'fintual.com',     color: '#FF5A36' },
  { name: 'PayPal',       domain: 'paypal.com',      color: '#003087' },
  { name: 'Apple Pay',    domain: 'apple.com',       color: '#1D1D1F' },
  { name: 'Google Pay',   domain: 'google.com',      color: '#4285F4' },
  { name: 'Samsung Pay',  domain: 'samsung.com',     color: '#1428A0' },
]

const ALL_OPTIONS = [...BANK_OPTIONS, ...WALLET_OPTIONS]

interface Props {
  paymentMethods: PaymentMethod[]
  userId: string
}

type FormState = {
  name: string
  card_type: CardType
  billing_day: string
  last_four: string
  is_default: boolean
  domain: string
  selectedBank: string | null
}

const DEFAULT_FORM: FormState = {
  name: '',
  card_type: 'debit',
  billing_day: '',
  last_four: '',
  is_default: false,
  domain: '',
  selectedBank: null,
}

export default function PaymentMethodManager({ paymentMethods: init, userId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [methods, setMethods]             = useState<PaymentMethod[]>(init)
  const [mode, setMode]                   = useState<'list' | 'new' | 'edit'>('list')
  const [editTarget, setEditTarget]       = useState<PaymentMethod | null>(null)
  const [form, setForm]                   = useState<FormState>(DEFAULT_FORM)
  const [saving, setSaving]               = useState(false)
  const [deleting, setDeleting]           = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [error, setError]                 = useState('')

  function openNew() {
    setForm(DEFAULT_FORM); setError(''); setMode('new')
  }

  function openEdit(m: PaymentMethod) {
    const matchedBank = ALL_OPTIONS.find(b => b.domain === m.domain)
    setForm({
      name: m.name,
      card_type: m.card_type ?? 'debit',
      billing_day: m.billing_day?.toString() ?? '',
      last_four: m.last_four ?? '',
      is_default: m.is_default,
      domain: m.domain ?? '',
      selectedBank: matchedBank?.domain ?? null,
    })
    setEditTarget(m)
    setError('')
    setMode('edit')
  }

  function cancel() {
    setMode('list'); setForm(DEFAULT_FORM); setEditTarget(null); setError('')
  }

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function changeType(type: CardType) {
    setForm(f => ({
      ...f,
      card_type: type,
      // Efectivo → nombre fijo, sin banco
      name: type === 'cash' ? 'Efectivo' : '',
      domain: '',
      selectedBank: null,
      last_four: '',
      billing_day: '',
    }))
  }

  function selectBank(bank: { name: string; domain: string }) {
    setForm(f => ({
      ...f,
      selectedBank: bank.domain,
      domain: bank.domain,
      name: bank.name,
    }))
  }

  async function save() {
    if (!form.name.trim()) { setError('Ponle un nombre al método'); return }
    if (form.card_type === 'credit' && form.billing_day) {
      const d = parseInt(form.billing_day)
      if (isNaN(d) || d < 1 || d > 28) { setError('Día de cierre debe ser entre 1 y 28'); return }
    }
    if (form.last_four && !/^\d{4}$/.test(form.last_four)) {
      setError('Los últimos 4 dígitos deben ser 4 números'); return
    }

    setSaving(true); setError('')

    const payload = {
      name:        form.name.trim(),
      card_type:   form.card_type,
      billing_day: form.card_type === 'credit' && form.billing_day ? parseInt(form.billing_day) : null,
      last_four:   form.last_four || null,
      is_default:  form.is_default,
      icon:        '💳',
      domain:      form.domain.trim() || null,
    }

    if (form.is_default) {
      await supabase
        .from('payment_methods')
        .update({ is_default: false })
        .eq('user_id', userId)
        .neq('id', editTarget?.id ?? '00000000-0000-0000-0000-000000000000')
    }

    if (mode === 'new') {
      const { data, error: err } = await supabase
        .from('payment_methods')
        .insert({ user_id: userId, ...payload, sort_order: methods.length + 1 })
        .select().single()

      setSaving(false)
      if (err) { setError(`Error: ${err.message}`); return }
      setMethods(prev => {
        const updated = form.is_default ? prev.map(m => ({ ...m, is_default: false })) : prev
        return [...updated, data]
      })

    } else if (mode === 'edit' && editTarget) {
      const { error: err } = await supabase
        .from('payment_methods')
        .update(payload)
        .eq('id', editTarget.id)

      setSaving(false)
      if (err) { setError(`Error: ${err.message}`); return }
      setMethods(prev => prev.map(m => {
        if (m.id === editTarget.id) return { ...m, ...payload }
        if (form.is_default) return { ...m, is_default: false }
        return m
      }))
    }

    router.refresh()
    cancel()
  }

  async function deleteMethod(id: string) {
    setDeleting(id)
    await supabase.from('payment_methods').delete().eq('id', id)
    setMethods(prev => prev.filter(m => m.id !== id))
    setDeleting(null)
    router.refresh()
  }

  const selectedType = CARD_TYPES.find(t => t.value === form.card_type)!
  const colors = TYPE_COLORS[form.card_type]

  // ── Lista ────────────────────────────────────────────────────────────────
  if (mode === 'list') return (
    <div className="flex flex-col gap-3">
      {methods.length === 0 ? (
        <div className="card text-center py-14 flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-1" style={{ background: '#EEF4FF' }}>
            <CreditCard className="w-6 h-6" style={{ color: '#1B6DD4' }} />
          </div>
          <p className="text-sm font-bold text-gray-600">Sin métodos de pago</p>
          <p className="text-xs text-gray-400">Agrega tu primera tarjeta o cuenta</p>
        </div>
      ) : (
        <div className="card overflow-hidden divide-y divide-gray-50">
          {methods.map(m => {
            const ct   = m.card_type ?? 'debit'
            const displayCt = ct === 'cash' ? 'digital' : ct
            const c    = TYPE_COLORS[displayCt as CardType] ?? TYPE_COLORS.debit
            const type = CARD_TYPES.find(t => t.value === displayCt)
              ?? (ct === 'cash' ? { label: 'Efectivo' } : CARD_TYPES[0])
            const fallbackColor = ALL_OPTIONS.find(b => b.domain === m.domain)?.color

            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3.5">
                {/* Logo */}
                <div className="flex-shrink-0">
                  <ServiceLogo
                    domain={m.domain}
                    name={m.name}
                    size={44}
                    fallbackColor={fallbackColor}
                  />
                </div>

                {/* Info */}
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
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ backgroundColor: c.bgHex, color: c.textHex }}
                    >
                      {type.label}
                    </span>
                    {m.card_type === 'credit' && m.billing_day && (
                      <span className="text-[11px] text-gray-400">Cierra día {m.billing_day}</span>
                    )}
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {pendingDelete === m.id ? (
                    <>
                      <span className="text-xs text-red-500 font-semibold mr-1.5">¿Eliminar?</span>
                      <button
                        onClick={() => setPendingDelete(null)}
                        className="p-1.5 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { deleteMethod(m.id); setPendingDelete(null) }}
                        disabled={deleting === m.id}
                        className="p-1.5 rounded-xl text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-60 ml-0.5"
                      >
                        {deleting === m.id
                          ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : <Check className="w-3.5 h-3.5" />
                        }
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => openEdit(m)}
                        className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setPendingDelete(m.id)}
                        className="p-2 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-xl transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button
        onClick={openNew}
        className="flex items-center justify-center gap-2 w-full py-3.5 border-2 border-dashed rounded-3xl text-sm font-bold transition-colors"
        style={{ borderColor: '#D5E6FF', color: '#1B6DD4' }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#EEF4FF' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '' }}
      >
        <Plus className="w-4 h-4" />
        Agregar método de pago
      </button>
    </div>
  )

  // ── Formulario ────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl border border-brand-200 p-5 flex flex-col gap-5">

      {/* Preview */}
      <div className={cn('flex items-center gap-3 p-3 rounded-xl', colors.bg)}>
        <ServiceLogo
          domain={form.domain || undefined}
          name={form.name || 'M'}
          size={40}
          fallbackColor={ALL_OPTIONS.find(b => b.domain === form.domain)?.color}
        />
        <div>
          <p className={cn('font-bold text-sm', colors.text)}>
            {form.name || 'Nombre del método'}
            {form.last_four && ` ···${form.last_four}`}
          </p>
          <p className={cn('text-xs opacity-70', colors.text)}>
            {selectedType.label}
            {form.card_type === 'credit' && form.billing_day && ` · Cierra día ${form.billing_day}`}
          </p>
        </div>
      </div>

      {/* Tipo — va primero para adaptar el resto */}
      <div>
        <label className="text-xs font-bold uppercase tracking-widest text-brand-600 block mb-2">Tipo</label>
        <div className="grid grid-cols-2 gap-2">
          {CARD_TYPES.map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => changeType(t.value)}
              className={cn(
                'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all',
                form.card_type === t.value
                  ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
                  : 'border-brand-100 bg-white hover:border-brand-300'
              )}
            >
              <t.Icon className="w-4 h-4 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gray-800">{t.label}</p>
                <p className="text-[10px] text-gray-400 leading-tight">{t.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Banco / wallet — solo si no es efectivo */}
      {form.card_type !== 'cash' && (
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-brand-600 block mb-2">
            {form.card_type === 'digital' ? 'Wallet o plataforma' : 'Banco'}
          </label>
          <div className="relative">
            <select
              value={form.selectedBank ?? ''}
              onChange={e => {
                const val = e.target.value
                if (!val) {
                  setForm(f => ({ ...f, selectedBank: null, domain: '', name: '' }))
                } else {
                  const opts = form.card_type === 'digital' ? WALLET_OPTIONS : BANK_OPTIONS
                  const bank = opts.find(b => b.domain === val)
                  if (bank) selectBank(bank)
                }
              }}
              className="w-full appearance-none bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none focus:border-brand-600 transition-colors pr-10 cursor-pointer"
            >
              <option value="">
                {form.card_type === 'digital' ? '— Selecciona wallet —' : '— Selecciona banco —'}
              </option>
              {(form.card_type === 'digital' ? WALLET_OPTIONS : BANK_OPTIONS).map(b => (
                <option key={b.domain} value={b.domain}>{b.name}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-brand-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Nombre — oculto para efectivo (nombre automático) */}
      {form.card_type !== 'cash' && (
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-brand-600 block mb-1.5">
            Nombre{' '}
            <span className="font-normal normal-case tracking-normal text-brand-400">
              (personaliza si quieres)
            </span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder={form.card_type === 'digital' ? 'ej: MACH, Mercado Pago...' : 'ej: Tarjeta BCI, CMR Falabella...'}
            maxLength={32}
            className="w-full bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-brand-300 outline-none focus:border-brand-600 transition-colors"
          />
        </div>
      )}

      {/* Últimos 4 dígitos — solo débito/crédito */}
      {(form.card_type === 'debit' || form.card_type === 'credit') && (
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-brand-600 block mb-1.5">
            Últimos 4 dígitos{' '}
            <span className="font-normal normal-case tracking-normal text-brand-400">(opcional)</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={form.last_four}
            onChange={e => set('last_four', e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="1234"
            className="w-full bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-brand-300 outline-none focus:border-brand-600 transition-colors"
          />
        </div>
      )}

      {/* Día de cierre (solo crédito) */}
      {form.card_type === 'credit' && (
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-brand-600 block mb-1.5">
            Día de cierre{' '}
            <span className="font-normal normal-case tracking-normal text-brand-400">(opcional)</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={form.billing_day}
            onChange={e => set('billing_day', e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="ej: 5"
            className="w-full bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-brand-300 outline-none focus:border-brand-600 transition-colors"
          />
          <p className="text-xs text-brand-400 mt-1">Entre 1 y 28</p>
        </div>
      )}

      {/* Default */}
      <button
        type="button"
        onClick={() => set('is_default', !form.is_default)}
        className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left',
          form.is_default ? 'bg-amber-50 border-amber-200' : 'bg-brand-50 border-brand-200'
        )}
      >
        <Star className={cn('w-4 h-4 flex-shrink-0', form.is_default ? 'text-amber-400 fill-amber-400' : 'text-brand-300')} />
        <div>
          <p className="text-sm font-semibold text-gray-800">Método predeterminado</p>
          <p className="text-xs text-brand-400">Se seleccionará por defecto al registrar un gasto</p>
        </div>
      </button>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={cancel}
          className="flex-1 py-2.5 border border-brand-200 text-brand-700 text-sm font-semibold rounded-xl hover:bg-brand-50 transition-colors flex items-center justify-center gap-1.5"
        >
          <X className="w-4 h-4" /> Cancelar
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
        >
          {saving
            ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : <><Check className="w-4 h-4" />{mode === 'edit' ? 'Guardar cambios' : 'Agregar'}</>
          }
        </button>
      </div>
    </div>
  )
}
