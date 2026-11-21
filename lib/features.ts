// Interruptores de funciones. Viajes compartidos (nov 2026): oculto por ahora a
// pedido de Cas — el código y los datos siguen intactos; poner `true` lo reactiva.
// "Por cobrar" (amigos que te devuelven plata) NO depende de este flag.
export const SHOW_TRIPS = false

// ── Módulos por persona (nov 2026, acceso por invitación) ────────────────────
// profiles.features dice qué módulos ve cada cuenta. Las cuentas nuevas parten
// con lo básico; Cas enciende lo demás desde /admin. Las tres funciones están
// hechas a la medida de un caso concreto (acciones con Racional, un arriendo
// con contrato propio, liquidaciones de un empleador), así que no tiene sentido
// mostrárselas a quien no las usa.
export type FeatureKey = 'inversiones' | 'ahorro' | 'propiedad' | 'liquidaciones' | 'ia' | 'viajes'

export type Features = Record<FeatureKey, boolean>

export const FEATURE_LABELS: Record<FeatureKey, { title: string; hint: string }> = {
  inversiones:   { title: 'Inversiones',          hint: 'Acciones, watchlist y billetera USD' },
  ahorro:        { title: 'Ahorro y depósitos',   hint: 'Cuentas de ahorro y depósitos a plazo' },
  propiedad:     { title: 'Propiedad',            hint: 'Arriendo, dividendo y cuentas de un depto' },
  liquidaciones: { title: 'Liquidaciones en PDF', hint: 'Subir la liquidación para registrar el sueldo' },
  viajes:        { title: 'Viajes compartidos',   hint: 'Viajes con otras personas, con o sin cuenta, repartidos según sueldo' },
  ia:            { title: 'Resumen con IA',       hint: 'Análisis y cierre de mes escritos por IA (tiene costo para ti)' },
}

export const FEATURE_KEYS = Object.keys(FEATURE_LABELS) as FeatureKey[]

/** Lo que ve una cuenta cuando no hay nada guardado. */
export const DEFAULT_FEATURES: Features = { inversiones: false, ahorro: false, propiedad: false, liquidaciones: false, ia: false, viajes: false }

export const ALL_FEATURES: Features = { inversiones: true, ahorro: true, propiedad: true, liquidaciones: true, ia: true, viajes: true }

/** Accesos rápidos del panel /admin: un clic en vez de marcar módulo por módulo. */
export const FEATURE_PRESETS: { id: string; label: string; features: Features }[] = [
  { id: 'basico',      label: 'Básico',          features: DEFAULT_FEATURES },
  { id: 'inversiones', label: 'Con inversiones', features: { ...DEFAULT_FEATURES, inversiones: true, ahorro: true } },
  { id: 'propiedad',   label: 'Con propiedad',   features: { ...DEFAULT_FEATURES, propiedad: true } },
  { id: 'viajes',      label: 'Con viajes',      features: { ...DEFAULT_FEATURES, viajes: true } },
  { id: 'completo',    label: 'Completo',        features: ALL_FEATURES },
]

export function normalizeFeatures(raw: unknown): Features {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    inversiones:   src.inversiones === true,
    ahorro:        src.ahorro === true,
    propiedad:     src.propiedad === true,
    liquidaciones: src.liquidaciones === true,
    ia:            src.ia === true,
    viajes:        src.viajes === true,
  }
}

/** ¿Ve el módulo? Si se pasan varios, basta con uno (ej. Inversiones aparece con Inversiones O Ahorro). */
export function hasFeature(features: Features | undefined, need?: FeatureKey | FeatureKey[]): boolean {
  if (!need || !features) return true
  return (Array.isArray(need) ? need : [need]).some(k => features[k])
}
