/** Fotos de perfil disponibles (estilo roundimals). No se sube foto propia: se elige una de estas. */
export const AVATARS = [
  { id: 'gato',     label: 'Gato' },
  { id: 'perro',    label: 'Perro' },
  { id: 'panda',    label: 'Panda' },
  { id: 'conejo',   label: 'Conejo' },
  { id: 'leon',     label: 'León' },
  { id: 'capibara', label: 'Capibara' },
  { id: 'tigre',    label: 'Tigre' },
  { id: 'pinguino', label: 'Pingüino' },
] as const

export type AvatarId = (typeof AVATARS)[number]['id']

/** Lo que se guarda en `profiles.avatar_url` (ruta pública de la app). */
export const avatarUrl = (id: AvatarId) => `/avatars/${id}.svg`
