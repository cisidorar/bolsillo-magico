import { describe, it, expect } from 'vitest'
import { applyPurchaseChange } from './purchase-edit'

// KO de Cas: 6 compras, la del 02/10 duplicada
const pos = { shares: 15.05828924, avg_cost_usd: 1305.77 / 15.05828924, wallet_cost_usd: 1305.77 }

describe('applyPurchaseChange', () => {
  it('eliminar una compra duplicada resta acciones, costo y billetera', () => {
    const r = applyPurchaseChange(pos, { shares: 2.32991612, total: 200 }, null)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.position.shares).toBeCloseTo(12.72837312, 8)
    expect(r.position.wallet_cost_usd).toBe(1105.77)
    expect(r.position.shares * r.position.avg_cost_usd).toBeCloseTo(1105.77, 6)
  })

  it('editar el monto de una compra ajusta costo y billetera por la diferencia', () => {
    const r = applyPurchaseChange(pos, { shares: 2.32991612, total: 200 }, { shares: 2.32991612, total: 210 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.position.shares).toBeCloseTo(pos.shares, 8)
    expect(r.position.wallet_cost_usd).toBe(1315.77)
    expect(r.position.shares * r.position.avg_cost_usd).toBeCloseTo(1315.77, 6)
  })

  it('editar las acciones cambia acciones y promedio, no el costo', () => {
    const r = applyPurchaseChange(pos, { shares: 2, total: 200 }, { shares: 2.5, total: 200 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.position.shares).toBeCloseTo(pos.shares + 0.5, 8)
    expect(r.position.shares * r.position.avg_cost_usd).toBeCloseTo(1305.77, 6)
  })

  it('posición sin billetera: wallet_cost_usd no se toca', () => {
    const r = applyPurchaseChange({ ...pos, wallet_cost_usd: 0 }, { shares: 2, total: 200 }, { shares: 2, total: 250 })
    expect(r.ok && r.position.wallet_cost_usd).toBe(0)
  })

  it('billetera nunca queda negativa', () => {
    const r = applyPurchaseChange({ ...pos, wallet_cost_usd: 100 }, { shares: 2, total: 200 }, null)
    expect(r.ok && r.position.wallet_cost_usd).toBe(0)
  })

  it('no deja borrar la única compra (posición en cero)', () => {
    const r = applyPurchaseChange({ shares: 3, avg_cost_usd: 100, wallet_cost_usd: 0 }, { shares: 3, total: 300 }, null)
    expect(r.ok).toBe(false)
  })
})
