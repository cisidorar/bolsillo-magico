import { describe, it, expect } from 'vitest'
import {
  chargeTotal, chargeStatus, chargeOutstanding, daysBetween,
  estimateArrears, aseoDueDates, aseoRef, propertyHealth, nextDue,
  mortgageProgress, type ChargeLike,
} from './property-charges'

const TODAY = '2026-09-03'

/** Cobro de aseo tal como llega el giro municipal. */
function aseo(due: string, amount: number, penalty = 0, ipc = 0, paid?: string): ChargeLike {
  return {
    kind: 'aseo', direction: 'out', due_date: due,
    amount, penalty, inflation_adj: ipc,
    paid_date: paid ?? null, responsible: 'owner',
  }
}

describe('chargeTotal', () => {
  it('suma base + penal + reajuste', () => {
    expect(chargeTotal(aseo('2026-04-30', 13950, 391, 350))).toBe(14691)
  })

  it('trata penal y reajuste ausentes como cero', () => {
    expect(chargeTotal({ due_date: '2026-09-30', amount: 14330 })).toBe(14330)
  })
})

describe('daysBetween', () => {
  it('cuenta días enteros hacia adelante', () => {
    expect(daysBetween('2026-09-03', '2026-09-30')).toBe(27)
  })

  it('devuelve negativo cuando la fecha ya pasó', () => {
    expect(daysBetween('2026-09-03', '2026-06-30')).toBe(-65)
  })

  it('cruza cambio de año sin desfase', () => {
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3)
  })

  it('no se corre por horario de verano (mediodía, no medianoche)', () => {
    // Chile cambia de hora en septiembre; parsear a medianoche daría 0 o 2.
    expect(daysBetween('2026-09-05', '2026-09-06')).toBe(1)
  })
})

describe('chargeStatus', () => {
  it('vencido cuando pasó la fecha y no hay pago', () => {
    expect(chargeStatus(aseo('2026-06-30', 13950), TODAY)).toBe('overdue')
  })

  it('pronto cuando vence dentro de 3 días', () => {
    expect(chargeStatus(aseo('2026-09-05', 14330), TODAY)).toBe('due_soon')
  })

  it('pendiente cuando falta más de 3 días', () => {
    expect(chargeStatus(aseo('2026-09-30', 14330), TODAY)).toBe('pending')
  })

  it('el día exacto del vencimiento todavía no está vencido', () => {
    expect(chargeStatus(aseo(TODAY, 14330), TODAY)).toBe('due_soon')
  })

  it('pagado cuando el abono cubre el total', () => {
    const c = { ...aseo('2026-04-30', 13950, 391, 350, '2026-05-02'), paid_amount: 14691 }
    expect(chargeStatus(c, TODAY)).toBe('paid')
  })

  it('pagado si hay fecha de pago sin monto (se asume completo)', () => {
    expect(chargeStatus(aseo('2026-04-30', 13950, 391, 350, '2026-05-02'), TODAY)).toBe('paid')
  })

  it('parcial cuando el abono no alcanza — ni pagado ni impago', () => {
    const c = { ...aseo('2026-04-30', 13950, 391, 350, '2026-05-02'), paid_amount: 10000 }
    expect(chargeStatus(c, TODAY)).toBe('partial')
  })
})

describe('chargeOutstanding', () => {
  it('todo el total si no se ha pagado', () => {
    expect(chargeOutstanding(aseo('2026-06-30', 13950, 194, 34))).toBe(14178)
  })

  it('solo el saldo si hubo abono parcial', () => {
    const c = { ...aseo('2026-06-30', 13950, 194, 34, '2026-07-01'), paid_amount: 10000 }
    expect(chargeOutstanding(c)).toBe(4178)
  })

  it('cero cuando está pagado del todo', () => {
    const c = { ...aseo('2026-06-30', 13950, 194, 34, '2026-07-01'), paid_amount: 14178 }
    expect(chargeOutstanding(c)).toBe(0)
  })

  it('nunca negativo aunque se pague de más', () => {
    const c = { ...aseo('2026-06-30', 13950, 0, 0, '2026-07-01'), paid_amount: 20000 }
    expect(chargeOutstanding(c)).toBe(0)
  })
})

describe('estimateArrears', () => {
  it('no cobra recargo antes del vencimiento', () => {
    expect(estimateArrears(13950, '2026-09-30', TODAY)).toEqual({
      penalty: 0, inflationAdj: 0, isEstimate: true,
    })
  })

  it('crece con el tiempo de mora', () => {
    const corto = estimateArrears(13950, '2026-06-30', TODAY)
    const largo = estimateArrears(13950, '2026-04-30', TODAY)
    expect(largo.penalty).toBeGreaterThan(corto.penalty)
  })

  it('se declara siempre como estimado — el número real lo pone TGR', () => {
    expect(estimateArrears(13950, '2026-04-30', TODAY).isEstimate).toBe(true)
  })

  it('queda en el orden de magnitud del giro real, sin pretender exactitud', () => {
    // Giro 2600580210: vencido el 30/04, penal real $391 al 03/09.
    // Solo exigimos misma escala: si el estimado se fuera a miles, la UI
    // mostraría una alarma falsa.
    const est = estimateArrears(13950, '2026-04-30', TODAY)
    expect(est.penalty).toBeGreaterThan(100)
    expect(est.penalty).toBeLessThan(1500)
  })
})

describe('aseoDueDates', () => {
  it('son los 4 vencimientos del calendario de TGR', () => {
    expect(aseoDueDates(2026)).toEqual([
      '2026-04-30', '2026-06-30', '2026-09-30', '2026-11-30',
    ])
  })

  it('sirve igual para cualquier año', () => {
    expect(aseoDueDates(2027)[0]).toBe('2027-04-30')
  })

  it('genera referencias estables para idempotencia', () => {
    expect(aseoRef(2026, 3)).toBe('aseo-2026-Q3')
  })
})

describe('propertyHealth — el caso real del ROL 105980225', () => {
  // Los 4 giros tal como llegan: dos vencidos impagos, dos por venir.
  const giros = [
    aseo('2026-04-30', 13950, 391, 350),
    aseo('2026-06-30', 13950, 194, 34),
    aseo('2026-09-30', 14330),
    aseo('2026-11-30', 14330),
  ]

  it('la deuda viva es la suma de los dos giros vencidos', () => {
    // 14.691 + 14.178 — el número que se muestra en el hero.
    expect(propertyHealth(giros, TODAY).debtTotal).toBe(28869)
  })

  it('marca exactamente los dos vencidos', () => {
    const h = propertyHealth(giros, TODAY)
    expect(h.overdue).toHaveLength(2)
    expect(h.overdue.map(c => c.due_date)).toEqual(['2026-04-30', '2026-06-30'])
  })

  it('no está ok mientras haya algo vencido', () => {
    expect(propertyHealth(giros, TODAY).ok).toBe(false)
  })

  it('el próximo por vencer es el giro de septiembre', () => {
    expect(nextDue(giros, TODAY)?.due_date).toBe('2026-09-30')
  })

  it('pagando los dos vencidos la deuda queda en cero', () => {
    const pagados = giros.map((c, i) =>
      i < 2 ? { ...c, paid_date: '2026-09-03', paid_amount: chargeTotal(c) } : c)
    const h = propertyHealth(pagados, TODAY)
    expect(h.debtTotal).toBe(0)
    expect(h.overdue).toHaveLength(0)
  })
})

describe('propertyHealth — arrendatario vs propietario', () => {
  it('un consumo impago del arrendatario no suma a tu deuda', () => {
    const charges: ChargeLike[] = [
      { kind: 'water', direction: 'out', due_date: '2026-08-20',
        amount: 24000, responsible: 'tenant' },
    ]
    const h = propertyHealth(charges, TODAY)
    expect(h.debtTotal).toBe(0)
    expect(h.overdue).toHaveLength(0)
  })

  it('pero sí se muestra aparte — su mora es causal de término', () => {
    const charges: ChargeLike[] = [
      { kind: 'gastos_comunes', direction: 'out', due_date: '2026-08-20',
        amount: 60000, responsible: 'tenant' },
    ]
    const h = propertyHealth(charges, TODAY)
    expect(h.tenantOverdue).toHaveLength(1)
    expect(h.ok).toBe(false)
  })

  it('un arriendo impago no es deuda tuya: es plata que no llegó', () => {
    const charges: ChargeLike[] = [
      { kind: 'rent', direction: 'in', due_date: '2026-09-01',
        amount: 335000, responsible: 'owner' },
    ]
    const h = propertyHealth(charges, TODAY)
    expect(h.overdue).toHaveLength(1)   // hay que actuar
    expect(h.debtTotal).toBe(0)         // pero no debes $335.000
  })
})

describe('propertyHealth — dividendo sin confirmar', () => {
  const dividendo: ChargeLike = {
    kind: 'mortgage', direction: 'out', due_date: '2026-09-01',
    amount: 420000, paid_date: '2026-09-01', paid_amount: 420000,
    auto_debit: true, confirmed: false, responsible: 'owner',
  }

  it('nace pagado: no genera alerta falsa de impago', () => {
    const h = propertyHealth([dividendo], TODAY)
    expect(h.overdue).toHaveLength(0)
    expect(h.debtTotal).toBe(0)
  })

  it('pero queda listado como pendiente de revisar', () => {
    expect(propertyHealth([dividendo], TODAY).unconfirmed).toHaveLength(1)
  })

  it('confirmado deja de aparecer', () => {
    const h = propertyHealth([{ ...dividendo, confirmed: true }], TODAY)
    expect(h.unconfirmed).toHaveLength(0)
  })
})

describe('propertyHealth — todo al día', () => {
  it('ok cuando no queda nada vencido ni por vencer', () => {
    const h = propertyHealth([aseo('2026-11-30', 14330)], TODAY)
    expect(h.ok).toBe(true)
    expect(h.debtTotal).toBe(0)
  })

  it('ok con la lista vacía — una propiedad recién creada no está en alerta', () => {
    expect(propertyHealth([], TODAY).ok).toBe(true)
  })

  it('deja de estar ok si algo vence dentro de 3 días', () => {
    expect(propertyHealth([aseo('2026-09-05', 14330)], TODAY).ok).toBe(false)
  })
})

describe('nextDue', () => {
  it('null cuando no queda nada pendiente', () => {
    expect(nextDue([], TODAY)).toBeNull()
  })

  it('ignora los ya pagados', () => {
    const charges = [
      aseo('2026-09-30', 14330, 0, 0, '2026-09-01'),
      aseo('2026-11-30', 14330),
    ]
    expect(nextDue(charges, TODAY)?.due_date).toBe('2026-11-30')
  })

  it('ignora los vencidos: "próximo" mira hacia adelante', () => {
    const charges = [aseo('2026-06-30', 13950), aseo('2026-09-30', 14330)]
    expect(nextDue(charges, TODAY)?.due_date).toBe('2026-09-30')
  })
})

/** Cuota de dividendo tal como la muestra la cartola del banco. */
function cuota(due: string, amount: number, paid?: string): ChargeLike {
  return { kind: 'mortgage', direction: 'out', due_date: due, amount, paid_date: paid ?? null, responsible: 'owner' }
}

describe('mortgageProgress', () => {
  it('cuenta solo las cuotas pagadas, no las generadas a futuro', () => {
    const charges = [
      cuota('2026-07-01', 280730, '2026-07-01'),
      cuota('2026-08-03', 280873, '2026-08-03'),
      cuota('2026-09-01', 281075, '2026-09-01'),
      cuota('2026-10-01', 281075),  // generada, aún no pagada
    ]
    const p = mortgageProgress(charges, 360)
    expect(p.paidCount).toBe(3)
    expect(p.pendingCount).toBe(357)
  })

  it('el monto de la última pagada es el UF-indexado más reciente, no un promedio', () => {
    const charges = [
      cuota('2026-07-01', 280730, '2026-07-01'),
      cuota('2026-09-01', 281075, '2026-09-01'),
      cuota('2026-08-03', 280873, '2026-08-03'),
    ]
    // Ordena por fecha de pago, no por orden de la lista.
    expect(mortgageProgress(charges, 360).lastPaidAmount).toBe(281075)
  })

  it('sin total de cuotas, pendingCount es null en vez de un número inventado', () => {
    const p = mortgageProgress([cuota('2026-07-01', 280730, '2026-07-01')], null)
    expect(p.pendingCount).toBeNull()
    expect(p.paidCount).toBe(1)
  })

  it('sin cuotas pagadas, todo en cero y lastPaidAmount null', () => {
    const p = mortgageProgress([cuota('2026-07-01', 280730)], 360)
    expect(p.paidCount).toBe(0)
    expect(p.pendingCount).toBe(360)
    expect(p.lastPaidAmount).toBeNull()
  })

  it('nunca pendingCount negativo si se pagaron más cuotas que el total cargado', () => {
    const charges = [cuota('2026-07-01', 280730, '2026-07-01'), cuota('2026-08-01', 280873, '2026-08-01')]
    expect(mortgageProgress(charges, 1).pendingCount).toBe(0)
  })

  it('ignora cobros de otro tipo', () => {
    const charges = [aseo('2026-07-30', 14330, 0, 0, '2026-07-30'), cuota('2026-07-01', 280730, '2026-07-01')]
    expect(mortgageProgress(charges, 360).paidCount).toBe(1)
  })
})
