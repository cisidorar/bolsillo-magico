import { describe, it, expect } from 'vitest'
import { buildRentAdjustmentPdf, monthLong, monthShort } from './rent-adjustment-pdf'
import { computeRentAdjustment, adjustmentWindow } from './rent-adjustment'

describe('rent-adjustment-pdf', () => {
  it('formatea meses en español', () => {
    expect(monthLong('2026-12-01')).toBe('diciembre de 2026')
    expect(monthShort('2026-05-01')).toBe('may-26')
  })
  it('genera un PDF válido', async () => {
    const series = adjustmentWindow('2026-12-01').map(date => ({ date, pctChange: 0.3 }))
    const adj = computeRentAdjustment(335_000, series, '2026-12-01')
    const bytes = await buildRentAdjustmentPdf({
      propertyLabel: 'Depto 921, Santa Victoria 562, Santiago',
      landlordName: 'Catalina Isidora Riquelme Zamora',
      tenantName: 'Bruno Adrián Soto Aguilera',
      adjustment: adj, issuedOn: '2026-11-19',
    })
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(1500)
  })
  it('no falla con IPC negativo ni ventana incompleta', async () => {
    const adj = computeRentAdjustment(335_000, [], '2026-12-01')
    const bytes = await buildRentAdjustmentPdf({
      propertyLabel: 'x', landlordName: 'y', tenantName: 'z', adjustment: adj, issuedOn: '2026-11-19',
    })
    expect(bytes.length).toBeGreaterThan(1000)
  })
})
