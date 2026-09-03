'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { aseoDueDates, aseoRef } from '@/lib/property-charges'
import { rentDueDate, rentPeriodsToGenerate, rentRef, mortgageRef, type LeaseLike } from '@/lib/lease'

// ── P1 (PLAN_PROPIEDAD): CRUD de la propiedad y su ledger de obligaciones ────
// Mundo aparte por decisión D1: nada de esto escribe en expenses ni en incomes.

export interface PropertyInput {
  alias:                string
  propertyType:         'departamento' | 'casa' | 'otro' | null
  unitNumber:           string | null
  address:              string | null
  region:               string | null
  comuna:               string | null
  rolSii:               string | null
  mortgageAmount:       number | null
  mortgageDueDay:       number | null
  mortgageAccountLabel: string | null
  electricityClientId:  string | null
  waterClientId:        string | null
}

type Result = { ok: true; id?: string } | { ok: false; error: string }

async function currentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function saveProperty(input: PropertyInput, id?: string): Promise<Result> {
  const { supabase, user } = await currentUser()
  if (!user) return { ok: false, error: 'No autenticado' }
  if (!input.alias.trim()) return { ok: false, error: 'Ponle un nombre a la propiedad' }

  const row = {
    user_id:                user.id,
    alias:                  input.alias.trim(),
    property_type:          input.propertyType || null,
    unit_number:            input.unitNumber?.trim() || null,
    address:                input.address?.trim() || null,
    region:                 input.region?.trim() || null,
    comuna:                 input.comuna?.trim() || null,
    rol_sii:                input.rolSii?.trim() || null,
    mortgage_amount:        input.mortgageAmount || null,
    mortgage_due_day:       input.mortgageDueDay || null,
    mortgage_account_label: input.mortgageAccountLabel?.trim() || null,
    electricity_client_id:  input.electricityClientId?.trim() || null,
    water_client_id:        input.waterClientId?.trim() || null,
    updated_at:             new Date().toISOString(),
  }

  const { data, error } = id
    ? await supabase.from('properties').update(row).eq('id', id).eq('user_id', user.id).select('id').single()
    : await supabase.from('properties').insert(row).select('id').single()

  if (error) return { ok: false, error: error.message }
  revalidatePath('/propiedad')
  return { ok: true, id: data?.id }
}

export async function deleteProperty(id: string): Promise<Result> {
  const { supabase, user } = await currentUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  // Los cobros caen solos por ON DELETE CASCADE.
  const { error } = await supabase.from('properties').delete().eq('id', id).eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/propiedad')
  return { ok: true }
}

// ── Cobros ──────────────────────────────────────────────────────────────────

export interface ChargeInput {
  propertyId:   string
  kind:         string
  direction:    'in' | 'out'
  dueDate:      string
  amount:       number
  penalty:      number
  inflationAdj: number
  responsible:  'owner' | 'tenant'
  externalRef:  string | null
  notes:        string | null
  periodMonth:  number | null
  periodYear:   number | null
}

export async function saveCharge(input: ChargeInput, id?: string): Promise<Result> {
  const { supabase, user } = await currentUser()
  if (!user) return { ok: false, error: 'No autenticado' }
  if (!input.dueDate) return { ok: false, error: 'Falta la fecha de vencimiento' }
  if (input.amount < 0) return { ok: false, error: 'El monto no puede ser negativo' }

  const row = {
    user_id:       user.id,
    property_id:   input.propertyId,
    kind:          input.kind,
    direction:     input.direction,
    due_date:      input.dueDate,
    amount:        Math.round(input.amount),
    penalty:       Math.round(input.penalty || 0),
    inflation_adj: Math.round(input.inflationAdj || 0),
    responsible:   input.responsible,
    external_ref:  input.externalRef?.trim() || null,
    notes:         input.notes?.trim() || null,
    period_month:  input.periodMonth,
    period_year:   input.periodYear,
    updated_at:    new Date().toISOString(),
  }

  const { error } = id
    ? await supabase.from('property_charges').update(row).eq('id', id).eq('user_id', user.id)
    : await supabase.from('property_charges').insert(row)

  if (error) {
    // El índice único por external_ref es la red que evita cargar dos veces el
    // mismo giro — vale la pena explicarlo en vez de mostrar el error de Postgres.
    if (error.code === '23505') {
      return { ok: false, error: `Ya existe un cobro con la referencia "${input.externalRef}"` }
    }
    return { ok: false, error: error.message }
  }
  revalidatePath('/propiedad')
  return { ok: true }
}

export async function markChargePaid(
  id: string,
  paidDate: string,
  paidAmount: number,
): Promise<Result> {
  const { supabase, user } = await currentUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { error } = await supabase
    .from('property_charges')
    .update({
      paid_date:   paidDate,
      paid_amount: Math.round(paidAmount),
      confirmed:   true,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', id).eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/propiedad')
  return { ok: true }
}

/** Deshacer un pago marcado por error: vuelve a quedar impago, sin borrar la fila. */
export async function unmarkChargePaid(id: string): Promise<Result> {
  const { supabase, user } = await currentUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { error } = await supabase
    .from('property_charges')
    .update({ paid_date: null, paid_amount: null, confirmed: false, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/propiedad')
  return { ok: true }
}

/** Confirmar un cargo automático (dividendo) que ya se revisó en la cartola. */
export async function confirmCharge(id: string): Promise<Result> {
  const { supabase, user } = await currentUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { error } = await supabase
    .from('property_charges')
    .update({ confirmed: true, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/propiedad')
  return { ok: true }
}

export async function deleteCharge(id: string): Promise<Result> {
  const { supabase, user } = await currentUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { error } = await supabase.from('property_charges').delete().eq('id', id).eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/propiedad')
  return { ok: true }
}

/**
 * Genera los 4 giros de derechos de aseo de un año con sus vencimientos
 * (30/04, 30/06, 30/09, 30/11) y monto base editable.
 *
 * Idempotente por `external_ref`: correrlo dos veces no duplica nada gracias al
 * índice único parcial. Los giros que ya existen se saltan en silencio, así que
 * también sirve para completar un año a medio cargar.
 */
export async function generateAseoCharges(
  propertyId: string,
  year: number,
  baseAmount: number,
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const { supabase, user } = await currentUser()
  if (!user) return { ok: false, error: 'No autenticado' }
  if (baseAmount <= 0) return { ok: false, error: 'Indica el monto base del giro' }

  const { data: existing } = await supabase
    .from('property_charges')
    .select('external_ref')
    .eq('user_id', user.id)
    .eq('property_id', propertyId)
    .eq('kind', 'aseo')

  const taken = new Set((existing ?? []).map(r => r.external_ref))

  const rows = aseoDueDates(year)
    .map((dueDate, i) => ({ dueDate, ref: aseoRef(year, i + 1), quarter: i + 1 }))
    .filter(r => !taken.has(r.ref))
    .map(r => ({
      user_id:      user.id,
      property_id:  propertyId,
      kind:         'aseo',
      direction:    'out' as const,
      due_date:     r.dueDate,
      amount:       Math.round(baseAmount),
      responsible:  'owner' as const,
      external_ref: r.ref,
      period_year:  year,
      period_month: Number(r.dueDate.slice(5, 7)),
      notes:        'Generado automáticamente — reemplaza la referencia por el N° de giro real',
    }))

  if (rows.length === 0) return { ok: true, created: 0 }

  const { error } = await supabase.from('property_charges').insert(rows)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/propiedad')
  return { ok: true, created: rows.length }
}

// ── P2: contrato de arriendo ────────────────────────────────────────────────

export interface LeaseInput {
  propertyId:        string
  tenantName:        string
  tenantEmail:       string | null
  tenantPhone:       string | null
  startDate:         string
  endDate:           string | null
  noticeDays:        number
  rentAmount:        number
  rentDueDay:        number
  lateFeePerDay:     number | null
  terminationDays:   number | null
  adjustmentKind:    'ipc' | 'uf' | 'none'
  adjustmentMonths:  number | null
  lastAdjustmentDate: string | null
  depositAmount:     number | null
  notes:             string | null
}

export async function saveLease(input: LeaseInput, id?: string): Promise<Result> {
  const { supabase, user } = await currentUser()
  if (!user) return { ok: false, error: 'No autenticado' }
  if (!input.tenantName.trim()) return { ok: false, error: 'Falta el nombre del arrendatario' }
  if (!input.startDate) return { ok: false, error: 'Falta la fecha de inicio' }
  if (input.rentAmount <= 0) return { ok: false, error: 'La renta debe ser mayor que cero' }

  const row = {
    user_id:              user.id,
    property_id:          input.propertyId,
    tenant_name:          input.tenantName.trim(),
    tenant_email:         input.tenantEmail?.trim() || null,
    tenant_phone:         input.tenantPhone?.trim() || null,
    start_date:           input.startDate,
    end_date:             input.endDate || null,
    notice_days:          input.noticeDays || 60,
    rent_amount:          Math.round(input.rentAmount),
    rent_due_day:         input.rentDueDay,
    late_fee_per_day:     input.lateFeePerDay ?? null,
    termination_days:     input.terminationDays ?? null,
    adjustment_kind:      input.adjustmentKind,
    adjustment_months:    input.adjustmentKind === 'none' ? null : input.adjustmentMonths,
    // Sin base explícita el reajuste se cuenta desde el inicio del contrato.
    last_adjustment_date: input.lastAdjustmentDate || input.startDate,
    deposit_amount:       input.depositAmount ?? null,
    notes:                input.notes?.trim() || null,
    updated_at:           new Date().toISOString(),
  }

  const { data, error } = id
    ? await supabase.from('lease_contracts').update(row).eq('id', id).eq('user_id', user.id).select('id').single()
    : await supabase.from('lease_contracts').insert(row).select('id').single()

  if (error) return { ok: false, error: error.message }
  revalidatePath('/propiedad')
  return { ok: true, id: data?.id }
}

export async function deleteLease(id: string): Promise<Result> {
  const { supabase, user } = await currentUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { error } = await supabase.from('lease_contracts').delete().eq('id', id).eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/propiedad')
  return { ok: true }
}

/**
 * Genera los cobros mensuales de arriendo y dividendo desde el inicio del
 * contrato hasta el mes en curso.
 *
 * Dos decisiones que cambian lo que ves en pantalla:
 *
 * - El **arriendo nace impago** (`paid_date: null`). Es plata que tiene que
 *   llegar; darla por recibida sin que Cas la confirme sería mentir sobre el
 *   estado de la propiedad.
 * - El **dividendo nace pagado pero sin confirmar** (D2 del plan): se descuenta
 *   solo de la cuenta corriente, así que decir "impago" sería falso. Pero que
 *   el banco lo haya cobrado es un supuesto hasta mirar la cartola — por eso
 *   `confirmed: false` y el chip de "revisar" en la UI.
 *
 * Idempotente por `external_ref`, igual que generateAseoCharges: correrlo dos
 * veces no duplica y sirve para rellenar meses faltantes.
 */
export async function generateLeaseCharges(
  propertyId: string,
  today: string,
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const { supabase, user } = await currentUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const [{ data: lease }, { data: prop }] = await Promise.all([
    supabase.from('lease_contracts')
      .select('start_date, end_date, notice_days, rent_amount, rent_due_day, late_fee_per_day, termination_days, adjustment_kind, adjustment_months, last_adjustment_date')
      .eq('user_id', user.id).eq('property_id', propertyId).eq('is_active', true).maybeSingle(),
    supabase.from('properties')
      .select('mortgage_amount, mortgage_due_day')
      .eq('user_id', user.id).eq('id', propertyId).single(),
  ])

  if (!lease) return { ok: false, error: 'Primero registra el contrato de arriendo' }

  const { data: existing } = await supabase
    .from('property_charges')
    .select('external_ref')
    .eq('user_id', user.id).eq('property_id', propertyId)
    .in('kind', ['rent', 'mortgage'])

  const taken = new Set((existing ?? []).map(r => r.external_ref))
  const periods = rentPeriodsToGenerate(lease as LeaseLike, today)
  const rows: Record<string, unknown>[] = []

  for (const { year, month } of periods) {
    const rRef = rentRef(year, month)
    if (!taken.has(rRef)) {
      rows.push({
        user_id: user.id, property_id: propertyId,
        kind: 'rent', direction: 'in',
        due_date: rentDueDate(lease as LeaseLike, year, month),
        amount: lease.rent_amount,
        responsible: 'owner', external_ref: rRef,
        period_year: year, period_month: month,
      })
    }

    // El dividendo solo se genera si la propiedad tiene monto y día cargados.
    const mRef = mortgageRef(year, month)
    if (prop?.mortgage_amount && prop.mortgage_due_day && !taken.has(mRef)) {
      const lastDay = new Date(year, month, 0).getDate()
      const day = Math.min(prop.mortgage_due_day, lastDay)
      const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      // Solo lo damos por cobrado si la fecha ya pasó — un dividendo que vence
      // en tres semanas no se descontó todavía.
      const yaVencio = dueDate <= today
      rows.push({
        user_id: user.id, property_id: propertyId,
        kind: 'mortgage', direction: 'out',
        due_date: dueDate,
        amount: prop.mortgage_amount,
        responsible: 'owner', external_ref: mRef,
        period_year: year, period_month: month,
        auto_debit: true,
        paid_date: yaVencio ? dueDate : null,
        paid_amount: yaVencio ? prop.mortgage_amount : null,
        confirmed: false,
      })
    }
  }

  if (rows.length === 0) return { ok: true, created: 0 }

  const { error } = await supabase.from('property_charges').insert(rows)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/propiedad')
  return { ok: true, created: rows.length }
}
