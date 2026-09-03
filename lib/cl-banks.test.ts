import { describe, it, expect } from 'vitest'
import { domainFromBankName, CL_INSTITUTIONS } from './cl-banks'

describe('domainFromBankName', () => {
  it('resuelve el nombre exacto de cada institución de la lista', () => {
    for (const inst of CL_INSTITUTIONS) {
      expect(domainFromBankName(inst.name)).toBe(inst.domain)
    }
  })

  // El bug que motivó el orden de comparación: "Banco de Chile" contiene
  // "chile", pero "Scotiabank Chile" y "HSBC Chile" también. Con el mapa
  // viejo (una cadena de includes) cualquiera de los tres podía caer en
  // bancochile.cl según el orden de los ifs.
  it('no confunde Scotiabank Chile ni HSBC Chile con Banco de Chile', () => {
    expect(domainFromBankName('Scotiabank Chile')).toBe('scotiabank.cl')
    expect(domainFromBankName('HSBC Chile')).toBe('hsbc.cl')
    expect(domainFromBankName('Banco de Chile')).toBe('bancochile.cl')
  })

  it('tolera cómo lo escribió la persona', () => {
    expect(domainFromBankName('bancoestado')).toBe('bancoestado.cl')
    expect(domainFromBankName('Banco Estado')).toBe('bancoestado.cl')
    expect(domainFromBankName('BCI')).toBe('bci.cl')
    expect(domainFromBankName('itau')).toBe('itau.cl')
    expect(domainFromBankName('Itaú Chile')).toBe('itau.cl')
    expect(domainFromBankName('  Santander  ')).toBe('santander.cl')
    expect(domainFromBankName('mercadopago')).toBe('mercadopago.com')
  })

  it('null cuando no reconoce nada, para caer al avatar', () => {
    expect(domainFromBankName('')).toBeNull()
    expect(domainFromBankName('   ')).toBeNull()
    expect(domainFromBankName('Mi cuenta del colchón')).toBeNull()
  })

  it('la lista no tiene nombres repetidos', () => {
    const names = CL_INSTITUTIONS.map(i => i.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })
})
