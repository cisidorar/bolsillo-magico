import { describe, it, expect } from 'vitest'
import { estadoModel, monthGrid, cuotasOfYear, joinEs, isTenantSide, type EstadoCharge } from './property-estado'

const fmt = (n: number) => `$${n}`
let seq = 0
const C = (o: Partial<EstadoCharge> & { kind: string; due_date: string }): EstadoCharge => ({
  id: `c${++seq}`, amount: 1000, direction: 'out', responsible: 'tenant', paid_date: null, ...o,
})
const today = '2026-10-18'

// Octubre: arriendo pagado, luz por vencer, agua y gastos comunes pendientes; aseo de septiembre vencido.
const charges: EstadoCharge[] = [
  C({ kind: 'rent', direction: 'in', due_date: '2026-10-05', paid_date: '2026-10-05', amount: 335000 }),
  C({ kind: 'electricity', due_date: '2026-10-24', amount: 15509 }),
  C({ kind: 'water', due_date: '2026-10-28', amount: 940 }),
  C({ kind: 'gastos_comunes', due_date: '2026-10-30', amount: 91073, is_estimate: true }),
  C({ kind: 'aseo', responsible: 'owner', due_date: '2026-09-30', amount: 14330 }),
  C({ kind: 'aseo', responsible: 'owner', due_date: '2026-06-30', paid_date: '2026-07-02' }),
  C({ kind: 'rent', direction: 'in', due_date: '2026-09-05', paid_date: '2026-09-05' }),
]

describe('joinEs', () => {
  it('une en español', () => {
    expect(joinEs([])).toBe('')
    expect(joinEs(['a'])).toBe('a')
    expect(joinEs(['a', 'b'])).toBe('a y b')
    expect(joinEs(['a', 'b', 'c'])).toBe('a, b y c')
  })
})

describe('isTenantSide', () => {
  it('el arriendo (entrada) y las cuentas de consumo son del arrendatario; la garantía no', () => {
    expect(isTenantSide(C({ kind: 'rent', direction: 'in', responsible: 'owner', due_date: today }))).toBe(true)
    expect(isTenantSide(C({ kind: 'water', due_date: today }))).toBe(true)
    expect(isTenantSide(C({ kind: 'deposit', direction: 'in', due_date: today }))).toBe(false)
    expect(isTenantSide(C({ kind: 'aseo', responsible: 'owner', due_date: today }))).toBe(false)
  })
})

describe('estadoModel', () => {
  const m = estadoModel(charges, today, '2026-10', fmt)

  it('cuenta 4 cosas pendientes: luz, agua, gastos comunes y el aseo vencido', () => {
    expect(m.pendingCount).toBe(4)
  })
  it('describe lo que pagó y lo que falta del arrendatario', () => {
    expect(m.tenantText).toBe('Pagó arriendo. Falta luz, agua y gastos comunes.')
    expect(m.tenantTone).toBe('soon')
    expect(m.paidTenantCount).toBe(1)
  })
  it('lo vencido tuyo manda, aunque sea de otro mes', () => {
    expect(m.ownerTone).toBe('overdue')
    expect(m.ownerText).toBe('Vencido: derechos de aseo de septiembre, $14330.')
  })
  it('una tarjeta por servicio, con null si este mes no hay cobro', () => {
    const sept = estadoModel(charges, today, '2026-09', fmt)
    expect(sept.tenantCards.find(t => t.kind === 'electricity')!.charge).toBeNull()
    expect(sept.tenantCards.find(t => t.kind === 'rent')!.charge).not.toBeNull()
  })
  it('todo pagado → "Pagó todo este mes."', () => {
    const paid = charges.map(c => ({ ...c, paid_date: c.paid_date ?? '2026-10-10' }))
    const p = estadoModel(paid, today, '2026-10', fmt)
    expect(p.tenantText).toBe('Pagó todo este mes.')
    expect(p.tenantTone).toBe('paid')
    expect(p.pendingCount).toBe(0)
    expect(p.ownerText).toBe('Nada por pagar este mes.')
  })
  it('varias cuentas vencidas se resumen con el total', () => {
    const many = [...charges, C({ kind: 'aseo', responsible: 'owner', due_date: '2026-08-31', amount: 14330 })]
    const r = estadoModel(many, today, '2026-10', fmt)
    expect(r.ownerText).toBe('2 cuentas vencidas (agosto y septiembre): $28660.')
  })
})

describe('monthGrid', () => {
  const keys = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
  const rows = monthGrid(charges, keys, today)
  it('una fila por servicio presente, arrendatario primero', () => {
    expect(rows.map(r => r.kind)).toEqual(['rent', 'electricity', 'water', 'gastos_comunes', 'aseo'])
    expect(rows.at(-1)!.side).toBe('owner')
  })
  it('celdas por mes con su tono, null si no hay cobro', () => {
    const rent = rows.find(r => r.kind === 'rent')!
    expect(rent.cells).toHaveLength(6)
    expect(rent.cells.find(c => c.monthKey === '2026-10')!.tone).toBe('paid')
    expect(rent.cells.find(c => c.monthKey === '2026-05')!.tone).toBeNull()
    const aseo = rows.find(r => r.kind === 'aseo')!
    expect(aseo.cells.find(c => c.monthKey === '2026-09')!.tone).toBe('overdue')
    expect(aseo.cells.find(c => c.monthKey === '2026-06')!.tone).toBe('paid')
  })
})

describe('cuotasOfYear', () => {
  it('ordena y rotula las cuotas del año', () => {
    const q = cuotasOfYear(charges, 'aseo', 2026, today)
    expect(q.map(c => [c.short, c.text])).toEqual([['jun', 'Pagada'], ['sep', 'Vencida']])
  })
})

describe('estimateRange', () => {
  const est = { id: 'e', kind: 'gastos_comunes', direction: 'out', responsible: 'tenant', due_date: '2026-10-24', amount: 91073, is_estimate: true } as unknown as EstadoCharge
  const real = (id: string, due: string, amount: number, kind = 'gastos_comunes') =>
    ({ id, kind, direction: 'out', responsible: 'tenant', due_date: due, amount, is_estimate: false }) as unknown as EstadoCharge

  it('usa hasta las 3 últimas boletas reales anteriores, del mismo tipo', async () => {
    const { estimateRange } = await import('./property-estado')
    const r = estimateRange([
      est,
      real('a', '2026-06-24', 70000),
      real('b', '2026-07-24', 87141),
      real('c', '2026-08-24', 89500),
      real('d', '2026-09-24', 91073),
      real('w', '2026-09-22', 8070, 'water'),
    ], est)
    expect(r).toEqual({ count: 3, min: 87141, max: 91073 })
  })

  it('null sin boletas reales de referencia', async () => {
    const { estimateRange } = await import('./property-estado')
    expect(estimateRange([est], est)).toBeNull()
  })
})
