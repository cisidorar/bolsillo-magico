import { describe, it, expect } from 'vitest'
import { fmtLastAutoUpdate } from './format-freshness'

// Todas las horas de "ahora" se dan a mediodía Chile para no rozar el
// borde de zona horaria entre CL y ET — el punto de estos tests es el
// conteo de días hábiles, no el corte fino de horario.
function clNoon(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00-04:00')   // CLT ≈ UTC-4 en sep 2026
}

describe('fmtLastAutoUpdate — sep 2026, bug real reportado por Cas', () => {
  it('viernes → lunes (feriado no involucrado): NO es viejo — son fines de semana, no un cron caído', () => {
    // Último análisis: viernes 4 sep. "Hoy": lunes... pero un lunes CUALQUIERA
    // que no sea feriado ya se cubría antes con diffDays<=1 desde el domingo;
    // acá probamos el caso real de Cas, el feriado.
    const r = fmtLastAutoUpdate('2026-09-04T22:33:00Z', clNoon('2026-09-07'))
    // 2026-09-07 es Labor Day (feriado NYSE) — el último hábil sigue siendo el viernes 4.
    expect(r.stale).toBe(false)
  })

  it('viernes → martes después de Labor Day: NO es viejo (el caso exacto reportado)', () => {
    // Viernes 4 sep (último cierre real) → martes 8 sep, con sábado+domingo+
    // Labor Day de por medio. Antes: diffDays=4 → "viejo, revisa el cron".
    // El cron en realidad corrió bien los 3 días que no eran hábiles.
    const r = fmtLastAutoUpdate('2026-09-04T22:33:00Z', clNoon('2026-09-08'))
    expect(r.stale).toBe(false)
  })

  it('el mismo viernes, más tarde ese día: no es viejo', () => {
    const r = fmtLastAutoUpdate('2026-09-04T22:33:00Z', clNoon('2026-09-04'))
    expect(r.stale).toBe(false)
  })

  it('un hábil real se saltó: SÍ es viejo (el cron de verdad se cayó)', () => {
    // Último análisis viernes 4 sep. "Hoy" miércoles 9 sep — el cron debió
    // correr el martes 8 (hábil normal) y no lo hizo.
    const r = fmtLastAutoUpdate('2026-09-04T22:33:00Z', clNoon('2026-09-09'))
    expect(r.stale).toBe(true)
  })

  it('actualización de ayer hábil (sin feriados de por medio): no es viejo', () => {
    const r = fmtLastAutoUpdate('2026-09-08T22:33:00Z', clNoon('2026-09-09'))
    expect(r.stale).toBe(false)
  })
})
