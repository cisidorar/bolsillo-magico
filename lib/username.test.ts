import { describe, it, expect } from 'vitest'
import { normalizeUsername, usernameError, isValidUsername } from './username'

describe('normalizeUsername', () => {
  it('quita @ y espacios y pasa a minúsculas', () => {
    expect(normalizeUsername('  @Cas.Riquelme ')).toBe('cas.riquelme')
    expect(normalizeUsername('@@pedro')).toBe('pedro')
    expect(normalizeUsername('MARIA_01')).toBe('maria_01')
  })
})

describe('usernameError', () => {
  it('acepta usuarios válidos', () => {
    for (const u of ['cas', 'cas.r', 'pedro_01', 'a1b', 'user.name_2', '@Cas', 'x'.repeat(20)]) {
      expect(usernameError(u)).toBeNull()
    }
  })
  it('rechaza vacío, muy corto y muy largo', () => {
    expect(usernameError('')).toBe('Escribe un usuario.')
    expect(usernameError('@')).toBe('Escribe un usuario.')
    expect(usernameError('ab')).toMatch(/Mínimo/)
    expect(usernameError('x'.repeat(21))).toMatch(/Máximo/)
  })
  it('rechaza caracteres no permitidos', () => {
    expect(usernameError('cas riquelme')).toMatch(/Solo letras/)
    expect(usernameError('cás')).toMatch(/Solo letras/)
    expect(usernameError('cas-r')).toMatch(/Solo letras/)
    expect(usernameError('cas#1234')).toMatch(/Solo letras/)
  })
  it('tiene que empezar y terminar con letra o número', () => {
    expect(usernameError('.cas')).toMatch(/empezar y terminar/)
    expect(usernameError('cas_')).toMatch(/empezar y terminar/)
  })
  it('sin separadores seguidos', () => {
    expect(usernameError('ca..s')).toMatch(/seguidos/)
    expect(usernameError('ca_.s')).toMatch(/seguidos/)
  })
  it('isValidUsername refleja lo mismo', () => {
    expect(isValidUsername('cas')).toBe(true)
    expect(isValidUsername('c')).toBe(false)
  })
})
