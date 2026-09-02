'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useBackdropClose } from '@/components/useBackdropClose'
import { createClient } from '@/lib/supabase/client'
import { formatCLP, monthName } from '@/lib/utils'
import { Plus, Trash2, X, RefreshCw, ArrowUp, ArrowDown, DollarSign, Info, ChevronRight, Undo2 } from 'lucide-react'
import InversionesToggle from '@/components/InversionesToggle'
import type { StockPurchase, StockSale } from '@/app/(dashboard)/inversiones/page'

// ── Billetera en dólares (Racional u otra) ────────────────────────────────────
// Modelo CLP-first en la entrada, USD-first en la vida posterior:
//   - El aporte se registra en pesos: "pagué X CLP y recibí N USD" — la
//     comisión/spread queda absorbida en la tasa implícita (X/N), igual que
//     el total pagado en acciones.
//   - Después del aporte la plata vive en dólares: el saldo y el rendimiento
//     se muestran en USD (las acciones ya rinden en USD en Acciones). La
//     conversión a CLP es un dato chico — es raro que ese dinero vuelva a Chile.
//   - Al patrimonio global sí entra en CLP (categoría "Dólares"), porque el
//     total necesita una sola moneda.

export interface UsdPurchase {
  id:             string
  usd_amount:     number
  total_paid_clp: number | null   // null en ventas (nunca pasaron por CLP)
  purchase_date:  string          // YYYY-MM-DD
  notes:          string | null
  kind:           'deposit' | 'sell'
}

interface Props {
  userId:           string
  initialPurchases: UsdPurchase[]
  investedUsd:      number   // Σ costo de posiciones abiertas — se descuenta del saldo
  stockPurchases?:  StockPurchase[]   // compras de acciones — para la cartola unificada
  sales?:           StockSale[]      // ventas — para el detalle (ticker, costo base, ganancia) en cada fila
}

interface FormState { date: string; clp: string; usd: string; notes: string; shares: string }

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
// Cas (ago 2026): quiere poder dejar registrado un aporte planificado a
// futuro (ej. "el 15 voy a mandar plata a la billetera") sin tener que
// volver ese día — antes el date picker topaba en hoy. Un año de margen es
// suficiente para planificar sin abrir la puerta a fechas absurdas.
function maxFutureStr(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}
const emptyForm = (): FormState => ({ date: todayStr(), clp: '', usd: '', notes: '', shares: '' })

function fmtUSD(n: number): string {
  return 'US$' + n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${day} ${MES[m - 1]} ${String(y).slice(2)}`
}
function fmtInputCLP(digits: string): string {
  return digits ? Number(digits).toLocaleString('es-CL') : ''
}
function fmtUSDSigned(n: number): string {
  return (n >= 0 ? '+US$' : '-US$') + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(n: number): string {
  const s = Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return n >= 0 ? `+${s}%` : `-${s}%`
}

export default function UsdWalletManager({ userId, initialPurchases, investedUsd, stockPurchases = [], sales = [] }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [purchases, setPurchases] = useState<UsdPurchase[]>(initialPurchases)
  const [showForm,  setShowForm]  = useState(false)
  const [editId,    setEditId]    = useState<string | null>(null)
  // ago 2026 (Cas: "quiero poder editar desde la misma billetera, además
  // editar la fecha"): antes solo los aportes eran editables — las ventas
  // solo se podían eliminar. Ahora también se puede editar la fecha (y nota)
  // de una venta, pero NO el monto/ganancia: esos números están atados a la
  // fila de stock_sales que registró la venta real, y desacoplarlos del
  // monto rompería el costo base de la posición. `editSaleId` guarda esa
  // fila enlazada para mantener sale_date sincronizada en las dos tablas —
  // sin esto, la fecha quedaría distinta en Ventas/benchmark vs. la billetera.
  // ago 2026 (Cas, ronda 2 — "quiero poder editar aca y que se refleje" sobre
  // una fila de Compra): antes las compras de acciones eran de solo lectura
  // acá ("se gestiona desde Acciones"). Ahora también se puede editar monto
  // invertido, acciones y fecha de una compra — el ticker queda fijo (cambiar
  // de ticker movería la fila a otra posición, fuera de alcance). Al guardar
  // se recalcula stock_positions (costo promedio, acciones, wallet_cost_usd)
  // con la misma lógica que "comprar más" en TransactionModal, y se resetea
  // trail_stop_usd para que el cron lo recalcule. Eliminar una compra sigue
  // sin estar acá — borrar una fila individual podría dejar la posición con
  // acciones/costo inconsistentes; eso se sigue gestionando desde Acciones.
  const [editKind,  setEditKind]  = useState<'deposit' | 'sell' | 'compra'>('deposit')
  const [editSaleId, setEditSaleId] = useState<string | null>(null)
  const [editTicker, setEditTicker] = useState<string | null>(null)
  const [stockPurchasesState, setStockPurchasesState] = useState<StockPurchase[]>(stockPurchases)
  const [form,      setForm]      = useState<FormState>(emptyForm())
  const [formError, setFormError] = useState('')
  const [busy,      setBusy]      = useState(false)
  const [fx,        setFx]        = useState<number | null>(null)
  // Hook llamado siempre — el modal es condicional (`{showForm && ...}`) más
  // abajo, pero el hook no puede serlo sin romper el orden de hooks (bug
  // real: crasheaba al abrir el modal, reportado por Cas).
  const backdropClose = useBackdropClose(() => setShowForm(false))

  // Detalle al tocar una fila (ago 2026, a pedido de Cas — mismo patrón que
  // el detalle de acciones en Radar.tsx: tocar la fila abre una tarjeta con
  // el detalle completo del movimiento, con "Editar" y "Eliminar" ahí en vez
  // de íconos sueltos en la fila). Aplica a las 3 filas de la cartola: aporte,
  // venta y compra — las compras de acciones son de solo lectura acá (se
  // gestionan en Acciones), aporte/venta se pueden editar/eliminar.
  const [detailKey,     setDetailKey]     = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  function closeDetail() { setDetailKey(null); setConfirmDelete(false) }
  const detailBackdropClose = useBackdropClose(closeDetail)

  // FX solo como dato chico (no protagonista) — si falla, la card vive sin él
  useEffect(() => {
    fetch('/api/stock-price?symbols=USDCLP')
      .then(r => r.ok ? r.json() : null)
      .then((d: { quotes?: Record<string, { price: number }> } | null) => {
        const p = d?.quotes?.['USDCLP=X']?.price ?? d?.quotes?.['USDCLP']?.price
        if (p && p > 0) setFx(p)
      })
      .catch(() => { /* opcional */ })
  }, [])

  // ── Agregados (USD primero) ────────────────────────────────────────────────
  // Saldo disponible = aportes + ventas − costo de posiciones abiertas.
  // Comprar acciones lo descuenta solo (la posición ES los USD invertidos);
  // vender agrega una fila kind='sell' y los devuelve.
  const deposits    = purchases.filter(p => p.kind !== 'sell')
  const movementsUsd = purchases.reduce((s, p) => s + Number(p.usd_amount), 0)
  const available   = movementsUsd - investedUsd
  const depositUsd  = deposits.reduce((s, p) => s + Number(p.usd_amount), 0)
  const totalClp    = deposits.reduce((s, p) => s + (p.total_paid_clp ?? 0), 0)
  const avgRate     = depositUsd > 0 ? totalClp / depositUsd : null   // CLP por USD, comisión incluida

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function openAdd() {
    setEditId(null); setEditKind('deposit'); setEditSaleId(null); setEditTicker(null)
    setForm(emptyForm()); setFormError(''); setShowForm(true)
  }
  function openEdit(p: UsdPurchase) {
    setEditId(p.id)
    setEditKind(p.kind === 'sell' ? 'sell' : 'deposit')
    setEditSaleId(p.kind === 'sell' ? (sales.find(s => s.usd_purchase_id === p.id)?.id ?? null) : null)
    setEditTicker(null)
    setForm({
      date:  p.purchase_date,
      clp:   String(p.total_paid_clp ?? ''),
      usd:   String(p.usd_amount),
      notes: p.notes ?? '',
      shares: '',
    })
    setFormError(''); setShowForm(true)
  }
  function openEditStockPurchase(sp: StockPurchase) {
    setEditId(sp.id); setEditKind('compra'); setEditSaleId(null); setEditTicker(sp.ticker)
    setForm({
      date:   sp.purchase_date,
      clp:    '',
      usd:    String(sp.total_paid_usd),
      notes:  sp.notes ?? '',
      shares: String(sp.shares),
    })
    setFormError(''); setShowForm(true)
  }

  async function save() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) { setFormError('Fecha inválida'); return }

    // Editar venta: fecha, nota y ahora también el monto recibido (ago 2026,
    // Cas: un error de tipeo en Vender dejó un monto absurdo y no había forma
    // de corregirlo). Las acciones vendidas y el costo base NO se tocan acá
    // — eso sigue viviendo en la venta real (stock_sales) y no cambia; solo
    // se recalcula la ganancia/pérdida con el monto corregido.
    if (editId && editKind === 'sell') {
      const usd = parseFloat(form.usd.replace(',', '.'))
      if (!Number.isFinite(usd) || usd <= 0) { setFormError('¿Cuántos dólares recibiste realmente?'); return }

      setBusy(true)
      const proceeds = Math.round(usd * 100) / 100
      const row = { usd_amount: proceeds, purchase_date: form.date, notes: form.notes.trim() || null }
      const { error } = await supabase.from('usd_purchases')
        .update(row).eq('id', editId).eq('user_id', userId)
      if (error) { setBusy(false); setFormError(error.message); return }
      // Mantener sale_date sincronizada — es la fecha que de verdad usan el
      // benchmark vs SPY y el historial de Ventas (stock_sales.sale_date),
      // no esta fila de billetera. El monto corregido también se propaga a
      // proceeds_usd/realized_pnl_usd — cost_basis_usd y shares_sold, que sí
      // reflejan lo que realmente salió de la posición, quedan intactos.
      if (editSaleId) {
        const sale = sales.find(s => s.id === editSaleId)
        const costBasis = sale ? Number(sale.cost_basis_usd) : null
        const realizedPnl = costBasis !== null ? Math.round((proceeds - costBasis) * 100) / 100 : undefined
        const { error: saleErr } = await supabase.from('stock_sales')
          .update({
            sale_date: form.date,
            proceeds_usd: proceeds,
            ...(realizedPnl !== undefined ? { realized_pnl_usd: realizedPnl } : {}),
          }).eq('id', editSaleId).eq('user_id', userId)
        if (saleErr) { setBusy(false); setFormError(saleErr.message); return }
      }
      setBusy(false)
      setPurchases(prev => prev.map(p => p.id === editId ? { ...p, ...row } : p))
      setShowForm(false)
      router.refresh()   // refleja el monto/fecha nuevos en Ventas/benchmark
      return
    }

    // Editar compra: monto invertido, acciones y fecha son editables — el
    // ticker no (para eso está Acciones). Hay que recalcular la posición
    // agregada (stock_positions) con el mismo criterio que "comprar más" en
    // TransactionModal: el delta de costo/acciones se suma al agregado
    // existente, en vez de reemplazarlo, porque la posición puede tener
    // otras compras además de esta.
    if (editId && editKind === 'compra') {
      const shares = parseFloat(form.shares.replace(',', '.'))
      const usdTotal = parseFloat(form.usd.replace(',', '.'))
      if (!Number.isFinite(shares) || shares <= 0) { setFormError('¿Cuántas acciones compraste?'); return }
      if (!Number.isFinite(usdTotal) || usdTotal <= 0) { setFormError('¿Cuánto invertiste en total (USD)?'); return }

      const oldSp = stockPurchasesState.find(sp => sp.id === editId)
      if (!oldSp) { setFormError('No se encontró la compra original.'); return }

      setBusy(true)
      const { data: posRow, error: posErr } = await supabase
        .from('stock_positions')
        .select('id, shares, avg_cost_usd, wallet_cost_usd, wallet_funded')
        .eq('user_id', userId).eq('ticker', oldSp.ticker).single()
      if (posErr || !posRow) { setBusy(false); setFormError(`No se encontró la posición de ${oldSp.ticker}.`); return }

      const newTotalPaid = Math.round(usdTotal * 100) / 100
      const newShares    = Math.round(shares * 1e6) / 1e6
      const deltaCost    = newTotalPaid - Number(oldSp.total_paid_usd)
      const deltaShares  = newShares - Number(oldSp.shares)
      const posShares    = Math.round((Number(posRow.shares) + deltaShares) * 1e6) / 1e6

      if (posShares <= 0) {
        setBusy(false)
        setFormError('La posición quedaría con 0 o menos acciones — ajusta esto desde Acciones en vez de acá.')
        return
      }
      const posTotalCost = Number(posRow.avg_cost_usd) * Number(posRow.shares) + deltaCost
      const newAvgCost   = posTotalCost / posShares
      // wallet_cost_usd es acumulado, no está atado 1:1 a esta fila — se
      // ajusta por el mismo delta solo si la posición ya estaba marcada como
      // financiada por la billetera (mismo criterio que buyMorePosition).
      const newWalletCost = posRow.wallet_funded
        ? Math.max(0, Math.round((Number(posRow.wallet_cost_usd ?? 0) + deltaCost) * 100) / 100)
        : Number(posRow.wallet_cost_usd ?? 0)

      const spRow = { shares: newShares, total_paid_usd: newTotalPaid, purchase_date: form.date, notes: form.notes.trim() || null }
      const { error: spErr } = await supabase.from('stock_purchases')
        .update(spRow).eq('id', editId).eq('user_id', userId)
      if (spErr) { setBusy(false); setFormError(spErr.message); return }

      const { error: posUpdErr } = await supabase.from('stock_positions').update({
        shares: posShares, avg_cost_usd: newAvgCost,
        wallet_cost_usd: newWalletCost, wallet_funded: newWalletCost > 0,
        trail_stop_usd: null, updated_at: new Date().toISOString(),
      }).eq('id', posRow.id).eq('user_id', userId)
      if (posUpdErr) { setBusy(false); setFormError(posUpdErr.message); return }

      setBusy(false)
      setStockPurchasesState(prev => prev.map(sp => sp.id === editId ? { ...sp, ...spRow } : sp))
      setShowForm(false)
      router.refresh()   // refleja el nuevo costo promedio en Acciones
      return
    }

    const clp = parseInt(form.clp.replace(/\D/g, '') || '0')
    const usd = parseFloat(form.usd.replace(',', '.'))
    if (!clp || clp < 1)                 { setFormError('¿Cuántos pesos pagaste en total? (comisión incluida)'); return }
    if (!Number.isFinite(usd) || usd <= 0) { setFormError('¿Cuántos dólares recibiste?'); return }

    setBusy(true)
    const row = {
      usd_amount:     Math.round(usd * 100) / 100,
      total_paid_clp: clp,
      purchase_date:  form.date,
      notes:          form.notes.trim() || null,
    }
    if (editId) {
      const { error } = await supabase.from('usd_purchases')
        .update(row).eq('id', editId).eq('user_id', userId)
      setBusy(false)
      if (error) { setFormError(error.message); return }
      setPurchases(prev => prev.map(p => p.id === editId ? { ...p, ...row } : p))
    } else {
      const { data, error } = await supabase.from('usd_purchases')
        .insert({ user_id: userId, kind: 'deposit', ...row })
        .select('id, usd_amount, total_paid_clp, purchase_date, notes, kind')
        .single()
      setBusy(false)
      if (error) { setFormError(error.message); return }
      setPurchases(prev => [data as UsdPurchase, ...prev])
    }
    setShowForm(false)
    router.refresh()
  }

  async function remove(p: UsdPurchase) {
    setPurchases(prev => prev.filter(x => x.id !== p.id))
    await supabase.from('usd_purchases').delete().eq('id', p.id).eq('user_id', userId)
    router.refresh()
  }

  /**
   * Revierte una venta de acciones por completo (sep 2026, a pedido de Cas:
   * "me gustaría que se cambiara el basurero por revertir venta").
   *
   * Antes el basurero llamaba a `remove()`, que borra SOLO la fila de la
   * billetera. Una venta toca tres cosas a la vez, así que eso dejaba los
   * datos rotos: los USD salían del saldo, pero las acciones NO volvían a la
   * posición y la ganancia/pérdida realizada quedaba huérfana en el historial
   * de Ventas (la FK es ON DELETE SET NULL, así que la fila de stock_sales
   * sobrevivía). Resultado: menos acciones de las que tienes y una pérdida
   * que nunca ocurrió. Revertir deshace las tres juntas.
   */
  async function revertSale(walletRow: UsdPurchase, sale: StockSale) {
    setBusy(true)

    // 1. Devolver las acciones a la posición.
    const { data: posRow } = await supabase
      .from('stock_positions')
      .select('id, shares, avg_cost_usd, wallet_cost_usd')
      .eq('user_id', userId).eq('ticker', sale.ticker)
      .maybeSingle()

    const sharesSold = Number(sale.shares_sold)
    const costBasis  = Number(sale.cost_basis_usd)

    if (posRow) {
      // Venta parcial: la posición sigue viva, solo hay que sumarle de vuelta.
      // wallet_cost_usd se había escalado por (restantes/total) al vender —
      // acá se aplica el inverso exacto para volver al valor original.
      const cur       = Number(posRow.shares)
      const curWallet = Number(posRow.wallet_cost_usd ?? 0)
      const newShares = Math.round((cur + sharesSold) * 1e6) / 1e6
      const newWallet = curWallet > 0 && cur > 0
        ? Math.round(curWallet * (newShares / cur) * 100) / 100
        : curWallet
      await supabase.from('stock_positions').update({
        shares:          newShares,
        wallet_cost_usd: newWallet,
        wallet_funded:   newWallet > 0,
        // El trailing se recalcula solo en el próximo cron; dejarlo con el
        // valor de una posición que ya no es la misma daría una alarma falsa.
        trail_stop_usd:  null,
        updated_at:      new Date().toISOString(),
      }).eq('id', posRow.id).eq('user_id', userId)
    } else {
      // Venta total: la posición se había borrado, hay que recrearla. El costo
      // promedio se reconstruye exacto desde la venta (cost_basis / acciones);
      // wallet_cost_usd no quedó guardado en ninguna parte, así que se asume
      // financiada por la billetera (el caso normal desde que existe). Si era
      // una posición legacy, corrígelo con "Editar posición" en Acciones.
      await supabase.from('stock_positions').insert({
        user_id:         userId,
        ticker:          sale.ticker,
        shares:          sharesSold,
        avg_cost_usd:    Math.round((costBasis / sharesSold) * 100) / 100,
        wallet_cost_usd: Math.round(costBasis * 100) / 100,
        wallet_funded:   true,
      })
    }

    // 2. Borrar la ganancia/pérdida realizada del historial de Ventas.
    await supabase.from('stock_sales').delete().eq('id', sale.id).eq('user_id', userId)

    // 3. Sacar los USD de la billetera.
    setPurchases(prev => prev.filter(x => x.id !== walletRow.id))
    await supabase.from('usd_purchases').delete().eq('id', walletRow.id).eq('user_id', userId)

    setBusy(false)
    router.refresh()
  }

  // ── Cartola unificada: aportes y ventas ENTRAN, compras de acciones SALEN ──
  // Cada venta se enriquece con su detalle (ticker, acciones, costo base,
  // ganancia/pérdida) uniendo la fila 'sell' de la billetera con stock_sales
  // vía usd_purchase_id — así no hace falta una vista aparte para Ventas.
  type Move = {
    key:   string
    date:  string
    type:  'aporte' | 'venta' | 'compra'
    label: string
    sub:   string | null
    usd:   number                 // con signo
    pnl:   number | null          // ganancia/pérdida realizada (solo ventas con detalle)
    pnlPct: number | null
    ticker: string | null         // solo ventas/compras con detalle de acción
    shares: number | null
    row:      UsdPurchase | null   // filas de billetera (aporte/venta) — editables/eliminables
    stockRow: StockPurchase | null // fila de compra de acciones — editable (no eliminable) acá
    // Venta con detalle enlazado: necesario para "Revertir venta", que tiene
    // que devolver las acciones a la posición además de borrar la fila.
    sale:     StockSale | null
  }
  const salesByPurchaseId = new Map(sales.map(s => [s.usd_purchase_id, s]))
  const moves: Move[] = [
    ...purchases.map<Move>(p => {
      if (p.kind === 'sell') {
        const sale = salesByPurchaseId.get(p.id)
        if (sale) {
          const pnl    = Number(sale.realized_pnl_usd)
          const costB  = Number(sale.cost_basis_usd)
          const pnlPct = costB > 0 ? (pnl / costB) * 100 : 0
          return {
            key: `w-${p.id}`, date: p.purchase_date, type: 'venta',
            label: `Venta ${sale.ticker}`,
            sub: `${Number(sale.shares_sold).toLocaleString('es-CL', { maximumFractionDigits: 6 })} acc. · ${fmtUSDSigned(pnl)} (${fmtPct(pnlPct)})`,
            usd: Number(p.usd_amount), pnl, pnlPct, ticker: sale.ticker, shares: Number(sale.shares_sold), row: p, stockRow: null, sale,
          }
        }
        return {
          key: `w-${p.id}`, date: p.purchase_date, type: 'venta',
          label: p.notes ?? 'Venta de acciones', sub: null,
          usd: Number(p.usd_amount), pnl: null, pnlPct: null, ticker: null, shares: null, row: p, stockRow: null, sale: null,
        }
      }
      return {
        key: `w-${p.id}`, date: p.purchase_date, type: 'aporte',
        label: 'Aporte a la billetera',
        sub: [
          p.total_paid_clp !== null ? `${formatCLP(p.total_paid_clp)} · ${formatCLP(Math.round(p.total_paid_clp / Number(p.usd_amount)))}/USD` : null,
          p.notes,
        ].filter(Boolean).join(' · ') || null,
        usd: Number(p.usd_amount), pnl: null, pnlPct: null, ticker: null, shares: null, row: p, stockRow: null, sale: null,
      }
    }),
    ...stockPurchasesState.map<Move>(sp => ({
      key: `p-${sp.id}`, date: sp.purchase_date, type: 'compra',
      label: `Compra ${sp.ticker}`,
      sub: `${Number(sp.shares).toLocaleString('es-CL', { maximumFractionDigits: 6 })} acc.`,
      usd: -Number(sp.total_paid_usd), pnl: null, pnlPct: null, ticker: sp.ticker, shares: Number(sp.shares), row: null, stockRow: sp, sale: null,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* sep 2026 (Cas: "en la parte de billetera el toggle aun no aparece a
          la izquierda"): este header vive en un componente aparte de Radar.tsx
          (Mis acciones/Watchlist), con su propio `justify-end` que pegaba
          todo a la derecha — mismo ajuste que ahí: toggle al borde izquierdo,
          Aporte al borde derecho.
          sep 2026, ronda 2 (Cas: "para la version escritorio esto este a la
          derecha congruente en las 4 vistas del toggle"): en mobile se
          mantiene repartido (justify-between), pero en sm+ el grupo se junta
          al borde derecho igual que en Mis acciones/Watchlist — ahí el toggle
          ya quedaba a la derecha por el justify-between del top bar, así que
          separado a lo ancho acá rompía la congruencia entre pestañas. Mismo
          breakpoint (sm) que usa Radar.tsx para no desalinearse en tablet. */}
      <div className="flex items-center justify-between sm:justify-end gap-2 mb-3">
        <InversionesToggle active="billetera" />
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all active:scale-[.97] shrink-0"
          style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Aporte
        </button>
      </div>

      {/* ── Modal agregar/editar aporte ──────────────────────────────────── */}
      {showForm && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          {...backdropClose}
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
                {editId
                  ? (editKind === 'sell' ? 'Editar venta' : editKind === 'compra' ? `Editar compra ${editTicker ?? ''}` : 'Editar aporte')
                  : 'Nuevo aporte'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(92dvh - 120px)' }}>
              {/* Editar venta (ago 2026, Cas: "quise vender walmart... se
                  vendió mal" — un error de tipeo en Vender dejó el monto
                  recibido en US$28.762 en vez de ~US$268, y esta pantalla no
                  dejaba corregirlo: el campo se mostraba como texto de solo
                  lectura y Guardar solo tocaba fecha/nota. Ahora el monto SÍ
                  es editable — las acciones vendidas y el costo base
                  (`cost_basis_usd`, lo que de verdad salió de la posición) NO
                  cambian, así que no hay riesgo de desincronizar la posición;
                  solo se recalcula la ganancia/pérdida realizada con el monto
                  corregido, en usd_purchases Y en stock_sales a la vez. */}
              {editKind === 'sell' ? (
                <>
                  {editSaleId && (() => {
                    const sale = sales.find(s => s.id === editSaleId)
                    return sale ? (
                      <div className="px-4 py-2.5 rounded-xl flex items-center justify-between" style={{ background: 'var(--surface-2)' }}>
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>
                          Vendiste
                        </span>
                        <span className="text-sm font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>
                          {Number(sale.shares_sold).toLocaleString('es-CL', { maximumFractionDigits: 6 })} acc. {sale.ticker}
                        </span>
                      </div>
                    ) : null
                  })()}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                      Dólares recibidos
                    </label>
                    <input
                      type="text" inputMode="decimal" placeholder="268,60"
                      value={form.usd}
                      onChange={e => setForm(f => ({ ...f, usd: e.target.value.replace(/[^0-9.,]/g, '') }))}
                      className="w-full text-sm border px-4 py-3 tabular-nums outline-none"
                      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)', borderRadius: 12 }}
                      autoFocus
                    />
                  </div>
                </>
              ) : editKind === 'compra' ? (
                <>
                  <div className="px-4 py-2.5 rounded-xl flex items-center justify-between" style={{ background: 'var(--surface-2)' }}>
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>
                      Ticker
                    </span>
                    <span className="text-sm font-extrabold" style={{ color: 'var(--ink)' }}>{editTicker}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                        Acciones
                      </label>
                      <input
                        type="text" inputMode="decimal" placeholder="3,446295"
                        value={form.shares}
                        onChange={e => setForm(f => ({ ...f, shares: e.target.value.replace(/[^0-9.,]/g, '') }))}
                        className="w-full text-sm border px-4 py-3 tabular-nums outline-none"
                        style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)', borderRadius: 12 }}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                        Invertido (USD)
                      </label>
                      <input
                        type="text" inputMode="decimal" placeholder="300,00"
                        value={form.usd}
                        onChange={e => setForm(f => ({ ...f, usd: e.target.value.replace(/[^0-9.,]/g, '') }))}
                        className="w-full text-sm border px-4 py-3 tabular-nums outline-none"
                        style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)', borderRadius: 12 }}
                      />
                    </div>
                  </div>
                  <p className="text-[10px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
                    Esto recalcula el costo promedio de tu posición en {editTicker}. El ticker no se puede cambiar acá.
                  </p>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                        Pesos pagados (total)
                      </label>
                      <input
                        type="text" inputMode="numeric" placeholder="950.000"
                        value={fmtInputCLP(form.clp)}
                        onChange={e => setForm(f => ({ ...f, clp: e.target.value.replace(/\D/g, '') }))}
                        className="w-full text-sm border px-4 py-3 tabular-nums outline-none"
                        style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)', borderRadius: 12 }}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                        Dólares recibidos
                      </label>
                      <input
                        type="text" inputMode="decimal" placeholder="1000,00"
                        value={form.usd}
                        onChange={e => setForm(f => ({ ...f, usd: e.target.value.replace(/[^0-9.,]/g, '') }))}
                        className="w-full text-sm border px-4 py-3 tabular-nums outline-none"
                        style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)', borderRadius: 12 }}
                      />
                    </div>
                  </div>

                  {/* Tasa implícita en vivo: hace visible la comisión sin pedirla aparte */}
                  {(() => {
                    const clp = parseInt(form.clp || '0')
                    const usd = parseFloat(form.usd.replace(',', '.'))
                    if (!clp || !Number.isFinite(usd) || usd <= 0) return null
                    return (
                      <div
                        className="px-4 py-2.5 rounded-xl flex items-center gap-2"
                        style={{ background: 'rgba(31,190,141,0.08)', border: '1px solid rgba(31,190,141,0.2)' }}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--mint)' }}>
                          Tasa implícita
                        </span>
                        <span className="text-sm font-extrabold tabular-nums ml-auto" style={{ color: 'var(--mint)' }}>
                          {formatCLP(Math.round(clp / usd))}/USD
                        </span>
                      </div>
                    )
                  })()}
                </>
              )}

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Fecha
                </label>
                <input
                  type="date" value={form.date} max={maxFutureStr()}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full text-sm border px-4 py-3 outline-none"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)', borderRadius: 12 }}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--ink-3)' }}>
                  Nota (opcional)
                </label>
                <input
                  type="text" placeholder="Racional" maxLength={60}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full text-sm border px-4 py-3 outline-none"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--ink)', borderRadius: 12 }}
                />
              </div>

              {formError && <p className="text-xs font-medium" style={{ color: 'var(--coral)' }}>{formError}</p>}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                  style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={save} disabled={busy}
                  className="flex-1 py-3 text-sm font-bold rounded-2xl disabled:opacity-50 transition-all active:scale-[.98] flex items-center justify-center gap-2"
                  style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 16px var(--shadow)' }}
                >
                  {busy && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {editId ? 'Guardar cambios' : 'Registrar aporte'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Detalle de un movimiento (ago 2026, a pedido de Cas) ────────────
          Tocar una fila de la cartola abre esto en vez de editar/eliminar
          directo — mismo patrón que el detalle de acciones (Radar.tsx): ver
          primero, decidir después. Cubre los 3 tipos de fila: aporte y venta
          (editables/eliminables acá) y compra de acciones (solo lectura —
          se gestiona en Acciones). */}
      {(() => {
        const m = detailKey ? moves.find(mv => mv.key === detailKey) ?? null : null
        if (!m) return null
        // aporte y venta se pueden editar (venta: solo fecha/nota, ver save());
        // compra también, desde ago 2026 (monto/acciones/fecha, ver save()).
        // Eliminar sigue solo para aporte/venta — borrar una compra suelta
        // podría dejar la posición con acciones/costo inconsistentes.
        const canEdit   = m.type === 'compra' ? m.stockRow !== null : m.row !== null
        const canDelete = m.row !== null
        const iconBg    = m.type === 'compra' ? 'rgba(43,124,246,0.12)' : 'rgba(31,190,141,0.14)'
        const iconColor = m.type === 'compra' ? 'var(--primary)' : 'var(--mint)'

        return (
          <div
            className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.65)' }}
            {...detailBackdropClose}
          >
            <div
              className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-hidden"
              style={{ background: 'var(--surface)', maxHeight: '92dvh' }}
            >
              <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

              <div className="flex items-center gap-3 px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: iconBg }}>
                  {m.type === 'aporte' && <ArrowUp className="w-4 h-4" style={{ color: iconColor }} strokeWidth={2.5} />}
                  {m.type === 'venta'  && <DollarSign className="w-4 h-4" style={{ color: iconColor }} strokeWidth={2.5} />}
                  {m.type === 'compra' && <ArrowDown className="w-4 h-4" style={{ color: iconColor }} strokeWidth={2.5} />}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold truncate" style={{ color: 'var(--ink)' }}>{m.label}</h2>
                  <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{fmtDate(m.date)}</p>
                </div>
                <button
                  onClick={closeDetail}
                  className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(92dvh - 190px)' }}>
                {/* Cifras clave */}
                <div className="rounded-2xl overflow-hidden divide-y" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
                      {m.type === 'aporte' ? 'Dólares recibidos' : m.type === 'venta' ? 'Dólares recibidos' : 'Monto invertido'}
                    </span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{fmtUSD(Math.abs(m.usd))}</span>
                  </div>
                  {m.type === 'aporte' && m.row?.total_paid_clp !== null && m.row?.total_paid_clp !== undefined && (
                    <>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Pesos pagados</span>
                        <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(m.row.total_paid_clp)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Tasa implícita</span>
                        <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                          {formatCLP(Math.round(m.row.total_paid_clp / Number(m.row.usd_amount)))}/USD
                        </span>
                      </div>
                    </>
                  )}
                  {m.ticker !== null && (
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Ticker</span>
                      <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{m.ticker}</span>
                    </div>
                  )}
                  {m.shares !== null && (
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Acciones</span>
                      <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                        {m.shares.toLocaleString('es-CL', { maximumFractionDigits: 6 })}
                      </span>
                    </div>
                  )}
                  {m.pnl !== null && (
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Ganancia/pérdida</span>
                      <span className="text-sm font-bold tabular-nums" style={{ color: m.pnl >= 0 ? 'var(--mint)' : 'var(--coral)' }}>
                        {fmtUSDSigned(m.pnl)} ({fmtPct(m.pnlPct ?? 0)})
                      </span>
                    </div>
                  )}
                </div>

                {(m.row !== null || m.stockRow !== null) && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>
                      Nota
                    </p>
                    <p className="text-sm" style={{ color: (m.row?.notes ?? m.stockRow?.notes) ? 'var(--ink-2)' : 'var(--ink-3)' }}>
                      {m.row?.notes ?? m.stockRow?.notes ?? 'Sin nota — agrégala al editar.'}
                    </p>
                  </div>
                )}

                {m.type === 'compra' && (
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>
                    Para vender esta posición o eliminar esta compra, usa <strong style={{ color: 'var(--ink-2)' }}>Acciones</strong>.
                  </p>
                )}

                {/* sep 2026 (Cas: "me gustaría que se cambiara el basurero
                    por revertir venta"): una venta no es un movimiento suelto
                    que se pueda borrar — toca tres tablas a la vez. Cuando la
                    fila es una venta con detalle enlazado, la acción deja de
                    llamarse "Eliminar" y pasa a ser "Revertir venta", con el
                    resumen explícito de lo que se va a deshacer. El resto de
                    los movimientos (aportes) mantiene el borrado simple. */}
                {confirmDelete && (
                  <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,111,97,0.08)', border: '1px solid rgba(255,111,97,0.25)' }}>
                    {m.sale ? (
                      <>
                        <p className="text-sm text-center font-medium" style={{ color: 'var(--ink-2)' }}>
                          ¿Revertir esta venta? Se deshace todo junto:
                        </p>
                        <ul className="text-xs space-y-1" style={{ color: 'var(--ink-2)' }}>
                          <li>· Vuelven {Number(m.sale.shares_sold).toLocaleString('es-CL', { maximumFractionDigits: 6 })} acc. de {m.sale.ticker} a tu posición</li>
                          <li>· Salen {fmtUSD(Number(m.row!.usd_amount))} de la billetera</li>
                          <li>· Se borra la {Number(m.sale.realized_pnl_usd) >= 0 ? 'ganancia' : 'pérdida'} de {fmtUSD(Math.abs(Number(m.sale.realized_pnl_usd)))} del historial de Ventas</li>
                        </ul>
                      </>
                    ) : (
                      <p className="text-sm text-center font-medium" style={{ color: 'var(--ink-2)' }}>
                        ¿Eliminar este movimiento?
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                        style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface)' }}
                      >
                        Cancelar
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (m.sale) revertSale(m.row!, m.sale)
                          else remove(m.row!)
                          closeDetail()
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold rounded-2xl disabled:opacity-60"
                        style={{ background: 'var(--coral)', color: 'white' }}
                      >
                        {m.sale ? <Undo2 className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                        {m.sale ? 'Revertir venta' : 'Eliminar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {!confirmDelete && (
                <div className="border-t px-5 py-3 flex items-center gap-2 flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                  {/* En una venta el ícono deja de ser un basurero: no estás
                      borrando un registro, estás deshaciendo una operación
                      que movió acciones y plata. Icono + etiqueta explícitos
                      para que no se confunda con "eliminar la fila". */}
                  {canDelete && (
                    m.sale ? (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="h-11 px-3.5 flex items-center justify-center gap-1.5 rounded-2xl border shrink-0 text-sm font-semibold transition-colors"
                        style={{ borderColor: 'var(--border)', color: 'var(--coral)', background: 'var(--surface-2)' }}
                      >
                        <Undo2 className="w-4 h-4" />
                        Revertir
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="w-11 h-11 flex items-center justify-center rounded-2xl border shrink-0 transition-colors"
                        style={{ borderColor: 'var(--border)', color: 'var(--coral)', background: 'var(--surface-2)' }}
                        aria-label="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )
                  )}
                  <button
                    onClick={closeDetail}
                    className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                    style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                  >
                    Cerrar
                  </button>
                  {canEdit && (
                    <button
                      onClick={() => { setDetailKey(null); setConfirmDelete(false); m.type === 'compra' ? openEditStockPurchase(m.stockRow!) : openEdit(m.row!) }}
                      className="flex-1 py-3 text-sm font-bold rounded-2xl transition-all active:scale-[.98]"
                      style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 16px var(--shadow)' }}
                    >
                      Editar
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {purchases.length === 0 ? (
        <div className="card px-6 py-8 text-center">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Registra tus compras de dólares</p>
          <p className="text-xs mt-1 max-w-md mx-auto leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            Anota cuántos pesos pagaste en total (con comisión incluida) y cuántos dólares recibiste.
            Desde ahí tu plata vive en dólares: el saldo se muestra en USD y entra al patrimonio como &ldquo;Dólares&rdquo;.
          </p>
        </div>
      ) : (
        <div className="space-y-4">

          {/* ── Hero: SOLO lo que importa — cuánto tienes para gastar hoy ──── */}
          <div className="card overflow-hidden hero-gradient w-full">
            <div className="px-5 pt-5 lg:px-6 lg:pt-6 pb-5">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                Disponible para comprar
              </p>
              <p className="text-4xl lg:text-5xl font-bold tabular-nums leading-none" style={{ fontFamily: 'Fredoka, sans-serif', color: 'white' }}>
                {fmtUSD(Math.max(0, available))}
              </p>
              {available < 0 && (
                <p className="text-[11px] font-bold mt-2" style={{ color: 'white' }}>
                  Tienes más invertido en acciones que aportes registrados — te faltan aportes por {fmtUSD(-available)}.
                </p>
              )}
            </div>
          </div>

          {/* ── Cartola de movimientos: aportes + compras/ventas de acciones ── */}
          {moves.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 lg:px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Movimientos</p>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                  {moves.length} operación{moves.length !== 1 ? 'es' : ''}
                </p>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {moves.map(m => (
                  <button
                    key={m.key}
                    onClick={() => setDetailKey(m.key)}
                    className="w-full text-left group flex items-center gap-3 px-4 lg:px-5 py-3 hover:bg-[var(--surface-2)] transition-colors active:opacity-80"
                  >
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: m.type === 'compra' ? 'rgba(43,124,246,0.12)' : 'rgba(31,190,141,0.14)' }}>
                      {m.type === 'aporte' && <ArrowUp className="w-4 h-4" style={{ color: 'var(--mint)' }} strokeWidth={2.5} />}
                      {m.type === 'venta'  && <DollarSign className="w-4 h-4" style={{ color: 'var(--mint)' }} strokeWidth={2.5} />}
                      {m.type === 'compra' && <ArrowDown className="w-4 h-4" style={{ color: 'var(--primary)' }} strokeWidth={2.5} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{m.label}</p>
                      <p className="text-[11px] tabular-nums" style={{ color: 'var(--ink-3)' }}>
                        {fmtDate(m.date)}{m.sub && <> · {m.sub}</>}
                      </p>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-right shrink-0"
                      style={{ color: m.pnl !== null ? (m.pnl >= 0 ? 'var(--mint)' : 'var(--coral)') : (m.usd >= 0 ? 'var(--mint)' : 'var(--ink-2)') }}>
                      {fmtUSDSigned(m.usd)}
                    </p>
                    <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--ink-3)' }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Contexto chico en una sola línea: tasa promedio, dólar hoy y conversión */}
          {available > 0 && (avgRate !== null || fx !== null) && (
            <p className="text-[11px] tabular-nums text-center" style={{ color: 'var(--ink-3)' }}>
              {avgRate !== null && <>pagaste {formatCLP(Math.round(avgRate))}/USD prom.</>}
              {avgRate !== null && fx !== null && (
                <> · dólar hoy {formatCLP(Math.round(fx))} (<span style={{ color: fx >= avgRate ? 'var(--mint)' : 'var(--coral)' }}>{fx >= avgRate ? '+' : ''}{(((fx - avgRate) / avgRate) * 100).toFixed(1)}%</span>)</>
              )}
              {fx !== null && <> · si lo trajeras ≈ {formatCLP(Math.round(available * fx))}</>}
            </p>
          )}

          {/* ── Cómo funciona ────────────────────────────────────────────────── */}
          <div className="card p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
              <Info className="w-4 h-4" style={{ color: 'var(--primary)' }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold mb-1" style={{ color: 'var(--ink)' }}>Cómo funciona la billetera</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>
                Comprar acciones <strong style={{ color: 'var(--ink-2)' }}>descuenta</strong> del disponible — no puedes invertir
                más de lo aportado. Al vender, los dólares <strong style={{ color: 'var(--ink-2)' }}>vuelven aquí</strong> y la
                fila queda con el ticker, las acciones vendidas y la ganancia o pérdida de esa venta.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
