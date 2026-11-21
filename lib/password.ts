// Reglas de contraseña al crear la cuenta (OWASP / NIST 800-63B): el largo importa más que los símbolos,
// se rechazan las claves obvias (comunes, secuencias, repeticiones) y las que contienen datos de la propia
// persona. No se exige "una mayúscula y un símbolo": eso empuja a claves predecibles tipo «Clave123!».
// Ojo: esto es ayuda en pantalla. El mínimo real lo tiene que imponer Supabase (Authentication → Password).

export const PASSWORD_MIN = 10

const COMMON = new Set([
  '1234567890', '12345678910', '0123456789', '1111111111', '0000000000', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm123',
  'password', 'password1', 'password12', 'password123', 'contrasena', 'contrasena1', 'contrasena123', 'contraseña',
  'contraseña1', 'contraseña123', 'iloveyou', 'iloveyou1', 'abc1234567', 'abcdefghij', 'qwerty1234', 'qwerty12345',
  'chile12345', 'santiago123', 'bolsillomagico', 'bolsillo123', 'bolsillomagico1', 'bolsillomagico123',
  'te quiero', 'tequiero123', 'princesa123', 'football123', 'admin12345', 'welcome123', 'letmein123', 'changeme123',
])

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', 'abcdefghijklmnopqrstuvwxyz']

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function isSequence(p: string): boolean {
  const s = norm(p)
  if (/^(.)\1+$/.test(s)) return true                              // aaaaaaaaaa
  for (const row of ROWS) {
    const rev = [...row].reverse().join('')
    if (s.length >= 8 && (row.includes(s) || rev.includes(s))) return true   // 12345678, qwertyui, 87654321
  }
  return false
}

export interface PasswordContext { email?: string; name?: string; username?: string }

export interface PasswordCheck {
  /** Cumple todo: se puede guardar */
  ok: boolean
  /** Lo que falta o está mal, en frases cortas para mostrar */
  issues: string[]
  /** 0 = no sirve · 1 = aceptable · 2 = buena · 3 = muy buena */
  score: 0 | 1 | 2 | 3
  label: string
}

export function checkPassword(pass: string, ctx: PasswordContext = {}): PasswordCheck {
  const issues: string[] = []
  const p = norm(pass)

  if (pass.length < PASSWORD_MIN) issues.push(`Al menos ${PASSWORD_MIN} caracteres (te faltan ${PASSWORD_MIN - pass.length})`)
  if (pass.length >= PASSWORD_MIN && (COMMON.has(p) || COMMON.has(p.replace(/\d+$/, '')))) issues.push('Es una clave muy común')
  if (pass.length >= PASSWORD_MIN && isSequence(pass)) issues.push('Es una secuencia o repetición (1234…, aaaa…)')

  const personal = [ctx.email?.split('@')[0], ctx.username, ctx.name]
    .map(x => norm(x ?? '').replace(/[^a-z0-9]/g, ''))
    .filter(x => x.length >= 4)
  if (pass.length > 0 && personal.some(x => p.replace(/[^a-z0-9]/g, '').includes(x))) issues.push('No uses tu nombre, usuario ni correo')

  if (pass.length === 0) return { ok: false, issues, score: 0, label: '' }
  if (issues.length > 0) return { ok: false, issues, score: 0, label: 'Débil' }

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(pass)).length
  const long = pass.length >= 16 || (pass.length >= 12 && classes >= 3)
  const score = (long ? (pass.length >= 16 && classes >= 2 ? 3 : 2) : classes >= 3 ? 2 : 1) as 1 | 2 | 3
  return { ok: true, issues, score, label: score === 1 ? 'Aceptable' : score === 2 ? 'Buena' : 'Muy buena' }
}
