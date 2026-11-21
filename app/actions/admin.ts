'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getUserAccess } from '@/lib/supabase/server'
import { FEATURE_KEYS, FEATURE_LABELS, normalizeFeatures, type FeatureKey, type Features } from '@/lib/features'

// ── Acceso por invitación (nov 2026) ─────────────────────────────────────────
// Todo lo de acá usa la llave de servicio, que se salta RLS, así que la
// primera línea de cada acción comprueba que quien llama es admin. Nunca se
// confía en lo que mande el navegador.

export interface WaitlistRow {
  id: string
  email: string
  created_at: string
  status: 'pending' | 'invited' | 'rejected'
  invited_at: string | null
}

export interface AccountRow {
  id: string
  email: string
  display_name: string | null
  created_at: string
  last_sign_in_at: string | null
  banned: boolean
  is_admin: boolean
  features: Features
}

export type AdminResult = { ok: true; message?: string } | { ok: false; error: string }

/** Tope de cuentas activas (sin contar bloqueadas). Se cambia con MAX_ACTIVE_USERS. */
const ACCOUNT_CAP = Number(process.env.MAX_ACTIVE_USERS ?? 10)

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createAdminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function requireAdmin() {
  const access = await getUserAccess()
  if (!access?.isAdmin) return null
  return access
}

const NO_ADMIN = { ok: false, error: 'No tienes permiso para hacer esto.' } as const
const NO_SERVICE = { ok: false, error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.' } as const

export async function loadAdminData(): Promise<
  | { ok: true; waitlist: WaitlistRow[]; accounts: AccountRow[]; cap: number }
  | { ok: false; error: string }
> {
  if (!(await requireAdmin())) return { ok: false, error: NO_ADMIN.error }
  const admin = serviceClient()
  if (!admin) return { ok: false, error: NO_SERVICE.error }

  const [{ data: wl, error: wlErr }, { data: usersPage, error: usersErr }, { data: profiles, error: profErr }] = await Promise.all([
    admin.from('waitlist').select('id, email, created_at, status, invited_at').order('created_at', { ascending: false }).limit(200),
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin.from('profiles').select('id, display_name, is_admin, features'),
  ])
  if (wlErr || usersErr || profErr) {
    console.error('[admin] carga falló:', wlErr?.message, usersErr?.message, profErr?.message)
    return { ok: false, error: 'No se pudo cargar el panel. Revisa que la migración 20261120 esté aplicada.' }
  }

  const byId = new Map((profiles ?? []).map(p => [p.id as string, p]))
  const accounts: AccountRow[] = (usersPage?.users ?? []).map(u => {
    const p = byId.get(u.id) as { display_name: string | null; is_admin: boolean; features: unknown } | undefined
    const bannedUntil = (u as { banned_until?: string | null }).banned_until
    return {
      id: u.id,
      email: u.email ?? '',
      display_name: p?.display_name ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      banned: !!bannedUntil && new Date(bannedUntil).getTime() > Date.now(),
      is_admin: p?.is_admin === true,
      features: normalizeFeatures(p?.features),
    }
  }).sort((a, b) => a.created_at.localeCompare(b.created_at))

  return { ok: true, waitlist: (wl ?? []) as WaitlistRow[], accounts, cap: ACCOUNT_CAP }
}

async function activeAccounts(admin: NonNullable<ReturnType<typeof serviceClient>>) {
  // El tope cuenta cuentas activas: así una cuenta bloqueada libera un cupo.
  const { data: usersPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  return (usersPage?.users ?? []).filter(u => {
    const b = (u as { banned_until?: string | null }).banned_until
    return !(b && new Date(b).getTime() > Date.now())
  }).length
}

/** "acceso: Inversiones, Propiedad" / "acceso básico", para el aviso que ve quien invita. */
function accessText(features?: Features): string {
  const f = features ? normalizeFeatures(features) : null
  const on = f ? FEATURE_KEYS.filter(k => f[k]).map(k => FEATURE_LABELS[k].title) : []
  return on.length ? `acceso: ${on.join(', ')}` : 'acceso básico'
}

/** Manda la invitación y, si se pidió, deja la cuenta con esos módulos desde el inicio. */
async function sendInvite(
  admin: NonNullable<ReturnType<typeof serviceClient>>, email: string, origin: string, features?: Features, name?: string,
): Promise<{ ok: true; userId: string | null } | { ok: false; error: string }> {
  if ((await activeAccounts(admin)) >= ACCOUNT_CAP) {
    return { ok: false, error: `Llegaste al tope de ${ACCOUNT_CAP} cuentas activas. Bloquea una o sube MAX_ACTIVE_USERS.` }
  }
  // El enlace del correo pasa por /api/auth/confirm (verifica el token) y
  // termina en /update-password?welcome=1, donde la persona crea su contraseña.
  const redirectTo = `${origin.replace(/\/$/, '')}/api/auth/confirm?next=${encodeURIComponent('/update-password?welcome=1')}`
  const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, ...(name ? { data: { display_name: name } } : {}) })
  if (invErr) {
    console.error('[admin] invite falló:', invErr.message)
    return { ok: false, error: invErr.message.includes('already') ? 'Ese correo ya tiene una cuenta.' : 'No se pudo mandar la invitación.' }
  }
  const userId = invited.user?.id ?? null
  if (userId && features) {
    const { error: fe } = await admin.from('profiles').update({ features }).eq('id', userId)
    if (fe) {
      console.error('[admin] no se pudieron guardar los módulos:', fe.message)
      return { ok: false, error: 'La invitación salió, pero no se pudieron guardar los módulos. Ajústalos en Cuentas.' }
    }
  }
  return { ok: true, userId }
}

export async function inviteFromWaitlist(waitlistId: string, origin: string, features?: Features): Promise<AdminResult> {
  if (!(await requireAdmin())) return NO_ADMIN
  const admin = serviceClient()
  if (!admin) return NO_SERVICE

  const { data: row, error } = await admin.from('waitlist').select('id, email, status').eq('id', waitlistId).maybeSingle()
  if (error || !row) return { ok: false, error: 'No encontramos esa solicitud.' }

  const res = await sendInvite(admin, row.email as string, origin, features ? normalizeFeatures(features) : undefined)
  if (!res.ok) return res

  await admin.from('waitlist').update({
    status: 'invited', invited_at: new Date().toISOString(), invited_user_id: res.userId,
  }).eq('id', waitlistId)

  revalidatePath('/admin')
  return { ok: true, message: `Invitación enviada a ${row.email} · ${accessText(features)}.` }
}

/** Invitar a alguien directo, sin que haya pasado por la lista de espera. */
export async function inviteByEmail(email: string, origin: string, features?: Features, name?: string): Promise<AdminResult> {
  if (!(await requireAdmin())) return NO_ADMIN
  const admin = serviceClient()
  if (!admin) return NO_SERVICE
  const clean = email.trim().toLowerCase()
  if (clean.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return { ok: false, error: 'Ese correo no parece válido.' }

  // El nombre viaja en la invitación: ella solo lo confirma al crear su cuenta.
  const cleanName = (name ?? '').trim().slice(0, 40)
  if (cleanName.includes('@')) return { ok: false, error: 'Pon solo el nombre, sin correo.' }
  const res = await sendInvite(admin, clean, origin, features ? normalizeFeatures(features) : undefined, cleanName || undefined)
  if (!res.ok) return res
  // Si ya estaba en la lista de espera, queda marcada como invitada.
  await admin.from('waitlist').update({ status: 'invited', invited_at: new Date().toISOString(), invited_user_id: res.userId })
    .eq('email', clean).eq('status', 'pending')
  revalidatePath('/admin')
  return { ok: true, message: `Invitación enviada a ${clean} · ${accessText(features)}.` }
}

export async function rejectWaitlist(waitlistId: string): Promise<AdminResult> {
  if (!(await requireAdmin())) return NO_ADMIN
  const admin = serviceClient()
  if (!admin) return NO_SERVICE
  const { error } = await admin.from('waitlist').update({ status: 'rejected' }).eq('id', waitlistId)
  if (error) return { ok: false, error: 'No se pudo actualizar la solicitud.' }
  revalidatePath('/admin')
  return { ok: true }
}

export async function setAccountFeature(userId: string, key: FeatureKey, on: boolean): Promise<AdminResult> {
  if (!(await requireAdmin())) return NO_ADMIN
  if (!FEATURE_KEYS.includes(key)) return { ok: false, error: 'Módulo desconocido.' }
  const admin = serviceClient()
  if (!admin) return NO_SERVICE

  const { data: prof, error } = await admin.from('profiles').select('features').eq('id', userId).maybeSingle()
  if (error || !prof) return { ok: false, error: 'No encontramos esa cuenta.' }
  const next = { ...normalizeFeatures((prof as { features: unknown }).features), [key]: on }
  const { error: upErr } = await admin.from('profiles').update({ features: next }).eq('id', userId)
  if (upErr) return { ok: false, error: 'No se pudo guardar el cambio.' }
  revalidatePath('/admin')
  return { ok: true }
}

/** Deja los módulos de una cuenta exactamente como se indica (presets Básico / Completo). */
export async function setAccountFeatures(userId: string, features: Features): Promise<AdminResult> {
  if (!(await requireAdmin())) return NO_ADMIN
  const admin = serviceClient()
  if (!admin) return NO_SERVICE
  const { error } = await admin.from('profiles').update({ features: normalizeFeatures(features) }).eq('id', userId)
  if (error) return { ok: false, error: 'No se pudo guardar el cambio.' }
  revalidatePath('/admin')
  return { ok: true }
}

/** Bloquear impide iniciar sesión pero conserva los datos; desbloquear lo revierte. */
export async function setAccountBlocked(userId: string, blocked: boolean): Promise<AdminResult> {
  const me = await requireAdmin()
  if (!me) return NO_ADMIN
  if (me.userId === userId) return { ok: false, error: 'No puedes bloquear tu propia cuenta.' }
  const admin = serviceClient()
  if (!admin) return NO_SERVICE
  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: blocked ? '876000h' : 'none' })
  if (error) return { ok: false, error: 'No se pudo cambiar el acceso.' }
  revalidatePath('/admin')
  return { ok: true }
}
