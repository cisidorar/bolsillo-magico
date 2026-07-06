'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, ChevronDown, ChevronUp, Star, Info, RefreshCw } from 'lucide-react'
import ServiceLogo from '@/components/ServiceLogo'
import type { TechnicalAnalysis, SignalTone } from '@/lib/technical'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WatchlistItem {
  id:     string
  ticker: string
}

interface Quote { price: number; changePercent: number; name: string; domain?: string }

interface Props {
  userId:       string
  initialItems: WatchlistItem[]
}

const TICKER_RE = /^[A-Z0-9.\-]{1,12}$/

const TONE_STYLE: Record<SignalTone, { color: string; bg: string }> = {
  mint:    { color: 'var(--mint)',  bg: 'rgba(31,190,141,0.12)' },
  gold:    { color: 'var(--gold)',  bg: 'rgba(255,194,60,0.14)' },
  coral:   { color: 'var(--coral)', bg: 'rgba(255,111,97,0.12)' },
  neutral: { color: 'var(--ink-2)', bg: 'var(--surface-2)' },
}

function fmtUSD(n: number): string {
  return '$' + n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function avatarColor(t: string): string {
  const palette = ['#2B7CF6','#1FBE8D','#FF6F61','#FFC23C','#A78BFA','#F472B6','#34D399','#FB923C']
  let h = 0
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return palette[Math.abs(h) % palette.length]
}

// ── RSI gauge ────────────────────────────────────────────────────────────────

function RsiBar({ value }: { value: number }) {
  const color = value <= 30 ? 'var(--mint)' : value >= 70 ? 'var(--gold)' : 'var(--primary)'
  return (
    <div>
      <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
        {/* Zonas 30 / 70 */}
        <div className="absolute inset-y-0" style={{ left: '30%', width: 1.5, background: 'var(--border)' }} />
        <div className="absolute inset-y-0" style={{ left: '70%', width: 1.5, background: 'var(--border)' }} />
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] font-semibold" style={{ color: 'var(--ink-3)' }}>30 sobreventa</span>
        <span className="text-[9px] font-semibold" style={{ color: 'var(--ink-3)' }}>70 sobrecompra</span>
      </div>
    </div>
  )
}

// ── Panel técnico de un ticker ────────────────────────────────────────────────

function TechnicalDetail({ a }: { a: TechnicalAnalysis }) {
  const range = a.high52 - a.low52 || 1
  const posPct = Math.min(Math.max(((a.price - a.low52) / range) * 100, 0), 100)

  return (
    <div className="px-4 pb-4 space-y-3">

      {/* Señales */}
      {a.signals.length > 0 ? (
        <div className="space-y-2">
          {a.signals.map(s => {
            const t = TONE_STYLE[s.tone]
            return (
              <div key={s.kind} className="flex items-start gap-2.5 rounded-2xl px-3 py-2.5" style={{ background: t.bg }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block mt-1.5 flex-shrink-0" style={{ background: t.color }} />
                <div className="min-w-0">
                  <p className="text-xs font-bold leading-tight" style={{ color: t.color }}>{s.title}</p>
                  <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>{s.detail}</p>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-xs rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
          Sin señales destacadas hoy: el precio se mueve en rango normal.
        </p>
      )}

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--ink-3)' }}>
            RSI 14 {a.rsi14 !== null && <span className="tabular-nums" style={{ color: 'var(--ink)' }}>· {Math.round(a.rsi14)}</span>}
          </p>
          {a.rsi14 !== null ? <RsiBar value={a.rsi14} /> : <p className="text-xs" style={{ color: 'var(--ink-3)' }}>—</p>}
        </div>

        <div className="rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--ink-3)' }}>Rango 52 semanas</p>
          <div className="relative h-2 rounded-full" style={{ background: 'linear-gradient(90deg, rgba(255,111,97,0.35), rgba(255,194,60,0.35), rgba(31,190,141,0.35))' }}>
            <div className="absolute -top-0.5 w-3 h-3 rounded-full border-2"
              style={{ left: `calc(${posPct}% - 6px)`, background: 'var(--surface)', borderColor: 'var(--ink)' }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] font-semibold tabular-nums" style={{ color: 'var(--ink-3)' }}>{fmtUSD(a.low52)}</span>
            <span className="text-[9px] font-semibold tabular-nums" style={{ color: 'var(--ink-3)' }}>{fmtUSD(a.high52)}</span>
          </div>
        </div>
      </div>

      {/* Medias + niveles */}
      <div className="grid grid-cols-3 gap-2">
        {([['SMA 20', a.sma20], ['SMA 50', a.sma50], ['SMA 200', a.sma200]] as const).map(([label, v]) => (
          <div key={label} className="rounded-2xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
            <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>{label}</p>
            <p className="text-xs font-extrabold tabular-nums mt-0.5"
              style={{ color: v === null ? 'var(--ink-3)' : a.price >= v ? 'var(--mint)' : 'var(--coral)' }}>
              {v !== null ? fmtUSD(v) : '—'}
            </p>
          </div>
        ))}
      </div>

      {(a.supports.length > 0 || a.resistances.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Soportes</p>
            {a.supports.length > 0 ? a.supports.map(s => (
              <p key={s} className="text-xs font-bold tabular-nums" style={{ color: 'var(--mint)' }}>{fmtUSD(s)}</p>
            )) : <p className="text-xs" style={{ color: 'var(--ink-3)' }}>—</p>}
          </div>
          <div className="rounded-2xl px-3 py-2.5" style={{ background: 'var(--surface-2)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Resistencias</p>
            {a.resistances.length > 0 ? a.resistances.map(r => (
              <p key={r} className="text-xs font-bold tabular-nums" style={{ color: 'var(--gold)' }}>{fmtUSD(r)}</p>
            )) : <p className="text-xs" style={{ color: 'var(--ink-3)' }}>—</p>}
          </div>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
        <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
        Señales informativas al cierre del {a.asOf}. No son recomendación de compra o venta: los indicadores técnicos
        tienen falsos positivos y un soporte roto se convierte en caída. La decisión es siempre tuya.
      </p>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function WatchlistPanel({ userId, initialItems }: Props) {
  const supabase = createClient()

  const [items,      setItems]      = useState<WatchlistItem[]>(initialItems)
  const [quotes,     setQuotes]     = useState<Record<string, Quote>>({})
  const [input,      setInput]      = useState('')
  const [adding,     setAdding]     = useState(false)
  const [addError,   setAddError]   = useState('')
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [analyses,   setAnalyses]   = useState<Record<string, TechnicalAnalysis | 'loading' | 'error'>>({})

  // ── Quotes de los favoritos ────────────────────────────────────────────────
  const fetchQuotes = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) return
    try {
      const r = await fetch(`/api/stock-price?symbols=${tickers.join(',')}`)
      if (!r.ok) return
      const data = await r.json() as Record<string, Quote>
      setQuotes(prev => ({ ...prev, ...data }))
    } catch { /* silencioso: el panel funciona sin quote */ }
  }, [])

  // ── Análisis técnico ──────────────────────────────────────────────────────
  const fetchAnalysis = useCallback(async (ticker: string) => {
    setAnalyses(prev => ({ ...prev, [ticker]: prev[ticker] && prev[ticker] !== 'error' ? prev[ticker] : 'loading' }))
    try {
      const r = await fetch(`/api/technical?symbol=${ticker}`)
      if (!r.ok) throw new Error()
      const data = await r.json() as { analysis: TechnicalAnalysis }
      setAnalyses(prev => ({ ...prev, [ticker]: data.analysis }))
    } catch {
      setAnalyses(prev => ({ ...prev, [ticker]: 'error' }))
    }
  }, [])

  // Avisos in-app: al entrar se precargan las señales de todos los favoritos
  // (secuencial para cuidar el rate limit; el servidor cachea 12 h)
  useEffect(() => {
    const tickers = initialItems.map(i => i.ticker)
    fetchQuotes(tickers)
    ;(async () => {
      for (const t of tickers) await fetchAnalysis(t)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggleExpand(ticker: string) {
    if (expanded === ticker) { setExpanded(null); return }
    setExpanded(ticker)
    const a = analyses[ticker]
    if (a && a !== 'error') return
    await fetchAnalysis(ticker)
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  async function addTicker() {
    const t = input.trim().toUpperCase()
    if (!TICKER_RE.test(t)) { setAddError('Ticker inválido (ej: AAPL, VOO, QQQ)'); return }
    if (items.some(i => i.ticker === t)) { setAddError('Ya está en tus favoritos'); return }
    setAdding(true); setAddError('')
    const { data, error } = await supabase
      .from('watchlist')
      .insert({ user_id: userId, ticker: t })
      .select('id, ticker')
      .single()
    setAdding(false)
    if (error) { setAddError(error.message); return }
    setItems(prev => [...prev, data as WatchlistItem])
    setInput('')
    fetchQuotes([t])
    fetchAnalysis(t)
  }

  async function removeTicker(item: WatchlistItem) {
    setItems(prev => prev.filter(i => i.id !== item.id))
    if (expanded === item.ticker) setExpanded(null)
    await supabase.from('watchlist').delete().eq('id', item.id).eq('user_id', userId)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mt-6">
      {/* Header + form */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--gold)' }} />
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Favoritos en seguimiento</p>
          {items.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
              {items.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={e => { setInput(e.target.value.toUpperCase()); setAddError('') }}
            onKeyDown={e => e.key === 'Enter' && addTicker()}
            placeholder="AAPL, VOO…"
            maxLength={12}
            className="w-28 sm:w-36 text-sm border px-3 py-2 uppercase"
            style={{
              color: 'var(--ink)', background: 'var(--surface)', borderColor: 'var(--border)',
              borderRadius: 12, outline: 'none',
            }}
          />
          <button
            onClick={addTicker}
            disabled={adding || !input.trim()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold rounded-xl transition-all active:scale-[.97] disabled:opacity-50"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Seguir</span>
          </button>
        </div>
      </div>
      {addError && <p className="text-xs font-medium mb-2" style={{ color: 'var(--coral)' }}>{addError}</p>}

      {/* Empty state */}
      {items.length === 0 ? (
        <div className="card px-6 py-8 text-center">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Sigue acciones o ETFs sin tener posición</p>
          <p className="text-xs mt-1 max-w-md mx-auto leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            Agrega un ticker y toca la fila para ver sus señales técnicas: RSI, medias móviles,
            soportes, resistencias y distancia a máximos del año.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden divide-y" style={{ borderColor: 'var(--border)' }}>
          {items.map(item => {
            const q = quotes[item.ticker]
            const a = analyses[item.ticker]
            const isOpen = expanded === item.ticker
            return (
              <div key={item.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpand(item.ticker)}
                  onKeyDown={e => e.key === 'Enter' && toggleExpand(item.ticker)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer transition-colors hover:bg-black/5"
                >
                  <ServiceLogo
                    domain={q?.domain ?? null}
                    name={item.ticker}
                    size={36}
                    fallbackColor={avatarColor(item.ticker)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{item.ticker}</p>
                      {/* Aviso in-app: nº de señales activas sin abrir la fila */}
                      {typeof a === 'object' && a.signals.length > 0 && (() => {
                        const strongest: SignalTone = a.signals.some(s => s.tone === 'coral') ? 'coral'
                          : a.signals.some(s => s.tone === 'gold') ? 'gold'
                          : a.signals.some(s => s.tone === 'mint') ? 'mint' : 'neutral'
                        const t = TONE_STYLE[strongest]
                        return (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: t.bg, color: t.color }}>
                            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: t.color }} />
                            {a.signals.length} señal{a.signals.length !== 1 ? 'es' : ''}
                          </span>
                        )
                      })()}
                    </div>
                    {q?.name && <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>{q.name}</p>}
                  </div>
                  {q && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtUSD(q.price)}</p>
                      <p className="text-[11px] font-semibold tabular-nums"
                        style={{ color: q.changePercent >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                        {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
                      </p>
                    </div>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); removeTicker(item) }}
                    className="w-8 h-8 flex items-center justify-center rounded-xl flex-shrink-0 transition-colors hover:bg-black/10"
                    style={{ color: 'var(--ink-3)' }}
                    aria-label={`Dejar de seguir ${item.ticker}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {isOpen
                    ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
                    : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />}
                </div>

                {/* Panel técnico */}
                {isOpen && (
                  a === 'loading' || a === undefined ? (
                    <div className="flex items-center gap-2 px-4 pb-4" style={{ color: 'var(--ink-3)' }}>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span className="text-xs">Calculando indicadores…</span>
                    </div>
                  ) : a === 'error' ? (
                    <p className="text-xs px-4 pb-4" style={{ color: 'var(--coral)' }}>
                      No se pudieron obtener velas diarias para {item.ticker}. Reintenta o revisa el ticker.
                    </p>
                  ) : (
                    <TechnicalDetail a={a} />
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
