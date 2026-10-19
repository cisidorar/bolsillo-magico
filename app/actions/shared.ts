'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getServerSession } from '@/lib/supabase/server'
import type { SplitKind, SplitMode, TripCategory } from '@/lib/shared-split'
import type { TripBudget } from '@/lib/trip-plan'
import { normalizeUsername, usernameError } from '@/lib/username'

// ── Gastos compartidos (docs/PLAN_GASTOS_COMPARTIDOS.md) ─────────────────────
// Todo lo que toca datos de dos personas pasa por funciones SECURITY DEFINER
// de la migración 20261020_shared_groups_n_people.sql: ahí viven las validaciones de
// pertenencia, de viaje cerrado y del reparto. Estas acciones solo traducen
// los errores a mensajes para la pantalla.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const ERRORS: Record<string, string> = {
  unauthenticated:      'Tu sesión expiró. Vuelve a entrar.',
  name_required:        'Ponle un nombre al viaje.',
  user_not_found:       'No encontramos a nadie con ese usuario.',
  cannot_invite_self:   'No puedes invitarte a ti mismo.',
  invalid_split_mode:   'Elige cómo repartir.',
  invalid_dates:        'La vuelta no puede ser antes de la salida.',
  invalid_category:     'Esa categoría no es tuya.',
  invite_not_available: 'Esa invitación ya no está disponible.',
  not_member:           'No eres parte de este viaje.',
  group_closed:         'El viaje está cerrado. Reábrelo para cambiarlo.',
  no_income_data:       'Para repartir según sueldo, todos tienen que aceptar compartir su porcentaje y tener ingresos registrados.',
  only_creator:         'Solo quien creó el viaje puede hacer esto.',
  already_member:       'Esa persona ya está en el viaje.',
  already_invited:      'Esa persona ya tiene una invitación pendiente.',
  member_has_activity:  'Esa persona tiene gastos o transferencias en el viaje; no se puede sacar.',
  creator_cannot_leave: 'Quien creó el viaje no puede salirse.',
  invalid_participants: 'Elige al menos una persona que participe.',
  invalid_people:       'El número de personas tiene que estar entre 1 y 50.',
  invalid_budget:       'Revisa los montos del presupuesto.',
  invalid_goal:         'Esa meta no es tuya.',
  already_paid:         'Ese pago ya está registrado.',
  invalid_amount:       'Ingresa un monto mayor a cero.',
  description_required: 'Escribe una descripción.',
  invalid_payer:        'Quien pagó tiene que ser parte del viaje.',
  invalid_split_kind:   'Reparto inválido.',
  invalid_exact_share:  'Las partes tienen que sumar el monto total.',
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
  categoryId: string | null
}

export async function createSharedGroup(input: CreateGroupInput): Promise<Result<{ id: string }>> {
  const r = await rpc<string>('shared_group_create', {
    p_name: input.name, p_start: input.startDate || null, p_end: input.endDate || null,
    p_split_mode: input.splitMode, p_category: input.categoryId,
  })
  if (!r.ok) return r
  return { ok: true, id: r.data as string }
}

export async function updateSharedGroup(groupId: string, name: string, startDate: string | null, endDate: string | null) {
  return rpc('shared_group_update', { p_group: groupId, p_name: name, p_start: startDate || null, p_end: endDate || null })
}

export async function setSharedMode(groupId: string, mode: SplitMode) {
  return rpc('shared_group_set_mode', { p_group: groupId, p_mode: mode })
}

export async function giveSharedConsent(groupId: string, consent: boolean) {
  return rpc('shared_give_consent', { p_group: groupId, p_consent: consent })
}

export async function inviteToSharedGroup(groupId: string, username: string) {
  return rpc('shared_group_invite', { p_group: groupId, p_username: username })
}

export async function removeSharedMember(groupId: string, userId: string) {
  return rpc('shared_member_remove', { p_group: groupId, p_user: userId })
}

export async function acceptSharedInvite(groupId: string, categoryId: string | null, consent: boolean) {
  return rpc('shared_group_accept', { p_group: groupId, p_category: categoryId, p_consent: consent })
}

export async function declineSharedInvite(groupId: string) {
  return rpc('shared_group_decline', { p_group: groupId })
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
  /** null = todos los miembros (se recalcula si entra alguien) */
  participants:    string[] | null
  /** solo split_kind 'exact': user_id → monto */
  exact:           Record<string, number> | null
}

export async function saveSharedExpense(input: SaveExpenseInput): Promise<Result<{ id: string }>> {
  const r = await rpc<string>('shared_expense_save', {
    p_id: input.id, p_group: input.groupId, p_trip_category: input.tripCategory,
    p_description: input.description, p_date: input.date, p_amount: input.amount,
    p_paid_by: input.paidBy, p_payment_method: input.paymentMethodId,
    p_split_kind: input.splitKind, p_participants: input.participants, p_exact: input.exact,
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
  const r = await rpc('shared_group_set_closed', { p_group: groupId, p_closed: closed })
  if (!r.ok) return r
  // Tu meta de ahorro ligada al viaje se archiva al cerrarlo (y vuelve si lo reabres).
  const user = await getServerSession()
  if (user) {
    const supabase = await createClient()
    const { data: m } = await supabase.from('shared_group_members')
      .select('savings_goal_id').eq('group_id', groupId).eq('user_id', user.id).maybeSingle()
    if (m?.savings_goal_id) {
      await supabase.from('savings_goals').update({ is_active: !closed, updated_at: new Date().toISOString() })
        .eq('id', m.savings_goal_id).eq('user_id', user.id)
      revalidatePath('/presupuesto')
    }
  }
  return r
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

// ── Fase 2: planificación ───────────────────────────────────────────────────

export async function setTripPlan(groupId: string, budget: TripBudget, people: number | null) {
  return rpc('shared_group_set_plan', { p_group: groupId, p_budget: budget, p_people: people })
}

/** Crea (o actualiza) tu meta de ahorro personal para el viaje y la deja ligada. */
export async function saveTripGoal(input: {
  groupId: string; goalId: string | null; name: string; target: number; targetDate: string | null
}): Promise<Result<{ id: string }>> {
  const user = await getServerSession()
  if (!user) return { ok: false, error: ERRORS.unauthenticated }
  if (!Number.isInteger(input.target) || input.target <= 0) return { ok: false, error: 'La meta tiene que ser mayor a cero.' }
  const supabase = await createClient()
  let id = input.goalId
  if (id) {
    const { error } = await supabase.from('savings_goals')
      .update({ name: input.name, target_amount: input.target, target_date: input.targetDate, updated_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', user.id)
    if (error) return { ok: false, error: 'No se pudo actualizar la meta.' }
  } else {
    const { data, error } = await supabase.from('savings_goals')
      .insert({ user_id: user.id, name: input.name, target_amount: input.target, target_date: input.targetDate, icon: 'Plane', color: '#0EA5E9' })
      .select('id').single()
    if (error || !data) return { ok: false, error: 'No se pudo crear la meta.' }
    id = data.id as string
  }
  const r = await rpc('shared_set_my_goal', { p_group: input.groupId, p_goal: id })
  if (!r.ok) return r
  revalidatePath('/presupuesto')
  return { ok: true, id: id! }
}

/** Suma a lo ahorrado de la meta del viaje. */
export async function addToTripGoal(goalId: string, amount: number): Promise<Result> {
  const user = await getServerSession()
  if (!user) return { ok: false, error: ERRORS.unauthenticated }
  if (!Number.isInteger(amount) || amount === 0) return { ok: false, error: 'Ingresa un monto.' }
  const supabase = await createClient()
  const { data: g } = await supabase.from('savings_goals').select('current_amount').eq('id', goalId).eq('user_id', user.id).maybeSingle()
  if (!g) return { ok: false, error: 'Esa meta ya no existe.' }
  const next = Math.max(0, (g.current_amount as number) + amount)
  const { error } = await supabase.from('savings_goals').update({ current_amount: next, updated_at: new Date().toISOString() }).eq('id', goalId).eq('user_id', user.id)
  if (error) return { ok: false, error: 'No se pudo actualizar la meta.' }
  revalidatePath('/compartidos')
  revalidatePath('/presupuesto')
  return { ok: true }
}

// ── Fase 3: pagos programados ───────────────────────────────────────────────

export async function savePlanItem(input: {
  id: string | null; groupId: string; description: string; category: TripCategory; amount: number; dueDate: string | null
  kind?: 'reserva' | 'durante'; quantity?: number; unitAmount?: number | null; capAmount?: number | null; optional?: boolean
}): Promise<Result<{ id: string }>> {
  const r = await rpc<string>('shared_plan_item_save', {
    p_id: input.id, p_group: input.groupId, p_description: input.description,
    p_category: input.category, p_amount: input.amount, p_due: input.dueDate || null,
    p_kind: input.kind ?? 'reserva', p_qty: input.quantity ?? 1, p_unit: input.unitAmount ?? null,
    p_cap: input.capAmount ?? null, p_optional: input.optional ?? false,
  })
  if (!r.ok) return r
  revalidatePath('/recurrentes')
  return { ok: true, id: r.data as string }
}

export async function togglePlanItem(id: string, enabled: boolean) {
  const r = await rpc('shared_plan_item_toggle', { p_id: id, p_enabled: enabled })
  revalidatePath('/recurrentes')
  return r
}

export async function deletePlanItem(id: string) {
  const r = await rpc('shared_plan_item_delete', { p_id: id })
  revalidatePath('/recurrentes')
  return r
}

export async function payPlanItem(id: string, amount: number | null, date: string, paymentMethodId: string | null) {
  const r = await rpc('shared_plan_item_pay', { p_id: id, p_amount: amount, p_date: date, p_payment_method: paymentMethodId })
  revalidatePath('/recurrentes')
  return r
}
