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
}

export const CL_INSTITUTIONS: ClInstitution[] = [
  // Bancos (nómina CMF)
  { name: 'Banco de Chile',        domain: 'bancochile.cl'         },
  { name: 'BancoEstado',           domain: 'bancoestado.cl'        },
  { name: 'Banco Santander',       domain: 'santander.cl'          },
  { name: 'Bci',                   domain: 'bci.cl'                },
  { name: 'Scotiabank Chile',      domain: 'scotiabank.cl'         },
  { name: 'Banco Itaú',            domain: 'itau.cl'               },
  { name: 'Banco BICE',            domain: 'bice.cl'               },
  { name: 'Banco Security',        domain: 'bancosecurity.cl'      },
  { name: 'Banco Falabella',       domain: 'falabella.com'         },
  { name: 'Banco Ripley',          domain: 'ripley.cl'             },
  { name: 'Banco Consorcio',       domain: 'bancoconsorcio.cl'     },
  { name: 'Banco Internacional',   domain: 'bancointernacional.cl' },
  { name: 'Banco BTG Pactual',     domain: 'btgpactual.cl'         },
  { name: 'HSBC Chile',            domain: 'hsbc.cl'               },
  { name: 'Banco Tanner',          domain: 'tanner.cl'             },
  // Cooperativas y cajas
  { name: 'Coopeuch',              domain: 'coopeuch.cl'           },
  // Fintechs / plataformas de inversión
  { name: 'Fintual',               domain: 'fintual.com'           },
  { name: 'Racional',              domain: 'racional.cl'           },
  { name: 'Tenpo',                 domain: 'tenpo.app'             },
  { name: 'Mercado Pago',          domain: 'mercadopago.com'       },
]

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
