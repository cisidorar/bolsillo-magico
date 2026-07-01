'use client'

import { useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, X, TrendingUp, Landmark, Trash2, ChevronRight,
  ArrowUp, ArrowDown, CalendarDays,
} from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import ServiceLogo from '@/components/ServiceLogo'
import type { SavingsAccount } from '@/app/(dashboard)/inversiones/page'

// ── Dominio por nombre de banco/fintech ───────────────────────────────────────
function domainFromSavingsName(name: string): string | null {
  const n = name.toLowerCase()
  // Fintechs Chile
  if (n.includes('copec'))         return 'copec.cl'
  if (n.includes('mercado pago') || n.includes('mercadopago')) return 'mercadopago.com'
  if (n.includes('fintual'))       return 'fintual.com'
  if (n.includes('tenpo'))         return 'tenpo.app'
  if (n.includes('mach'))          return 'somosmach.com'
  if (n.includes('lana'))          return 'lana.cl'
  if (n.includes('chek'))          return 'chek.cl'
  if (n.includes('tapp'))          return 'tapp.cl'
  if (n.includes('fpay') || n.includes('falabella pay')) return 'falabella.com'
  if (n.includes('flow'))          return 'flow.cl'
  // Bancos Chile
  if (n.includes('banco estado') || n.includes('bancoestado')) return 'bancoestado.cl'
  if (n.includes('santander'))     return 'santander.cl'
  if (n.includes('bci'))           return 'bci.cl'
  if (n.includes('falabella'))     return 'falabella.com'
  if (n.includes('ripley'))        return 'ripley.cl'
  if (n.includes('scotiabank'))    return 'scotiabank.cl'
  if (n.includes('bice'))          return 'bice.cl'
  if (n.includes('itaú') || n.includes('itau')) return 'itau.cl'
  if (n.includes('chile'))         return 'bancochile.cl'
  if (n.includes('security'))      return 'bancosecurity.cl'
  if (n.includes('coopeuch'))      return 'coopeuch.cl'
  if (n.includes('consorcio'))     return 'bancoconsorcio.cl'
  if (n.includes('internacional')) return 'bancointernacional.cl'
  // Internacional
  if (n.includes('nubank') || n.includes(' nu ') || n === 'nu') return 'nu.com.br'
  if (n.includes('paypal'))        return 'paypal.com'
  if (n.includes('wise'))          return 'wise.com'
  if (n.includes('revolut'))       return 'revolut.com'
  return null
}

function avatarColor(name: string): string {
  const palette = ['#1B6DD4','#1FBE8D','#FF6F61','#FBC23C','#A78BFA','#F472B6','#34D399','#FB923C']
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return palette[Math.abs(h) % palette.length]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

/** Días transcurridos desde start_date hasta hoy (mínimo 0 — el día de inicio no genera interés) */
function daysElapsed(startDate: string): number {
  const s   = new Date(startDate + 'T12:00:00')
  const now = new Date()
  return Math.max(0, Math.floor((now.getTime() - s.getTime()) / 86_400_000))
}

/** Tasa diaria efectiva a partir de TEA: (1 + r)^(1/365) - 1 */
function dailyRate(annualRate: number): number {
  return Math.pow(1 + annualRate / 100, 1 / 365) - 1
}

/** Interés ganado acumulado (capitalización compuesta diaria) en CLP */
function earnedSoFar(balance: number, annualRate: number, startDate: string): number {
  const days = daysElapsed(startDate)
  return Math.round(balance * (Math.pow(1 + annualRate / 100, days / 365) - 1))
}

/** Interés ganado en un día en CLP (tasa diaria efectiva) */
function dailyInterest(balance: number, annualRate: number): number {
  return Math.round(balance * dailyRate(annualRate))
}

/** Interés proyectado en N días (capitalización compuesta) */
function projectedInterest(balance: number, annualRate: number, days: number): number {
  return Math.round(balance * (Math.pow(1 + annualRate / 100, days / 365) - 1))
}

function fmtCLP(n: number, showSign = false): string {
  const sign = showSign && n >= 0 ? '+' : ''
  return sign + formatCLP(Math.abs(n))
}

function fmtPct(n: number): string {
  return n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + '%'
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-CL', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtInput(raw: string): string {
  const n = raw.replace(/\D/g, '')
  if (!n) return ''
  return parseInt(n).toLocaleString('es-CL')
}

// ── Input styles ──────────────────────────────────────────────────────────────

const inputBase: React.CSSProperties = {
  color:        'var(--ink)',
  background:   'var(--surface-2)',
  borderColor:  'var(--border)',
  borderRadius:  12,
  outline:      'none',
  transition:   'border-color 150ms, box-shadow 150ms',
}
function focusOn(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'var(--primary)'
  e.currentTarget.style.boxShadow   = '0 0 0 3px var(--primary-soft)'
}
function focusOff(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'var(--border)'
  e.currentTarget.style.boxShadow   = 'none'
}

// ── Sparkline mini-bar (proyección 12 meses) ──────────────────────────────────

function ProjectionBar({ balance, annualRate }: { balance: number; annualRate: number }) {
  const months = [1, 3, 6, 9, 12]
  const values = months.map(m => projectedInterest(balance, annualRate, m * 30))
  const max    = values[values.length - 1] || 1

  return (
    <div className="flex items-end gap-1 h-8">
      {values.map((v, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1">
          <div
            className="w-full rounded-t-md transition-all"
            style={{
              height:     `${Math.max(4, (v / max) * 28)}px`,
              background: `rgba(31,190,141,${0.35 + i * 0.13})`,
            }}
          />
        </div>
      ))}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  userId:         string
  initialSavings: SavingsAccount[]
}
interface FormState {
  name:       string
  balance:    string   // raw digits only
  annualRate: string
  startDate:  string
  notes:      string
}
const emptyForm: FormState = {
  name:       '',
  balance:    '',
  annualRate: '',
  startDate:  todayStr(),
  notes:      '',
}

export default function DepositManager({ userId, initialSavings }: Props) {
  const supabase     = createClient()
  const searchParams = useSearchParams()
  const isAhorro     = searchParams.get('view') === 'ahorro'

  const [savings,       setSavings]       = useState<SavingsAccount[]>(initialSavings)
  const [showForm,      setShowForm]      = useState(false)
  const [editingId,     setEditingId]     = useState<string | null>(null)
  const [form,          setForm]          = useState<FormState>(emptyForm)
  const [saving,        setSaving_]       = useState(false)
  const [formError,     setFormError]     = useState('')
  const [deletingId,    setDeletingId]    = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // ── Computed totals ───────────────────────────────────────────────────────
  const totalBalance     = savings.reduce((s, a) => s + a.balance, 0)
  const totalEarned      = savings.reduce((s, a) => s + earnedSoFar(a.balance, a.annual_rate, a.start_date), 0)
  const totalCurrentValue = totalBalance + totalEarned
  const totalReturn      = totalBalance > 0 ? (totalEarned / totalBalance) * 100 : 0

  const totalDaily       = savings.reduce((s, a) => s + dailyInterest(a.balance, a.annual_rate), 0)
  const totalMonthly     = savings.reduce((s, a) => s + projectedInterest(a.balance, a.annual_rate, 30), 0)
  const totalAnnual      = savings.reduce((s, a) => s + projectedInterest(a.balance, a.annual_rate, 365), 0)

  const avgRate = savings.length > 0
    ? savings.reduce((s, a) => s + a.annual_rate * a.balance, 0) / (totalBalance || 1)
    : 0

  const bestAccount = savings.reduce<{ name: string; rate: number } | null>((best, a) => {
    if (!best || a.annual_rate > best.rate) return { name: a.name, rate: a.annual_rate }
    return best
  }, null)

  // ── Form helpers ──────────────────────────────────────────────────────────
  function openAdd() {
    setForm(emptyForm); setEditingId(null); setFormError(''); setDeleteConfirm(false); setShowForm(true)
  }
  function openEdit(acc: SavingsAccount) {
    setForm({
      name:       acc.name,
      balance:    String(acc.balance),
      annualRate: String(acc.annual_rate),
      startDate:  acc.start_date,
      notes:      acc.notes ?? '',
    })
    setEditingId(acc.id); setFormError(''); setDeleteConfirm(false); setShowForm(true)
  }
  function cancelForm() {
    setShowForm(false); setEditingId(null); setForm(emptyForm)
    setFormError(''); setDeleteConfirm(false)
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const saveAccount = useCallback(async () => {
    const name       = form.name.trim()
    const balance    = parseInt(form.balance.replace(/\D/g, '') || '0')
    const annualRate = parseFloat(form.annualRate)

    if (!name)                                  { setFormError('Ingresa el nombre de la cuenta'); return }
    if (!balance || balance < 1)                { setFormError('Monto inválido'); return }
    if (isNaN(annualRate) || annualRate <= 0)   { setFormError('Tasa anual inválida'); return }
    if (!form.startDate)                        { setFormError('Fecha de inicio requerida'); return }

    setSaving_(true); setFormError('')
    const payload = {
      user_id:     userId,
      name,
      balance,
      annual_rate: annualRate,
      start_date:  form.startDate,
      notes:       form.notes.trim() || null,
      updated_at:  new Date().toISOString(),
    }

    if (editingId) {
      const { error } = await supabase.from('savings_accounts')
        .update(payload).eq('id', editingId).eq('user_id', userId)
      setSaving_(false)
      if (error) { setFormError(error.message); return }
      setSavings(prev => prev.map(a => a.id === editingId ? { ...a, ...payload } : a))
    } else {
      const { data, error } = await supabase.from('savings_accounts')
        .insert(payload).select().single()
      setSaving_(false)
      if (error) { setFormError(error.message); return }
      setSavings(prev => [...prev, data as SavingsAccount].sort((a, b) => a.start_date.localeCompare(b.start_date)))
    }
    cancelForm()
  }, [form, editingId, userId, supabase])

  async function deleteAccount(id: string) {
    setDeletingId(id)
    await supabase.from('savings_accounts').delete().eq('id', id).eq('user_id', userId)
    setSavings(prev => prev.filter(a => a.id !== id))
    setDeletingId(null)
    cancelForm()
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  const previewBalance = parseInt(form.balance.replace(/\D/g, '') || '0')
  const previewRate    = parseFloat(form.annualRate) || 0
  const previewDaily   = previewBalance > 0 && previewRate > 0
    ? dailyInterest(previewBalance, previewRate)
    : null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        {/* Tasa promedio — izquierda */}
        <div className="flex items-center gap-2 min-w-0 text-[11px]">
          {savings.length > 0 && (
            <>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--mint)' }} />
              <span style={{ color: 'var(--mint)' }} className="font-semibold">
                {fmtPct(avgRate)} TAE promedio
              </span>
            </>
          )}
        </div>

        {/* Tabs + Agregar — derecha */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="view-toggle-wrap flex items-center gap-1 rounded-xl p-1">
            <Link
              href="/inversiones"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                !isAhorro ? 'view-toggle-active-purchase' : 'view-toggle-btn'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Acciones</span>
            </Link>
            <Link
              href="/inversiones?view=ahorro"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isAhorro ? 'view-toggle-active-purchase' : 'view-toggle-btn'
              }`}
            >
              <Landmark className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ahorro</span>
            </Link>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all active:scale-[.97] shrink-0"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Agregar
          </button>
        </div>
      </div>

      {/* ── Modal add/edit ───────────────────────────────────────────────── */}
      {showForm && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={e => { if (e.target === e.currentTarget) cancelForm() }}
        >
          <div
            className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-hidden"
            style={{ background: 'var(--surface)', maxHeight: '92dvh' }}
          >
            {/* Handle mobile */}
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>
                {editingId ? 'Editar cuenta' : 'Nueva cuenta de ahorro'}
              </h2>
              <button
                onClick={cancelForm}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(92dvh - 120px)' }}>

              {/* Nombre */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Nombre de la cuenta
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ej: Mercado Pago, Fintual, BancoEstado"
                  maxLength={60}
                  className="w-full text-sm border px-4 py-3"
                  style={inputBase}
                  onFocus={focusOn} onBlur={focusOff}
                  autoFocus
                />
              </div>

              {/* Saldo + Tasa */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                    Saldo actual (CLP)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={fmtInput(form.balance)}
                    onChange={e => setForm(f => ({ ...f, balance: e.target.value.replace(/\D/g, '') }))}
                    placeholder="$0"
                    className="w-full text-sm border px-4 py-3 tabular-nums"
                    style={inputBase}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                    Tasa anual (% TAE)
                  </label>
                  <input
                    type="number"
                    value={form.annualRate}
                    onChange={e => setForm(f => ({ ...f, annualRate: e.target.value }))}
                    placeholder="12.5"
                    min="0.01"
                    max="100"
                    step="0.01"
                    className="w-full text-sm border px-4 py-3"
                    style={inputBase}
                    onFocus={focusOn} onBlur={focusOff}
                  />
                </div>
              </div>

              {/* Chip de preview diario */}
              {previewDaily !== null && previewDaily > 0 && (
                <div
                  className="px-4 py-2.5 rounded-xl flex items-center gap-2"
                  style={{ background: 'rgba(31,190,141,0.08)', border: '1px solid rgba(31,190,141,0.2)' }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--mint)' }}>
                    Ganás por día
                  </span>
                  <span className="text-sm font-extrabold tabular-nums ml-auto" style={{ color: 'var(--mint)', fontFamily: 'ui-monospace, monospace' }}>
                    +{fmtCLP(previewDaily)}
                  </span>
                </div>
              )}

              {/* Fecha de inicio */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Fecha de inicio
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  max={todayStr()}
                  className="w-full text-sm border px-4 py-3"
                  style={inputBase}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              {/* Nota */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Nota (opcional)
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="ej: tasa variable, cuenta remunerada"
                  maxLength={80}
                  className="w-full text-sm border px-4 py-3"
                  style={inputBase}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              {formError && (
                <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{formError}</p>
              )}

              {/* Confirmación de eliminación */}
              {deleteConfirm && editingId && (
                <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,111,97,0.08)', border: '1px solid rgba(255,111,97,0.25)' }}>
                  <p className="text-sm text-center font-medium" style={{ color: 'var(--ink-2)' }}>
                    ¿Eliminar esta cuenta?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDeleteConfirm(false)}
                      className="flex-1 py-2.5 text-sm font-semibold rounded-xl border transition-colors"
                      style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => editingId && deleteAccount(editingId)}
                      disabled={!!deletingId}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold rounded-xl disabled:opacity-50"
                      style={{ background: 'var(--coral)', color: 'white' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </button>
                  </div>
                </div>
              )}

              {/* Footer buttons */}
              {!deleteConfirm && (
                <div className="flex items-center gap-2 pt-1">
                  {editingId && (
                    <button
                      onClick={() => setDeleteConfirm(true)}
                      className="w-10 h-10 flex items-center justify-center rounded-xl border shrink-0 transition-colors"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink-3)', background: 'var(--surface-2)' }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={cancelForm}
                    className="flex-1 py-2.5 text-sm font-semibold rounded-xl border transition-colors"
                    style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveAccount}
                    disabled={saving}
                    className="flex-1 py-2.5 text-sm font-bold rounded-xl disabled:opacity-50 transition-all active:scale-[.98]"
                    style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 16px var(--shadow)' }}
                  >
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {savings.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-16 text-center px-6">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(31,190,141,0.1)' }}
          >
            <Landmark className="w-7 h-7" style={{ color: 'var(--mint)' }} />
          </div>
          <p className="text-base font-bold mb-1" style={{ color: 'var(--ink)' }}>Sin cuentas de ahorro</p>
          <p className="text-sm mb-5 max-w-xs" style={{ color: 'var(--ink-3)' }}>
            Registrá tu cuenta para ver cuánto estás ganando cada día.
          </p>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
          >
            <Plus className="w-4 h-4" />
            Agregar cuenta
          </button>
        </div>
      )}

      {/* ── Hero + KPIs ──────────────────────────────────────────────────── */}
      {savings.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-4">

          {/* Hero card */}
          <div
            className="rounded-3xl overflow-hidden"
            style={{
              flex: '40 1 0',
              background: 'linear-gradient(135deg, #1B6DD4 0%, #1557b0 100%)',
              boxShadow: '0 8px 32px rgba(27,109,212,0.35)',
            }}
          >
            {/* Valor total */}
            <div className="px-5 pt-5 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Total en ahorro
              </p>
              <div className="flex items-baseline gap-2">
                <p
                  className="text-4xl lg:text-5xl font-extrabold tabular-nums leading-none"
                  style={{ color: 'white', fontFamily: 'Fredoka, sans-serif' }}
                >
                  {formatCLP(totalCurrentValue)}
                </p>
              </div>
              <p className="text-[11px] mt-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {fmtPct(avgRate)} TAE promedio ponderado
              </p>
            </div>

            {/* Sub-KPIs */}
            <div className="border-t grid grid-cols-3" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
              <div className="px-4 py-3 lg:px-5 lg:py-4">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Depositado</p>
                <p className="text-sm lg:text-base font-bold tabular-nums" style={{ color: 'white' }}>
                  {formatCLP(totalBalance)}
                </p>
              </div>
              <div className="px-4 py-3 lg:px-5 lg:py-4 border-l" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Interés ganado</p>
                <p className="text-sm lg:text-base font-bold tabular-nums" style={{ color: '#1FBE8D' }}>
                  +{formatCLP(totalEarned)}
                </p>
              </div>
              <div className="px-4 py-3 lg:px-5 lg:py-4 border-l" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Rentabilidad</p>
                <p className="text-sm lg:text-base font-bold tabular-nums" style={{ color: '#1FBE8D' }}>
                  +{fmtPct(totalReturn)}
                </p>
              </div>
            </div>
          </div>

          {/* 3 KPI cards horizontales */}
          <div className="grid grid-cols-3 gap-3 w-full lg:min-w-0" style={{ flex: '60 1 0', alignContent: 'stretch' }}>

            {/* Hoy */}
            <div className="card p-4 lg:p-5 flex flex-col">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-3)' }}>Hoy</p>
              <p
                className="text-2xl lg:text-3xl font-extrabold tabular-nums leading-none"
                style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--mint)' }}
              >
                +{formatCLP(totalDaily)}
              </p>
              <p className="text-[11px] mt-1.5 font-medium" style={{ color: 'var(--ink-3)' }}>
                por día
              </p>
              <div className="flex-1" />
              {bestAccount && (
                <div className="flex items-center gap-1 mt-2">
                  <ArrowUp className="w-3 h-3" style={{ color: 'var(--mint)' }} />
                  <span className="text-[10px] font-semibold truncate" style={{ color: 'var(--ink-3)' }}>
                    {bestAccount.name} {fmtPct(bestAccount.rate)}
                  </span>
                </div>
              )}
            </div>

            {/* 30 días */}
            <div className="card p-4 lg:p-5 flex flex-col">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-3)' }}>30 días</p>
              <p
                className="text-2xl lg:text-3xl font-extrabold tabular-nums leading-none"
                style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
              >
                +{formatCLP(totalMonthly)}
              </p>
              <p className="text-[11px] mt-1.5 font-medium" style={{ color: 'var(--ink-3)' }}>
                proyección mensual
              </p>
            </div>

            {/* 12 meses */}
            <div className="card p-4 lg:p-5 flex flex-col">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-3)' }}>12 meses</p>
              <p
                className="text-2xl lg:text-3xl font-extrabold tabular-nums leading-none"
                style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}
              >
                +{formatCLP(totalAnnual)}
              </p>
              <p className="text-[11px] mt-1.5 font-medium" style={{ color: 'var(--ink-3)' }}>
                proyección anual
              </p>
              <div className="flex-1" />
              <div className="mt-2">
                <ProjectionBar balance={totalBalance} annualRate={avgRate} />
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Tabla de cuentas ─────────────────────────────────────────────── */}
      {savings.length > 0 && (
        <div className="card overflow-hidden">

          {/* Table header */}
          <div className="hidden lg:grid px-6 py-2.5 border-b" style={{
            borderColor: 'var(--border)',
            gridTemplateColumns: '2fr 1fr 0.8fr 1fr 1fr 1fr 40px',
          }}>
            {['Cuenta', 'Saldo', 'Tasa', 'Ganado hoy', 'Total ganado', 'Desde', ''].map((h, i) => (
              <p key={i} className={`text-[10px] font-bold uppercase tracking-widest ${i > 0 ? 'text-right' : ''}`}
                style={{ color: 'var(--ink-3)' }}>
                {h}
              </p>
            ))}
          </div>

          {/* Rows */}
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {savings.map(acc => {
              const earned = earnedSoFar(acc.balance, acc.annual_rate, acc.start_date)
              const today  = dailyInterest(acc.balance, acc.annual_rate)
              const days   = daysElapsed(acc.start_date)

              return (
                <button
                  key={acc.id}
                  onClick={() => openEdit(acc)}
                  className="w-full text-left group px-4 lg:px-6 py-3.5 hover:bg-[var(--surface-2)] transition-colors active:opacity-80"
                >
                  {/* Desktop */}
                  <div
                    className="hidden lg:grid items-center"
                    style={{ gridTemplateColumns: '2fr 1fr 0.8fr 1fr 1fr 1fr 40px' }}
                  >
                    {/* Cuenta */}
                    <div className="flex items-center gap-3">
                      <ServiceLogo
                        domain={domainFromSavingsName(acc.name)}
                        name={acc.name}
                        size={36}
                        fallbackColor={avatarColor(acc.name)}
                      />
                      <div>
                        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{acc.name}</p>
                        {acc.notes && (
                          <p className="text-[11px] truncate max-w-[160px]" style={{ color: 'var(--ink-3)' }}>{acc.notes}</p>
                        )}
                      </div>
                    </div>

                    {/* Saldo */}
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                        {formatCLP(acc.balance)}
                      </p>
                    </div>

                    {/* Tasa */}
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                        {fmtPct(acc.annual_rate)}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--ink-3)' }}>anual</p>
                    </div>

                    {/* Ganado hoy */}
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--mint)' }}>
                        +{formatCLP(today)}
                      </p>
                    </div>

                    {/* Total ganado */}
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--mint)' }}>
                        +{formatCLP(earned)}
                      </p>
                      <p className="text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                        {days} días
                      </p>
                    </div>

                    {/* Desde */}
                    <div className="text-right">
                      <p className="text-sm tabular-nums" style={{ color: 'var(--ink-2)' }}>
                        {fmtDate(acc.start_date)}
                      </p>
                    </div>

                    {/* Chevron */}
                    <div className="flex items-center justify-end">
                      <ChevronRight
                        className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                        style={{ color: 'var(--ink-3)' }}
                      />
                    </div>
                  </div>

                  {/* Mobile */}
                  <div className="lg:hidden flex items-center gap-3">
                    <ServiceLogo
                      domain={domainFromSavingsName(acc.name)}
                      name={acc.name}
                      size={40}
                      fallbackColor={avatarColor(acc.name)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{acc.name}</span>
                        <span className="text-[10px] font-semibold shrink-0" style={{ color: 'var(--ink-3)' }}>
                          {fmtPct(acc.annual_rate)}
                        </span>
                      </div>
                      <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                        {formatCLP(acc.balance)} · {days} días
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--mint)' }}>
                        +{formatCLP(earned)}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--ink-3)' }}>
                        +{formatCLP(today)}/día
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--ink-3)' }} />
                  </div>

                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div
            className="px-4 lg:px-6 py-2.5 border-t flex items-center gap-2 text-[10px]"
            style={{ borderColor: 'var(--border)', color: 'var(--ink-3)' }}
          >
            <CalendarDays className="w-3 h-3 shrink-0" />
            <span>Capitalización compuesta diaria (TEA) · actualizado al día de hoy</span>
          </div>
        </div>
      )}

    </div>
  )
}
