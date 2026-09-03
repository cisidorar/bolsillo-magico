// ── Instituciones chilenas que reciben depósitos ────────────────────────────
// sep 2026 (Cas: "aquí en banco debería desplegar y mostrar los bancos de
// chile"): el campo era texto libre con un placeholder de ejemplos, así que
// había que escribir el nombre completo a mano cada vez — y cualquier
// variación ("Bco de Chile", "banco chile") rompía el match del logo.
//
// Esta lista es la ÚNICA fuente: alimenta el desplegable del formulario y la
// resolución de dominio para el logo. Antes el mapa de dominios vivía suelto
// en TermDepositManager y había que acordarse de tocar los dos lados.
//
// Bancos verificados contra la nómina de la CMF (cmfchile.cl, 2026). Se
// excluyen los de banca mayorista sin productos para personas (JP Morgan,
// China Construction Bank, Bank of China). Se agregan cooperativas y
// fintechs que sí ofrecen depósitos a plazo o cuentas con interés.
//
// El input sigue siendo libre: la lista sugiere, no restringe.

export interface ClInstitution {
  name:   string
  domain: string
  /** Color corporativo — para el monograma cuando no hay logo nítido.
   *  sep 2026: varios bancos chilenos (Banco de Chile entre ellos) solo
   *  publican un favicon de 16px, así que estirarlo a 40px se ve sucio. En
   *  esos casos se dibuja la inicial sobre este color en vez del logo
   *  borroso — se ve intencional y a escala. Es solo un color, no reproduce
   *  la marca. */
  color:  string
}

export const CL_INSTITUTIONS: ClInstitution[] = [
  // Bancos (nómina CMF)
  { name: 'Banco de Chile',        domain: 'bancochile.cl',         color: '#0B2C6F' },
  { name: 'BancoEstado',           domain: 'bancoestado.cl',        color: '#F58220' },
  { name: 'Banco Santander',       domain: 'santander.cl',          color: '#EC0000' },
  { name: 'Bci',                   domain: 'bci.cl',                color: '#0033A0' },
  { name: 'Scotiabank Chile',      domain: 'scotiabank.cl',         color: '#EC111A' },
  { name: 'Banco Itaú',            domain: 'itau.cl',               color: '#EC7000' },
  { name: 'Banco BICE',            domain: 'bice.cl',               color: '#003C71' },
  { name: 'Banco Security',        domain: 'bancosecurity.cl',      color: '#00953B' },
  { name: 'Banco Falabella',       domain: 'falabella.com',         color: '#79BC43' },
  { name: 'Banco Ripley',          domain: 'ripley.cl',             color: '#9B26B6' },
  { name: 'Banco Consorcio',       domain: 'bancoconsorcio.cl',     color: '#003865' },
  { name: 'Banco Internacional',   domain: 'bancointernacional.cl', color: '#005EB8' },
  { name: 'Banco BTG Pactual',     domain: 'btgpactual.cl',         color: '#0F2B46' },
  { name: 'HSBC Chile',            domain: 'hsbc.cl',               color: '#DB0011' },
  { name: 'Banco Tanner',          domain: 'tanner.cl',             color: '#00A0DF' },
  // Cooperativas y cajas
  { name: 'Coopeuch',              domain: 'coopeuch.cl',           color: '#E30613' },
  // Fintechs / plataformas de inversión
  { name: 'Fintual',               domain: 'fintual.com',           color: '#00C08B' },
  { name: 'Racional',              domain: 'racional.cl',           color: '#12B76A' },
  { name: 'Tenpo',                 domain: 'tenpo.app',             color: '#00E1A0' },
  { name: 'Mercado Pago',          domain: 'mercadopago.com',       color: '#00B1EA' },
]

/** Color de marca para el monograma, o `null` si no se reconoce la
 *  institución (ahí el componente usa su paleta por hash, como siempre). */
export function brandColor(name: string): string | null {
  const domain = domainFromBankName(name)
  if (!domain) return null
  return CL_INSTITUTIONS.find(i => i.domain === domain)?.color ?? null
}

/** Palabras clave extra por institución — para que el logo siga saliendo
 *  aunque el nombre se haya escrito distinto (datos ya guardados, o alguien
 *  que escribe "bancoestado" junto, "itau" sin tilde, "BCI" en mayúsculas). */
const ALIASES: Record<string, string[]> = {
  'bancoestado.cl':        ['banco estado', 'bancoestado'],
  'itau.cl':               ['itaú', 'itau'],
  'mercadopago.com':       ['mercado pago', 'mercadopago'],
  'bancochile.cl':         ['banco de chile', 'banco chile'],
  'bci.cl':                ['bci', 'crédito e inversiones', 'credito e inversiones'],
  'bancosecurity.cl':      ['security'],
  'bancoconsorcio.cl':     ['consorcio'],
  'bancointernacional.cl': ['internacional'],
  'btgpactual.cl':         ['btg'],
  'scotiabank.cl':         ['scotiabank'],
  'santander.cl':          ['santander'],
  'falabella.com':         ['falabella'],
  'ripley.cl':             ['ripley'],
  'bice.cl':               ['bice'],
  'coopeuch.cl':           ['coopeuch'],
  'fintual.com':           ['fintual'],
  'racional.cl':           ['racional'],
  'tenpo.app':             ['tenpo'],
  'tanner.cl':             ['tanner'],
  'hsbc.cl':               ['hsbc'],
}

/**
 * Dominio web de la institución a partir de lo que el usuario escribió, para
 * pedir el logo. `null` si no se reconoce (cae al avatar con la inicial).
 *
 * Ojo con el orden: "Banco de Chile" contiene "chile", pero también lo
 * contienen "Scotiabank Chile" y "HSBC Chile". Por eso se prueba primero el
 * nombre exacto de cada institución y recién después los alias, que son más
 * laxos — al revés, "Scotiabank Chile" resolvería a bancochile.cl.
 */
export function domainFromBankName(name: string): string | null {
  const n = name.trim().toLowerCase()
  if (!n) return null

  for (const inst of CL_INSTITUTIONS) {
    if (n === inst.name.toLowerCase()) return inst.domain
  }
  for (const inst of CL_INSTITUTIONS) {
    if (n.includes(inst.name.toLowerCase())) return inst.domain
  }
  for (const [domain, keys] of Object.entries(ALIASES)) {
    if (keys.some(k => n.includes(k))) return domain
  }
  // Último recurso: "chile" a secas se lee como Banco de Chile, pero solo si
  // ninguna institución más específica coincidió antes.
  if (n.includes('chile')) return 'bancochile.cl'
  return null
}
