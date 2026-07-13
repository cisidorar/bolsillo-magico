'use client'

import { Receipt, ArrowUp, ArrowDown } from 'lucide-react'
import InversionesToggle from '@/components/InversionesToggle'
import { relativeDate } from '@/lib/utils'
import type { StockSale } from '@/app/(dashboard)/inversiones/page'

function fmtUSD(n: number): string {
  return '$' + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtUSDSigned(n: number): string {
  return (n >= 0 ? '+$' : '-$') + Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(n: number): string {
  const s = Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return n >= 0 ? `+${s}%` : `-${s}%`
}

interface Props {
  initialSales: StockSale[]
}

export default function StockSalesHistory({ initialSales }: Props) {
  const sales = initialSales

  const totalPnl      = sales.reduce((s, x) => s + Number(x.realized_pnl_usd), 0)
  const totalCostBasis= sales.reduce((s, x) => s + Number(x.cost_basis_usd), 0)
  const totalPnlPct   = totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : 0
  const wins          = sales.filter(s => Number(s.realized_pnl_usd) >= 0).length
  const losses        = sales.filter(s => Number(s.realized_pnl_usd) < 0).length

  return (
    <div>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 mb-3">
        <InversionesToggle active="ventas" />
      </div>

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {sales.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--primary-soft)' }}>
            <Receipt className="w-7 h-7" style={{ color: 'var(--primary)' }} />
          </div>
          <p className="text-base font-bold mb-1" style={{ color: 'var(--ink)' }}>Sin ventas registradas</p>
          <p className="text-sm max-w-sm" style={{ color: 'var(--ink-3)' }}>
            Cuando vendas una acción desde Inversiones → Acciones, la ganancia o pérdida queda registrada acá.
          </p>
        </div>
      )}

      {sales.length > 0 && (
        <div className="space-y-4">

          {/* ── Hero: ganancia/pérdida realizada acumulada ──────────────── */}
          <div className="card overflow-hidden hero-gradient">
            <div className="px-5 pt-5 lg:px-6 lg:pt-6 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                Ganancia/pérdida realizada
              </p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-4xl lg:text-5xl font-bold tabular-nums leading-none" style={{ fontFamily: 'Fredoka, sans-serif', color: 'white' }}>
                  {fmtUSDSigned(totalPnl)}
                </p>
                <span className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>USD</span>
              </div>
            </div>
            <div className="border-t grid grid-cols-3" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
              <div className="px-4 py-3 lg:px-5 lg:py-4">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Retorno</p>
                <p className="text-base lg:text-lg font-bold tabular-nums" style={{ color: totalPnl >= 0 ? '#1FBE8D' : '#FF6F61' }}>
                  {fmtPct(totalPnlPct)}
                </p>
              </div>
              <div className="px-4 py-3 lg:px-5 lg:py-4 border-l" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Ventas ganadoras</p>
                <p className="text-base lg:text-lg font-bold tabular-nums" style={{ color: '#1FBE8D' }}>{wins}</p>
              </div>
              <div className="px-4 py-3 lg:px-5 lg:py-4 border-l" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Ventas perdedoras</p>
                <p className="text-base lg:text-lg font-bold tabular-nums" style={{ color: '#FF6F61' }}>{losses}</p>
              </div>
            </div>
          </div>

          {/* ── Tabla de ventas ──────────────────────────────────────────── */}
          <div className="card overflow-hidden">
            {/* Column headers (desktop only) */}
            <div
              className="hidden lg:grid px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest border-b"
              style={{ gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr 1.2fr', color: 'var(--ink-3)', borderColor: 'var(--border)' }}
            >
              <span>Ticker</span>
              <span className="text-right">Fecha</span>
              <span className="text-right">Acciones</span>
              <span className="text-right">Costo base</span>
              <span className="text-right">Recibido</span>
              <span className="text-right">Ganancia/Pérdida</span>
            </div>

            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {sales.map(sale => {
                const pnl    = Number(sale.realized_pnl_usd)
                const isUp   = pnl >= 0
                const costB  = Number(sale.cost_basis_usd)
                const pnlPct = costB > 0 ? (pnl / costB) * 100 : 0

                return (
                  <div key={sale.id} className="px-4 lg:px-6 py-3">
                    {/* Desktop row */}
                    <div className="hidden lg:grid items-center" style={{ gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr 1.2fr' }}>
                      <p className="text-sm font-bold" style={{ color: 'var(--ink)', fontFamily: 'ui-monospace, monospace' }}>
                        {sale.ticker}
                      </p>
                      <p className="text-right text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                        {relativeDate(sale.sale_date)}
                      </p>
                      <p className="text-right text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                        {Number(sale.shares_sold).toLocaleString('es-CL', { maximumFractionDigits: 6 })}
                      </p>
                      <p className="text-right text-sm font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>
                        {fmtUSD(costB)}
                      </p>
                      <p className="text-right text-sm font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>
                        {fmtUSD(Number(sale.proceeds_usd))}
                      </p>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums" style={{ color: isUp ? 'var(--mint)' : 'var(--coral)' }}>
                          {fmtUSDSigned(pnl)}
                        </p>
                        <div className="flex items-center justify-end gap-0.5 text-[10px] font-semibold"
                          style={{ color: isUp ? 'var(--mint)' : 'var(--coral)' }}>
                          {isUp ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                          {fmtPct(pnlPct)}
                        </div>
                      </div>
                    </div>

                    {/* Mobile row */}
                    <div className="lg:hidden flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold" style={{ color: 'var(--ink)', fontFamily: 'ui-monospace, monospace' }}>{sale.ticker}</span>
                          <span className="text-[10px] font-medium" style={{ color: 'var(--ink-3)' }}>{relativeDate(sale.sale_date)}</span>
                        </div>
                        <p className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
                          {Number(sale.shares_sold).toLocaleString('es-CL', { maximumFractionDigits: 6 })} acc. · recibido {fmtUSD(Number(sale.proceeds_usd))}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold tabular-nums" style={{ color: isUp ? 'var(--mint)' : 'var(--coral)' }}>
                          {fmtUSDSigned(pnl)}
                        </p>
                        <p className="text-[10px] font-semibold" style={{ color: isUp ? 'var(--mint)' : 'var(--coral)' }}>
                          {fmtPct(pnlPct)}
                        </p>
                      </div>
                    </div>

                    {sale.notes && (
                      <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-3)' }}>{sale.notes}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
