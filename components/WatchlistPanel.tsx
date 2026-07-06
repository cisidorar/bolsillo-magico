'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, ChevronRight, Star, Info, RefreshCw, X, Search, Check } from 'lucide-react'
import ServiceLogo from '@/components/ServiceLogo'
import type { TechnicalAnalysis, SignalTone } from '@/lib/technical'
import type { SearchResult } from '@/app/api/stock-search/route'

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
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [analyses,   setAnalyses]   = useState<Record<string, TechnicalAnalysis | 'loading' | 'error'>>({})
  const [errDetails, setErrDetails] = useState<Record<string, string>>({})

  // Buscador (popup)
  const [showSearch, setShowSearch] = useState(false)
  const [query,      setQuery]      = useState('')
  const [results,    setResults]    = useState<SearchResult[]>([])
  const [searching,  setSearching]  = useState(false)
  const [addingSym,  setAddingSym]  = useState<string | null>(null)
  const [addError,   setAddError]   = useState('')
  const searchSeq = useRef(0)

  // ── Quotes de los favoritos ────────────────────────────────────────────────
  const fetchQuotes = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) return
    try {
      const r = await fetch(`/api/stock-price?symbols=${tickers.join(',')}`)
      if (!r.ok) return
      // La route devuelve { quotes, marketOpen, marketLabel }
      const data = await r.json() as { quotes?: Record<string, Quote> }
      if (data.quotes) setQuotes(prev => ({ ...prev, ...data.quotes }))
    } catch { /* silencioso: el panel funciona sin quote */ }
  }, [])

  // ── Análisis técnico ──────────────────────────────────────────────────────
  const fetchAnalysis = useCallback(async (ticker: string, force = false) => {
    setAnalyses(prev => ({ ...prev, [ticker]: prev[ticker] && prev[ticker] !== 'error' ? prev[ticker] : 'loading' }))
    try {
      const r = await fetch(`/api/technical?symbol=${ticker}${force ? '&force=1' : ''}`)
      if (!r.ok) {
        const body = await r.json().catch(() => null) as { detail?: string } | null
        if (body?.detail) setErrDetails(prev => ({ ...prev, [ticker]: body.detail! }))
        throw new Error()
      }
      const data = await r.json() as { analysis: TechnicalAnalysis }
      setAnalyses(prev => ({ ...prev, [ticker]: data.analysis }))
      setErrDetails(prev => { const { [ticker]: _omit, ...rest } = prev; return rest })
    } catch {
      setAnalyses(prev => ({ ...prev, [ticker]: 'error' }))
    }
  }, [])

  // Avisos in-app: al entrar se precargan las señales de todos los favoritos.
  // Secuencial + pausa: Alpha Vantage free también limita por minuto, y con
  // ~15 favoritos en frío una ráfaga podría rebotar. El cache de 24 h hace que
  // en visitas siguientes esto sea instantáneo y sin requests.
  useEffect(() => {
    const tickers = initialItems.map(i => i.ticker)
    fetchQuotes(tickers)
    ;(async () => {
      for (const t of tickers) {
        await fetchAnalysis(t)
        await new Promise(res => setTimeout(res, 400))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openDetail(ticker: string) {
    setExpanded(ticker)
    const a = analyses[ticker]
    if (a && a !== 'error') return
    await fetchAnalysis(ticker)
  }

  // ── Búsqueda con debounce ─────────────────────────────────────────────────
  useEffect(() => {
    if (!showSearch) return
    const q = query.trim()
    if (q.length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    const seq = ++searchSeq.current
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/stock-search?q=${encodeURIComponent(q)}`)
        const data = r.ok ? await r.json() as { results: SearchResult[] } : { results: [] }
        if (searchSeq.current === seq) setResults(data.results)
      } catch {
        if (searchSeq.current === seq) setResults([])
      } finally {
        if (searchSeq.current === seq) setSearching(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [query, showSearch])

  function openSearch() {
    setShowSearch(true); setQuery(''); setResults([]); setAddError('')
  }
  function closeSearch() {
    setShowSearch(false); setQuery(''); setResults([]); setAddError('')
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  async function addSymbol(symbol: string) {
    const t = symbol.trim().toUpperCase()
    if (!TICKER_RE.test(t)) { setAddError('Ticker inválido'); return }
    if (items.some(i => i.ticker === t)) return
    setAddingSym(t); setAddError('')
    const { data, error } = await supabase
      .from('watchlist')
      .insert({ user_id: userId, ticker: t })
      .select('id, ticker')
      .single()
    setAddingSym(null)
    if (error) { setAddError(error.message); return }
    setItems(prev => [...prev, data as WatchlistItem])
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
        <button
          onClick={openSearch}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all active:scale-[.97] shrink-0"
          style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Seguir
        </button>
      </div>

      {/* ── Popup de búsqueda por nombre ─────────────────────────────────── */}
      {showSearch && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={e => { if (e.target === e.currentTarget) closeSearch() }}
        >
          <div
            className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-hidden flex flex-col"
            style={{ background: 'var(--surface)', maxHeight: '80dvh' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Buscar acción o ETF</h2>
              <button
                onClick={closeSearch}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Input */}
            <div className="px-5 pt-4 pb-2">
              <div className="flex items-center gap-2.5 border px-4 py-3"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', borderRadius: 12 }}>
                <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
                <input
                  type="text"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setAddError('') }}
                  placeholder="ej: Apple, Netflix, Vanguard S&P 500…"
                  maxLength={40}
                  autoFocus
                  className="flex-1 text-sm bg-transparent outline-none border-0 min-w-0"
                  style={{ color: 'var(--ink)' }}
                />
                {searching && <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" style={{ color: 'var(--ink-3)' }} />}
              </div>
              {addError && <p className="text-xs font-medium mt-2" style={{ color: 'var(--coral)' }}>{addError}</p>}
            </div>

            {/* Resultados */}
            <div className="px-5 pb-5 overflow-y-auto flex-1">
              {query.trim().length < 2 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--ink-3)' }}>
                  Escribe el nombre de la empresa o del fondo — también funciona con el ticker.
                </p>
              ) : !searching && results.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Sin resultados para “{query.trim()}”</p>
                  {TICKER_RE.test(query.trim().toUpperCase()) && (
                    <button
                      onClick={() => addSymbol(query.trim().toUpperCase())}
                      disabled={addingSym !== null}
                      className="mt-3 px-4 py-2 rounded-xl text-xs font-bold transition-opacity hover:opacity-85 disabled:opacity-50"
                      style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
                    >
                      Seguir “{query.trim().toUpperCase()}” de todas formas
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  {results.map(r => {
                    const followed = items.some(i => i.ticker === r.symbol)
                    const busy = addingSym === r.symbol
                    return (
                      <div key={r.symbol} className="flex items-center gap-3 rounded-2xl px-3 py-3" style={{ background: 'var(--surface-2)' }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-extrabold text-white"
                          style={{ background: avatarColor(r.symbol) }}>
                          {r.symbol.slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold leading-tight truncate" style={{ color: 'var(--ink)' }}>{r.name}</p>
                          <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                            {r.symbol} · {r.type === 'etf' ? 'ETF' : 'Acción'}
                          </p>
                        </div>
                        {followed ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl flex-shrink-0"
                            style={{ background: 'rgba(31,190,141,0.12)', color: 'var(--mint)' }}>
                            <Check className="w-3.5 h-3.5" /> Siguiendo
                          </span>
                        ) : (
                          <button
                            onClick={() => addSymbol(r.symbol)}
                            disabled={busy}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold flex-shrink-0 transition-all active:scale-95 disabled:opacity-50"
                            style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
                          >
                            {busy ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" strokeWidth={3} />}
                            Seguir
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 ? (
        <div className="card px-6 py-8 text-center">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Sigue acciones o ETFs sin tener posición</p>
          <p className="text-xs mt-1 max-w-md mx-auto leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            Busca por nombre (Apple, Netflix, Vanguard…) y toca la fila para ver sus señales técnicas:
            RSI, medias móviles, soportes, resistencias y distancia a máximos del año.
          </p>
          <button
            onClick={openSearch}
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl text-xs font-bold transition-opacity hover:opacity-85"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 8px 18px var(--shadow)' }}
          >
            <Search className="w-3.5 h-3.5" />
            Buscar y seguir
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden divide-y" style={{ borderColor: 'var(--border)' }}>
          {items.map(item => {
            const q = quotes[item.ticker]
            const a = analyses[item.ticker]
            return (
              <div key={item.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(item.ticker)}
                  onKeyDown={e => e.key === 'Enter' && openDetail(item.ticker)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer transition-colors hover:bg-black/5 group"
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
                  {q ? (
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtUSD(q.price)}</p>
                      <p className="text-[11px] font-semibold tabular-nums"
                        style={{ color: q.changePercent >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                        {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
                      </p>
                    </div>
                  ) : (
                    /* Skeleton mientras llega la cotización */
                    <div className="text-right flex-shrink-0 animate-pulse">
                      <div className="h-3.5 w-16 rounded-md ml-auto" style={{ background: 'var(--surface-2)' }} />
                      <div className="h-2.5 w-10 rounded-md mt-1.5 ml-auto" style={{ background: 'var(--surface-2)' }} />
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
                  <ChevronRight className="w-4 h-4 flex-shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--ink-3)' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Popup de detalle técnico ─────────────────────────────────────── */}
      {expanded !== null && (() => {
        const ticker = expanded
        const q = quotes[ticker]
        const a = analyses[ticker]
        return (
          <div
            className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.65)' }}
            onClick={e => { if (e.target === e.currentTarget) setExpanded(null) }}
          >
            <div
              className="w-full lg:max-w-lg rounded-t-3xl lg:rounded-3xl overflow-hidden flex flex-col"
              style={{ background: 'var(--surface)', maxHeight: '88dvh' }}
            >
              <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

              {/* Header: ticker + quote */}
              <div className="flex items-center gap-3 px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <ServiceLogo
                  domain={q?.domain ?? null}
                  name={ticker}
                  size={40}
                  fallbackColor={avatarColor(ticker)}
                />
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold leading-tight" style={{ color: 'var(--ink)' }}>{ticker}</h2>
                  {q?.name && <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>{q.name}</p>}
                </div>
                {q && (
                  <div className="text-right flex-shrink-0 mr-1">
                    <p className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtUSD(q.price)}</p>
                    <p className="text-[11px] font-semibold tabular-nums"
                      style={{ color: q.changePercent >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                      {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}% hoy
                    </p>
                  </div>
                )}
                <button
                  onClick={() => setExpanded(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0 transition-colors"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="overflow-y-auto pt-4">
                {a === 'loading' || a === undefined ? (
                  <div className="mx-4 mb-4 rounded-2xl px-4 py-3 flex items-center gap-2.5"
                    style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                    <span className="text-xs font-semibold">Calculando indicadores de {ticker}…</span>
                  </div>
                ) : a === 'error' ? (
                  <div className="mx-4 mb-4 rounded-2xl px-4 py-3 flex items-center gap-3"
                    style={{ background: 'rgba(255,111,97,0.08)', border: '1px solid rgba(255,111,97,0.2)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold" style={{ color: 'var(--coral)' }}>
                        No pudimos obtener los datos de {ticker}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                        {errDetails[ticker]
                          ? <>Respuesta de los proveedores: {errDetails[ticker]}</>
                          : 'Puede ser un problema momentáneo del proveedor o un ticker no soportado.'}
                      </p>
                    </div>
                    <button
                      onClick={() => fetchAnalysis(ticker, true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold flex-shrink-0 transition-all active:scale-95"
                      style={{ background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}
                    >
                      <RefreshCw className="w-3 h-3" />
                      Reintentar
                    </button>
                  </div>
                ) : (
                  <TechnicalDetail a={a} />
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
