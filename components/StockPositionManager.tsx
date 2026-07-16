'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, X, TrendingUp, TrendingDown, Pencil, Minus,
  Trash2, Check, AlertCircle, Bell, ArrowUp, ArrowDown, ChevronRight,
  DollarSign, ArrowLeft,
} from 'lucide-react'
import { formatCLP, relativeDate } from '@/lib/utils'
import ServiceLogo from '@/components/ServiceLogo'
import InversionesToggle from '@/components/InversionesToggle'
import type { StockPosition, StockSale, StockPurchase } from '@/app/(dashboard)/inversiones/page'
import type { TechnicalAnalysis } from '@/lib/technical'
import { getAnalysis } from '@/lib/analysis-cache'

/** Salida accionable HOY según el plan: coral si la tendencia se dio vuelta
 *  (vender), gold si es zona caliente (asegurar una parte). null = nada hoy. */
function exitFlagOf(pa: TechnicalAnalysis | 'loading' | 'error' | undefined): { text: string; color: string; bg: string } | null {
  if (typeof pa !== 'object') return null
  if (!pa.sell.some(t => t.now)) return null
  if (pa.trend.aboveSma200 === false) return { text: 'Vender', color: 'var(--coral)', bg: 'rgba(255,111,97,0.14)' }
  return { text: 'Asegurar parte', color: 'var(--gold)', bg: 'rgba(255,194,60,0.16)' }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Quote {
  price:         number
  changePercent: number
  name:          string
  currency:      string
  history7d?:    number[]
  domain?:       string
}
type Quotes   = Record<string, Quote>

// ── Formatting ────────────────────────────────────────────────────────────────
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

// ── Ticker avatar color (deterministic) ───────────────────────────────────────
const AVATAR_PALETTE = [
  '#2B7CF6','#1FBE8D','#FF6F61','#FBC23C',
  '#A78BFA','#F472B6','#34D399','#FB923C','#60A5FA','#F87171',
]
function tickerColor(ticker: string): string {
  let h = 0
  for (let i = 0; i < ticker.length; i++) h = ticker.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length]
}

// ── Dominio para ETFs y acciones sin weburl en Finnhub ───────────────────────
const TICKER_DOMAIN: Record<string, string> = {
  // iShares (BlackRock) — usar blackrock.com porque ishares.com no tiene logo en Clearbit
  IBIT: 'blackrock.com', IVV: 'blackrock.com', IJR: 'blackrock.com', AGG: 'blackrock.com',
  EFA: 'blackrock.com', EEM: 'blackrock.com', LQD: 'blackrock.com', HYG: 'blackrock.com',
  // Invesco
  QQQ: 'invesco.com', QQQM: 'invesco.com', RSP: 'invesco.com',
  // Vanguard
  VOO: 'vanguard.com', VTI: 'vanguard.com', VEA: 'vanguard.com',
  VWO: 'vanguard.com', BND: 'vanguard.com', VIG: 'vanguard.com',
  // SPDR (State Street)
  SPY: 'ssga.com', GLD: 'ssga.com', XLF: 'ssga.com', XLE: 'ssga.com',
  XLK: 'ssga.com', DIA: 'ssga.com',
  // ProShares
  TQQQ: 'proshares.com', SQQQ: 'proshares.com', UPRO: 'proshares.com',
  // ARK
  ARKK: 'ark-funds.com', ARKW: 'ark-funds.com', ARKG: 'ark-funds.com',
  // VanEck
  SMH: 'vaneck.com', GDX: 'vaneck.com',
  // Acciones individuales populares
  AAPL: 'apple.com',      MSFT: 'microsoft.com',  GOOGL: 'google.com',
  GOOG: 'google.com',     AMZN: 'amazon.com',      NVDA: 'nvidia.com',
  META: 'meta.com',       TSLA: 'tesla.com',       NFLX: 'netflix.com',
  MSCI: 'msci.com',       BRK: 'berkshirehathaway.com',
  JPM:  'jpmorganchase.com', BAC: 'bankofamerica.com', WFC: 'wellsfargo.com',
  GS:   'goldmansachs.com',  MS: 'morganstanley.com',
  WMT:  'walmart.com',    COST: 'costco.com',      TGT: 'target.com',
  AMGN: 'amgen.com',      LLY: 'lilly.com',        JNJ: 'jnj.com',
  PFE:  'pfizer.com',     ABBV: 'abbvie.com',      MRK: 'merck.com',
  XOM:  'exxonmobil.com', CVX: 'chevron.com',      COP: 'conocophillips.com',
  INTC: 'intel.com',      AMD: 'amd.com',           MU: 'micron.com',
  QCOM: 'qualcomm.com',   AVGO: 'broadcom.com',     TXN: 'ti.com',
  TSM:  'tsmc.com',       ASML: 'asml.com',         AMAT: 'appliedmaterials.com',
  MELI: 'mercadolibre.com', NU: 'nu.com.br',        SE: 'sea.com',
  BABA: 'alibaba.com',    JD: 'jd.com',             BIDU: 'baidu.com',
  V:    'visa.com',       MA: 'mastercard.com',     PYPL: 'paypal.com',
  DIS:  'thewaltdisneycompany.com', CMCSA: 'comcast.com',
  T:    'att.com',        VZ: 'verizon.com',
  KO:   'coca-cola.com',  PEP: 'pepsico.com',       MCD: 'mcdonalds.com',
  SBUX: 'starbucks.com',  NKE: 'nike.com',
  CRM:  'salesforce.com', ORCL: 'oracle.com',       SAP: 'sap.com',
  UBER: 'uber.com',       LYFT: 'lyft.com',         ABNB: 'airbnb.com',
  COIN: 'coinbase.com',   MSTR: 'microstrategy.com',
  SPOT: 'spotify.com',    SNAP: 'snap.com',          PINS: 'pinterest.com',
}

// Infiere dominio desde el nombre del emisor (fallback para ETFs desconocidos)
function domainFromName(name: string | undefined): string | null {
  if (!name) return null
  const n = name.toLowerCase()
  if (n.includes('ishares'))  return 'blackrock.com'
  if (n.includes('invesco'))  return 'invesco.com'
  if (n.includes('vanguard')) return 'vanguard.com'
  if (n.includes('spdr'))     return 'ssga.com'
  if (n.includes('proshares'))return 'proshares.com'
  if (n.includes('ark'))      return 'ark-funds.com'
  if (n.includes('vaneck'))   return 'vaneck.com'
  if (n.includes('wisdomtree'))return 'wisdomtree.com'
  if (n.includes('direxion')) return 'direxioninvestments.com'
  return null
}

// ── Sparkline SVG ──────────────────────────────────────────────────────────────
function Sparkline({
  values,
  w = 80, h = 28,
  color,
  strokeWidth = 1.5,
  responsive = false,
}: {
  values: number[]
  w?: number
  h?: number
  color: string
  strokeWidth?: number
  responsive?: boolean
}) {
  if (values.length < 2) {
    return (
      <svg width={responsive ? '100%' : w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio={responsive ? 'none' : undefined}>
        <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
      </svg>
    )
  }
  const pad = 2
  const min = Math.min(...values)
  const max = Math.max(...values)
  const rng = max - min || 1
  const xs  = values.map((_, i) => pad + (i / (values.length - 1)) * (w - pad * 2))
  const ys  = values.map(v => h - pad - ((v - min) / rng) * (h - pad * 2))
  const d   = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')

  return (
    <svg
      width={responsive ? '100%' : w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio={responsive ? 'none' : undefined}
      className="overflow-visible"
    >
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      {!responsive && <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={2} fill={color} />}
    </svg>
  )
}


// ── Input helpers ─────────────────────────────────────────────────────────────
const inputBase: React.CSSProperties = {
  color:       'var(--ink)',
  background:  'var(--surface-2)',
  borderColor: 'var(--border)',
  borderRadius: 12,
  outline:     'none',
  transition:  'border-color 150ms, box-shadow 150ms',
}
function focusOn(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'var(--primary)'
  e.currentTarget.style.boxShadow   = '0 0 0 3px var(--primary-soft)'
}
function focusOff(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'var(--border)'
  e.currentTarget.style.boxShadow   = 'none'
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  userId:           string
  initialPositions: StockPosition[]
  /** Σ movimientos USD de la billetera (aportes + ventas). 0 = billetera sin uso → no se valida. */
  walletUsdBase?:   number
  /** Ventas ya registradas — para armar el timeline de "Movimientos" de cada posición. */
  initialSales?:    StockSale[]
  /** Compras ya registradas individualmente (desde que existe esta tabla) — mismo propósito. */
  initialPurchases?: StockPurchase[]
}
interface FormState { ticker: string; shares: string; totalPaid: string; notes: string }
const emptyForm: FormState = { ticker: '', shares: '', totalPaid: '', notes: '' }

export default function StockPositionManager({
  userId, initialPositions, walletUsdBase = 0, initialSales = [], initialPurchases = [],
}: Props) {
  const supabase     = createClient()

  const [positions,      setPositions]      = useState<StockPosition[]>(initialPositions)
  const [sales,          setSales]          = useState<StockSale[]>(initialSales)
  const [purchases,      setPurchases]      = useState<StockPurchase[]>(initialPurchases)
  const [quotes,         setQuotes]         = useState<Quotes>({})
  const [loadingQ,       setLoadingQ]       = useState(false)
  const [quotesError,    setQuotesError]    = useState('')
  const [lastUpdated,    setLastUpdated]    = useState<Date | null>(null)
  const [secsAgo,        setSecsAgo]        = useState(0)
  const [marketOpen,     setMarketOpen]     = useState<boolean | null>(null)
  const [marketLabel,    setMarketLabel]    = useState<string>('')

  const [showForm,      setShowForm]      = useState(false)
  const [editingId,     setEditingId]     = useState<string | null>(null)
  const [form,          setForm]          = useState<FormState>(emptyForm)
  const [saving,        setSaving]        = useState(false)
  const [formError,     setFormError]     = useState('')
  const [deletingId,    setDeletingId]    = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  // Análisis técnico por ticker para el plan de salida del popup.
  // Vía cache compartida (lib/analysis-cache): si el ticker también está en
  // favoritos, se reutiliza el mismo fetch en vez de duplicarlo.
  const [posAnalyses, setPosAnalyses] = useState<Record<string, TechnicalAnalysis | 'loading' | 'error'>>({})
  const fetchPosAnalysis = useCallback(async (ticker: string) => {
    setPosAnalyses(prev => ({ ...prev, [ticker]: 'loading' }))
    try {
      const analysis = await getAnalysis(ticker)
      setPosAnalyses(prev => ({ ...prev, [ticker]: analysis }))
    } catch {
      setPosAnalyses(prev => ({ ...prev, [ticker]: 'error' }))
    }
  }, [])

  const [sellMode,      setSellMode]      = useState(false)   // panel de venta
  const [buyMode,       setBuyMode]       = useState(false)   // panel de comprar más de una posición existente
  const [editMode,      setEditMode]      = useState(false)   // panel de editar campos crudos (corregir un error)
  const [sellUsd,       setSellUsd]       = useState('')   // USD recibidos al vender (total)
  const [sellPrice,     setSellPrice]     = useState('')   // precio de venta por acción — editable, no siempre coincide con la cotización en vivo
  const [sellShares,    setSellShares]    = useState('')   // acciones vendidas (soporta venta parcial)
  const [sellDate,      setSellDate]      = useState('')   // fecha de la venta, editable
  const [buyShares,     setBuyShares]     = useState('')   // acciones a comprar (agregar a la posición)
  const [buyTotalPaid,  setBuyTotalPaid]  = useState('')   // total pagado USD por esas acciones
  const [buyDate,       setBuyDate]       = useState('')   // fecha de la compra, editable

  // Live "hace Xs" timer
  useEffect(() => {
    const t = setInterval(() => {
      if (lastUpdated) setSecsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [lastUpdated])

  const fetchQuotes = useCallback(async (tickers: string[]) => {
    if (!tickers.length) return
    setLoadingQ(true)
    setQuotesError('')
    try {
      const res = await fetch(`/api/stock-price?symbols=${tickers.join(',')}&history=true`)
      if (!res.ok) throw new Error('fetch')
      const body = await res.json()
      // API puede devolver {quotes, marketOpen, marketLabel} o el formato antiguo {ticker: quote}
      const data: Quotes = body.quotes ?? body
      setQuotes(data)
      setLastUpdated(new Date())
      setSecsAgo(0)
      if (typeof body.marketOpen === 'boolean') {
        setMarketOpen(body.marketOpen)
        setMarketLabel(body.marketLabel ?? '')
      }
    } catch {
      setQuotesError('No se pudieron obtener los precios. Intenta de nuevo.')
    } finally {
      setLoadingQ(false)
    }
  }, [])

  useEffect(() => {
    if (positions.length) {
      const tickers = positions.map(p => p.ticker)
      fetchQuotes(tickers)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Preload de análisis de TODAS las posiciones al entrar: los avisos de
  // salida (chip en fila + banner) no sirven si hay que abrir cada popup para
  // enterarse. Secuencial y suave; el server tiene su propio throttle diario.
  useEffect(() => {
    ;(async () => {
      for (const p of positions) {
        if (typeof posAnalyses[p.ticker] === 'object') continue
        await fetchPosAnalysis(p.ticker)
        await new Promise(res => setTimeout(res, 350))
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Computed ─────────────────────────────────────────────────────────────
  const hasQ        = positions.length > 0 && Object.keys(quotes).some(k => k !== 'USDCLP=X')
  const totalCostUsd = positions.reduce((s, p) => s + p.shares * p.avg_cost_usd, 0)
  const totalValueUsd= positions.reduce((s, p) => {
    const q = quotes[p.ticker]
    return s + p.shares * (q?.price ?? p.avg_cost_usd)
  }, 0)
  const totalGainUsd  = totalValueUsd - totalCostUsd
  const totalGainPct  = totalCostUsd > 0 ? (totalGainUsd / totalCostUsd) * 100 : 0
  // Billetera: disponible = movimientos (aportes+ventas) − costo de posiciones
  // FINANCIADAS por la billetera. Las legacy (compradas antes de usarla) no
  // descuentan: no salieron de estos aportes.
  // wallet_cost_usd por posición: soporta mezcla legacy + compras nuevas con
  // billetera en el mismo ticker (el booleano todo-o-nada inflaba el saldo)
  const fundedCostUsd = positions.reduce((s, p) => s + Number(p.wallet_cost_usd ?? 0), 0)
  const walletAvailable = walletUsdBase > 0 ? walletUsdBase - fundedCostUsd : null

  // posUp/posDown basados en retorno TOTAL (precio actual vs costo), no en cambio del día
  const posUp   = positions.filter(p => {
    const q = quotes[p.ticker]
    if (!q) return false
    return p.shares * q.price > p.shares * p.avg_cost_usd
  }).length
  const posDown = positions.filter(p => {
    const q = quotes[p.ticker]
    if (!q) return false
    return p.shares * q.price < p.shares * p.avg_cost_usd
  }).length

  // Posición más cerca de gatillar su alarma de salida — el dato prospectivo
  // que importa para decidir: "MU está a 1.2% de su salida" > "mejor retorno"
  const nearestAlarm = positions.reduce<{ ticker: string; distPct: number; alarm: number } | null>((best, p) => {
    const pa = posAnalyses[p.ticker]
    if (typeof pa !== 'object' || pa.alarm === null) return best
    const px = quotes[p.ticker]?.price ?? pa.price
    const d = ((px - pa.alarm) / pa.alarm) * 100
    if (d < 0) return best   // ya la perdió: eso lo grita el chip Vender/fila coral
    if (!best || d < best.distPct) return { ticker: p.ticker, distPct: d, alarm: pa.alarm }
    return best
  }, null)
  const alarmClose = nearestAlarm !== null && nearestAlarm.distPct <= 3

  // Ganancia realizada acumulada (ventas cerradas) — parte del resultado real
  const realizedPnlUsd = sales.reduce((s, x) => s + Number(x.realized_pnl_usd), 0)

  const bestPos = positions.reduce<{ ticker: string; pct: number } | null>((best, p) => {
    const q    = quotes[p.ticker]
    if (!q) return best
    const pct  = ((q.price - p.avg_cost_usd) / p.avg_cost_usd) * 100
    if (!best || pct > best.pct) return { ticker: p.ticker, pct }
    return best
  }, null)

  // Portfolio sparkline: usa historial real si está disponible, si no muestra costo → valor actual
  const histLens = positions.map(p => quotes[p.ticker]?.history7d?.length ?? 0).filter(l => l > 0)
  const histLen  = histLens.length > 0 ? Math.min(...histLens) : 0
  const portfolioHistory: number[] = histLen > 1
    ? Array.from({ length: histLen }, (_, d) =>
        positions.reduce((s, p) => s + p.shares * (quotes[p.ticker]?.history7d?.[d] ?? p.avg_cost_usd), 0)
      )
    : hasQ
      ? [totalCostUsd, totalValueUsd]   // fallback 2 puntos: costo → valor actual
      : []

  // Escape key closes form
  useEffect(() => {
    if (!showForm) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') cancelForm() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [showForm])

  // ── CRUD ─────────────────────────────────────────────────────────────────
  function openAdd() {
    setForm(emptyForm); setEditingId(null); setFormError('')
    setDeleteConfirm(false); setSellMode(false); setBuyMode(false); setEditMode(false)
    setShowForm(true)
  }
  /** Abre una posición existente: primero muestra el elegidor Comprar/Vender/Editar. */
  function openEdit(pos: StockPosition) {
    const totalPaid = (pos.shares * pos.avg_cost_usd).toFixed(2)
    setForm({ ticker: pos.ticker, shares: String(pos.shares), totalPaid, notes: pos.notes ?? '' })
    setEditingId(pos.id); setFormError('')
    setDeleteConfirm(false); setSellMode(false); setBuyMode(false); setEditMode(false)
    setShowForm(true)
    // Plan de salida en el popup: cargar el análisis técnico del ticker
    // (antes solo existía si además lo seguías en favoritos)
    if (typeof posAnalyses[pos.ticker] !== 'object') fetchPosAnalysis(pos.ticker)
  }
  function cancelForm() {
    setShowForm(false); setEditingId(null); setForm(emptyForm)
    setFormError(''); setDeleteConfirm(false); setSellMode(false); setBuyMode(false); setEditMode(false)
    setSellUsd(''); setSellPrice(''); setSellShares(''); setSellDate('')
    setBuyShares(''); setBuyTotalPaid(''); setBuyDate('')
  }
  function openSellPanel() {
    const pos = positions.find(p => p.id === editingId)
    if (pos) {
      const q = quotes[pos.ticker]
      const price = q?.price ?? pos.avg_cost_usd
      setSellShares(String(Number(pos.shares.toFixed(6))))
      setSellPrice(price.toFixed(2))
      setSellUsd((price * pos.shares).toFixed(2))
      setSellDate(new Date().toISOString().slice(0, 10))
    }
    setFormError(''); setSellMode(true)
  }
  function openBuyPanel() {
    setBuyShares(''); setBuyTotalPaid(''); setBuyDate(new Date().toISOString().slice(0, 10))
    setFormError(''); setBuyMode(true)
  }
  function openEditFields() {
    setFormError(''); setEditMode(true)
  }

  async function savePosition() {
    const ticker     = form.ticker.trim().toUpperCase()
    const shares     = parseFloat(form.shares)
    const totalPaid  = parseFloat(form.totalPaid)
    if (!ticker || !/^[A-Z0-9.\-]{1,10}$/.test(ticker)) { setFormError('Ticker inválido (ej: AAPL, BRK.B)'); return }
    if (isNaN(shares)    || shares    <= 0) { setFormError('Número de acciones inválido'); return }
    if (isNaN(totalPaid) || totalPaid <= 0) { setFormError('Total pagado inválido'); return }
    const avgCost = totalPaid / shares

    // Tope de billetera: no puedes invertir USD que no aportaste.
    // Solo aplica en compras nuevas y si la billetera está en uso (base > 0).
    if (!editingId && walletAvailable !== null && totalPaid > walletAvailable + 0.01) {
      setFormError(
        `Billetera insuficiente: tienes ${fmtUSD(Math.max(0, walletAvailable))} disponibles y esta compra cuesta ${fmtUSD(totalPaid)}. ` +
        'Registra un aporte en Inversiones → Ahorro → Billetera en dólares, o ajusta el monto.'
      )
      return
    }

    // Bug #3: warn if adding a ticker that already exists (would silently upsert)
    if (!editingId) {
      const duplicate = positions.find(p => p.ticker === ticker)
      if (duplicate) {
        setFormError(`Ya tenés ${ticker} en el portafolio. Abrí esa posición para editarla.`)
        setSaving(false)
        return
      }
    }

    setSaving(true); setFormError('')
    if (editingId) {
      const { error } = await supabase.from('stock_positions')
        .update({ ticker, shares, avg_cost_usd: avgCost, notes: form.notes.trim() || null, updated_at: new Date().toISOString() })
        .eq('id', editingId).eq('user_id', userId)
      setSaving(false)
      if (error) { setFormError('Error al guardar'); return }
      setPositions(prev => prev.map(p => p.id === editingId
        ? { ...p, ticker, shares, avg_cost_usd: avgCost, notes: form.notes.trim() || null }
        : p
      ))
    } else {
      const { data, error } = await supabase.from('stock_positions')
        .upsert({
          user_id: userId, ticker, shares, avg_cost_usd: avgCost, notes: form.notes.trim() || null,
          // Con billetera activa, la compra nueva sale de ella y descuenta del saldo
          wallet_funded:   walletUsdBase > 0,
          wallet_cost_usd: walletUsdBase > 0 ? Math.round(totalPaid * 100) / 100 : 0,
        }, { onConflict: 'user_id,ticker' })
        .select().single()
      setSaving(false)
      if (error) { setFormError('Error al guardar'); return }
      const newPos = data as StockPosition
      setPositions(prev => {
        const idx = prev.findIndex(p => p.ticker === ticker)
        return idx >= 0 ? prev.map(p => p.ticker === ticker ? newPos : p) : [newPos, ...prev]
      })
      fetchQuotes([...positions.map(p => p.ticker), ticker])

      // Registro histórico de la compra — para el timeline de "Movimientos"
      const { data: purchaseRow, error: purchaseErr } = await supabase.from('stock_purchases')
        .insert({
          user_id: userId, ticker, shares, total_paid_usd: totalPaid,
          purchase_date: new Date().toISOString().slice(0, 10),
          notes: form.notes.trim() || null,
        })
        .select().single()
      if (purchaseErr) console.error('[stock_purchases] insert error:', purchaseErr.message)
      if (purchaseRow) setPurchases(prev => [purchaseRow as StockPurchase, ...prev])
    }
    cancelForm()
  }

  async function deletePosition(id: string) {
    setDeletingId(id)
    await supabase.from('stock_positions').delete().eq('id', id).eq('user_id', userId)
    setPositions(prev => prev.filter(p => p.id !== id))
    setDeletingId(null)
    cancelForm()
  }

  /**
   * Vender: los USD recibidos SIEMPRE van a la billetera (usd_purchases,
   * kind='sell') — se haya comprado o no esa posición desde ahí, porque la
   * plata que obtienes al vender es plata real y disponible desde ahora.
   * En paralelo, registra la ganancia/pérdida realizada en stock_sales,
   * enlazada a esa fila de billetera. Soporta venta parcial: si vendes menos
   * que el total, la posición se reduce en vez de cerrarse.
   */
  async function sellPosition(id: string) {
    const pos = positions.find(p => p.id === id)
    if (!pos) return

    const sharesSold = parseFloat(sellShares.replace(',', '.'))
    if (!Number.isFinite(sharesSold) || sharesSold <= 0 || sharesSold > pos.shares + 1e-6) {
      setFormError('Cantidad de acciones a vender inválida'); return
    }
    const proceeds = parseFloat(sellUsd.replace(',', '.'))
    if (!Number.isFinite(proceeds) || proceeds <= 0) { setFormError('¿Cuántos USD recibiste por la venta?'); return }
    if (!sellDate) { setFormError('Elegí la fecha de la venta'); return }

    setDeletingId(id); setFormError('')

    const costBasis   = sharesSold * pos.avg_cost_usd
    const realizedPnl = Math.round((proceeds - costBasis) * 100) / 100
    const isFullSale  = sharesSold >= pos.shares - 1e-6

    const { data: wp, error: wErr } = await supabase.from('usd_purchases').insert({
      user_id:       userId,
      kind:          'sell',
      usd_amount:    Math.round(proceeds * 100) / 100,
      purchase_date: sellDate,
      notes:         `Venta ${pos.ticker}`,
    }).select().single()
    if (wErr) { console.error('[usd_purchases] insert error:', wErr.message); setDeletingId(null); setFormError('No se pudo registrar la venta en la billetera'); return }
    const usdPurchaseId: string | null = wp?.id ?? null

    const { data: saleRow, error: saleErr } = await supabase.from('stock_sales').insert({
      user_id:          userId,
      ticker:           pos.ticker,
      shares_sold:      sharesSold,
      cost_basis_usd:   Math.round(costBasis * 100) / 100,
      proceeds_usd:     Math.round(proceeds * 100) / 100,
      realized_pnl_usd: realizedPnl,
      sale_date:        sellDate,
      notes:            form.notes.trim() || null,
      usd_purchase_id:  usdPurchaseId,
    }).select().single()
    if (saleErr) { console.error('[stock_sales] insert error:', saleErr.message); setDeletingId(null); setFormError('No se pudo registrar la ganancia/pérdida de la venta'); return }
    if (saleRow) setSales(prev => [saleRow as StockSale, ...prev])

    if (isFullSale) {
      await supabase.from('stock_positions').delete().eq('id', id).eq('user_id', userId)
      setPositions(prev => prev.filter(p => p.id !== id))
    } else {
      const remainingShares = Math.round((pos.shares - sharesSold) * 10000) / 10000
      // El costo financiado por billetera se reduce en proporción a lo vendido
      const newWalletCost = Math.round(Number(pos.wallet_cost_usd ?? 0) * (remainingShares / pos.shares) * 100) / 100
      await supabase.from('stock_positions')
        .update({
          shares: remainingShares,
          wallet_cost_usd: newWalletCost, wallet_funded: newWalletCost > 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id).eq('user_id', userId)
      setPositions(prev => prev.map(p => p.id === id
        ? { ...p, shares: remainingShares, wallet_cost_usd: newWalletCost, wallet_funded: newWalletCost > 0 }
        : p))
    }

    setDeletingId(null)
    cancelForm()
  }

  /** Comprar más de un ticker que ya tenés: suma acciones y recalcula el costo promedio ponderado. */
  async function buyMorePosition(id: string) {
    const pos = positions.find(p => p.id === id)
    if (!pos) return

    const addShares = parseFloat(buyShares.replace(',', '.'))
    if (!Number.isFinite(addShares) || addShares <= 0) { setFormError('Número de acciones inválido'); return }
    const addTotal = parseFloat(buyTotalPaid.replace(',', '.'))
    if (!Number.isFinite(addTotal) || addTotal <= 0) { setFormError('Total pagado inválido'); return }
    if (!buyDate) { setFormError('Elegí la fecha de la compra'); return }

    // Mismo tope de billetera que al agregar una posición nueva.
    if (walletAvailable !== null && addTotal > walletAvailable + 0.01) {
      setFormError(
        `Billetera insuficiente: tienes ${fmtUSD(Math.max(0, walletAvailable))} disponibles y esta compra cuesta ${fmtUSD(addTotal)}. ` +
        'Registra un aporte en Inversiones → Ahorro → Billetera en dólares, o ajusta el monto.'
      )
      return
    }

    setSaving(true); setFormError('')
    const newShares  = pos.shares + addShares
    const newAvgCost = (pos.shares * pos.avg_cost_usd + addTotal) / newShares
    // Fix contable: comprar más con billetera activa SUMA al costo financiado
    // aunque la posición original sea legacy — antes esa plata salía de la
    // billetera sin descontar nunca (saldo inflado)
    const newWalletCost = Math.round((Number(pos.wallet_cost_usd ?? 0) + (walletUsdBase > 0 ? addTotal : 0)) * 100) / 100
    const { error } = await supabase.from('stock_positions')
      .update({
        shares: newShares, avg_cost_usd: newAvgCost,
        wallet_cost_usd: newWalletCost, wallet_funded: newWalletCost > 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id).eq('user_id', userId)
    if (error) { setSaving(false); setFormError('Error al guardar'); return }
    setPositions(prev => prev.map(p => p.id === id
      ? { ...p, shares: newShares, avg_cost_usd: newAvgCost, wallet_cost_usd: newWalletCost, wallet_funded: newWalletCost > 0 }
      : p))
    fetchQuotes(positions.map(p => p.ticker))

    // Registro histórico de la compra — para el timeline de "Movimientos"
    const { data: purchaseRow, error: purchaseErr } = await supabase.from('stock_purchases')
      .insert({ user_id: userId, ticker: pos.ticker, shares: addShares, total_paid_usd: addTotal, purchase_date: buyDate })
      .select().single()
    if (purchaseErr) console.error('[stock_purchases] insert error:', purchaseErr.message)
    if (purchaseRow) setPurchases(prev => [purchaseRow as StockPurchase, ...prev])

    setSaving(false)
    cancelForm()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>

      {/* ── Top bar — espacio compacto arriba y abajo ────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-3">
        {/* Estado del mercado — izquierda */}
        <div className="flex items-center gap-2 min-w-0 text-[11px]">
          {lastUpdated && !quotesError && marketOpen !== null && (
            <>
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: marketOpen ? 'var(--mint)' : 'var(--coral)', animation: marketOpen ? 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' : 'none' }}
              />
              {marketOpen ? (
                <span style={{ color: 'var(--mint)' }} className="font-semibold">
                  Precios en vivo · {marketLabel}
                </span>
              ) : (
                <span style={{ color: 'var(--ink-3)' }} className="font-medium">
                  {marketLabel}
                </span>
              )}
            </>
          )}
          {lastUpdated && !quotesError && marketOpen === null && (
            <>
              <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ background: 'var(--mint)' }} />
              <span style={{ color: 'var(--mint)' }} className="font-semibold">Precios actualizados</span>
            </>
          )}
          {quotesError && (
            <div className="flex items-center gap-1.5" style={{ color: 'var(--coral)' }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <button onClick={() => fetchQuotes(positions.map(p => p.ticker))}
                disabled={loadingQ} className="underline underline-offset-2 disabled:opacity-50">
                Reintentar
              </button>
            </div>
          )}
        </div>

        {/* Tabs + Agregar — derecha */}
        <div className="flex items-center gap-2 shrink-0">
          <InversionesToggle active="acciones" showVentas={sales.length > 0} />
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

      {/* ── Add/Edit form — modal popup (fixed, fuera del flujo) ─────────── */}
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
            {/* Handle — mobile */}
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>
                {!editingId
                  ? 'Nueva posición'
                  : buyMode ? 'Comprar más'
                  : sellMode ? 'Vender'
                  : deleteConfirm ? 'Eliminar posición'
                  : editMode ? 'Editar posición'
                  : (positions.find(p => p.id === editingId)?.ticker ?? 'Posición')}
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
            <div className="px-5 py-5 space-y-4">

              {/* ── Panel 0: elegidor — solo al abrir una posición existente ── */}
              {editingId && !buyMode && !sellMode && !deleteConfirm && !editMode && (() => {
                const pos = positions.find(p => p.id === editingId)
                if (!pos) return null
                const q            = quotes[pos.ticker]
                const currentPrice = q?.price ?? null
                const changePct    = q?.changePercent ?? null
                const currentValue = currentPrice !== null ? pos.shares * currentPrice : null
                const costBasis    = pos.shares * pos.avg_cost_usd
                const gainUsd      = currentValue !== null ? currentValue - costBasis : null
                const gainPct      = gainUsd !== null && costBasis > 0 ? (gainUsd / costBasis) * 100 : null

                // Timeline de movimientos: compras registradas + ventas, más antiguo primero.
                // Si nunca se registró una compra individual (posición legacy), se sintetiza
                // una sola "Compra inicial" desde el agregado para no dejar la lista vacía.
                type Movement = { type: 'buy' | 'sell'; date: string; shares: number; pricePerShare: number; amount: number; synthetic?: boolean }
                const purchasesForTicker = purchases.filter(p => p.ticker === pos.ticker)
                const salesForTicker     = sales.filter(s => s.ticker === pos.ticker)
                const movements: Movement[] = [
                  ...(purchasesForTicker.length > 0
                    ? purchasesForTicker.map(p => ({
                        type: 'buy' as const, date: p.purchase_date, shares: Number(p.shares),
                        pricePerShare: Number(p.total_paid_usd) / Number(p.shares), amount: -Number(p.total_paid_usd),
                      }))
                    : [{
                        type: 'buy' as const, date: pos.created_at.slice(0, 10), shares: pos.shares,
                        pricePerShare: pos.avg_cost_usd, amount: -costBasis, synthetic: true,
                      }]),
                  ...salesForTicker.map(s => ({
                    type: 'sell' as const, date: s.sale_date, shares: Number(s.shares_sold),
                    pricePerShare: Number(s.proceeds_usd) / Number(s.shares_sold), amount: Number(s.proceeds_usd),
                  })),
                ].sort((a, b) => a.date.localeCompare(b.date))

                return (
                  <div className="space-y-4">
                    {/* Header: logo + ticker + en vivo + nombre */}
                    <div className="flex items-center gap-3">
                      <ServiceLogo
                        domain={q?.domain ?? TICKER_DOMAIN[pos.ticker] ?? domainFromName(q?.name) ?? null}
                        name={q?.name ?? pos.ticker}
                        size={44}
                        fallbackColor={tickerColor(pos.ticker)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-base font-bold" style={{ color: 'var(--ink)', fontFamily: 'ui-monospace, monospace' }}>
                            {pos.ticker}
                          </p>
                          {marketOpen && (
                            <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                              style={{ background: 'rgba(31,190,141,0.14)', color: 'var(--mint)' }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--mint)' }} />
                              En vivo
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>{q?.name ?? '…'}</p>
                      </div>
                    </div>

                    {/* Valor de tu posición | Precio hoy */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>
                          Valor de tu posición
                        </p>
                        <p className="text-2xl font-bold tabular-nums" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>
                          {currentValue !== null ? fmtUSD(currentValue) : fmtUSD(costBasis)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Precio hoy</p>
                        <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                          {currentPrice !== null ? fmtUSD(currentPrice) : '—'}
                        </p>
                        {changePct !== null && (
                          <p className="flex items-center justify-end gap-0.5 text-[11px] font-semibold" style={{ color: changePct >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                            {changePct >= 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                            {fmtPct(changePct)} hoy
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Banner ganancia total */}
                    {gainUsd !== null && (
                      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: gainUsd >= 0 ? 'rgba(31,190,141,0.10)' : 'rgba(255,111,97,0.10)' }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: gainUsd >= 0 ? 'rgba(31,190,141,0.18)' : 'rgba(255,111,97,0.18)' }}>
                          {gainUsd >= 0
                            ? <TrendingUp className="w-4 h-4" style={{ color: 'var(--mint)' }} />
                            : <TrendingDown className="w-4 h-4" style={{ color: 'var(--coral)' }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Ganancia total</p>
                          {gainPct !== null && (
                            <p className="text-[11px] font-semibold" style={{ color: gainUsd >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                              {fmtPct(gainPct)} de retorno
                            </p>
                          )}
                        </div>
                        <p className="text-base font-bold tabular-nums shrink-0" style={{ color: gainUsd >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                          {fmtUSDSigned(gainUsd)}
                        </p>
                      </div>
                    )}

                    {/* Acciones | Precio compra | Invertido */}
                    <div className="grid grid-cols-3 rounded-2xl overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                      <div className="p-3 text-center border-r" style={{ borderColor: 'var(--border)' }}>
                        <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Acciones</p>
                        <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                          {pos.shares.toLocaleString('es-CL', { maximumFractionDigits: 6 })}
                        </p>
                      </div>
                      <div className="p-3 text-center border-r" style={{ borderColor: 'var(--border)' }}>
                        <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Precio compra</p>
                        <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtUSD(pos.avg_cost_usd)}</p>
                      </div>
                      <div className="p-3 text-center">
                        <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Invertido</p>
                        <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtUSD(costBasis)}</p>
                      </div>
                    </div>

                    {/* Movimientos */}
                    {movements.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Movimientos</p>
                          <p className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                            {movements.length} operación{movements.length !== 1 ? 'es' : ''}
                          </p>
                        </div>
                        <div className="rounded-2xl divide-y overflow-hidden" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                          {movements.map((m, i) => (
                            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                                style={{ background: m.type === 'buy' ? 'rgba(43,124,246,0.14)' : 'rgba(31,190,141,0.14)' }}>
                                {m.type === 'buy'
                                  ? <Plus className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} strokeWidth={2.5} />
                                  : <Minus className="w-3.5 h-3.5" style={{ color: 'var(--mint)' }} strokeWidth={2.5} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>
                                  {m.type === 'buy' ? (m.synthetic ? 'Compra inicial' : 'Compra') : 'Venta'} · {m.shares.toLocaleString('es-CL', { maximumFractionDigits: 6 })} acc.
                                </p>
                                <p className="text-[10px] tabular-nums" style={{ color: 'var(--ink-3)' }}>
                                  {relativeDate(m.date)} · @{fmtUSD(m.pricePerShare)}
                                </p>
                              </div>
                              <p className="text-xs font-bold tabular-nums shrink-0" style={{ color: m.amount >= 0 ? 'var(--mint)' : 'var(--ink-2)' }}>
                                {m.amount >= 0 ? '+' : '-'}{fmtUSD(Math.abs(m.amount))}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Plan de salida — mismo cálculo que el detalle de favoritos */}
                    {(() => {
                      const pa = posAnalyses[pos.ticker]
                      if (!pa || pa === 'error') return null
                      if (pa === 'loading') return (
                        <p className="text-[11px] font-semibold animate-pulse" style={{ color: 'var(--ink-3)' }}>
                          Calculando plan de salida…
                        </p>
                      )
                      const l = pa.rating.label
                      const chipColor = l === 'compra' || l === 'compra_fuerte' ? 'var(--mint)'
                        : l === 'venta' || l === 'venta_fuerte' ? 'var(--coral)'
                        : pa.rating.caution ? 'var(--gold)' : 'var(--ink-3)'
                      return (
                        <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--surface-2)', borderLeft: '3px solid var(--gold)' }}>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Plan de salida</p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--surface)', color: chipColor }}>
                              {pa.rating.caution && (l !== 'venta' && l !== 'venta_fuerte') ? 'Toma de ganancias' : pa.rating.action}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            {pa.sell.map((t, i) => (
                              <p key={i} className="text-sm font-bold tabular-nums leading-snug" style={{ color: 'var(--ink)' }}>
                                <span className="font-extrabold" style={{ color: t.now ? 'var(--gold)' : 'var(--ink-3)' }}>{t.pct}%</span>
                                {' '}{t.cond}
                              </p>
                            ))}
                          </div>
                          <p className="text-[11px] leading-relaxed mt-1.5" style={{ color: 'var(--ink-2)' }}>{pa.sellPlan}</p>
                          {/* Guard intradía: los precios del plan son del cierre anterior */}
                          {(() => {
                            const live = quotes[pos.ticker]?.price
                            if (!live) return null
                            const dev = ((live - pa.price) / pa.price) * 100
                            if (Math.abs(dev) < 3) return null
                            return (
                              <p className="text-[10px] font-bold mt-1.5" style={{ color: 'var(--coral)' }}>
                                Ojo: hoy se mueve fuerte ({dev > 0 ? '+' : ''}{dev.toFixed(1)}% vs el cierre analizado) — los precios del plan pueden estar viejos; se recalcula al próximo cierre.
                              </p>
                            )
                          })()}
                        </div>
                      )
                    })()}

                    {/* Comprar / Vender */}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={openBuyPanel}
                        className="flex items-center justify-center gap-1.5 py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[.98]"
                        style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
                      >
                        <Plus className="w-4 h-4" strokeWidth={2.5} />
                        Comprar más
                      </button>
                      <button
                        onClick={openSellPanel}
                        className="flex items-center justify-center gap-1.5 py-3.5 rounded-2xl font-bold text-sm border transition-all active:scale-[.98]"
                        style={{ background: 'transparent', color: 'var(--mint)', borderColor: 'rgba(31,190,141,0.4)' }}
                      >
                        <DollarSign className="w-4 h-4" />
                        Vender
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button onClick={cancelForm} className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
                        Cerrar
                      </button>
                      <button onClick={openEditFields} className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
                        <Pencil className="w-3 h-3" />
                        Editar posición
                      </button>
                    </div>
                  </div>
                )
              })()}

              {/* ── Panel 1: crear posición nueva, o editar campos crudos (corregir un error) ── */}
              {(!editingId || editMode) && !buyMode && !sellMode && !deleteConfirm && (
                <>
                  {editingId && (
                    <button
                      onClick={() => setEditMode(false)}
                      className="flex items-center gap-1 text-xs font-semibold -mt-1"
                      style={{ color: 'var(--ink-3)' }}
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Volver
                    </button>
                  )}

                  {/* Ticker */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                      Ticker
                    </label>
                    <input
                      type="text"
                      value={form.ticker}
                      onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                      placeholder="AAPL"
                      maxLength={10}
                      className="w-full text-sm font-bold border px-4 py-3"
                      style={{ ...inputBase, fontFamily: 'ui-monospace, monospace', fontSize: 15 }}
                      onFocus={focusOn} onBlur={focusOff}
                    />
                  </div>

                  {/* N° acciones + Total pagado */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                        N° acciones
                      </label>
                      <input
                        type="number"
                        value={form.shares}
                        onChange={e => setForm(f => ({ ...f, shares: e.target.value }))}
                        placeholder="10"
                        min="0.0001"
                        step="any"
                        className="w-full text-sm border px-4 py-3"
                        style={inputBase}
                        onFocus={focusOn} onBlur={focusOff}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                        Total pagado (USD)
                      </label>
                      <input
                        type="number"
                        value={form.totalPaid}
                        onChange={e => setForm(f => ({ ...f, totalPaid: e.target.value }))}
                        placeholder="896.99"
                        min="0.01"
                        step="0.01"
                        className="w-full text-sm border px-4 py-3"
                        style={inputBase}
                        onFocus={focusOn} onBlur={focusOff}
                      />
                    </div>
                  </div>

                  {/* Precio por acción — cálculo automático */}
                  {form.shares && form.totalPaid && parseFloat(form.shares) > 0 && parseFloat(form.totalPaid) > 0 && (
                    <div className="px-4 py-2.5 rounded-xl flex items-center gap-2" style={{ background: 'var(--surface-2)' }}>
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>Precio por acción</span>
                      <span className="text-sm font-bold tabular-nums ml-auto" style={{ color: 'var(--ink)', fontFamily: 'ui-monospace, monospace' }}>
                        {fmtUSD(parseFloat(form.totalPaid) / parseFloat(form.shares))}
                      </span>
                    </div>
                  )}

                  {/* Nota */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                      Nota (opcional)
                    </label>
                    <input
                      type="text"
                      value={form.notes}
                      onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="ej: compra inicial"
                      maxLength={80}
                      className="w-full text-sm border px-4 py-3"
                      style={inputBase}
                      onFocus={focusOn} onBlur={focusOff}
                    />
                  </div>

                  {formError && (
                    <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{formError}</p>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => editingId ? setEditMode(false) : cancelForm()}
                      className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                      style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={savePosition}
                      disabled={saving}
                      className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-2xl transition-all disabled:opacity-50 active:scale-[.98]"
                      style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
                    >
                      <Check className="w-4 h-4" />
                      {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>

                  {/* Eliminar — el camino raro, para corregir un registro por error */}
                  {editingId && (
                    <button
                      onClick={() => { setFormError(''); setDeleteConfirm(true) }}
                      className="w-full text-center text-[11px] font-semibold pt-1"
                      style={{ color: 'var(--ink-3)' }}
                    >
                      Eliminar sin registrar venta
                    </button>
                  )}
                </>
              )}

              {/* ── Panel Comprar: agregar acciones a una posición existente ── */}
              {buyMode && editingId && (() => {
                const pos          = positions.find(p => p.id === editingId)
                const addShares    = parseFloat(buyShares.replace(',', '.'))
                const validShares  = Number.isFinite(addShares) && addShares > 0
                const addTotal     = parseFloat(buyTotalPaid.replace(',', '.'))
                const validTotal   = Number.isFinite(addTotal) && addTotal > 0
                const newShares    = pos && validShares ? pos.shares + addShares : null
                const newAvgCost   = pos && newShares && validTotal
                  ? (pos.shares * pos.avg_cost_usd + addTotal) / newShares
                  : null

                return (
                  <div className="space-y-4">
                    <button
                      onClick={() => setBuyMode(false)}
                      className="flex items-center gap-1 text-xs font-semibold"
                      style={{ color: 'var(--ink-3)' }}
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Volver
                    </button>

                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(43,124,246,0.10)' }}>
                        <Plus className="w-4 h-4" style={{ color: 'var(--primary)' }} strokeWidth={2.5} />
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Comprar más {pos?.ticker}</p>
                        <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Suma a tu posición actual</p>
                      </div>
                    </div>

                    <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(43,124,246,0.06)', border: '1px solid rgba(43,124,246,0.2)' }}>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                            N° acciones
                          </label>
                          <input
                            type="number"
                            value={buyShares}
                            onChange={e => setBuyShares(e.target.value)}
                            placeholder="5"
                            min="0.0001"
                            step="any"
                            className="w-full text-sm border px-3 py-2.5 rounded-xl outline-none"
                            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                            Fecha
                          </label>
                          <input
                            type="date"
                            value={buyDate}
                            onChange={e => setBuyDate(e.target.value)}
                            max={new Date().toISOString().slice(0, 10)}
                            className="w-full text-sm border px-3 py-2.5 rounded-xl outline-none"
                            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                          Total pagado (USD)
                        </label>
                        <input
                          type="number"
                          value={buyTotalPaid}
                          onChange={e => setBuyTotalPaid(e.target.value)}
                          placeholder="450.00"
                          min="0.01"
                          step="0.01"
                          className="w-full text-sm border px-4 py-2.5 rounded-xl outline-none"
                          style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                        />
                      </div>
                    </div>

                    {newShares !== null && newAvgCost !== null && (
                      <div className="rounded-2xl p-3 space-y-1.5" style={{ background: 'var(--surface-2)' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Acciones totales</span>
                          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                            {newShares.toLocaleString('es-CL', { maximumFractionDigits: 6 })}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Nuevo costo promedio</span>
                          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                            {fmtUSD(newAvgCost)}
                          </span>
                        </div>
                      </div>
                    )}

                    {formError && (
                      <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{formError}</p>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => setBuyMode(false)}
                        className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                        style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => buyMorePosition(editingId)}
                        disabled={saving || !validShares || !validTotal}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold rounded-2xl disabled:opacity-50 transition-all active:scale-[.98]"
                        style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
                      >
                        {saving ? 'Guardando…' : 'Confirmar compra'}
                      </button>
                    </div>
                  </div>
                )
              })()}

              {/* ── Panel 2: vender (registra ganancia/pérdida, soporta venta parcial) ── */}
              {sellMode && editingId && (() => {
                const pos          = positions.find(p => p.id === editingId)
                const maxShares    = pos?.shares ?? 0
                const sharesNum    = parseFloat(sellShares.replace(',', '.'))
                // Tolerancia más generosa que antes (1e-6 → 1e-4): "Todas" precarga
                // el valor completo de pos.shares como texto, y un redondeo de ida
                // y vuelta por el input (o un pos.shares con más decimales de los
                // que se ven) podía dejar sharesNum una pizca por encima de maxShares
                // y bloquear el botón sin ningún error visible.
                const validShares  = Number.isFinite(sharesNum) && sharesNum > 0 && sharesNum <= maxShares + 1e-4
                const proceedsNum  = parseFloat(sellUsd.replace(',', '.'))
                const validProceeds= Number.isFinite(proceedsNum) && proceedsNum > 0
                const costBasis    = pos && validShares ? sharesNum * pos.avg_cost_usd : null
                const pnl          = costBasis !== null && validProceeds ? proceedsNum - costBasis : null
                const pnlPct       = pnl !== null && costBasis && costBasis > 0 ? (pnl / costBasis) * 100 : null
                const isPartial    = validShares && sharesNum < maxShares - 1e-6

                return (
                  <div className="space-y-4">
                    <button
                      onClick={() => setSellMode(false)}
                      className="flex items-center gap-1 text-xs font-semibold"
                      style={{ color: 'var(--ink-3)' }}
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Volver
                    </button>

                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(31,190,141,0.12)' }}>
                        <DollarSign className="w-4 h-4" style={{ color: 'var(--mint)' }} />
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Vender {pos?.ticker}</p>
                        <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>Registra cuánto ganaste o perdiste</p>
                      </div>
                    </div>

                    <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(31,190,141,0.06)', border: '1px solid rgba(31,190,141,0.2)' }}>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>
                              Acciones
                            </label>
                            {pos && (
                              <button
                                onClick={() => {
                                  const q = quotes[pos.ticker]
                                  const p = parseFloat(sellPrice.replace(',', '.'))
                                  const priceToUse = Number.isFinite(p) && p > 0 ? p : (q?.price ?? pos.avg_cost_usd)
                                  setSellShares(String(Number(pos.shares.toFixed(6))))
                                  setSellUsd((priceToUse * pos.shares).toFixed(2))
                                }}
                                className="text-[10px] font-bold"
                                style={{ color: 'var(--primary)' }}
                              >
                                Todas
                              </button>
                            )}
                          </div>
                          <input
                            type="number"
                            value={sellShares}
                            onChange={e => {
                              const val = e.target.value
                              setSellShares(val)
                              const n = parseFloat(val)
                              const p = parseFloat(sellPrice.replace(',', '.'))
                              if (Number.isFinite(n) && n > 0 && Number.isFinite(p) && p > 0) {
                                setSellUsd((p * n).toFixed(2))
                              }
                            }}
                            max={maxShares}
                            min="0.0001"
                            step="any"
                            className="w-full text-sm border px-3 py-2.5 rounded-xl outline-none"
                            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                            Fecha
                          </label>
                          <input
                            type="date"
                            value={sellDate}
                            onChange={e => setSellDate(e.target.value)}
                            max={new Date().toISOString().slice(0, 10)}
                            className="w-full text-sm border px-3 py-2.5 rounded-xl outline-none"
                            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                            Precio de venta (USD/acc.)
                          </label>
                          <input
                            type="number"
                            value={sellPrice}
                            onChange={e => {
                              const val = e.target.value
                              setSellPrice(val)
                              const p = parseFloat(val.replace(',', '.'))
                              if (Number.isFinite(p) && p > 0 && Number.isFinite(sharesNum) && sharesNum > 0) {
                                setSellUsd((p * sharesNum).toFixed(2))
                              }
                            }}
                            placeholder="Precio al que vendiste"
                            min="0.01"
                            step="any"
                            className="w-full text-sm border px-3 py-2.5 rounded-xl outline-none"
                            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                            Total recibido
                          </label>
                          <input
                            type="number"
                            value={sellUsd}
                            onChange={e => {
                              const val = e.target.value
                              setSellUsd(val)
                              const u = parseFloat(val.replace(',', '.'))
                              if (Number.isFinite(u) && u > 0 && Number.isFinite(sharesNum) && sharesNum > 0) {
                                setSellPrice((u / sharesNum).toFixed(2))
                              }
                            }}
                            min="0.01"
                            step="0.01"
                            className="w-full text-sm border px-3 py-2.5 rounded-xl outline-none"
                            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }}
                          />
                        </div>
                      </div>
                      <p className="text-[10px]" style={{ color: 'var(--ink-3)' }}>El total recibido vuelve a tu billetera en dólares</p>
                    </div>

                    {pnl !== null && (
                      <div
                        className="flex items-center justify-between px-4 py-3 rounded-2xl"
                        style={{ background: pnl >= 0 ? 'rgba(31,190,141,0.1)' : 'rgba(255,111,97,0.1)' }}
                      >
                        <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
                          Ganancia/pérdida
                        </span>
                        <span className="text-sm font-bold tabular-nums" style={{ color: pnl >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                          {fmtUSDSigned(pnl)}{pnlPct !== null && ` (${fmtPct(pnlPct)})`}
                        </span>
                      </div>
                    )}

                    {formError && (
                      <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{formError}</p>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => setSellMode(false)}
                        className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                        style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => sellPosition(editingId)}
                        disabled={!!deletingId || !validShares || !validProceeds}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold rounded-2xl disabled:opacity-50 transition-all active:scale-[.98]"
                        style={{ background: 'var(--mint)', color: 'white' }}
                      >
                        {deletingId ? 'Registrando…' : isPartial ? 'Confirmar venta parcial' : 'Confirmar venta'}
                      </button>
                    </div>
                  </div>
                )
              })()}

              {/* ── Panel 3: eliminar sin registrar venta ── */}
              {deleteConfirm && editingId && (
                <div className="space-y-4">
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    className="flex items-center gap-1 text-xs font-semibold"
                    style={{ color: 'var(--ink-3)' }}
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Volver
                  </button>

                  <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(255,111,97,0.08)', border: '1px solid rgba(255,111,97,0.25)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                      ¿Eliminar esta posición sin registrar una venta? No va a quedar ningún rastro de cuánto ganaste o perdiste.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setDeleteConfirm(false)}
                      className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                      style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => deletePosition(editingId)}
                      disabled={!!deletingId}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold rounded-2xl disabled:opacity-50 transition-all active:scale-[.98]"
                      style={{ background: 'var(--coral)', color: 'white' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {deletingId ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Contenido principal ────────────────────────────────────────── */}
      <div className="space-y-4">

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {positions.length === 0 && !showForm && (
        <div className="card flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--primary-soft)' }}>
            <TrendingUp className="w-7 h-7" style={{ color: 'var(--primary)' }} />
          </div>
          <p className="text-base font-bold mb-1" style={{ color: 'var(--ink)' }}>Sin posiciones</p>
          <p className="text-sm mb-5" style={{ color: 'var(--ink-3)' }}>Agregá tus acciones para hacer seguimiento de tu portfolio.</p>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}>
            <Plus className="w-4 h-4" /> Agregar primera acción
          </button>
        </div>
      )}

      {/* ── Hero card + 3 KPIs (lado a lado en desktop) ─────────────────── */}
      {positions.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-4 lg:items-stretch">

          {/* ── Hero card ── */}
          <div className="card overflow-hidden hero-gradient w-full lg:min-w-0" style={{ flex: '40 1 0' }}>
            {/* Valor */}
            <div className="px-5 pt-5 lg:px-6 lg:pt-6 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                Valor del portafolio
              </p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-4xl lg:text-5xl font-bold tabular-nums leading-none" style={{ fontFamily: 'Fredoka, sans-serif', color: 'white' }}>
                  {hasQ ? fmtUSD(totalValueUsd) : fmtUSD(totalCostUsd)}
                </p>
                <span className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>USD</span>
              </div>
              {/* Sin línea de billetera acá: el disponible ya vive en su propia
                  card KPI al lado — repetirlo era doble información */}
            </div>

            {/* Divider + 4 sub-KPIs: la ganancia realizada (ventas) es parte del resultado real */}
            <div className="border-t grid grid-cols-4" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
              {/* Invertido */}
              <div className="px-4 py-3 lg:px-5 lg:py-4">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Invertido</p>
                <p className="text-base lg:text-lg font-bold tabular-nums" style={{ color: 'white' }}>
                  {fmtUSD(totalCostUsd)}
                </p>
              </div>
              {/* Ganancia abierta (posiciones vivas) */}
              <div className="px-4 py-3 lg:px-5 lg:py-4 border-l" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>G. abierta</p>
                <p className="text-base lg:text-lg font-bold tabular-nums" style={{ color: hasQ ? (totalGainUsd >= 0 ? '#1FBE8D' : '#FF6F61') : 'rgba(255,255,255,0.5)' }}>
                  {hasQ ? fmtUSDSigned(totalGainUsd) : '—'}
                </p>
              </div>
              {/* Realizada (ventas cerradas) */}
              <div className="px-4 py-3 lg:px-5 lg:py-4 border-l" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Realizada</p>
                <p className="text-base lg:text-lg font-bold tabular-nums" style={{ color: sales.length > 0 ? (realizedPnlUsd >= 0 ? '#1FBE8D' : '#FF6F61') : 'rgba(255,255,255,0.5)' }}>
                  {sales.length > 0 ? fmtUSDSigned(realizedPnlUsd) : '—'}
                </p>
              </div>
              {/* Retorno */}
              <div className="px-4 py-3 lg:px-5 lg:py-4 border-l" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Retorno</p>
                <p className="text-base lg:text-lg font-bold tabular-nums" style={{ color: hasQ ? (totalGainPct >= 0 ? '#1FBE8D' : '#FF6F61') : 'rgba(255,255,255,0.5)' }}>
                  {hasQ ? fmtPct(totalGainPct) : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* ── 3 KPI cards horizontales ── */}
          <div className="grid grid-cols-3 gap-2 lg:gap-3 w-full lg:min-w-0" style={{ flex: '60 1 0', alignContent: 'stretch' }}>

            {/* Billetera disponible — card completa clickeable hacia la Billetera */}
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
                  <p className="text-[10px] lg:text-xs font-semibold mt-1.5" style={{ color: 'var(--primary)' }}>
                    Registra tus aportes →
                  </p>
                </>
              )}
            </a>

            {/* Posiciones */}
            <div className="card p-3 lg:p-5 min-w-0">
              <p className="text-[9px] lg:text-[10px] font-bold uppercase tracking-widest mb-2 whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>Posiciones</p>
              <p className="text-xl sm:text-2xl lg:text-4xl font-extrabold leading-none" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>
                {positions.length}
              </p>
              {hasQ && (posUp > 0 || posDown > 0) && (
                <div className="flex items-center gap-2 mt-1.5 text-[10px] lg:text-xs font-semibold">
                  {posUp   > 0 && <span style={{ color: 'var(--mint)' }}>{posUp}↑</span>}
                  {posDown > 0 && <span style={{ color: 'var(--coral)' }}>{posDown}↓</span>}
                </div>
              )}
            </div>

            {/* Mejor retorno — cede su lugar al riesgo cercano cuando lo hay:
                "MU a 1.2% de su alarma" decide más que un dato de vanidad.
                Card clickeable: abre directo el popup de esa posición. */}
            <button
              onClick={() => {
                const t = alarmClose && nearestAlarm ? nearestAlarm.ticker : bestPos?.ticker
                const pos = t ? positions.find(p => p.ticker === t) : undefined
                if (pos) openEdit(pos)
              }}
              className="card p-3 lg:p-5 min-w-0 text-left transition-colors hover:bg-[var(--surface-2)]"
            >
              <p className="text-[9px] lg:text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: alarmClose ? 'var(--gold)' : 'var(--ink-3)' }}>
                {alarmClose ? 'Cerca de alarma' : bestPos && bestPos.pct < 0 ? 'Menor pérdida' : 'Mejor retorno'}
              </p>
              {alarmClose && nearestAlarm ? (
                <>
                  <p className="text-xl sm:text-2xl lg:text-4xl font-extrabold leading-none" style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--ink)' }}>
                    {nearestAlarm.ticker}
                  </p>
                  <p className="text-[10px] lg:text-xs font-semibold mt-1.5 tabular-nums" style={{ color: 'var(--gold)' }}>
                    a {nearestAlarm.distPct.toFixed(1)}% de su salida ({fmtUSD(nearestAlarm.alarm)})
                  </p>
                </>
              ) : bestPos ? (
                <>
                  <p className="text-xl sm:text-2xl lg:text-4xl font-extrabold leading-none" style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--ink)' }}>
                    {bestPos.ticker}
                  </p>
                  <div className="flex items-center gap-1 mt-1.5">
                    {bestPos.pct >= 0
                      ? <ArrowUp className="w-3 h-3" style={{ color: 'var(--mint)' }} />
                      : <ArrowDown className="w-3 h-3" style={{ color: 'var(--coral)' }} />}
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

      {/* ── Mis posiciones table ─────────────────────────────────────────── */}
      {positions.length > 0 && (
        <div className="card overflow-hidden">

          {/* Table header bar */}
          <div className="flex items-center justify-end px-4 lg:px-6 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            {/* ⊙ cierre · hace Xs */}
            <p className="text-[10px] flex items-center gap-1.5" style={{ color: 'var(--ink-3)' }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: lastUpdated ? 'var(--mint)' : 'var(--ink-3)' }} />
              cierre ·{' '}
              {lastUpdated
                ? `hace ${Math.round((Date.now() - lastUpdated.getTime()) / 1000)}s`
                : 'sin datos'}
            </p>
          </div>

          {/* Column headers (desktop only) */}
          <div
            className="hidden lg:grid px-6 py-2 text-[10px] font-bold uppercase tracking-widest border-b"
            style={{ gridTemplateColumns: '2fr 0.9fr 1fr 1fr 1fr 1.1fr 40px', color: 'var(--ink-3)', borderColor: 'var(--border)' }}
          >
            <span>Empresa</span>
            <span className="text-right">Cant.</span>
            <span className="text-right">Precio hoy</span>
            <span className="text-right">Valor</span>
            <span className="text-right">Invertido</span>
            <span className="text-right">Retorno</span>
            <span></span>
          </div>

          {/* Rows — ordenadas por dinero invertido (mayor primero) */}
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {[...positions].sort((a, b) => b.shares * b.avg_cost_usd - a.shares * a.avg_cost_usd).map(pos => {
              const q            = quotes[pos.ticker]
              const currentPrice = q?.price ?? null
              const changePct    = q?.changePercent ?? null
              const currentValue = currentPrice !== null ? pos.shares * currentPrice : null
              const costBasis    = pos.shares * pos.avg_cost_usd
              const gainUsd      = currentValue !== null ? currentValue - costBasis : null
              const gainPct      = gainUsd !== null && costBasis > 0 ? (gainUsd / costBasis) * 100 : null
              const isUp         = gainUsd !== null && gainUsd >= 0
              const todayUp      = changePct !== null && changePct >= 0
              const logoName     = q?.name ?? pos.ticker
              const logoDomain   = q?.domain
                ?? TICKER_DOMAIN[pos.ticker]
                ?? domainFromName(q?.name)
                ?? null
              const avatarBg     = tickerColor(pos.ticker)
              const initials     = pos.ticker.slice(0, 2)

              return (
                <button
                  key={pos.id}
                  onClick={() => openEdit(pos)}
                  className="w-full text-left group px-4 lg:px-6 py-3 hover:bg-[var(--surface-2)] transition-colors active:opacity-80"
                  style={(() => {
                    // Fila resaltada cuando el plan de salida pide acción hoy
                    const f = exitFlagOf(posAnalyses[pos.ticker])
                    return f ? {
                      borderLeft: `3px solid ${f.color}`,
                      background: f.text === 'Vender' ? 'rgba(255,111,97,0.05)' : 'rgba(255,194,60,0.05)',
                    } : undefined
                  })()}
                >

                  {/* Desktop row — Empresa | Cant. | Precio hoy | Valor | Invertido | Retorno | chevron */}
                  <div className="hidden lg:grid items-center" style={{ gridTemplateColumns: '2fr 0.9fr 1fr 1fr 1fr 1.1fr 40px' }}>

                    {/* Empresa: logo + ticker + name */}
                    <div className="flex items-center gap-3">
                      <ServiceLogo
                        domain={logoDomain}
                        name={logoName}
                        size={36}
                        fallbackColor={avatarBg}
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold" style={{ color: 'var(--ink)', fontFamily: 'ui-monospace, monospace' }}>
                            {pos.ticker}
                          </p>
                          {(() => {
                            const f = exitFlagOf(posAnalyses[pos.ticker])
                            return f && (
                              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                                style={{ background: f.bg, color: f.color }}>
                                {f.text}
                              </span>
                            )
                          })()}
                        </div>
                        <p className="text-[11px] truncate max-w-[140px]" style={{ color: 'var(--ink-3)' }}>
                          {q?.name ?? '…'}
                        </p>
                      </div>
                    </div>

                    {/* Cant. */}
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                        {pos.shares.toLocaleString('es-CL', { maximumFractionDigits: 6 })}
                      </p>
                    </div>

                    {/* Precio hoy + distancia a la alarma de salida */}
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                        {currentPrice !== null ? fmtUSD(currentPrice) : (loadingQ ? '…' : '—')}
                      </p>
                      {changePct !== null && (
                        <p className="text-[10px] font-semibold tabular-nums" style={{ color: todayUp ? 'var(--mint)' : 'var(--coral)' }}>
                          {fmtPct(changePct)}
                        </p>
                      )}
                      {(() => {
                        const pa = posAnalyses[pos.ticker]
                        if (typeof pa !== 'object' || pa.alarm === null || currentPrice === null) return null
                        const d = ((currentPrice - pa.alarm) / pa.alarm) * 100
                        if (d < 0) return (
                          <p className="text-[9px] font-bold tabular-nums" style={{ color: 'var(--coral)' }}>
                            bajo la alarma {fmtUSD(pa.alarm)}
                          </p>
                        )
                        return (
                          <p className="text-[9px] font-semibold tabular-nums" style={{ color: d <= 3 ? 'var(--gold)' : 'var(--ink-3)' }}>
                            alarma {fmtUSD(pa.alarm)}{d <= 3 ? ` · a ${d.toFixed(1)}%` : ''}
                          </p>
                        )
                      })()}
                    </div>

                    {/* Valor */}
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                        {currentValue !== null ? fmtUSD(currentValue) : '—'}
                      </p>
                    </div>

                    {/* Invertido */}
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>
                        {fmtUSD(costBasis)}
                      </p>
                      <p className="text-[10px] tabular-nums" style={{ color: 'var(--ink-3)' }}>@{fmtUSD(pos.avg_cost_usd)}</p>
                    </div>

                    {/* Retorno */}
                    <div className="text-right">
                      {gainUsd !== null ? (
                        <>
                          <p className="text-sm font-bold tabular-nums" style={{ color: isUp ? 'var(--mint)' : 'var(--coral)' }}>
                            {fmtUSDSigned(gainUsd)}
                          </p>
                          {gainPct !== null && (
                            <div className="flex items-center justify-end gap-0.5 text-[10px] font-semibold"
                              style={{ color: isUp ? 'var(--mint)' : 'var(--coral)' }}>
                              {isUp ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                              {fmtPct(gainPct, false)}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-sm" style={{ color: 'var(--ink-3)' }}>—</span>
                      )}
                    </div>

                    {/* Chevron */}
                    <div className="flex items-center justify-end">
                      <ChevronRight
                        className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                        style={{ color: 'var(--ink-3)' }}
                      />
                    </div>
                  </div>

                  {/* Mobile row */}
                  <div className="lg:hidden flex items-center gap-3">
                    <ServiceLogo
                      domain={logoDomain}
                      name={logoName}
                      size={36}
                      fallbackColor={avatarBg}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: 'var(--ink)', fontFamily: 'ui-monospace, monospace' }}>{pos.ticker}</span>
                        {(() => {
                          const f = exitFlagOf(posAnalyses[pos.ticker])
                          return f ? (
                            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                              style={{ background: f.bg, color: f.color }}>
                              {f.text}
                            </span>
                          ) : changePct !== null && (
                            <span className="text-[10px] font-semibold" style={{ color: todayUp ? 'var(--mint)' : 'var(--coral)' }}>
                              {fmtPct(changePct)} hoy
                            </span>
                          )
                        })()}
                      </div>
                      <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                        {pos.shares.toLocaleString('es-CL', { maximumFractionDigits: 6 })} acc. · {currentPrice !== null ? fmtUSD(currentPrice) : '—'}
                      </p>
                    </div>
                    <div className="text-right shrink-0 min-w-[72px]">
                      {gainUsd !== null ? (
                        <>
                          <p className="text-sm font-bold tabular-nums" style={{ color: isUp ? 'var(--mint)' : 'var(--coral)' }}>
                            {fmtUSDSigned(gainUsd)}
                          </p>
                          {gainPct !== null && (
                            <p className="text-[10px] font-semibold" style={{ color: isUp ? 'var(--mint)' : 'var(--coral)' }}>
                              {fmtPct(gainPct, false)}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>{fmtUSD(costBasis)}</p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--ink-3)' }} />
                  </div>

                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-4 lg:px-6 py-2.5 border-t flex items-center justify-between text-[10px]" style={{ borderColor: 'var(--border)', color: 'var(--ink-3)' }}>
            <span>Fuente: Finnhub · precios en USD</span>
          </div>
        </div>
      )}

      {/* El teaser "Alertas de precio · próximamente" se eliminó: la función ya
          existe de verdad como precio objetivo en Favoritos (con aviso por correo) */}

      </div> {/* end space-y-4 */}
    </div>
  )
}
