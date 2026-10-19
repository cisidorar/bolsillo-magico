// ── Usuario único (@usuario) ─────────────────────────────────────────────────
// Mismas reglas que el CHECK profiles_username_format de la migración
// 20261019: 3 a 20 caracteres, minúsculas/números/"_"/"."; empieza y termina
// con letra o número; sin separadores seguidos.

export const USERNAME_MIN = 3
export const USERNAME_MAX = 20

/** Quita "@" y espacios de los extremos y pasa a minúsculas (lo que escribe la gente). */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').trim().toLowerCase()
}

const FORMAT = /^[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$/

/** null si es válido; si no, el mensaje para mostrar. */
export function usernameError(raw: string): string | null {
  const u = normalizeUsername(raw)
  if (u.length === 0) return 'Escribe un usuario.'
  if (u.length < USERNAME_MIN) return `Mínimo ${USERNAME_MIN} caracteres.`
  if (u.length > USERNAME_MAX) return `Máximo ${USERNAME_MAX} caracteres.`
  if (/[^a-z0-9_.]/.test(u)) return 'Solo letras sin tilde, números, "_" y ".".'
  if (!/^[a-z0-9]/.test(u) || !/[a-z0-9]$/.test(u)) return 'Tiene que empezar y terminar con una letra o un número.'
  if (/[_.]{2}/.test(u)) return 'No puede tener "_" o "." seguidos.'
  return FORMAT.test(u) ? null : 'Usuario inválido.'
}

export function isValidUsername(raw: string): boolean {
  return usernameError(raw) === null
}
