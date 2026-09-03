import { describe, it, expect } from 'vitest'
import { computeWalletCash, availableToInvest } from './wallet-cash'

describe('computeWalletCash', () => {
  it('sin movimientos ni compras, todo en cero', () => {
    expect(computeWalletCash([], [])).toEqual({ deposited: 0, proceeds: 0, spent: 0, cash: 0 })
  })

  it('un aporte sin comprar nada queda íntegro como efectivo', () => {
    const r = computeWalletCash([{ kind: 'deposit', usd_amount: 1000 }], [])
    expect(r).toEqual({ deposited: 1000, proceeds: 0, spent: 0, cash: 1000 })
  })

  it('comprar descuenta del efectivo', () => {
    const r = computeWalletCash([{ kind: 'deposit', usd_amount: 1000 }], [{ total_paid_usd: 300 }])
    expect(r.cash).toBe(700)
  })

  // El bug que motivó este módulo: la fórmula vieja (movimientos − costo de
  // posiciones ABIERTAS) dejaba de restar el costo al cerrar la posición, así
  // que una compra+venta completa inflaba el saldo por el monto de la compra.
  it('comprar en 300 y vender TODO en 400 deja 1.100, no 1.400', () => {
    const r = computeWalletCash(
      [{ kind: 'deposit', usd_amount: 1000 }, { kind: 'sell', usd_amount: 400 }],
      [{ total_paid_usd: 300 }],
    )
    expect(r.cash).toBe(1100)
  })

  it('una venta con pérdida también cuadra', () => {
    const r = computeWalletCash(
      [{ kind: 'deposit', usd_amount: 1000 }, { kind: 'sell', usd_amount: 250 }],
      [{ total_paid_usd: 300 }],
    )
    expect(r.cash).toBe(950)
  })

  it('las ventas no cuentan como dólares comprados', () => {
    const r = computeWalletCash(
      [{ kind: 'deposit', usd_amount: 1000 }, { kind: 'sell', usd_amount: 400 }],
      [],
    )
    expect(r.deposited).toBe(1000)   // no 1400: la venta no es plata nueva
    expect(r.proceeds).toBe(400)
  })

  it('reconciliación real de Cas contra el bróker (sep 2026)', () => {
    // Depósitos 6.195,20 − compras 7.748,33 + ventas 2.296,41 = 743,28
    const r = computeWalletCash(
      [{ kind: 'deposit', usd_amount: 6195.20 }, { kind: 'sell', usd_amount: 2296.41 }],
      [{ total_paid_usd: 7748.33 }],
    )
    expect(r.cash).toBe(743.28)
  })

  it('no arrastra error de punto flotante', () => {
    const r = computeWalletCash(
      [{ kind: 'deposit', usd_amount: 0.1 }, { kind: 'deposit', usd_amount: 0.2 }],
      [],
    )
    expect(r.deposited).toBe(0.3)
  })
})

describe('availableToInvest', () => {
  it('null si nunca hubo billetera — distinto de tener saldo cero', () => {
    expect(availableToInvest([], [])).toBeNull()
  })

  it('nunca devuelve negativo aunque falten datos', () => {
    const v = availableToInvest([{ kind: 'deposit', usd_amount: 100 }], [{ total_paid_usd: 500 }])
    expect(v).toBe(0)
  })

  it('devuelve el efectivo real cuando es positivo', () => {
    const v = availableToInvest([{ kind: 'deposit', usd_amount: 1000 }], [{ total_paid_usd: 300 }])
    expect(v).toBe(700)
  })
})
