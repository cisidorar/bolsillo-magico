// ── Empresas de servicios por comuna (Chile) ────────────────────────────────
//
// El agua y la luz están concesionadas por territorio: no existe "la empresa
// de agua de Chile". Aguas Andinas cubre buena parte de Santiago, pero en Las
// Condes factura Aguas Cordillera, en Maipú el municipio (SMAPA) y en
// Valparaíso ESVAL. Sin este mapeo el formulario le pediría a alguien de Viña
// su "número de cliente Aguas Andinas", que no existe.
//
// Alcance honesto: esto es una SUGERENCIA para pre-llenar el formulario, no
// una fuente de verdad. Los límites de concesión no calzan perfecto con los
// límites comunales — hay comunas partidas entre dos distribuidoras. Por eso
// la UI siempre deja elegir otra empresa, y `confident: false` marca los
// casos donde la comuna es limítrofe o está repartida.

export interface UtilityCompany {
  id:    string
  name:  string
  /** Dominio para el logo (ServiceLogo lo usa). */
  domain: string | null
}

export interface UtilitySuggestion {
  water:       UtilityCompany
  electricity: UtilityCompany
  /** false si la comuna está repartida entre empresas y hay que verificar. */
  confident:   boolean
}

// ── Catálogo ────────────────────────────────────────────────────────────────

const W = {
  andinas:     { id: 'aguas_andinas',    name: 'Aguas Andinas',        domain: 'aguasandinas.cl' },
  cordillera:  { id: 'aguas_cordillera', name: 'Aguas Cordillera',     domain: 'aguascordillera.cl' },
  smapa:       { id: 'smapa',            name: 'SMAPA',                domain: 'maipu.cl' },
  servicomunal:{ id: 'servicomunal',     name: 'Servicomunal',         domain: 'servicomunal.cl' },
  esval:       { id: 'esval',            name: 'ESVAL',                domain: 'esval.cl' },
  essbio:      { id: 'essbio',           name: 'ESSBIO',               domain: 'essbio.cl' },
  nuevosur:    { id: 'nuevosur',         name: 'Nuevosur',             domain: 'nuevosur.cl' },
  araucania:   { id: 'aguas_araucania',  name: 'Aguas Araucanía',      domain: 'aguasaraucania.cl' },
  essal:       { id: 'essal',            name: 'ESSAL',                domain: 'essal.cl' },
  decima:      { id: 'aguas_decima',     name: 'Aguas Décima',         domain: 'aguasdecima.cl' },
  antofagasta: { id: 'aguas_antofagasta',name: 'Aguas Antofagasta',    domain: 'aguasantofagasta.cl' },
  chanar:      { id: 'aguas_chanar',     name: 'Aguas Chañar',         domain: 'aguaschanar.cl' },
  valle:       { id: 'aguas_del_valle',  name: 'Aguas del Valle',      domain: 'aguasdelvalle.cl' },
  altiplano:   { id: 'aguas_altiplano',  name: 'Aguas del Altiplano',  domain: 'aguasdelaltiplano.cl' },
  magallanes:  { id: 'aguas_magallanes', name: 'Aguas Magallanes',     domain: 'aguasmagallanes.cl' },
  patagonia:   { id: 'aguas_patagonia',  name: 'Aguas Patagonia',      domain: 'aguaspatagonia.cl' },
} as const satisfies Record<string, UtilityCompany>

const E = {
  enel:       { id: 'enel',       name: 'Enel Distribución', domain: 'enel.cl' },
  cge:        { id: 'cge',        name: 'CGE',               domain: 'cge.cl' },
  chilquinta: { id: 'chilquinta', name: 'Chilquinta',        domain: 'chilquinta.cl' },
  saesa:      { id: 'saesa',      name: 'Saesa',             domain: 'gruposaesa.cl' },
  frontel:    { id: 'frontel',    name: 'Frontel',           domain: 'gruposaesa.cl' },
  edelmag:    { id: 'edelmag',    name: 'Edelmag',           domain: 'edelmag.cl' },
  edelaysen:  { id: 'edelaysen',  name: 'Edelaysén',         domain: 'gruposaesa.cl' },
  litoral:    { id: 'litoral',    name: 'Litoral',           domain: 'energiadelitoral.cl' },
} as const satisfies Record<string, UtilityCompany>

export const WATER_COMPANIES = Object.values(W) as UtilityCompany[]
export const ELECTRIC_COMPANIES = Object.values(E) as UtilityCompany[]

// ── Excepciones por comuna ──────────────────────────────────────────────────
// Solo las comunas donde la empresa NO es la del default regional. Todo lo
// demás cae al mapa por región.

const WATER_BY_COMUNA: Record<string, UtilityCompany> = {
  // RM — el default es Aguas Andinas, estas facturan aparte
  'Las Condes': W.cordillera,
  'Vitacura': W.cordillera,
  'Lo Barnechea': W.cordillera,
  'Maipú': W.smapa,
  'Colina': W.servicomunal,
  'Lampa': W.servicomunal,
  // Los Ríos — Valdivia tiene sanitaria propia, el resto es ESSAL
  'Valdivia': W.decima,
}

const ELECTRIC_BY_COMUNA: Record<string, UtilityCompany> = {
  // RM — el default es Enel, pero la periferia sur y poniente es CGE
  'Buin': E.cge, 'Paine': E.cge, 'Melipilla': E.cge, 'Alhué': E.cge,
  'Curacaví': E.cge, 'María Pinto': E.cge, 'San Pedro': E.cge,
  'Talagante': E.cge, 'El Monte': E.cge, 'Isla de Maipo': E.cge,
  'Padre Hurtado': E.cge, 'Peñaflor': E.cge, 'Calera de Tango': E.cge,
  'San José de Maipo': E.cge, 'Tiltil': E.cge,
  // Valparaíso — el litoral sur no es Chilquinta
  'San Antonio': E.litoral, 'Algarrobo': E.litoral, 'Cartagena': E.litoral,
  'El Quisco': E.litoral, 'El Tabo': E.litoral, 'Santo Domingo': E.litoral,
  'Casablanca': E.litoral,
  'Isla de Pascua': E.cge, 'Juan Fernández': E.cge,
}

const WATER_BY_REGION: Record<string, UtilityCompany> = {
  'Arica y Parinacota': W.altiplano,
  'Tarapacá':           W.altiplano,
  'Antofagasta':        W.antofagasta,
  'Atacama':            W.chanar,
  'Coquimbo':           W.valle,
  'Valparaíso':         W.esval,
  'Metropolitana':      W.andinas,
  "O'Higgins":          W.essbio,
  'Maule':              W.nuevosur,
  'Ñuble':              W.essbio,
  'Biobío':             W.essbio,
  'La Araucanía':       W.araucania,
  'Los Ríos':           W.essal,
  'Los Lagos':          W.essal,
  'Aysén':              W.patagonia,
  'Magallanes':         W.magallanes,
}

const ELECTRIC_BY_REGION: Record<string, UtilityCompany> = {
  'Arica y Parinacota': E.cge,
  'Tarapacá':           E.cge,
  'Antofagasta':        E.cge,
  'Atacama':            E.cge,
  'Coquimbo':           E.cge,
  'Valparaíso':         E.chilquinta,
  'Metropolitana':      E.enel,
  "O'Higgins":          E.cge,
  'Maule':              E.cge,
  'Ñuble':              E.frontel,
  'Biobío':             E.cge,
  'La Araucanía':       E.frontel,
  'Los Ríos':           E.saesa,
  'Los Lagos':          E.saesa,
  'Aysén':              E.edelaysen,
  'Magallanes':         E.edelmag,
}

/**
 * Comunas donde la concesión está repartida entre dos empresas y la sugerencia
 * puede fallar. La UI muestra un aviso para que el usuario verifique en su
 * boleta en vez de confiar a ciegas.
 */
const SPLIT_COMUNAS = new Set([
  'San Bernardo', 'Puente Alto', 'Pirque', 'Quilicura', 'Colina', 'Lampa',
  'Villa Alemana', 'Quilpué', 'Limache',
])

/** Empresas de agua y luz que corresponden a una comuna (o a su región). */
export function suggestUtilities(region: string | null, comuna: string | null): UtilitySuggestion | null {
  if (!region) return null

  const water = (comuna && WATER_BY_COMUNA[comuna])
    ?? WATER_BY_REGION[region]
  const electricity = (comuna && ELECTRIC_BY_COMUNA[comuna])
    ?? ELECTRIC_BY_REGION[region]

  if (!water || !electricity) return null

  return {
    water,
    electricity,
    confident: !(comuna && SPLIT_COMUNAS.has(comuna)),
  }
}

/** Busca una empresa por id en cualquiera de los dos catálogos. */
export function findCompany(id: string): UtilityCompany | null {
  return [...WATER_COMPANIES, ...ELECTRIC_COMPANIES].find(c => c.id === id) ?? null
}
