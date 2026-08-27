'use server'

import { createClient } from '@/lib/supabase/server'
import { extractText } from 'unpdf'
import { parsePayslipText, type ParsedPayslip, type BreakdownLine } from '@/lib/payslip-parser'

export type PayslipDraft = ParsedPayslip

/** Paso 1: sube el PDF a memoria, extrae el texto y lo parsea — NO guarda
 *  nada todavía. El resultado se muestra en un formulario editable para que
 *  el usuario confirme antes de escribir en la base. */
export async function extractPayslipDraft(
  formData: FormData
): Promise<{ ok: true; draft: PayslipDraft } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'No se recibió el archivo' }
  if (file.type !== 'application/pdf') return { ok: false, error: 'El archivo debe ser un PDF' }
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: 'El PDF es muy grande (máx. 8MB)' }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const { text } = await extractText(bytes, { mergePages: true })
    if (!text || text.trim().length < 20) {
      return { ok: false, error: 'No se pudo leer texto del PDF (¿es un PDF escaneado/imagen?)' }
    }
    const draft = parsePayslipText(text)
    return { ok: true, draft }
  } catch {
    return { ok: false, error: 'No se pudo leer el PDF. Intenta con otro archivo.' }
  }
}

export interface SavePayslipInput {
  month: number
  year: number
  employerName: string | null
  employerRut: string | null
  employeeName: string | null
  employeeRut: string | null
  position: string | null
  contractType: string | null
  contractStart: string | null
  daysWorked: number | null
  ufValue: number | null
  previsionLabel: string | null
  saludLabel: string | null
  haberesImponibles: BreakdownLine[]
  haberesNoImponibles: BreakdownLine[]
  descuentosLegales: BreakdownLine[]
  otrosDescuentos: BreakdownLine[]
  totalHaberes: number
  totalDescuentos: number
  liquido: number
}

/** Paso 2: el usuario ya revisó/corrigió el formulario — sube el PDF
 *  definitivo a Storage, guarda el desglose en `payslips` y refleja el
 *  líquido en `incomes.amount` de ese mes (sin pisar nota/desglose manual
 *  que ya existiera). */
export async function savePayslip(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const file = formData.get('file')
  const dataRaw = formData.get('data')
  if (!(file instanceof File)) return { ok: false, error: 'No se recibió el archivo' }
  if (typeof dataRaw !== 'string') return { ok: false, error: 'Datos inválidos' }

  let input: SavePayslipInput
  try {
    input = JSON.parse(dataRaw)
  } catch {
    return { ok: false, error: 'Datos inválidos' }
  }

  if (!input.month || !input.year || !input.liquido || input.liquido <= 0) {
    return { ok: false, error: 'Mes, año y líquido a recibir son obligatorios' }
  }

  const path = `${user.id}/${input.year}-${String(input.month).padStart(2, '0')}.pdf`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from('payslips')
    .upload(path, bytes, { contentType: 'application/pdf', upsert: true })
  if (uploadError) return { ok: false, error: 'No se pudo guardar el PDF' }

  const { error: upsertError } = await supabase.from('payslips').upsert(
    {
      user_id: user.id,
      month: input.month,
      year: input.year,
      employer_name: input.employerName,
      employer_rut: input.employerRut,
      employee_name: input.employeeName,
      employee_rut: input.employeeRut,
      position: input.position,
      contract_type: input.contractType,
      contract_start: input.contractStart,
      days_worked: input.daysWorked,
      uf_value: input.ufValue,
      prevision_label: input.previsionLabel,
      salud_label: input.saludLabel,
      haberes_imponibles: input.haberesImponibles,
      haberes_no_imponibles: input.haberesNoImponibles,
      descuentos_legales: input.descuentosLegales,
      otros_descuentos: input.otrosDescuentos,
      total_haberes: input.totalHaberes,
      total_descuentos: input.totalDescuentos,
      liquido: input.liquido,
      pdf_path: path,
    },
    { onConflict: 'user_id,month,year' }
  )
  if (upsertError) return { ok: false, error: 'No se pudo guardar la liquidación' }

  const { data: existingIncome } = await supabase
    .from('incomes')
    .select('description, breakdown')
    .eq('user_id', user.id)
    .eq('month', input.month)
    .eq('year', input.year)
    .maybeSingle()

  await supabase.from('incomes').upsert(
    {
      user_id: user.id,
      month: input.month,
      year: input.year,
      amount: input.liquido,
      description: existingIncome?.description ?? (input.employerName ? `Liquidación — ${input.employerName}` : 'Liquidación de sueldo'),
      breakdown: existingIncome?.breakdown ?? [],
    },
    { onConflict: 'user_id,month,year' }
  )

  return { ok: true }
}

export async function deletePayslip(month: number, year: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { data: existing } = await supabase
    .from('payslips')
    .select('pdf_path')
    .eq('user_id', user.id)
    .eq('month', month)
    .eq('year', year)
    .maybeSingle()

  if (existing?.pdf_path) {
    await supabase.storage.from('payslips').remove([existing.pdf_path])
  }

  const { error } = await supabase
    .from('payslips')
    .delete()
    .eq('user_id', user.id)
    .eq('month', month)
    .eq('year', year)

  if (error) return { ok: false, error: 'No se pudo eliminar' }
  return { ok: true }
}

export async function getPayslipDownloadUrl(path: string): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  if (!path.startsWith(`${user.id}/`)) return null // defensa extra — RLS del bucket ya lo exige
  const { data, error } = await supabase.storage.from('payslips').createSignedUrl(path, 60 * 5)
  if (error) return null
  return data.signedUrl
}
