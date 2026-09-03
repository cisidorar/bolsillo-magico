import { describe, it, expect } from 'vitest'
import { suggestUtilities, findCompany, WATER_COMPANIES, ELECTRIC_COMPANIES } from './cl-utilities'

describe('suggestUtilities — Metropolitana', () => {
  it('Santiago centro: Aguas Andinas + Enel', () => {
    const s = suggestUtilities('Metropolitana', 'Santiago')!
    expect(s.water.name).toBe('Aguas Andinas')
    expect(s.electricity.name).toBe('Enel Distribución')
    expect(s.confident).toBe(true)
  })

  it('Las Condes factura Aguas Cordillera, no Aguas Andinas', () => {
    // El error clásico: asumir que toda la RM es Aguas Andinas.
    expect(suggestUtilities('Metropolitana', 'Las Condes')!.water.name).toBe('Aguas Cordillera')
    expect(suggestUtilities('Metropolitana', 'Vitacura')!.water.name).toBe('Aguas Cordillera')
  })

  it('Maipú tiene sanitaria municipal (SMAPA)', () => {
    expect(suggestUtilities('Metropolitana', 'Maipú')!.water.name).toBe('SMAPA')
  })

  it('la periferia sur de la RM es CGE, no Enel', () => {
    expect(suggestUtilities('Metropolitana', 'Melipilla')!.electricity.name).toBe('CGE')
    expect(suggestUtilities('Metropolitana', 'Buin')!.electricity.name).toBe('CGE')
  })

  it('una comuna RM sin excepción cae al default regional', () => {
    const s = suggestUtilities('Metropolitana', 'Ñuñoa')!
    expect(s.water.name).toBe('Aguas Andinas')
    expect(s.electricity.name).toBe('Enel Distribución')
  })
})

describe('suggestUtilities — otras regiones', () => {
  it('Valparaíso: ESVAL + Chilquinta', () => {
    const s = suggestUtilities('Valparaíso', 'Viña del Mar')!
    expect(s.water.name).toBe('ESVAL')
    expect(s.electricity.name).toBe('Chilquinta')
  })

  it('el litoral sur de Valparaíso es Litoral, no Chilquinta', () => {
    expect(suggestUtilities('Valparaíso', 'El Quisco')!.electricity.name).toBe('Litoral')
  })

  it('Biobío: ESSBIO + CGE', () => {
    const s = suggestUtilities('Biobío', 'Concepción')!
    expect(s.water.name).toBe('ESSBIO')
    expect(s.electricity.name).toBe('CGE')
  })

  it('Valdivia tiene sanitaria propia; el resto de Los Ríos es ESSAL', () => {
    expect(suggestUtilities('Los Ríos', 'Valdivia')!.water.name).toBe('Aguas Décima')
    expect(suggestUtilities('Los Ríos', 'La Unión')!.water.name).toBe('ESSAL')
  })

  it('Magallanes tiene sus propias empresas', () => {
    const s = suggestUtilities('Magallanes', 'Punta Arenas')!
    expect(s.water.name).toBe('Aguas Magallanes')
    expect(s.electricity.name).toBe('Edelmag')
  })
})

describe('suggestUtilities — bordes', () => {
  it('sin región no hay sugerencia', () => {
    expect(suggestUtilities(null, 'Santiago')).toBeNull()
  })

  it('con región pero sin comuna usa el default regional', () => {
    const s = suggestUtilities('Metropolitana', null)!
    expect(s.water.name).toBe('Aguas Andinas')
  })

  it('marca confident=false en comunas repartidas entre empresas', () => {
    // San Bernardo y Puente Alto tienen concesiones partidas: la sugerencia
    // puede fallar y el usuario tiene que mirar su boleta.
    expect(suggestUtilities('Metropolitana', 'San Bernardo')!.confident).toBe(false)
    expect(suggestUtilities('Metropolitana', 'Puente Alto')!.confident).toBe(false)
  })

  it('una región inventada no rompe, devuelve null', () => {
    expect(suggestUtilities('Narnia', 'Cair Paravel')).toBeNull()
  })
})

describe('catálogo', () => {
  it('todas las empresas tienen id único', () => {
    const ids = [...WATER_COMPANIES, ...ELECTRIC_COMPANIES].map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('findCompany encuentra por id en ambos catálogos', () => {
    expect(findCompany('esval')?.name).toBe('ESVAL')
    expect(findCompany('enel')?.name).toBe('Enel Distribución')
    expect(findCompany('no_existe')).toBeNull()
  })

  it('cada región tiene sugerencia de agua y luz', () => {
    const regiones = [
      'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
      'Valparaíso', 'Metropolitana', "O'Higgins", 'Maule', 'Ñuble', 'Biobío',
      'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
    ]
    for (const r of regiones) {
      const s = suggestUtilities(r, null)
      expect(s, `falta mapeo para ${r}`).not.toBeNull()
    }
  })
})
