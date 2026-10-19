'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getServerSession } from '@/lib/supabase/server'
import type { SplitKind, SplitMode, TripCategory } from '@/lib/shared-split'
import { normalizeUsername, usernameError } from '@/lib/username'

// ── Gastos compartidos (docs/PLAN_GASTOS_COMPARTIDOS.md) ─────────────────────
// Todo lo que toca datos de dos personas pasa por funciones SECURITY DEFINER
// de la migración 20261018_shared_groups.sql: ahí viven las validaciones de
// pertenencia, de viaje cerrado y del reparto. Estas acciones solo traducen
// los errores a mensajes para la pantalla.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const ERRORS: Record<string, string> = {
  unauthenticated:      'Tu sesión expiró. Vuelve a entrar.',
  name_required:        'Ponle un nombre al viaje.',
  user_not_found:       'No encontramos a nadie con ese usuario.',
  cannot_invite_self:   'No puedes invitarte a ti mismo.',
  invalid_split_mode:   'Elige cómo repartir.',
  invalid_ratio:        'El porcentaje tiene que estar entre 0 y 100.',
  invalid_dates:        'La vuelta no puede ser antes de la salida.',
  invalid_category:     'Esa categoría no es tuya.',
  invite_not_available: 'Esa invitación ya no está disponible.',
  not_member:           'No eres parte de este viaje.',
  group_closed:         'El viaje está cerrado. Reábrelo para cambiarlo.',
  waiting_for_member:   'Falta que la otra persona acepte la invitación.',
  no_income_data:       'A alguno de los dos le faltan ingresos registrados. Prueba con 50/50 o un porcentaje fijo.',
  nothing_to_confirm:   'No hay ninguna propuesta pendiente.',
  cannot_confirm_own_proposal: 'La propuesta tiene que confirmarla la otra persona.',
  ratio_not_agreed:     'Primero tienen que acordar el reparto.',
  invalid_amount:       'Ingresa un monto mayor a cero.',
  description_required: 'Escribe una descripción.',
  invalid_payer:        'Quien pagó tiene que ser uno de los dos.',
  invalid_split_kind:   'Reparto inválido.',
  invalid_exact_share:  'La parte tiene que estar entre 0 y el monto total.',
  invalid_payment_method: 'Ese método de pago no es de quien pagó.',
  expense_not_found:    'Ese gasto ya no existe.',
  invalid_recipient:    'Destinatario inválido.',
}

function friendly(message: string | undefined): string {
  if (!message) return 'No se pudo completar. Intenta de nuevo.'
  for (const key of Object.keys(ERRORS)) {
    if (message.includes(key)) return ERRORS[key]
  }
  return 'No se pudo completar. Intenta de nuevo.'
}

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<Result<{ data: T | null }>> {
  const user = await getServerSession()
  if (!user) return { ok: false, error: ERRORS.unauthenticated }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, error: friendly(error.message) }
  revalidatePath('/compartidos')
  revalidatePath('/historial')
  revalidatePath('/inicio')
  return { ok: true, data: (data ?? null) as T | null }
}

/** Categoría propia donde cae tu parte; "Viajes" se crea si no tienes ninguna. */
export async function ensureTripCategory(): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getServerSession()
  if (!user) return { ok: false, error: ERRORS.unauthenticated }
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('categories').select('id, name').eq('user_id', user.id)
  const found = (existing ?? []).find(c => /^(vacaciones|viajes?)$/i.test((c.name ?? '').trim()))
  if (found) return { ok: true, id: found.id }
  const { data: created, error } = await supabase
    .from('categories')
    .insert({
      user_id: user.id, name: 'Vacaciones', icon: 'Plane',
      color: '#0EA5E9', bg_color: '#E0F2FE', sort_order: (existing?.length ?? 0) + 1,
    })
    .select('id').single()
  if (error || !created) return { ok: false, error: 'No se pudo crear la categoría Vacaciones.' }
  revalidatePath('/categorias')
  return { ok: true, id: created.id }
}

export interface CreateGroupInput {
  name:       string
  startDate:  string | null
  endDate:    string | null
  splitMode:  SplitMode
  /** Parte del creador, 0..1 (solo si splitMode = 'fixed'). */
  fixedRatio: number | null
  /** @usuario de la otra persona (con o sin @) */
  username:   string
  categoryId: string | null
}

export async function createSharedGroup(input: CreateGroupInput): Promise<Result<{ id: string }>> {
  const r = await rpc<string>('shared_group_create', {
    p_name: input.name, p_start: input.startDate || null, p_end: input.endDate || null,
    p_split_mode: input.splitMode, p_fixed_ratio: input.fixedRatio,
    p_username: input.username, p_category: input.categoryId,
  })
  if (!r.ok) return r
  return { ok: true, id: r.data as string }
}

export async function acceptSharedInvite(groupId: string, categoryId: string | null) {
  return rpc('shared_group_accept', { p_group: groupId, p_category: categoryId })
}

export async function declineSharedInvite(groupId: string) {
  return rpc('shared_group_decline', { p_group: groupId })
}

export async function proposeSharedRatio(groupId: string, mode: SplitMode, fixedRatio: number | null) {
  return rpc('shared_ratio_propose', { p_group: groupId, p_mode: mode, p_fixed_ratio: fixedRatio })
}

export async function confirmSharedRatio(groupId: string) {
  return rpc('shared_ratio_confirm', { p_group: groupId })
}

export async function rejectSharedRatio(groupId: string) {
  return rpc('shared_ratio_reject', { p_group: groupId })
}

export interface SaveExpenseInput {
  id:              string | null
  groupId:         string
  tripCategory:    TripCategory
  description:     string
  date:            string
  amount:          number
  paidBy:          string
  paymentMethodId: string | null
  splitKind:       SplitKind
  exactA:          number | null
}

export async function saveSharedExpense(input: SaveExpenseInput): Promise<Result<{ id: string }>> {
  const r = await rpc<string>('shared_expense_save', {
    p_id: input.id, p_group: input.groupId, p_trip_category: input.tripCategory,
    p_description: input.description, p_date: input.date, p_amount: input.amount,
    p_paid_by: input.paidBy, p_payment_method: input.paymentMethodId,
    p_split_kind: input.splitKind, p_exact_a: input.exactA,
  })
  if (!r.ok) return r
  return { ok: true, id: r.data as string }
}

export async function deleteSharedExpense(id: string) {
  return rpc('shared_expense_delete', { p_id: id })
}

export async function settleShared(groupId: string, fromUser: string, toUser: string, amount: number, date: string) {
  return rpc('shared_settle', { p_group: groupId, p_from: fromUser, p_to: toUser, p_amount: amount, p_date: date })
}

export async function deleteSettlement(id: string) {
  return rpc('shared_settlement_delete', { p_id: id })
}

export async function setSharedGroupClosed(groupId: string, closed: boolean) {
  return rpc('shared_group_set_closed', { p_group: groupId, p_closed: closed })
}

export async function setMySharedCategory(groupId: string, categoryId: string) {
  return rpc('shared_set_my_category', { p_group: groupId, p_category: categoryId })
}

export interface FoundUser {
  username:    string
  displayName: string
  avatarUrl:   string | null
  isSelf:      boolean
}

/** Búsqueda exacta por @usuario. Null si no existe o no se deja encontrar. */
export async function findSharedUser(raw: string): Promise<FoundUser | null> {
  const user = await getServerSession()
  if (!user) return null
  const username = normalizeUsername(raw)
  if (usernameError(username)) return null
  const supabase = await createClient()
  const { data } = await supabase.rpc('shared_find_user', { p_username: username })
  const row = (data as { username: string; display_name: string; avatar_url: string | null; is_self: boolean }[] | null)?.[0]
  if (!row) return null
  return { username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url, isSelf: row.is_self }
}
