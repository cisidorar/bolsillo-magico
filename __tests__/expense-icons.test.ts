import { describe, it, expect } from 'vitest'
import { getExpenseIcon } from '@/lib/expense-icons'

describe('getExpenseIcon', () => {
  describe('matching por descripción (prioridad sobre categoría)', () => {
    it('uber → Car icon', () => {
      const { icon } = getExpenseIcon('Uber', 'Transporte')
      expect(icon.displayName ?? icon.name).toMatch(/car/i)
    })

    it('starbucks → Coffee icon', () => {
      const { icon } = getExpenseIcon('Starbucks latte', null)
      expect(icon.displayName ?? icon.name).toMatch(/coffee/i)
    })

    it('farmacia → Pill icon', () => {
      const { icon } = getExpenseIcon('Farmacia Cruz Verde', 'Salud')
      expect(icon.displayName ?? icon.name).toMatch(/pill/i)
    })

    it('gym → Dumbbell icon', () => {
      const { icon } = getExpenseIcon('Smart Fit gym mensualidad', null)
      expect(icon.displayName ?? icon.name).toMatch(/dumbbell/i)
    })

    it('arriendo → House icon', () => {
      const { icon } = getExpenseIcon('Arriendo departamento', null)
      expect(icon.displayName ?? icon.name).toMatch(/house/i)
    })

    it('spotify → Music icon', () => {
      const { icon } = getExpenseIcon('Spotify Premium', null)
      expect(icon.displayName ?? icon.name).toMatch(/music/i)
    })
  })

  describe('matching por categoría cuando descripción no matchea', () => {
    it('categoría transporte sin descripción conocida', () => {
      const result = getExpenseIcon('Viaje en auto', 'transporte')
      // Debe retornar algo válido con color y bg
      expect(result.color).toMatch(/^#/)
      expect(result.bg).toMatch(/^#/)
    })

    it('categoría supermercado → ShoppingCart', () => {
      const { icon } = getExpenseIcon('Compras varias', 'supermercado')
      expect(icon.displayName ?? icon.name).toMatch(/shoppingcart/i)
    })

    it('categoría suscripciones → RefreshCw', () => {
      const { icon } = getExpenseIcon('Mensualidad', 'suscripciones')
      expect(icon.displayName ?? icon.name).toMatch(/refreshcw/i)
    })
  })

  describe('fallback cuando nada matchea', () => {
    it('descripción y categoría desconocidas → Package icon', () => {
      const { icon } = getExpenseIcon('XYZ 123 random', 'categoria_inexistente')
      expect(icon.displayName ?? icon.name).toMatch(/package/i)
    })

    it('null en ambos → retorna fallback', () => {
      const result = getExpenseIcon(null, null)
      expect(result.icon).toBeDefined()
      expect(result.color).toBeDefined()
      expect(result.bg).toBeDefined()
    })
  })

  describe('todos los resultados tienen estructura válida', () => {
    const cases: [string | null, string | null][] = [
      ['Uber', 'Transporte'],
      ['Pizza dominó', 'Comidas'],
      [null, 'salud'],
      ['Vuelo LATAM', null],
      [null, null],
    ]

    cases.forEach(([desc, cat]) => {
      it(`getExpenseIcon(${JSON.stringify(desc)}, ${JSON.stringify(cat)}) tiene icon, color y bg`, () => {
        const result = getExpenseIcon(desc, cat)
        expect(result).toHaveProperty('icon')
        expect(result).toHaveProperty('color')
        expect(result).toHaveProperty('bg')
        expect(result.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
        expect(result.bg).toMatch(/^#[0-9A-Fa-f]{6}$/)
      })
    })
  })
})
