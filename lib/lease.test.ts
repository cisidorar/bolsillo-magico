import { describe, it, expect } from 'vitest'
import {
  addMonths, nextAdjustmentDate, computeAdjustedRent, lateFee,
  terminationRight, noticeDeadline, rentDueDate, rentPeriodsToGenerate,
  rentRef, mortgageRef, type LeaseLike,
} from './lease'
import type { IpcObservation } from './cl-indicators'

// Contrato real de Cas (notariado 30/05/2026) como caso base de los tests.
const CONTRATO: LeaseLike = {
  start_date:           '2026-06-01',
  end_date:             null,
  notice_days:          60,
  rent_amount:          335_000,
  rent_due_day:         5,
  late_fee_per_day:     5_000,
  termination_days:     30,
  adjustment_kind:      'ipc',
  adjustment_months:    6,
  last_adjustment_date: '2026-06-01',
}

describe('addMonths', () => {
  it('suma meses conservando el día', () => {
    expect(addMonths('2026-06-01', 6)).toBe('2026-12-01')
    expect(addMonths('2026-09-15', 3)).toBe('2026-12-15')
  })

  it('cruza el cambio de año', () => {
    expect(addMonths('2026-11-05', 3)).toBe('2027-02-05')
  })

  it('hace clamp al último día real del mes destino', () => {
    // 31 de enero + 1 mes no es "31 de febrero" — cae al 28.
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-08-31', 1)).toBe('2026-09-30')
  })
})

describe('nextAdjustmentDate', () => {
  it('el primer reajuste del contrato de Cas cae en diciembre 2026', () => {
    expect(nextAdjustmentDate(CONTRATO)).toBe('2026-12-01')
  })

  it('usa start_date si nunca se ha reajustado', () => {
    expect(nextAdjustmentDate({ ...CONTRATO, last_adjustment_date: null })).toBe('2026-12-01')
  })

  it('devuelve null si el contrato no reajusta', () => {
    expect(nextAdjustmentDate({ ...CONTRATO, adjustment_kind: 'none' })).toBeNull()
  })
})

describe('computeAdjustedRent', () => {
  // Semestre jun-nov 2026 con IPC mensual positivo.
  const ipc: IpcObservation[] = [
    { date: '2026-07-01', pctChange: 0.4 },
    { date: '2026-08-01', pctChange: 0.3 },
    { date: '2026-09-01', pctChange: 0.2 },
    { date: '2026-10-01', pctChange: 0.3 },
    { date: '2026-11-01', pctChange: 0.4 },
    { date: '2026-12-01', pctChange: 0.2 },
  ]

  it('sube la renta por el IPC acumulado del período', () => {
    const r = computeAdjustedRent(CONTRATO, ipc, '2026-12-01')!
    // factor ≈ 1.0181 → 335.000 × 1.0181 ≈ 341.064
    expect(r.newRent).toBeGreaterThan(340_000)
    expect(r.newRent).toBeLessThan(342_000)
    expect(r.delta).toBe(r.newRent - 335_000)
    expect(r.floored).toBe(false)
  })

  it('NO baja la renta si el IPC del período fue negativo', () => {
    // El contrato dice explícitamente que la renta no baja con deflación.
    const deflacion: IpcObservation[] = [
      { date: '2026-07-01', pctChange: -0.5 },
      { date: '2026-08-01', pctChange: -0.3 },
    ]
    const r = computeAdjustedRent(CONTRATO, deflacion, '2026-12-01')!
    expect(r.newRent).toBe(335_000)
    expect(r.delta).toBe(0)
    expect(r.floored).toBe(true)
  })

  it('devuelve null si el contrato no reajusta por IPC', () => {
    expect(computeAdjustedRent({ ...CONTRATO, adjustment_kind: 'none' }, ipc, '2026-12-01')).toBeNull()
  })
})

describe('lateFee', () => {
  it('cobra $5.000 por cada día de atraso', () => {
    // Vencía el 5, se paga el 12 → 7 días × 5.000
    expect(lateFee(CONTRATO, '2026-09-05', '2026-09-12')).toBe(35_000)
  })

  it('es 0 si se paga el mismo día del vencimiento', () => {
    expect(lateFee(CONTRATO, '2026-09-05', '2026-09-05')).toBe(0)
  })

  it('es 0 si se paga antes de vencer', () => {
    expect(lateFee(CONTRATO, '2026-09-05', '2026-09-01')).toBe(0)
  })

  it('es 0 si el contrato no fija multa', () => {
    expect(lateFee({ ...CONTRATO, late_fee_per_day: null }, '2026-09-05', '2026-09-20')).toBe(0)
  })
})

describe('terminationRight', () => {
  it('no da derecho a término antes de los 30 días', () => {
    const r = terminationRight(CONTRATO, '2026-09-05', '2026-09-20')
    expect(r.daysLate).toBe(15)
    expect(r.entitled).toBe(false)
  })

  it('da derecho a término al cumplirse el umbral', () => {
    const r = terminationRight(CONTRATO, '2026-09-05', '2026-10-05')
    expect(r.daysLate).toBe(30)
    expect(r.entitled).toBe(true)
    expect(r.threshold).toBe(30)
  })

  it('nunca devuelve días negativos', () => {
    expect(terminationRight(CONTRATO, '2026-09-05', '2026-09-01').daysLate).toBe(0)
  })
})

describe('noticeDeadline', () => {
  it('resta los días de aviso a la fecha de término', () => {
    const c = { ...CONTRATO, end_date: '2027-05-31', notice_days: 60 }
    expect(noticeDeadline(c)).toBe('2027-04-01')
  })

  it('es null en contrato indefinido', () => {
    expect(noticeDeadline(CONTRATO)).toBeNull()
  })
})

describe('rentDueDate', () => {
  it('usa el día del contrato', () => {
    expect(rentDueDate(CONTRATO, 2026, 9)).toBe('2026-09-05')
  })

  it('hace clamp si el mes es más corto que el día pactado', () => {
    const c = { ...CONTRATO, rent_due_day: 28 }
    expect(rentDueDate(c, 2027, 2)).toBe('2027-02-28')
  })
})

describe('rentPeriodsToGenerate', () => {
  it('genera desde el inicio del contrato hasta el mes en curso, inclusive', () => {
    const p = rentPeriodsToGenerate(CONTRATO, '2026-09-03')
    expect(p).toEqual([
      { year: 2026, month: 6 }, { year: 2026, month: 7 },
      { year: 2026, month: 8 }, { year: 2026, month: 9 },
    ])
  })

  it('cruza el cambio de año', () => {
    const c = { ...CONTRATO, start_date: '2026-11-01' }
    expect(rentPeriodsToGenerate(c, '2027-01-15')).toEqual([
      { year: 2026, month: 11 }, { year: 2026, month: 12 }, { year: 2027, month: 1 },
    ])
  })

  it('se detiene en end_date — un contrato terminado no sigue generando', () => {
    const c = { ...CONTRATO, end_date: '2026-07-31' }
    expect(rentPeriodsToGenerate(c, '2026-09-03')).toEqual([
      { year: 2026, month: 6 }, { year: 2026, month: 7 },
    ])
  })

  it('devuelve solo el mes de inicio si empieza este mes', () => {
    const c = { ...CONTRATO, start_date: '2026-09-01' }
    expect(rentPeriodsToGenerate(c, '2026-09-03')).toEqual([{ year: 2026, month: 9 }])
  })
})

describe('refs idempotentes', () => {
  it('pad de mes a dos dígitos para que ordenen alfabéticamente', () => {
    expect(rentRef(2026, 9)).toBe('rent-2026-09')
    expect(mortgageRef(2026, 12)).toBe('mortgage-2026-12')
    // El pad importa: sin él 'rent-2026-10' < 'rent-2026-9' al ordenar texto.
    expect(rentRef(2026, 10) > rentRef(2026, 9)).toBe(true)
  })
})
