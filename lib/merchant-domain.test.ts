import { describe, it, expect } from 'vitest'
import { guessMerchantDomain } from './expense-icons'
import { detectDomain } from './services'

describe('guessMerchantDomain: marcas pedidas por Cas', () => {
  it('Airbnb y Metro de Santiago tienen logo', () => {
    expect(guessMerchantDomain('Airbnb con novia vacaciones')).toBe('airbnb.com')
    expect(guessMerchantDomain('Metro')).toBe('metro.cl')
    expect(guessMerchantDomain('Metro de Santiago')).toBe('metro.cl')
    expect(detectDomain('Airbnb vacaciones')).toBe('airbnb.com')
    expect(detectDomain('Metro de Santiago')).toBe('metro.cl')
    expect(detectDomain('Metro')).toBe('metro.cl')   // Historial usa detectDomain
    expect(detectDomain('Metrogas')).not.toBe('metro.cl')
  })
  it('Metrogas no se confunde con Metro', () => {
    expect(guessMerchantDomain('Metrogas')).not.toBe('metro.cl')
    expect(guessMerchantDomain('Metro gas')).not.toBe('metro.cl')
  })
  it('AliExpress', () => {
    expect(guessMerchantDomain('Lego por aliexpress')).toBe('aliexpress.com')
  })
})
