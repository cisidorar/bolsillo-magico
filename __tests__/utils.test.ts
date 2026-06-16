import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  formatCLP,
  pct,
  isEmoji,
  monthName,
  billingPeriod,
  currentStatementRange,
  relativeDate,
} from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// formatCLP
// ─────────────────────────────────────────────────────────────────────────────
describe('formatCLP', () => {
  it('formatea cero', () => {
    expect(formatCLP(0)).toBe('$0')
  })

  it('formatea miles con punto separador', () => {
    expect(formatCLP(1000)).toBe('$1.000')
  })

  it('formatea millones', () => {
    expect(formatCLP(1500000)).toBe('$1.500.000')
  })

  it('no incluye decimales (coma decimal)', () => {
    // En formato es-CL el separador de miles es "." y el decimal sería ","
    // CLP no tiene centavos, así que no debe haber coma (decimal separator)
    const result = formatCLP(1234)
    expect(result).not.toContain(',')
    expect(result).toContain('$')
    // El punto aquí es separador de miles, no decimal — eso está bien
    expect(result).toBe('$1.234')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// pct
// ─────────────────────────────────────────────────────────────────────────────
describe('pct', () => {
  it('calcula porcentaje básico', () => {
    expect(pct(25, 100)).toBe(25)
  })

  it('redondea al entero más cercano', () => {
    expect(pct(1, 3)).toBe(33)  // 33.33... → 33
  })

  it('retorna 0 si total es 0 (evita división por cero)', () => {
    expect(pct(50, 0)).toBe(0)
  })

  it('cap a 100 cuando value > total', () => {
    expect(pct(150, 100)).toBe(100)
  })

  it('retorna 0 si value es 0', () => {
    expect(pct(0, 100)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// isEmoji
// ─────────────────────────────────────────────────────────────────────────────
describe('isEmoji', () => {
  it('detecta emoji unicode como emoji', () => {
    expect(isEmoji('🛒')).toBe(true)
    expect(isEmoji('🍕')).toBe(true)
    expect(isEmoji('💊')).toBe(true)
  })

  it('nombre Lucide PascalCase no es emoji', () => {
    expect(isEmoji('ShoppingCart')).toBe(false)
    expect(isEmoji('CreditCard')).toBe(false)
    expect(isEmoji('Home')).toBe(false)
  })

  it('string vacío no es emoji', () => {
    expect(isEmoji('')).toBe(false)
  })

  it('string que empieza con minúscula es emoji (ej: texto libre)', () => {
    // La función solo verifica si NO empieza con mayúscula ASCII
    expect(isEmoji('house')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// monthName
// ─────────────────────────────────────────────────────────────────────────────
describe('monthName', () => {
  it('retorna nombre en español', () => {
    expect(monthName(1)).toBe('enero')
    expect(monthName(6)).toBe('junio')
    expect(monthName(12)).toBe('diciembre')
  })

  it('cubre todos los meses', () => {
    const names = Array.from({ length: 12 }, (_, i) => monthName(i + 1))
    expect(names).toHaveLength(12)
    expect(names.every(n => n.length > 0)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// billingPeriod
// ─────────────────────────────────────────────────────────────────────────────
describe('billingPeriod', () => {
  describe('sin billing_day (débito/efectivo)', () => {
    it('retorna el mes de la compra', () => {
      expect(billingPeriod('2026-06-10', null)).toEqual({ month: 6, year: 2026 })
      expect(billingPeriod('2026-01-01', null)).toEqual({ month: 1, year: 2026 })
    })
  })

  describe('con billing_day (tarjeta crédito)', () => {
    // Corte día 15
    it('compra antes del corte → mismo mes', () => {
      // Compra el 10 de junio, corte 15 → estado junio
      expect(billingPeriod('2026-06-10', 15)).toEqual({ month: 6, year: 2026 })
    })

    it('compra en el día exacto del corte → mismo mes', () => {
      // Compra el 15 de junio, corte 15 → estado junio
      expect(billingPeriod('2026-06-15', 15)).toEqual({ month: 6, year: 2026 })
    })

    it('compra después del corte → mes siguiente', () => {
      // Compra el 20 de junio, corte 15 → estado julio
      expect(billingPeriod('2026-06-20', 15)).toEqual({ month: 7, year: 2026 })
    })

    it('cruce de año: compra en diciembre después del corte → estado enero', () => {
      // Compra el 20 de diciembre, corte 15 → estado enero del año siguiente
      expect(billingPeriod('2026-12-20', 15)).toEqual({ month: 1, year: 2027 })
    })

    it('compra el 1ro del mes siempre va al mismo mes', () => {
      expect(billingPeriod('2026-06-01', 15)).toEqual({ month: 6, year: 2026 })
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// currentStatementRange
// ─────────────────────────────────────────────────────────────────────────────
describe('currentStatementRange', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('si hoy es antes del corte, el período cierra este mes', () => {
    // Hoy = 10 de junio, corte = 15
    // Período: 16 mayo – 15 junio → cierra junio
    vi.setSystemTime(new Date(2026, 5, 10))  // 10 jun 2026
    const range = currentStatementRange(15)
    expect(range.month).toBe(6)
    expect(range.year).toBe(2026)
    expect(range.end).toBe('2026-06-15')
    expect(range.start).toBe('2026-05-16')
  })

  it('si hoy es después del corte, el período cierra el mes siguiente', () => {
    // Hoy = 20 de junio, corte = 15
    // Período: 16 junio – 15 julio → cierra julio
    vi.setSystemTime(new Date(2026, 5, 20))  // 20 jun 2026
    const range = currentStatementRange(15)
    expect(range.month).toBe(7)
    expect(range.year).toBe(2026)
    expect(range.end).toBe('2026-07-15')
    expect(range.start).toBe('2026-06-16')
  })

  it('cruce de año: hoy = 20 diciembre, corte = 15 → cierra enero', () => {
    vi.setSystemTime(new Date(2026, 11, 20))  // 20 dic 2026
    const range = currentStatementRange(15)
    expect(range.month).toBe(1)
    expect(range.year).toBe(2027)
  })

  it('corte en fin de mes no genera fecha inválida', () => {
    // Corte = 31 en mes de 30 días → debe clampar al último día del mes
    vi.setSystemTime(new Date(2026, 5, 10))  // 10 jun (30 días)
    const range = currentStatementRange(31)
    // No debe lanzar. El end debe ser una fecha válida.
    expect(range.end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// relativeDate
// ─────────────────────────────────────────────────────────────────────────────
describe('relativeDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('retorna "Hoy" para la fecha actual', () => {
    vi.setSystemTime(new Date(2026, 5, 16))  // 16 jun 2026
    expect(relativeDate('2026-06-16')).toBe('Hoy')
  })

  it('retorna "Ayer" para el día anterior', () => {
    vi.setSystemTime(new Date(2026, 5, 16))
    expect(relativeDate('2026-06-15')).toBe('Ayer')
  })

  it('retorna fecha formateada para días más lejanos', () => {
    vi.setSystemTime(new Date(2026, 5, 16))
    const result = relativeDate('2026-06-10')
    // Debe contener día y mes, no ser "Hoy" ni "Ayer"
    expect(result).not.toBe('Hoy')
    expect(result).not.toBe('Ayer')
    expect(result.length).toBeGreaterThan(3)
  })
})
