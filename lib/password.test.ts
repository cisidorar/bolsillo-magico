import { describe, it, expect } from 'vitest'
import { checkPassword, PASSWORD_MIN } from './password'

describe('checkPassword', () => {
  it('rechaza claves cortas y dice cuántos caracteres faltan', () => {
    const r = checkPassword('abc123')
    expect(r.ok).toBe(false)
    expect(r.issues[0]).toContain(`${PASSWORD_MIN - 6}`)
  })
  it('rechaza claves comunes, secuencias y repeticiones', () => {
    expect(checkPassword('1234567890').ok).toBe(false)
    expect(checkPassword('Contraseña123').ok).toBe(false)
    expect(checkPassword('aaaaaaaaaaaa').ok).toBe(false)
    expect(checkPassword('qwertyuiop').ok).toBe(false)
  })
  it('rechaza claves que contienen el nombre, usuario o correo', () => {
    const ctx = { email: 'camila.soto@gmail.com', name: 'Camila', username: 'cami_s' }
    expect(checkPassword('camilasoto2026!', ctx).ok).toBe(false)
    expect(checkPassword('MiCamila-Viaja99', ctx).ok).toBe(false)
  })
  it('acepta una frase larga sin exigir símbolos', () => {
    const r = checkPassword('cafe con leche en la tarde', { email: 'ana@x.cl' })
    expect(r.ok).toBe(true)
    expect(r.score).toBeGreaterThanOrEqual(2)
  })
  it('acepta una clave de 10 caracteres sin obligar mayúsculas', () => {
    expect(checkPassword('verdeazul42').ok).toBe(true)
  })
})
