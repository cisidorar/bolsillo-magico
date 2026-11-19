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
export type FeatureKey = 'inversiones' | 'propiedad' | 'liquidaciones'

export type Features = Record<FeatureKey, boolean>

export const FEATURE_LABELS: Record<FeatureKey, { title: string; hint: string }> = {
  inversiones:   { title: 'Inversiones',          hint: 'Acciones, billetera USD, depósitos y ahorro' },
  propiedad:     { title: 'Propiedad',            hint: 'Arriendo, dividendo y cuentas de un depto' },
  liquidaciones: { title: 'Liquidaciones en PDF', hint: 'Subir la liquidación para registrar el sueldo' },
}

export const FEATURE_KEYS = Object.keys(FEATURE_LABELS) as FeatureKey[]

/** Lo que ve una cuenta cuando no hay nada guardado. */
export const DEFAULT_FEATURES: Features = { inversiones: false, propiedad: false, liquidaciones: false }

export function normalizeFeatures(raw: unknown): Features {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    inversiones:   src.inversiones === true,
    propiedad:     src.propiedad === true,
    liquidaciones: src.liquidaciones === true,
  }
}
