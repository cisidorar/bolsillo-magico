'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, ChevronRight, ChevronDown, ChevronUp, Star, Info, RefreshCw, X, Search, Check,
  AlertTriangle, Target, AlertCircle, ArrowUp, ArrowDown, Trash2,
} from 'lucide-react'
import ServiceLogo from '@/components/ServiceLogo'
import InversionesToggle from '@/components/InversionesToggle'
import type { TechnicalAnalysis } from '@/lib/technical'
import type { SearchResult } from '@/app/api/stock-search/route'
import { getAnalysis, AnalysisError } from '@/lib/analysis-cache'
import { computeConviction, isActionableBuyNow, type ConvictionResult, type ConvictionTier } from '@/lib/conviction'
import { positionSizeUsd } from '@/lib/technical'
import { ConvictionChip, RiskRail } from '@/components/RiskRail'
import TechnicalDetail, { type OwnedPosition } from '@/components/TechnicalDetail'
import TransactionModal, { type TransactionMode } from '@/components/TransactionModal'
import type { StockPosition, StockSale, StockPurchase } from '@/app/(dashboard)/inversiones/page'
import type { SpyBenchmarkResult } from '@/lib/benchmark'
import { fmtLastAutoUpdate } from '@/lib/format-freshness'
import { useToast } from '@/components/ToastProvider'

// ── U4 (roadmap UX): "Radar" — un solo mundo para posiciones y favoritos.
// Reemplaza StockPositionManager.tsx + WatchlistPanel.tsx: antes eran dos
// listas, dos patrones de detalle (modal transaccional vs. detalle técnico) y
// doble estado de análisis (posAnalyses/analyses) para el mismo ticker. Acá
// hay un solo fetch de análisis por ticker, un solo detalle (TechnicalDetail,
// el de U3) para cualquiera, y el modal (TransactionModal) queda SOLO para
// comprar/vender/editar — se invoca desde el detalle, no al revés.

export interface WatchlistItem {
  id:               string
  ticker:           string
  target_price:     number | null
  target_direction: 'above' | 'below' | null
}

function targetReached(item: WatchlistItem | undefined, price: number | undefined, owned: boolean): boolean {
  if (!item || item.target_price === null || price === undefined) return false
  const dir = item.target_direction ?? (owned ? 'above' : 'below')
  return dir === 'above' ? price >= item.target_price : price <= item.target_price
}
function nearTarget(item: WatchlistItem | undefined, price: number | undefined, owned: boolean): boolean {
  if (!item || item.target_price === null || price === undefined) return false
  if (targetReached(item, price, owned)) return false
  return Math.abs(price - item.target_price) / item.target_price <= 0.03
}

/**
 * "buy" exige DOS cosas: tier de convicción de compra (fix commit 18cee34,
 * jul 2026 — no mirar solo a.rating.label) Y un gatillo de entrada activo
 * HOY (`a.buy.some(t => t.now)`, vía `isActionableBuyNow`). Sin el segundo
 * filtro, un ticker con convicción alta pero sin base técnica para entrar
 * (ej. esperando un retroceso concreto) se marcaba "buy" en la fila aunque
 * su propio detalle dijera "no compres hoy" — misma inconsistencia que en
 * el panel "¿Qué comprar hoy?", detectada por Cas, jul 2026.
 */
function actionFlag(a: TechnicalAnalysis | 'loading' | 'error' | undefined, owned: boolean, conviction?: ConvictionResult | null): 'buy' | 'sell' | 'caution' | null {
  if (typeof a !== 'object') return null
  const isBuy  = conviction !== null && conviction !== undefined && isActionableBuyNow(a, conviction)
  const isSell = a.rating.label === 'venta'  || a.rating.label === 'venta_fuerte'
  if (isBuy) return 'buy'
  if (isSell && owned) return 'sell'
  if (a.rating.caution && owned) return 'caution'
  return null
}

const FLAG_UI: Record<'buy' | 'sell' | 'caution', { color: string; bg: string; softBg: string }> = {
  buy:     { color: 'var(--mint)',  bg: 'rgba(31,190,141,0.16)', softBg: 'rgba(31,190,141,0.06)' },
  sell:    { color: 'var(--coral)', bg: 'rgba(255,111,97,0.16)', softBg: 'rgba(255,111,97,0.06)' },
  caution: { color: 'var(--gold)',  bg: 'rgba(255,194,60,0.18)', softBg: 'rgba(255,194,60,0.07)' },
}

function fmtUSD(n: number): string {
  return '$' + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtUSDSigned(n: number): string {
  return (n >= 0 ? '+$' : '-$') + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(n: number, showSign = true): string {
  const s = Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return showSign ? (n >= 0 ? `+${s}%` : `-${s}%`) : `${s}%`
}
function avatarColor(t: string): string {
  const palette = ['#2B7CF6','#1FBE8D','#FF6F61','#FFC23C','#A78BFA','#F472B6','#34D399','#FB923C']
  let h = 0
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return palette[Math.abs(h) % palette.length]
}
const MONTHS_ES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
function fmtAsOfDay(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${d} ${MONTHS_ES[m - 1]}`
}

interface Quote { price: number; changePercent: number; name: string; domain?: string }

const TICKER_RE = /^[A-Z0-9.\-]{1,12}$/

/** I1 (roadmap interacción): el ranking nombraba tickers en texto plano sin
 *  forma de abrirlos — había que buscarlos a mano en la lista de abajo. */
function TickerLink({ t, onOpen, bold = false, muted = false }: { t: string; onOpen: (ticker: string) => void; bold?: boolean; muted?: boolean }) {
  return (
    <button
      onClick={() => onOpen(t)}
      className={`underline underline-offset-2 decoration-dotted ${bold ? 'font-extrabold' : 'font-bold'}`}
      style={{ color: muted ? 'var(--ink-3)' : 'inherit' }}
    >
      {t}
    </button>
  )
}

type Tab = 'tengo' | 'sigo' | 'todo'

interface Props {
  userId:            string
  initialPositions:  StockPosition[]
  walletUsdBase?:    number
  initialSales?:     StockSale[]
  initialPurchases?: StockPurchase[]
  spyBenchmark?:     SpyBenchmarkResult | null
  lastAutoUpdate?:   string | null
  initialWatchlist:  WatchlistItem[]
}

export default function Radar({
  userId, initialPositions, walletUsdBase = 0, initialSales = [], initialPurchases = [],
  spyBenchmark = null, lastAutoUpdate = null, initialWatchlist,
}: Props) {
  const supabase = createClient()
  const { showToast } = useToast()

  const [positions, setPositions] = useState<StockPosition[]>(initialPositions)
  const [sales,     setSales]     = useState<StockSale[]>(initialSales)
  const [purchases, setPurchases] = useState<StockPurchase[]>(initialPurchases)
  const [items,     setItems]     = useState<WatchlistItem[]>(initialWatchlist)

  const [quotes,     setQuotes]     = useState<Record<string, Quote>>({})
  const [analyses,   setAnalyses]   = useState<Record<string, TechnicalAnalysis | 'loading' | 'error'>>({})
  const [errDetails, setErrDetails] = useState<Record<string, string>>({})
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [tab,        setTab]        = useState<Tab>('todo')

  const [loadingQ,    setLoadingQ]    = useState(false)
  const [quotesError, setQuotesError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [marketOpen,  setMarketOpen]  = useState<boolean | null>(null)
  const [marketLabel, setMarketLabel] = useState('')

  // Modal transaccional — SOLO comprar/vender/editar/eliminar (U4 roadmap UX).
  // prefillUsd (I1 roadmap interacción): al abrir desde una sugerencia con
  // monto, el modal llega con ese número ya cargado — sin esto había que
  // re-tipear a mano lo que la app acababa de calcular.
  const [txn, setTxn] = useState<{ mode: TransactionMode; ticker: string | null; prefillUsd?: number } | null>(null)

  // ── Posición agregada por ticker (puede haber legacy con varias filas) ──
  const ownedMap = useMemo(() => {
    const map: Record<string, OwnedPosition> = {}
    for (const s of positions) {
      const prev = map[s.ticker]
      if (prev) {
        const totalShares = prev.shares + s.shares
        map[s.ticker] = {
          shares: totalShares,
          avgCost: (prev.shares * prev.avgCost + s.shares * s.avg_cost_usd) / totalShares,
        }
      } else {
        map[s.ticker] = { shares: s.shares, avgCost: s.avg_cost_usd }
      }
    }
    return map
  }, [positions])
  const owned = new Set(Object.keys(ownedMap))

  const positionTickers = useMemo(() => Object.keys(ownedMap), [ownedMap])
  const watchTickers    = useMemo(() => items.map(i => i.ticker), [items])
  const allTickers      = useMemo(() => [...new Set([...positionTickers, ...watchTickers])], [positionTickers, watchTickers])

  // SPY como referencia de fuerza relativa — un solo fetch para todo Radar
  const [spyReturn6m, setSpyReturn6m] = useState<number | null>(null)
  useEffect(() => {
    getAnalysis('SPY').then(a => setSpyReturn6m(a.returns.m6)).catch(() => { /* opcional */ })
  }, [])

  // Billetera disponible: mismo cálculo en toda la app (Radar/TransactionModal)
  const fundedCostUsd = positions.reduce((s, p) => s + Number(p.wallet_cost_usd ?? 0), 0)
  const walletAvailable = walletUsdBase > 0 ? walletUsdBase - fundedCostUsd : null

  const totalCostUsd  = positions.reduce((s, p) => s + p.shares * p.avg_cost_usd, 0)
  const totalValueUsd = positions.reduce((s, p) => s + p.shares * (quotes[p.ticker]?.price ?? p.avg_cost_usd), 0)
  const hasQ          = positions.length > 0 && Object.keys(quotes).some(k => positions.some(p => p.ticker === k))
  const totalGainUsd  = totalValueUsd - totalCostUsd
  const realizedPnlUsd = sales.reduce((s, x) => s + Number(x.realized_pnl_usd), 0)
  const totalReturnUsd = totalGainUsd + realizedPnlUsd
  const totalReturnPct = totalCostUsd > 0 ? (totalReturnUsd / totalCostUsd) * 100 : 0

  // Retorno del día, agregado del portafolio — antes solo se veía el retorno
  // TOTAL en el hero; el del día había que armarlo a mano sumando el % de
  // cada fila (y ni siquiera se mostraba para posiciones, que solo traían el
  // total). Cas pidió poder ver ambos de un vistazo (jul 2026). q.changePercent
  // es % contra el cierre anterior; se deriva el cierre anterior de ahí para
  // sumar el cambio en USD real de cada posición, no solo promediar los %.
  const dailyChangeUsd = positions.reduce((s, p) => {
    const q = quotes[p.ticker]
    if (!q) return s
    const prevClose = q.price / (1 + q.changePercent / 100)
    return s + p.shares * (q.price - prevClose)
  }, 0)
  const prevTotalValueUsd = totalValueUsd - dailyChangeUsd
  const dailyChangePct = prevTotalValueUsd > 0 ? (dailyChangeUsd / prevTotalValueUsd) * 100 : 0

  const posUp = positions.filter(p => { const q = quotes[p.ticker]; return q && p.shares * q.price > p.shares * p.avg_cost_usd }).length
  const posDown = positions.filter(p => { const q = quotes[p.ticker]; return q && p.shares * q.price < p.shares * p.avg_cost_usd }).length
  const bestPos = positions.reduce<{ ticker: string; pct: number } | null>((best, p) => {
    const q = quotes[p.ticker]
    if (!q) return best
    const pct = ((q.price - p.avg_cost_usd) / p.avg_cost_usd) * 100
    if (!best || pct > best.pct) return { ticker: p.ticker, pct }
    return best
  }, null)

  const portfolioValueUsd = totalValueUsd + Math.max(0, walletAvailable ?? 0)

  // ── Quotes ────────────────────────────────────────────────────────────────
  const fetchQuotes = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) return
    setLoadingQ(true); setQuotesError('')
    for (let i = 0; i < tickers.length; i += 25) {
      const chunk = tickers.slice(i, i + 25)
      try {
        const r = await fetch(`/api/stock-price?symbols=${chunk.join(',')}`, { cache: 'no-store' })
        if (!r.ok) continue
        const data = await r.json() as { quotes?: Record<string, Quote>; marketOpen?: boolean; marketLabel?: string }
        if (data.quotes) setQuotes(prev => ({ ...prev, ...data.quotes }))
        if (typeof data.marketOpen === 'boolean') { setMarketOpen(data.marketOpen); setMarketLabel(data.marketLabel ?? '') }
        setLastUpdated(new Date())
      } catch { setQuotesError('No se pudieron obtener los precios.') }
    }
    setLoadingQ(false)
  }, [])

  // ── Análisis técnico — vía cache compartida: un ticker que es posición Y
  // favorito ya no duplica el fetch (antes StockPositionManager y
  // WatchlistPanel lo pedían cada uno por su lado)
  const fetchAnalysis = useCallback(async (ticker: string, force = false) => {
    setAnalyses(prev => ({ ...prev, [ticker]: prev[ticker] && prev[ticker] !== 'error' ? prev[ticker] : 'loading' }))
    try {
      const analysis = await getAnalysis(ticker, force)
      setAnalyses(prev => ({ ...prev, [ticker]: analysis }))
      setErrDetails(prev => { const { [ticker]: _omit, ...rest } = prev; return rest })
    } catch (err) {
      if (err instanceof AnalysisError && err.detail) setErrDetails(prev => ({ ...prev, [ticker]: err.detail! }))
      setAnalyses(prev => ({ ...prev, [ticker]: 'error' }))
    }
  }, [])

  useEffect(() => {
    fetchQuotes(allTickers)
    ;(async () => {
      for (const t of allTickers) {
        if (typeof analyses[t] === 'object') continue
        await fetchAnalysis(t)
        await new Promise(res => setTimeout(res, 400))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // I5 (roadmap interacción): antes las quotes se pedían UNA vez al montar —
  // si dejabas la pestaña abierta mirando el mercado, el pill seguía diciendo
  // "en vivo" con precios de hace rato. Refresco silencioso cada 75s, solo
  // con mercado abierto y la pestaña realmente visible (no gasta requests en
  // segundo plano ni fuera de horario).
  const allTickersKey = allTickers.join(',')
  useEffect(() => {
    if (!marketOpen || allTickers.length === 0) return
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetchQuotes(allTickers)
    }, 75_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketOpen, allTickersKey])

  async function openDetail(ticker: string) {
    setExpanded(ticker)
    const a = analyses[ticker]
    if (a && a !== 'error') return
    await fetchAnalysis(ticker)
  }

  // I1 (roadmap interacción): TodayQueue es un Server Component sin estado —
  // sus filas enlazan a `?ticker=X` en vez de manipular el detalle directo.
  // Al montar, si llega ese query param, se abre el detalle acá y se limpia
  // la URL (replace, sin agregar entrada al historial) para que un refresh
  // no lo vuelva a abrir solo.
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  useEffect(() => {
    const t = searchParams.get('ticker')
    if (t) {
      openDetail(t.toUpperCase())
      router.replace(pathname, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const convictionFor = useCallback((ticker: string): ConvictionResult | null => {
    const a = analyses[ticker]
    return typeof a === 'object' ? computeConviction(a, null, spyReturn6m) : null
  }, [analyses, spyReturn6m])

  /** I1 (roadmap interacción): mismo cálculo de "monto sugerido" que ya vive
   *  repartido entre el panel de ranking y el hint del modal — un solo lugar
   *  para prefillear el modal al abrirlo desde cualquier sugerencia. Si el
   *  ticker ya es posición, el monto es el MARGEN restante hasta el tope del
   *  1% (para "Comprar más"), no el máximo bruto. */
  function suggestedUsdFor(ticker: string): number | null {
    const a = analyses[ticker]
    if (typeof a !== 'object') return null
    const live = quotes[ticker]?.price ?? a.price
    const sizing = portfolioValueUsd > 0 ? positionSizeUsd(portfolioValueUsd, live, a.alarm) : null
    if (!sizing) return null
    const cashCap = walletAvailable !== null ? Math.max(0, walletAvailable) : null
    let usd = cashCap !== null ? Math.min(sizing.maxUsd, cashCap) : sizing.maxUsd
    const pos = ownedMap[ticker]
    if (pos) {
      const currentValue = pos.shares * live
      usd = Math.min(usd, Math.max(0, sizing.maxUsd - currentValue))
    }
    return usd > 1 ? Math.round(usd * 100) / 100 : null
  }

  // ── Ranking "¿Qué comprar hoy?" — sobre TODO el universo (posiciones + favoritos) ──
  const ranking = allTickers
    .map(t => {
      const a = analyses[t]
      const conviction = convictionFor(t)
      if (typeof a !== 'object' || conviction === null) return null
      return { ticker: t, a, conviction }
    })
    .filter((r): r is { ticker: string; a: TechnicalAnalysis; conviction: ConvictionResult } => r !== null)
    .sort((x, y) => y.conviction.score - x.conviction.score)
  const allLoaded = allTickers.length > 0 && ranking.length === allTickers.length
  const top      = ranking[0] ?? null
  const runnerUp = ranking[1] ?? null
  // Convicción alta ≠ entrada lista: el score puede ganar por riesgo/recompensa
  // y fuerza vs. SPY mientras el gráfico todavía no da gatillo (isActionableBuyNow
  // exige además a.buy con un tramo "now"). Sin este filtro este panel podía
  // decir "la mejor compra hoy es X" mientras el detalle de X decía "no compres
  // hoy" — mismo dato, dos lecturas (detectado por Cas, jul 2026).
  const topIsBuyTier   = top !== null && (top.conviction.tier === 'compra' || top.conviction.tier === 'compra_fuerte')
  const topActionable  = top !== null && isActionableBuyNow(top.a, top.conviction)
  const topSizing = topActionable && top !== null && portfolioValueUsd > 0
    ? positionSizeUsd(portfolioValueUsd, quotes[top.ticker]?.price ?? top.a.price, top.a.alarm)
    : null
  const topCashCap = walletAvailable !== null ? Math.max(0, walletAvailable) : null
  const topSuggestedUsd = topSizing !== null
    ? (topCashCap !== null ? Math.min(topSizing.maxUsd, topCashCap) : topSizing.maxUsd)
    : null

  // ── Búsqueda con debounce ("Seguir") ─────────────────────────────────────
  const [showSearch, setShowSearch] = useState(false)
  const [query,      setQuery]      = useState('')
  const [results,    setResults]    = useState<SearchResult[]>([])
  const [searching,  setSearching]  = useState(false)
  const [addingSym,  setAddingSym]  = useState<string | null>(null)
  const [addError,   setAddError]   = useState('')
  const searchSeq = useRef(0)

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
      } catch { if (searchSeq.current === seq) setResults([]) }
      finally { if (searchSeq.current === seq) setSearching(false) }
    }, 350)
    return () => clearTimeout(t)
  }, [query, showSearch])

  function openSearch() { setShowSearch(true); setQuery(''); setResults([]); setAddError('') }
  function closeSearch() { setShowSearch(false); setQuery(''); setResults([]); setAddError('') }

  async function addSymbol(symbol: string) {
    const t = symbol.trim().toUpperCase()
    if (!TICKER_RE.test(t)) { setAddError('Ticker inválido'); return }
    if (items.some(i => i.ticker === t)) return
    setAddingSym(t); setAddError('')
    const { data, error } = await supabase
      .from('watchlist')
      .insert({ user_id: userId, ticker: t })
      .select('id, ticker, target_price, target_direction')
      .single()
    setAddingSym(null)
    if (error) { setAddError(error.message); return }
    setItems(prev => [...prev, data as WatchlistItem])
    fetchQuotes([t])
    fetchAnalysis(t)
    // I6 (roadmap interacción): antes de esto, seguir un ticker no mostraba
    // nada visible — la fila nueva aparecía al fondo de la lista sin señal.
    // Se agregó porque el usuario quiere VERLO: cerrar el buscador y abrir
    // su detalle directo.
    closeSearch()
    openDetail(t)
  }

  /**
   * I2 (roadmap interacción): "Dejar de seguir" borraba al instante sin red
   * de seguridad — un mis-tap en mobile perdía el ticker y su precio
   * objetivo. Ahora se quita de la vista al toque (optimista) pero el
   * DELETE real en Supabase se difiere 5s (mismo tiempo que dura el toast
   * con acción); si el usuario toca "Deshacer" a tiempo, se cancela el
   * borrado y la fila vuelve tal cual estaba — nunca llegó a irse del server.
   */
  async function removeTicker(item: WatchlistItem) {
    setItems(prev => prev.filter(i => i.id !== item.id))
    if (expanded === item.ticker) setExpanded(null)

    let undone = false
    showToast(`Dejaste de seguir ${item.ticker}`, {
      action: {
        label: 'Deshacer',
        onClick: () => {
          undone = true
          setItems(prev => prev.some(i => i.id === item.id) ? prev : [...prev, item])
        },
      },
    })

    await new Promise(res => setTimeout(res, 5000))
    if (!undone) await supabase.from('watchlist').delete().eq('id', item.id).eq('user_id', userId)
  }

  // I4 (roadmap interacción): leyenda de una sola vez sobre la lista — mismo
  // patrón de persistencia que otras preferencias de UI en la app (localStorage).
  const [showLegend, setShowLegend] = useState(true)
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('radarLegendDismissed') === '1') setShowLegend(false)
  }, [])
  function dismissLegend() {
    setShowLegend(false)
    try { localStorage.setItem('radarLegendDismissed', '1') } catch { /* modo privado */ }
  }

  // ── Precio objetivo ───────────────────────────────────────────────────────
  const [targetInput,       setTargetInput]       = useState<string | null>(null)
  const [targetDirOverride, setTargetDirOverride] = useState<'above' | 'below' | null>(null)
  const [targetBusy,        setTargetBusy]        = useState(false)
  useEffect(() => { setTargetInput(null); setTargetDirOverride(null) }, [expanded])

  async function saveTarget(item: WatchlistItem, value: number | null, direction: 'above' | 'below' | null) {
    setTargetBusy(true)
    const { error } = await supabase
      .from('watchlist')
      .update({ target_price: value, target_direction: value === null ? null : direction, target_notified: false })
      .eq('id', item.id)
      .eq('user_id', userId)
    setTargetBusy(false)
    if (error) return
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, target_price: value, target_direction: value === null ? null : direction }
      : i))
    setTargetInput(null)
    setTargetDirOverride(null)
    // I2 (roadmap interacción): confirmar el objetivo guardado con el dato
    // concreto — antes el popup solo se cerraba sin decir qué quedó activo.
    if (value === null) {
      showToast(`Ya no seguimos ningún precio objetivo para ${item.ticker}`)
    } else {
      const verb = direction === 'above' ? 'suba' : 'baje'
      showToast(`Objetivo guardado: te avisamos si ${item.ticker} ${verb} a ${fmtUSD(value)}`)
    }
  }

  // ── Fila: orden por atractivo real de compra (mismo criterio que el
  // ranking de arriba — commit 18cee34, jul 2026: convicción, no rating crudo) ──
  function buyRank(ticker: string): number {
    const item = items.find(i => i.ticker === ticker)
    const a = analyses[ticker]
    const price = quotes[ticker]?.price
    const isOwned = owned.has(ticker)
    const c = convictionFor(ticker)
    let r = 0
    if (!isOwned && targetReached(item, price, isOwned)) r += 100
    if (c) r += c.score
    if (typeof a === 'object') {
      if (a.rating.label === 'venta')        r -= 40
      else if (a.rating.label === 'venta_fuerte') r -= 60
      if (a.rating.caution) r -= 20
      if (a.buy.some(t => t.now)) r += 15
    }
    if (nearTarget(item, price, isOwned)) r += 40
    return r
  }

  const tabTickers = tab === 'tengo' ? positionTickers
    : tab === 'sigo' ? watchTickers.filter(t => !owned.has(t))
    : allTickers
  // I3 (roadmap interacción): mientras la precarga sigue en curso, NO
  // reordenar — las filas saltaban bajo el dedo a medida que llegaba cada
  // análisis. Se ordena por convicción recién cuando todo terminó de cargar;
  // antes de eso se respeta el orden natural (posiciones primero, luego
  // favoritos en el orden en que se siguieron).
  const rows = allLoaded ? [...tabTickers].sort((x, y) => buyRank(y) - buyRank(x)) : tabTickers
  const loadedCount = allTickers.filter(t => typeof analyses[t] === 'object').length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0 text-[11px]">
          {lastUpdated && !quotesError && marketOpen !== null && (
            <>
              <span className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: marketOpen ? 'var(--mint)' : 'var(--coral)', animation: marketOpen ? 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' : 'none' }} />
              {marketOpen ? (
                <span style={{ color: 'var(--mint)' }} className="font-semibold">Precios en vivo · {marketLabel}</span>
              ) : (
                <span style={{ color: 'var(--ink-3)' }} className="font-medium">{marketLabel}</span>
              )}
              {/* I5 (roadmap interacción): hora de la última quote — antes el
                  pill decía "en vivo" sin importar cuánto rato llevaba abierta
                  la pestaña; ahora se ve cuándo se refrescó de verdad. */}
              <span className="tabular-nums" style={{ color: 'var(--ink-3)' }}>
                · {lastUpdated.toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' })}
              </span>
              <button
                onClick={() => fetchQuotes(allTickers)}
                disabled={loadingQ}
                title="Actualizar precios ahora"
                className="flex-shrink-0 disabled:opacity-50"
                style={{ color: 'var(--ink-3)' }}
              >
                <RefreshCw className={`w-3 h-3 ${loadingQ ? 'animate-spin' : ''}`} />
              </button>
            </>
          )}
          {quotesError && (
            <div className="flex items-center gap-1.5" style={{ color: 'var(--coral)' }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <button onClick={() => fetchQuotes(allTickers)} disabled={loadingQ} className="underline underline-offset-2 disabled:opacity-50">
                Reintentar
              </button>
            </div>
          )}
          {lastAutoUpdate && (() => {
            const au = fmtLastAutoUpdate(lastAutoUpdate)
            return (
              <span className="flex items-center gap-1 font-medium truncate" style={{ color: au.stale ? 'var(--coral)' : 'var(--ink-3)' }}>
                · análisis {au.label}{au.stale ? ' — revisa el cron' : ''}
              </span>
            )
          })()}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <InversionesToggle active="acciones" />
          <button
            onClick={openSearch}
            className="flex items-center gap-1.5 px-3 py-2 text-xs lg:text-sm font-bold rounded-xl border transition-all active:scale-[.97] shrink-0"
            style={{ borderColor: 'var(--border)', color: 'var(--ink-2)', background: 'var(--surface)' }}
          >
            <Star className="w-3.5 h-3.5" style={{ color: 'var(--gold)' }} />
            Seguir
          </button>
          <button
            onClick={() => setTxn({ mode: 'new', ticker: null })}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all active:scale-[.97] shrink-0"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Agregar
          </button>
        </div>
      </div>

      {/* ── Hero + 3 KPIs (portafolio) ───────────────────────────────────── */}
      {positions.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-4 lg:items-stretch mb-4">
          <div className="card overflow-hidden hero-gradient w-full lg:min-w-0" style={{ flex: '40 1 0' }}>
            <div className="px-5 pt-5 lg:px-6 lg:pt-6 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>Valor del portafolio</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-4xl lg:text-5xl font-bold tabular-nums leading-none" style={{ fontFamily: 'Fredoka, sans-serif', color: 'white' }}>
                  {hasQ ? fmtUSD(totalValueUsd) : fmtUSD(totalCostUsd)}
                </p>
                <span className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>USD</span>
              </div>
              {/* Retorno de HOY, junto al valor grande — el retorno total ya vive
                  en la fila de KPIs de abajo; separarlos en dos lugares distintos
                  (no ambos "totales") es justo lo que Cas pedía poder ver de un
                  vistazo. */}
              {hasQ && (
                <p className="flex items-center gap-1 text-xs lg:text-sm font-bold mt-1.5" style={{ color: dailyChangeUsd >= 0 ? '#7EEBC7' : '#FFB4AB' }}>
                  {dailyChangeUsd >= 0 ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                  {fmtUSDSigned(dailyChangeUsd)} ({fmtPct(dailyChangePct)}) hoy
                </p>
              )}
            </div>
            <div className="border-t grid grid-cols-4" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
              <div className="px-2 py-3 lg:px-5 lg:py-4 min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1 whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.5)' }}>Invertido</p>
                <p className="text-sm lg:text-lg font-bold tabular-nums truncate" style={{ color: 'white' }}>{fmtUSD(totalCostUsd)}</p>
              </div>
              <div className="px-2 py-3 lg:px-5 lg:py-4 border-l min-w-0" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1 whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.5)' }}>Retorno total</p>
                <p className="text-sm lg:text-lg font-bold tabular-nums truncate" style={{ color: hasQ ? (totalReturnUsd >= 0 ? '#1FBE8D' : '#FF6F61') : 'rgba(255,255,255,0.5)' }}>
                  {hasQ ? fmtUSDSigned(totalReturnUsd) : '—'}
                </p>
              </div>
              <div className="px-2 py-3 lg:px-5 lg:py-4 border-l min-w-0" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1 whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.5)' }}>Retorno %</p>
                <p className="text-sm lg:text-lg font-bold tabular-nums truncate" style={{ color: hasQ ? (totalReturnPct >= 0 ? '#1FBE8D' : '#FF6F61') : 'rgba(255,255,255,0.5)' }}>
                  {hasQ ? fmtPct(totalReturnPct) : '—'}
                </p>
              </div>
              <div className="px-2 py-3 lg:px-5 lg:py-4 border-l min-w-0" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1 whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.5)' }}>vs SPY</p>
                <p className="text-sm lg:text-lg font-bold tabular-nums truncate" style={{ color: spyBenchmark?.diffPct != null ? (spyBenchmark.diffPct >= 0 ? '#1FBE8D' : '#FF6F61') : 'rgba(255,255,255,0.5)' }}>
                  {spyBenchmark?.diffPct != null ? fmtPct(spyBenchmark.diffPct) : '—'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 lg:gap-3 w-full lg:min-w-0" style={{ flex: '60 1 0', alignContent: 'stretch' }}>
            <a href="/inversiones?view=billetera" className="card p-3 lg:p-5 block min-w-0 transition-colors hover:bg-[var(--surface-2)]">
              <p className="text-[9px] lg:text-[10px] font-bold uppercase tracking-widest mb-2 whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Billetera</p>
              {walletAvailable !== null ? (
                <>
                  <p className="text-xl sm:text-2xl lg:text-4xl font-extrabold tabular-nums leading-none truncate"
                    style={{ fontFamily: 'Fredoka, sans-serif', color: walletAvailable >= 0 ? 'var(--ink)' : 'var(--coral)' }}>
                    {fmtUSD(Math.max(0, walletAvailable))}
                  </p>
                  <p className="text-[10px] lg:text-xs font-semibold mt-1.5" style={{ color: walletAvailable >= 0 ? 'var(--ink-3)' : 'var(--coral)' }}>
                    {walletAvailable >= 0 ? 'disponible para comprar →' : 'revisa tus aportes: hay más invertido que aportado'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xl sm:text-2xl lg:text-4xl font-extrabold leading-none" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink-3)' }}>—</p>
                  <p className="text-[10px] lg:text-xs font-semibold mt-1.5" style={{ color: 'var(--primary)' }}>Registra tus aportes →</p>
                </>
              )}
            </a>

            <div className="card p-3 lg:p-5 min-w-0">
              <p className="text-[9px] lg:text-[10px] font-bold uppercase tracking-widest mb-2 whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Posiciones</p>
              <p className="text-xl sm:text-2xl lg:text-4xl font-extrabold leading-none" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>
                {positionTickers.length}
              </p>
              {hasQ && (posUp > 0 || posDown > 0) && (
                <div className="flex items-center gap-2 mt-1.5 text-[10px] lg:text-xs font-semibold">
                  {posUp   > 0 && <span style={{ color: 'var(--mint)' }}>{posUp}↑</span>}
                  {posDown > 0 && <span style={{ color: 'var(--coral)' }}>{posDown}↓</span>}
                </div>
              )}
            </div>

            <button
              onClick={() => { if (bestPos) openDetail(bestPos.ticker) }}
              className="card p-3 lg:p-5 min-w-0 text-left transition-colors hover:bg-[var(--surface-2)]"
            >
              <p className="text-[9px] lg:text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-3)' }}>
                {bestPos && bestPos.pct < 0 ? 'Menor pérdida' : 'Mejor retorno'}
              </p>
              {bestPos ? (
                <>
                  <p className="text-xl sm:text-2xl lg:text-4xl font-extrabold leading-none" style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--ink)' }}>
                    {bestPos.ticker}
                  </p>
                  <div className="flex items-center gap-1 mt-1.5">
                    {bestPos.pct >= 0 ? <ArrowUp className="w-3 h-3" style={{ color: 'var(--mint)' }} /> : <ArrowDown className="w-3 h-3" style={{ color: 'var(--coral)' }} />}
                    <span className="text-[10px] lg:text-xs font-semibold" style={{ color: bestPos.pct >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                      {fmtPct(bestPos.pct)} total
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-lg lg:text-3xl font-extrabold" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink-3)' }}>—</p>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── ¿Qué comprar hoy? ───────────────────────────────────────────── */}
      {allTickers.length > 0 && (
        <div className="card overflow-hidden mb-4">
          <div className="px-4 lg:px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
            <Target className="w-4 h-4" style={{ color: 'var(--primary)' }} />
            <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>¿Qué comprar hoy?</p>
          </div>
          <div className="px-4 lg:px-5 py-4">
            {!allLoaded ? (
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                  Comparando… {loadedCount}/{allTickers.length}
                </p>
                <div className="h-1 rounded-full overflow-hidden mt-2 max-w-[200px]" style={{ background: 'var(--surface-2)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${(loadedCount / allTickers.length) * 100}%`, background: 'var(--primary)' }} />
                </div>
              </div>
            ) : top === null ? (
              <p className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Sin datos suficientes todavía.</p>
            ) : !topIsBuyTier ? (
              <>
                <p className="text-sm font-extrabold" style={{ color: 'var(--coral)' }}>Hoy no compres nada de tu lista.</p>
                <p className="text-xs leading-relaxed mt-1" style={{ color: 'var(--ink-2)' }}>
                  Ni siquiera <TickerLink t={top.ticker} onOpen={openDetail} />, tu mejor candidata ({top.conviction.score}/100), tiene caso suficiente para comprar ahora mismo. {top.conviction.verdict}
                </p>
              </>
            ) : !topActionable ? (
              <>
                {/* Convicción alta, pero sin gatillo de entrada todavía — no decir
                    "cómpralo hoy" cuando el propio plan técnico dice que esperes:
                    eso es lo que generaba la contradicción entre este panel y el
                    detalle del ticker (fix jul 2026, a pedido de Cas). */}
                <p className="text-sm font-extrabold leading-snug" style={{ color: 'var(--gold)' }}>
                  <TickerLink t={top.ticker} onOpen={openDetail} bold /> es tu mejor candidata ({top.conviction.score}/100), pero todavía no hay entrada.
                </p>
                <p className="text-xs leading-relaxed mt-1.5" style={{ color: 'var(--ink-2)' }}>{top.a.entryPlan}</p>
                <ul className="mt-2 space-y-1">
                  {top.conviction.reasons.slice(0, 2).map((r, i) => (
                    <li key={i} className="text-[11px] leading-relaxed flex items-start gap-1.5" style={{ color: 'var(--ink-2)' }}>
                      <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--gold)' }} />
                      {r}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="text-sm font-extrabold leading-snug" style={{ color: 'var(--mint)' }}>
                  La mejor compra hoy es <TickerLink t={top.ticker} onOpen={openDetail} bold />{' '}({top.conviction.score}/100)
                  {runnerUp && <> — mejor que <TickerLink t={runnerUp.ticker} onOpen={openDetail} /> ({runnerUp.conviction.score}/100)</>}.
                </p>
                <ul className="mt-2 space-y-1">
                  {top.conviction.reasons.slice(0, 3).map((r, i) => (
                    <li key={i} className="text-[11px] leading-relaxed flex items-start gap-1.5" style={{ color: 'var(--ink-2)' }}>
                      <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--mint)' }} />
                      {r}
                    </li>
                  ))}
                </ul>
                {topSuggestedUsd !== null && (
                  <button
                    onClick={() => setTxn({ mode: owned.has(top.ticker) ? 'buyMore' : 'new', ticker: top.ticker, prefillUsd: topSuggestedUsd })}
                    className="text-sm font-bold tabular-nums mt-2.5 px-3 py-2 rounded-xl inline-block transition-opacity hover:opacity-85 active:scale-[.98]"
                    style={{ background: 'rgba(31,190,141,0.12)', color: 'var(--mint)' }}
                  >
                    Compra hasta {fmtUSD(topSuggestedUsd)} de {top.ticker} ahora
                  </button>
                )}
                {ranking.length > 1 && (
                  <p className="text-[10px] mt-2 flex flex-wrap items-center gap-x-1" style={{ color: 'var(--ink-3)' }}>
                    Resto del ranking:{' '}
                    {ranking.slice(1, 4).map((r, i) => (
                      <span key={r.ticker}>
                        {i > 0 && ' · '}
                        <TickerLink t={r.ticker} onOpen={openDetail} muted /> ({r.conviction.score})
                      </span>
                    ))}
                  </p>
                )}
              </>
            )}
            <p className="text-[9px] leading-relaxed mt-2.5" style={{ color: 'var(--ink-3)' }}>
              Score de convicción: técnico + riesgo/recompensa + fuerza vs. el mercado (SPY). No es garantía —
              es la mejor lectura con lo que hay hoy.
            </p>
          </div>
        </div>
      )}

      {/* ── Análisis al cierre del ── */}
      {(() => {
        const asOfDates = allTickers.map(t => analyses[t]).filter((a): a is TechnicalAnalysis => typeof a === 'object').map(a => a.asOf)
        if (asOfDates.length === 0) return null
        const latest = asOfDates.reduce((max, d) => d > max ? d : max)
        return (
          <p className="text-[11px] mb-3" style={{ color: 'var(--ink-3)' }}>
            Análisis técnico al cierre del {fmtAsOfDay(latest)} · el precio de arriba sí es en vivo
          </p>
        )
      })()}

      {/* ── Tabs Tengo / Sigo / Todo ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        {([
          ['tengo', 'Tengo', positionTickers.length],
          ['sigo',  'Sigo',  watchTickers.filter(t => !owned.has(t)).length],
          ['todo',  'Todo',  allTickers.length],
        ] as const).map(([id, label, count]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all"
            style={tab === id ? { background: 'var(--primary)', color: 'var(--primary-ink)' } : { background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}
          >
            {label}
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
              style={tab === id ? { background: 'rgba(255,255,255,0.25)' } : { background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Leyenda descartable — se explica una vez, no en cada fila (I4 roadmap interacción) */}
      {showLegend && (
        <div className="flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5 mb-3" style={{ background: 'var(--surface-2)' }}>
          <p className="flex-1 text-[11px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            <span className="font-bold" style={{ color: 'var(--ink)' }}>●&nbsp;número</span> = convicción de compra (0-100, toca cualquiera para el detalle) ·{' '}
            <span className="font-bold" style={{ color: 'var(--ink)' }}>barra roja/verde</span> = riesgo hasta tu salida vs. aire hasta el próximo techo.
          </p>
          <button onClick={dismissLegend} className="flex-shrink-0 text-[11px] font-bold px-2 py-1 rounded-lg transition-colors hover:bg-black/5" style={{ color: 'var(--ink-3)' }}>
            Entendido
          </button>
        </div>
      )}

      {/* ── Popup de búsqueda ("Seguir") ─────────────────────────────────── */}
      {showSearch && (
        <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={e => { if (e.target === e.currentTarget) closeSearch() }}>
          <div className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', maxHeight: '80dvh' }}>
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />
            <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Buscar acción o ETF</h2>
              <button onClick={closeSearch} className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 pt-4 pb-2">
              <div className="flex items-center gap-2.5 border px-4 py-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', borderRadius: 12 }}>
                <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
                <input
                  type="text" value={query}
                  onChange={e => { setQuery(e.target.value); setAddError('') }}
                  placeholder="ej: Apple, Netflix, Vanguard S&P 500…"
                  maxLength={40} autoFocus
                  className="flex-1 text-sm bg-transparent outline-none border-0 min-w-0"
                  style={{ color: 'var(--ink)' }}
                />
                {searching && <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" style={{ color: 'var(--ink-3)' }} />}
              </div>
              {addError && <p className="text-xs font-medium mt-2" style={{ color: 'var(--coral)' }}>{addError}</p>}
            </div>
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
                          <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>{r.symbol} · {r.type === 'etf' ? 'ETF' : 'Acción'}</p>
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

      {/* ── Lista ─────────────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <div className="card px-6 py-8 text-center">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
            {tab === 'tengo' ? 'Sin posiciones todavía' : tab === 'sigo' ? 'Sin favoritos sin posición' : 'Sin tickers en tu radar'}
          </p>
          <p className="text-xs mt-1 max-w-md mx-auto leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            Busca por nombre (Apple, Netflix, Vanguard…) y toca la fila para ver su lectura en simple:
            hacia dónde va la tendencia, los pisos y techos donde suele frenarse, y si subió o cayó demasiado rápido.
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <button onClick={openSearch}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-opacity hover:opacity-85"
              style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 8px 18px var(--shadow)' }}>
              <Search className="w-3.5 h-3.5" />
              Buscar y seguir
            </button>
            <button onClick={() => setTxn({ mode: 'new', ticker: null })}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-opacity hover:opacity-85"
              style={{ borderColor: 'var(--border)', color: 'var(--ink-2)' }}>
              <Plus className="w-3.5 h-3.5" />
              Agregar posición
            </button>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden divide-y" style={{ borderColor: 'var(--border)' }}>
          {rows.map(ticker => {
            const q = quotes[ticker]
            const a = analyses[ticker]
            const item = items.find(i => i.ticker === ticker)
            const pos = ownedMap[ticker]
            const isOwned = owned.has(ticker)
            const c = convictionFor(ticker)
            const flag = actionFlag(a, isOwned, c)
            const atTarget = targetReached(item, q?.price, isOwned)
            const watchCount = (typeof a === 'object' ? a.watch.length : 0) + (nearTarget(item, q?.price, isOwned) ? 1 : 0)
            const gainUsd = isOwned && pos && q ? pos.shares * (q.price - pos.avgCost) : null
            const gainPct = isOwned && pos && q && pos.avgCost > 0 ? ((q.price - pos.avgCost) / pos.avgCost) * 100 : null

            return (
              <div
                key={ticker}
                role="button"
                tabIndex={0}
                onClick={() => openDetail(ticker)}
                onKeyDown={e => e.key === 'Enter' && openDetail(ticker)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer transition-colors hover:bg-black/5 group"
                style={flag ? { borderLeft: `3px solid ${FLAG_UI[flag].color}`, background: FLAG_UI[flag].softBg } : undefined}
              >
                <ServiceLogo domain={q?.domain ?? null} name={ticker} size={36} fallbackColor={avatarColor(ticker)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{ticker}</p>
                    {c ? <ConvictionChip score={c.score} tier={c.tier} />
                      : <span className="inline-block w-6 h-3.5 rounded-full animate-pulse" style={{ background: 'var(--surface-2)' }} />}
                    {flag === 'caution' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: FLAG_UI.caution.bg, color: FLAG_UI.caution.color }}>
                        <AlertTriangle className="w-3 h-3" /> Toma de ganancias
                      </span>
                    )}
                    {atTarget && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                        <Target className="w-3 h-3" /> En tu precio
                      </span>
                    )}
                    {!flag && !atTarget && watchCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                        revisar pronto
                      </span>
                    )}
                  </div>
                  {q?.name && (
                    <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>
                      {q.name}{isOwned && ' · en cartera'}
                    </p>
                  )}
                  {isOwned && typeof a === 'object' && q?.price !== undefined && (
                    <div className="mt-1">
                      <RiskRail price={q.price} stop={a.alarm} resistance={a.resistanceLevels[0]?.price ?? null} compact />
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  {q ? (
                    <>
                      <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtUSD(q.price)}</p>
                      {isOwned && gainUsd !== null && gainPct !== null ? (
                        <>
                          <p className="text-[11px] font-semibold tabular-nums" style={{ color: gainUsd >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                            {fmtUSDSigned(gainUsd)} ({fmtPct(gainPct, false)})
                          </p>
                          {/* Con posición, arriba solo se veía el retorno TOTAL —
                              el del día quedaba escondido hasta abrir el detalle.
                              Ahora ambos, uno abajo del otro (jul 2026). */}
                          <p className="text-[9px] font-semibold tabular-nums" style={{ color: q.changePercent >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                            {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}% hoy
                          </p>
                        </>
                      ) : (
                        <p className="text-[11px] font-semibold tabular-nums" style={{ color: q.changePercent >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                          {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="animate-pulse">
                      <div className="h-3.5 w-16 rounded-md ml-auto" style={{ background: 'var(--surface-2)' }} />
                      <div className="h-2.5 w-10 rounded-md mt-1.5 ml-auto" style={{ background: 'var(--surface-2)' }} />
                    </div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 flex-shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--ink-3)' }} />
              </div>
            )
          })}
        </div>
      )}

      {/* ── Popup de detalle técnico — único para cualquier ticker (U4) ──── */}
      {expanded !== null && (() => {
        const ticker = expanded
        const q = quotes[ticker]
        const a = analyses[ticker]
        const item = items.find(i => i.ticker === ticker)
        const pos = ownedMap[ticker]
        const rawPos = positions.find(p => p.ticker === ticker) ?? null
        const isOwned = owned.has(ticker)

        return (
          <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}
            onClick={e => { if (e.target === e.currentTarget) setExpanded(null) }}>
            <div className="w-full lg:max-w-3xl rounded-t-3xl lg:rounded-3xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', maxHeight: '88dvh' }}>
              <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

              <div className="flex items-center gap-3 px-5 lg:px-6 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <ServiceLogo domain={q?.domain ?? null} name={ticker} size={40} fallbackColor={avatarColor(ticker)} />
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold leading-tight" style={{ color: 'var(--ink)' }}>{ticker}</h2>
                  {q?.name && (
                    <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>
                      {q.name}{isOwned && ' · en cartera'}
                    </p>
                  )}
                </div>
                {q && (
                  <div className="text-right flex-shrink-0 mr-1">
                    <p className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtUSD(q.price)}</p>
                    <p className="text-[11px] font-semibold tabular-nums" style={{ color: q.changePercent >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                      {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}% hoy
                    </p>
                  </div>
                )}
                <button onClick={() => setExpanded(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0 transition-colors"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Precio objetivo — solo si el ticker está en watchlist */}
              {item && (() => {
                const reached = targetReached(item, q?.price, isOwned)
                const dirLabel = (d: 'above' | 'below') => d === 'above' ? 'suba a' : 'baje a'
                const enteredVal = targetInput !== null ? parseFloat(targetInput) : NaN
                const inferredDir: 'above' | 'below' = q && Number.isFinite(enteredVal) && enteredVal < q.price ? 'below' : 'above'
                const effectiveDir = targetDirOverride ?? inferredDir

                return (
                  <div className="px-5 lg:px-6 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2.5">
                      <Target className="w-4 h-4 flex-shrink-0" style={{ color: reached ? 'var(--primary)' : 'var(--ink-3)' }} />
                      {targetInput !== null ? (
                        <>
                          <input
                            type="number" inputMode="decimal" min="0" step="0.01"
                            value={targetInput}
                            onChange={e => setTargetInput(e.target.value)}
                            placeholder={isOwned ? 'Precio de salida en USD' : 'Precio de entrada en USD'}
                            autoFocus
                            className="flex-1 min-w-0 text-xs font-semibold outline-none border rounded-xl px-3 py-1.5"
                            style={{ color: 'var(--ink)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                          />
                          {/* I6 (roadmap interacción): distancia en vivo mientras
                              se escribe — antes solo se veía al guardar y reabrir. */}
                          {q && Number.isFinite(parseFloat(targetInput)) && parseFloat(targetInput) > 0 && (
                            <span className="text-[10px] font-bold flex-shrink-0 tabular-nums" style={{ color: 'var(--ink-3)' }}>
                              a {(Math.abs(q.price - parseFloat(targetInput)) / parseFloat(targetInput) * 100).toFixed(1)}%
                            </span>
                          )}
                          <button
                            onClick={() => {
                              const v = parseFloat(targetInput)
                              if (Number.isFinite(v) && v > 0) saveTarget(item, Math.round(v * 100) / 100, effectiveDir)
                            }}
                            disabled={targetBusy}
                            className="px-3 py-1.5 rounded-xl text-[11px] font-bold flex-shrink-0 transition-all active:scale-95 disabled:opacity-50"
                            style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
                          >
                            Guardar
                          </button>
                          <button onClick={() => { setTargetInput(null); setTargetDirOverride(null) }}
                            className="px-3 py-1.5 rounded-xl text-[11px] font-bold flex-shrink-0 transition-colors"
                            style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                            Cancelar
                          </button>
                        </>
                      ) : item.target_price !== null ? (
                        <>
                          <p className="flex-1 min-w-0 text-xs font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>
                            Objetivo de {isOwned ? 'salida' : 'entrada'}: cuando {dirLabel(item.target_direction ?? (isOwned ? 'above' : 'below'))}{' '}
                            <span className="font-bold" style={{ color: 'var(--ink)' }}>{fmtUSD(item.target_price)}</span>
                            {reached ? (
                              <span className="ml-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                                Llegó a tu precio
                              </span>
                            ) : q && (
                              <span className="ml-2 text-[10px] font-bold" style={{ color: 'var(--ink-3)' }}>
                                a {(Math.abs(q.price - item.target_price) / item.target_price * 100).toFixed(1)}% de distancia
                              </span>
                            )}
                          </p>
                          <button
                            onClick={() => { setTargetInput(String(item.target_price)); setTargetDirOverride(item.target_direction) }}
                            className="px-3 py-1.5 rounded-xl text-[11px] font-bold flex-shrink-0 transition-colors hover:bg-black/5"
                            style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
                            Editar
                          </button>
                          <button onClick={() => saveTarget(item, null, null)} disabled={targetBusy}
                            className="px-3 py-1.5 rounded-xl text-[11px] font-bold flex-shrink-0 transition-colors hover:bg-black/5 disabled:opacity-50"
                            style={{ background: 'transparent', color: 'var(--coral)' }}>
                            Quitar
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setTargetInput('')}
                          className="flex-1 text-left text-xs font-semibold transition-opacity hover:opacity-75"
                          style={{ color: 'var(--ink-3)' }}>
                          Definir precio objetivo de {isOwned ? 'salida' : 'entrada'} — te avisamos por correo cuando llegue
                        </button>
                      )}
                    </div>
                    {targetInput !== null && (
                      <div className="flex items-center gap-1.5 mt-2 ml-[26px]">
                        <span className="text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>Avisar cuando el precio:</span>
                        <button onClick={() => setTargetDirOverride('above')}
                          className="px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors"
                          style={effectiveDir === 'above' ? { background: 'rgba(31,190,141,0.16)', color: 'var(--mint)' } : { background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                          ↑ suba a ese valor
                        </button>
                        <button onClick={() => setTargetDirOverride('below')}
                          className="px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors"
                          style={effectiveDir === 'below' ? { background: 'rgba(255,111,97,0.16)', color: 'var(--coral)' } : { background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                          ↓ baje a ese valor
                        </button>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Body */}
              <div className="overflow-y-auto pt-4">
                {a === 'loading' || a === undefined ? (
                  <div className="mx-4 mb-4 rounded-2xl px-4 py-3 flex items-center gap-2.5" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                    <span className="text-xs font-semibold">Calculando indicadores de {ticker}…</span>
                  </div>
                ) : a === 'error' ? (
                  <div className="mx-4 mb-4 rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(255,111,97,0.08)', border: '1px solid rgba(255,111,97,0.2)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold" style={{ color: 'var(--coral)' }}>No pudimos obtener los datos de {ticker}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                        {errDetails[ticker] ? <>Respuesta de los proveedores: {errDetails[ticker]}</> : 'Puede ser un problema momentáneo del proveedor o un ticker no soportado.'}
                      </p>
                    </div>
                    <button onClick={() => fetchAnalysis(ticker, true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold flex-shrink-0 transition-all active:scale-95"
                      style={{ background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}>
                      <RefreshCw className="w-3 h-3" />
                      Reintentar
                    </button>
                  </div>
                ) : (
                  <TechnicalDetail
                    key={ticker}
                    a={a}
                    ticker={ticker}
                    position={pos}
                    rawPosition={rawPos}
                    purchases={purchases}
                    sales={sales}
                    livePrice={q?.price}
                    portfolioValueUsd={portfolioValueUsd}
                    walletAvailableUsd={walletAvailable}
                    spyReturn6m={spyReturn6m}
                    onBuyMore={isOwned ? (t) => setTxn({ mode: 'buyMore', ticker: t, prefillUsd: suggestedUsdFor(t) ?? undefined }) : undefined}
                    onSell={isOwned ? (t) => setTxn({ mode: 'sell', ticker: t }) : undefined}
                  />
                )}

                {/* Acciones del footer: comprar (si no la tienes) / editar / eliminar / dejar de seguir */}
                <div className="px-4 pb-4 space-y-2">
                  {!isOwned && (
                    <button
                      onClick={() => setTxn({ mode: 'new', ticker, prefillUsd: suggestedUsdFor(ticker) ?? undefined })}
                      className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-2xl transition-colors"
                      style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
                    >
                      <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                      Registrar compra de {ticker}
                    </button>
                  )}
                  {isOwned && (
                    <div className="flex items-center justify-center gap-4">
                      <button onClick={() => setTxn({ mode: 'edit', ticker })}
                        className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                        Editar posición
                      </button>
                      <button onClick={() => setTxn({ mode: 'delete', ticker })}
                        className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                        Eliminar sin registrar venta
                      </button>
                    </div>
                  )}
                  {item && (
                    <button
                      onClick={() => { removeTicker(item); setExpanded(null) }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-2xl border transition-colors hover:bg-black/5"
                      style={{ color: 'var(--coral)', borderColor: 'rgba(255,111,97,0.3)', background: 'transparent' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Dejar de seguir {ticker}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Modal transaccional — SOLO comprar/vender/editar/eliminar ────── */}
      {txn && (
        <TransactionModal
          userId={userId}
          mode={txn.mode}
          ticker={txn.ticker}
          positions={positions}
          setPositions={setPositions}
          purchases={purchases}
          setPurchases={setPurchases}
          sales={sales}
          setSales={setSales}
          walletUsdBase={walletUsdBase}
          quotes={quotes}
          posAnalyses={analyses}
          onClose={() => setTxn(null)}
          onDone={(ticker) => {
            fetchQuotes([ticker])
            fetchAnalysis(ticker, true)
            // I6 (roadmap interacción): comprar un ticker que no seguías lo
            // deja fuera de daily_decisions y del correo diario — sin
            // watchlist, la app no vuelve a mirarlo. Se ofrece seguirlo en
            // el mismo momento, un solo tap.
            if (txn?.mode === 'new' && !items.some(i => i.ticker === ticker)) {
              showToast(`¿Seguir ${ticker} para recibir sus señales diarias?`, {
                action: { label: 'Seguir', onClick: () => addSymbol(ticker) },
              })
            }
          }}
          prefill={txn.prefillUsd !== undefined ? { totalUsd: txn.prefillUsd } : undefined}
        />
      )}
    </div>
  )
}
