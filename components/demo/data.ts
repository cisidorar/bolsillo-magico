import { getNowChile, billingPeriod } from '@/lib/utils'

// Datos ficticios de la demo pública. Nada acá es de una persona real: nombres,
// montos y comercios están inventados. Las fechas son relativas a hoy para que
// la demo nunca se vea vieja.

export const CLOSING = 20       // la Visa ficticia cierra el 20…
export const DUE_DAY = 5        // …y vence el 5 del mes siguiente
export const BUDGET = 800_000
export const SUELDO = 1_850_000
export const INVERTIDO = 150_000
export const LAST_STATEMENT_TOTAL = 438_900

export interface DCategory { id: string; name: string; icon: string; color: string; bg: string; limit: number | null }
export interface DMethod { id: string; name: string; type: 'credit' | 'debit' | 'cash'; domain: string | null }
export interface DExpense { id: string; date: string; amount: number; description: string; categoryId: string; methodId: string; fixed?: boolean }
export interface DDebt { id: string; person: string; concept: string; amount: number; date: string; paid: boolean }
export interface DRecurring { id: string; name: string; domain: string | null; categoryId: string; amount: number; day: number; prevAmount?: number; note?: string }

export const CATEGORIES: DCategory[] = [
  { id: 'sup', name: 'Supermercado',    icon: 'ShoppingCart', color: '#1B6DD4', bg: '#E3EEFF', limit: 170_000 },
  { id: 'sus', name: 'Suscripciones',   icon: 'Film',         color: '#6D5BD0', bg: '#EAE6FB', limit: 40_000 },
  { id: 'com', name: 'Comidas',         icon: 'Coffee',       color: '#D97706', bg: '#FDEFD6', limit: 90_000 },
  { id: 'tra', name: 'Transporte',      icon: 'Car',          color: '#0E9F8E', bg: '#D9F4EF', limit: 80_000 },
  { id: 'cmp', name: 'Compras para mí', icon: 'Star',         color: '#EA580C', bg: '#FFE7D8', limit: null },
  { id: 'sal', name: 'Salud',           icon: 'Heart',        color: '#E5484D', bg: '#FDE2E3', limit: 60_000 },
  { id: 'out', name: 'Salidas',         icon: 'Ticket',       color: '#C026D3', bg: '#FAE4FB', limit: 50_000 },
  { id: 'cue', name: 'Cuentas',         icon: 'Zap',          color: '#64748B', bg: '#E6EBF5', limit: null },
]

export const METHODS: DMethod[] = [
  { id: 'efe', name: 'Efectivo', type: 'cash',   domain: null },
  { id: 'deb', name: 'Débito',   type: 'debit',  domain: null },
  { id: 'vis', name: 'Visa',     type: 'credit', domain: 'visa.com' },
]

export const RECURRING: DRecurring[] = [
  { id: 'r1', name: 'Notebook',   domain: null,           categoryId: 'cmp', amount: 89_990, day: 10, note: 'cuota 3 de 6' },
  { id: 'r2', name: 'Seguro auto', domain: null,          categoryId: 'cue', amount: 38_000, day: 25 },
  { id: 'r3', name: 'Gimnasio',   domain: null,           categoryId: 'sal', amount: 29_990, day: 13 },
  { id: 'r4', name: 'Internet',   domain: 'movistar.cl',  categoryId: 'cue', amount: 24_990, day: 15 },
  { id: 'r5', name: 'Netflix',    domain: 'netflix.com',  categoryId: 'sus', amount: 11_990, day: 11 },
  { id: 'r6', name: 'Spotify',    domain: 'spotify.com',  categoryId: 'sus', amount: 5_990,  day: 29, prevAmount: 5_490 },
  { id: 'r7', name: 'Apple',      domain: 'apple.com',    categoryId: 'sus', amount: 990,    day: 8 },
]

export const addDays = (dateStr: string, n: number): string => {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// [descripción, monto, categoría, método, hace cuántos días, es fijo]
const SEED_EXPENSES: [string, number, string, string, number, boolean?][] = [
  ['Starbucks', 4_800, 'com', 'deb', 0],
  ['Uber', 7_840, 'tra', 'vis', 1],
  ['Jumbo', 58_640, 'sup', 'vis', 2],
  ['Netflix', 11_990, 'sus', 'vis', 3, true],
  ['Cine', 16_000, 'out', 'vis', 4],
  ['Farmacia Ahumada', 18_900, 'sal', 'vis', 5],
  ['Rappi', 14_990, 'com', 'vis', 6],
  ['Spotify', 5_990, 'sus', 'vis', 7, true],
  ['Copec', 35_000, 'tra', 'vis', 8],
  ['Lider', 41_230, 'sup', 'deb', 9],
  ['Zara', 39_990, 'cmp', 'vis', 10],
  ['Uber', 12_440, 'tra', 'vis', 11],
  ['Cuenta de luz', 32_450, 'cue', 'deb', 12, true],
  ['Gimnasio', 29_990, 'sal', 'deb', 13, true],
  ['Almuerzo con el equipo', 9_500, 'com', 'efe', 14],
  ['Tottus', 33_140, 'sup', 'vis', 15],
  ['Apple', 990, 'sus', 'vis', 16, true],
  ['Metro', 4_200, 'tra', 'efe', 17],
  ['Entradas teatro', 24_000, 'out', 'vis', 18],
  ['Aliexpress', 9_870, 'cmp', 'vis', 19],
  ['Cruz Verde', 12_500, 'sal', 'vis', 21],
  ['Starbucks', 5_200, 'com', 'deb', 22],
  ['Jumbo', 47_200, 'sup', 'vis', 24],
  ['Uber', 6_900, 'tra', 'vis', 26],
]

export function seedExpenses(today: string): DExpense[] {
  return SEED_EXPENSES.map(([description, amount, categoryId, methodId, ago, fixed], i) => ({
    id: `s${i}`, date: addDays(today, -ago), amount, description, categoryId, methodId, fixed,
  })).sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function seedDebts(today: string): DDebt[] {
  return [
    { id: 'd1', person: 'Ana',  concept: 'Cena de cumpleaños', amount: 24_000, date: addDays(today, -9), paid: false },
    { id: 'd2', person: 'Ana',  concept: 'Taxi de vuelta',     amount: 3_200,  date: addDays(today, -5), paid: false },
    { id: 'd3', person: 'Beto', concept: 'Pizzas',             amount: 12_400, date: addDays(today, -3), paid: false },
    { id: 'd4', person: 'Caro', concept: 'Pasajes a la playa', amount: 32_000, date: addDays(today, -14), paid: false },
    { id: 'd5', person: 'Dani', concept: 'Regalo en común',    amount: 15_000, date: addDays(today, -2), paid: false },
  ]
}

export const PEOPLE_POOL = ['Eli', 'Fer', 'Gabi', 'Hugo', 'Isa']

export const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
export const monthShort = (m: number) => MONTHS[m - 1].slice(0, 3)
export const longDate = (s: string) => `${Number(s.slice(8))} de ${MONTHS[Number(s.slice(5, 7)) - 1]}`
export const shortDate = (s: string) => `${Number(s.slice(8))} ${monthShort(Number(s.slice(5, 7)))}`

export const catOf = (id: string) => CATEGORIES.find(c => c.id === id)!
export const methodOf = (id: string) => METHODS.find(m => m.id === id)!

export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
export function greeting(hour: number) {
  return hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'
}

/** Mes de estado de cuenta (Visa) al que cae una compra. */
export function statementOf(e: DExpense) {
  return methodOf(e.methodId).type === 'credit' ? billingPeriod(e.date, CLOSING) : billingPeriod(e.date, null)
}

/** Cuánto dura el mes en curso y en qué día va. */
export function monthCtx() {
  const n = getNowChile()
  return { ...n, daysInMonth: new Date(n.year, n.month, 0).getDate() }
}

/** Palabras que sugieren categoría al escribir la descripción (como la app real). */
export function suggestCategoryId(text: string): string | null {
  const t = text.toLowerCase()
  const rules: [RegExp, string][] = [
    [/uber|cabify|metro|bip|copec|bencina|taxi|didi/, 'tra'],
    [/jumbo|lider|l[ií]der|tottus|unimarc|supermercado|santa isabel/, 'sup'],
    [/netflix|spotify|apple|disney|youtube|hbo|suscrip/, 'sus'],
    [/starbucks|rappi|almuerzo|caf[eé]|pizza|sushi|restaurant|comida/, 'com'],
    [/farmacia|ahumada|cruz verde|salcobrand|doctor|dentista|gimnasio/, 'sal'],
    [/cine|teatro|entrada|concierto|bar\b|fiesta/, 'out'],
    [/luz|agua|gas|internet|enel|aguas|cuenta/, 'cue'],
    [/zara|falabella|ripley|aliexpress|ropa|zapatos/, 'cmp'],
  ]
  return rules.find(([re]) => re.test(t))?.[1] ?? null
}
