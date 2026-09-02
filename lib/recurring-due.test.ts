import { describe, it, expect } from 'vitest'
import { monthlyDueDates, annualDueDates, effectiveDay, CATCHUP_MONTHS } from './recurring-due'

describe('effectiveDay', () => {
  it('respeta el día de cobro cuando el mes lo permite', () => {
    expect(effectiveDay(29, 2026, 8)).toBe(29)
  })

  it('cae al último día del mes si el día no existe (31 en abril)', () => {
    expect(effectiveDay(31, 2026, 4)).toBe(30)
  })

  it('febrero no bisiesto: el 29 pasa a 28', () => {
    expect(effectiveDay(29, 2026, 2)).toBe(28)
  })

  it('febrero bisiesto: el 29 sí existe', () => {
    expect(effectiveDay(29, 2028, 2)).toBe(29)
  })
})

describe('monthlyDueDates — el bug real de Spotify (sep 2026)', () => {
  // Cas usó la app por última vez el 27 de agosto y volvió el 2 de septiembre.
  // Spotify cobra el 29: ese cobro cayó justo en los días sin abrir la app y
  // el mes se cerró. Antes esto se perdía para siempre.
  const spotify = { billingDay: 29 }

  it('al volver el 2 de septiembre, recupera el cobro del 29 de agosto', () => {
    const dates = monthlyDueDates(spotify, '2026-09-02', '2026-06-20').map(d => d.date)
    expect(dates).toContain('2026-08-29')
  })

  it('NO inventa el cobro de septiembre, que todavía no llega', () => {
    const dates = monthlyDueDates(spotify, '2026-09-02', '2026-06-20').map(d => d.date)
    expect(dates).not.toContain('2026-09-29')
  })

  it('devuelve los cobros de más antiguo a más reciente', () => {
    const dates = monthlyDueDates(spotify, '2026-09-02', '2026-06-20').map(d => d.date)
    expect(dates).toEqual([...dates].sort())
  })
})

describe('monthlyDueDates — bordes', () => {
  it('el cobro del mes en curso entra el mismo día que se cumple', () => {
    const dates = monthlyDueDates({ billingDay: 11 }, '2026-09-11').map(d => d.date)
    expect(dates).toContain('2026-09-11')
  })

  it('el cobro del mes en curso NO entra el día anterior', () => {
    const dates = monthlyDueDates({ billingDay: 11 }, '2026-09-10').map(d => d.date)
    expect(dates).not.toContain('2026-09-11')
  })

  it('no genera cobros anteriores al alta del recurrente', () => {
    // El cobro de agosto (05-08) es anterior al alta (20-08) y el de
    // septiembre (05-09) todavía no llega → no hay nada pendiente.
    const dates = monthlyDueDates({ billingDay: 5 }, '2026-09-02', '2026-08-20').map(d => d.date)
    expect(dates).toEqual([])
  })

  it('un ítem creado el mismo día del cobro sí lo genera', () => {
    const dates = monthlyDueDates({ billingDay: 29 }, '2026-09-02', '2026-08-29').map(d => d.date)
    expect(dates).toContain('2026-08-29')
  })

  it('no mira más atrás que la ventana de catch-up', () => {
    const dates = monthlyDueDates({ billingDay: 15 }, '2026-09-20', null)
    expect(dates).toHaveLength(CATCHUP_MONTHS + 1)
    expect(dates[0].date).toBe('2026-06-15')
  })

  it('cruza el cambio de año hacia atrás sin romperse', () => {
    const dates = monthlyDueDates({ billingDay: 10 }, '2026-01-15', null, 3).map(d => d.date)
    expect(dates).toEqual(['2025-10-10', '2025-11-10', '2025-12-10', '2026-01-10'])
  })

  it('día 31 en meses cortos cae al último día real', () => {
    const dates = monthlyDueDates({ billingDay: 31 }, '2026-07-05', null, 3).map(d => d.date)
    expect(dates).toContain('2026-04-30')
    expect(dates).toContain('2026-06-30')
  })
})

describe('annualDueDates', () => {
  // Google: billing_month 6, billing_day 26 — se cobró bien el 26 de junio y
  // no vuelve hasta junio 2027. El catch-up no puede duplicarlo ni adelantarlo.
  const google = { billingDay: 26, billingMonth: 6 }

  it('no genera nada fuera de la ventana de catch-up', () => {
    // Hoy 2 de septiembre: junio quedó a 3 meses, justo en el borde.
    expect(annualDueDates(google, '2026-09-02', '2026-06-26', 2)).toHaveLength(0)
  })

  it('dentro de la ventana sí recupera el cobro anual perdido', () => {
    const dates = annualDueDates(google, '2026-07-10', '2026-06-26', 3).map(d => d.date)
    expect(dates).toEqual(['2026-06-26'])
  })

  it('no adelanta el cobro del año en curso si el mes no llegó', () => {
    const dates = annualDueDates(google, '2026-03-10', null, 3)
    expect(dates).toHaveLength(0)
  })

  it('un ítem mensual (sin billing_month) no produce cobros anuales', () => {
    expect(annualDueDates({ billingDay: 29, billingMonth: null }, '2026-09-02')).toHaveLength(0)
  })
})
