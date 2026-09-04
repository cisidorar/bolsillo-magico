import { describe, it, expect } from 'vitest'
import { propertySummary, monthBills, pendingIncome, type SummaryCharge } from './property-summary'

const TODAY = '2026-09-03'

function rent(due: string, paid?: string): SummaryCharge {
  return { kind: 'rent', direction: 'in', due_date: due, amount: 335000, responsible: 'owner', paid_date: paid ?? null }
}
function bill(kind: string, due: string, amount: number, paid?: string): SummaryCharge {
  return { kind, direction: 'out', due_date: due, amount, responsible: 'owner', paid_date: paid ?? null }
}
function tenantBill(kind: string, due: string, amount: number): SummaryCharge {
  return { kind, direction: 'out', due_date: due, amount, responsible: 'tenant', paid_date: null }
}

describe('propertySummary — por cobrar', () => {
  it('suma los arriendos vencidos de todos los meses, no solo del actual', () => {
    // Tres meses impagos son una sola cifra: partirla por mes la esconde.
    const s = propertySummary(
      [rent('2026-06-05'), rent('2026-07-05'), rent('2026-08-05')], TODAY, 335000, 248400,
    )
    expect(s.toReceive).toBe(1_005_000)
    expect(s.toReceiveCount).toBe(3)
  })

  it('un arriendo que aún no vence no cuenta como por cobrar', () => {
    const s = propertySummary([rent('2026-09-05')], TODAY, 335000, 248400)
    expect(s.toReceive).toBe(0)
    expect(s.toReceiveCount).toBe(0)
  })

  it('un arriendo pagado no cuenta', () => {
    const s = propertySummary([rent('2026-08-05', '2026-08-04')], TODAY, 335000, 248400)
    expect(s.toReceive).toBe(0)
  })

  it('un abono parcial deja solo el saldo', () => {
    const parcial: SummaryCharge = {
      ...rent('2026-08-05'), paid_date: '2026-08-06', paid_amount: 200000,
    }
    const s = propertySummary([parcial], TODAY, 335000, 248400)
    expect(s.toReceive).toBe(135_000)
    expect(s.toReceiveCount).toBe(1)
  })
})

describe('propertySummary — cuentas del mes', () => {
  it('suma solo las salidas tuyas del mes en curso, sin el dividendo', () => {
    const s = propertySummary([
      bill('mortgage', '2026-09-01', 248400, '2026-09-01'),  // excluido: tiene tarjeta propia
      bill('aseo', '2026-09-30', 41900),
      bill('aseo', '2026-08-30', 41900),                     // otro mes
    ], TODAY, 335000, 248400)
    expect(s.ownerBills).toBe(41_900)
    expect(s.ownerBillsCount).toBe(1)
  })

  it('las cuentas del arrendatario no son costo tuyo', () => {
    const s = propertySummary([
      tenantBill('gastos_comunes', '2026-09-10', 96500),
      tenantBill('electricity', '2026-09-12', 34210),
    ], TODAY, 335000, 248400)
    expect(s.ownerBills).toBe(0)
  })

  it('distingue lo cobrado de lo que sigue impago', () => {
    const s = propertySummary([
      bill('aseo', '2026-09-30', 41900),
      bill('repair', '2026-09-15', 20000, '2026-09-02'),
    ], TODAY, 335000, 248400)
    expect(s.ownerBills).toBe(61_900)
    expect(s.ownerBillsUnpaid).toBe(41_900)
  })
})

describe('propertySummary — margen', () => {
  it('arriendo menos dividendo menos cuentas tuyas', () => {
    const s = propertySummary([bill('aseo', '2026-09-30', 41900)], TODAY, 335000, 248400)
    expect(s.margin).toBe(335000 - 248400 - 41900)
  })

  it('sin dividendo el margen es null, no el arriendo entero', () => {
    // Devolver +$335.000 sugeriría una ganancia que no existe.
    expect(propertySummary([], TODAY, 335000, null).margin).toBeNull()
  })

  it('sin contrato el margen es null', () => {
    expect(propertySummary([], TODAY, null, 248400).margin).toBeNull()
  })

  it('puede ser negativo cuando el dividendo supera al arriendo', () => {
    expect(propertySummary([], TODAY, 300000, 400000, ).margin).toBe(-100_000)
  })
})

describe('monthBills', () => {
  it('trae las salidas tuyas del mes, dividendo incluido, por fecha', () => {
    const list = monthBills([
      bill('aseo', '2026-09-30', 41900),
      bill('mortgage', '2026-09-01', 248400),
      tenantBill('gastos_comunes', '2026-09-10', 96500),
      bill('aseo', '2026-08-30', 41900),
    ], TODAY)
    expect(list.map(c => c.kind)).toEqual(['mortgage', 'aseo'])
  })
})

describe('pendingIncome', () => {
  it('ordena de más viejo a más nuevo', () => {
    const list = pendingIncome([rent('2026-09-05'), rent('2026-06-05'), rent('2026-07-05')], TODAY)
    expect(list.map(c => c.due_date)).toEqual(['2026-06-05', '2026-07-05', '2026-09-05'])
  })

  it('excluye lo ya cobrado', () => {
    const list = pendingIncome([rent('2026-08-05', '2026-08-05'), rent('2026-09-05')], TODAY)
    expect(list).toHaveLength(1)
  })

  it('ignora las salidas', () => {
    expect(pendingIncome([bill('aseo', '2026-09-30', 41900)], TODAY)).toHaveLength(0)
  })
})
