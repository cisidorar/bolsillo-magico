import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { fetchClIpcSeries } from '@/lib/cl-indicators'
import { nextAdjustmentDate, type LeaseLike } from '@/lib/lease'
import { computeRentAdjustment, shouldNotifyAdjustment, monthStart, DEFAULT_WINDOW_MONTHS } from '@/lib/rent-adjustment'
import { buildRentAdjustmentPdf } from '@/lib/rent-adjustment-pdf'
import { invokeEdgeFunction } from '@/lib/invoke-edge-function'
import { getNowChile } from '@/lib/utils'
import { applyRentAdjustmentCore } from '@/lib/rent-adjustment-apply'

// ── Cron: reajuste semestral del arriendo por IPC (nov 2026) ─────────────────
// Diario. Por cada contrato activo con reajuste por IPC: calcula el próximo
// reajuste (lib/rent-adjustment.ts, ventana de 6 meses con 2 de desfase), y
// apenas el IPC de la ventana está publicado —y todavía no se avisó— guarda el
// cálculo en rent_adjustments, genera el PDF del aviso (Storage, bucket
// property-docs) y llama a la Edge Function notify-rent-adjustment, que manda
// el correo con el PDF adjunto (Resend vive allá). Idempotente: una fila por
// (contrato, mes de reajuste) y el correo se manda una sola vez (notified_at).
//
// Manual: GET ?dry=1 → calcula y devuelve, sin guardar ni enviar.
// Siempre con Authorization: Bearer CRON_SECRET.

export const maxDuration = 60
export const dynamic = 'force-dynamic'

interface LeaseRow extends LeaseLike {
  id: string; user_id: string; property_id: string; tenant_name: string
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase env faltante' }, { status: 503 })
  const supabase = createAdminClient(url, key)
  const dry = new URL(request.url).searchParams.get('dry') === '1'
  const { dateStr: today } = getNowChile()

  const { data: leases, error } = await supabase
    .from('lease_contracts')
    .select('id, user_id, property_id, tenant_name, start_date, end_date, notice_days, rent_amount, rent_due_day, late_fee_per_day, termination_days, adjustment_kind, adjustment_months, last_adjustment_date')
    .eq('is_active', true).eq('adjustment_kind', 'ipc')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!leases || leases.length === 0) return NextResponse.json({ today, leases: 0, created: 0 })

  const series = await fetchClIpcSeries(supabase)
  if (!series) return NextResponse.json({ today, leases: leases.length, created: 0, warning: 'IPC no disponible, se reintenta mañana' })

  const report: Record<string, unknown>[] = []
  let created = 0

  for (const lease of leases as LeaseRow[]) {
    const next = nextAdjustmentDate(lease)
    if (!next) continue
    const adjustmentMonth = monthStart(next)
    const adj = computeRentAdjustment(lease.rent_amount, series, adjustmentMonth, lease.adjustment_months ?? DEFAULT_WINDOW_MONTHS)

    const { data: existing } = await supabase
      .from('rent_adjustments').select('id, notified_at, pdf_path')
      .eq('lease_id', lease.id).eq('adjustment_month', adjustmentMonth).maybeSingle()

    const send = shouldNotifyAdjustment({ adjustment: adj, alreadyNotified: !!existing?.notified_at, today })
    report.push({
      lease: lease.id, adjustmentMonth, complete: adj.complete, cumulativePct: adj.cumulativePct,
      newRent: adj.newRent, willNotify: send,
    })
    if (!send || dry) continue

    const [{ data: prop }, { data: profile }] = await Promise.all([
      supabase.from('properties').select('alias, address, comuna, unit_number').eq('id', lease.property_id).single(),
      supabase.from('profiles').select('display_name, full_name').eq('id', lease.user_id).maybeSingle(),
    ])
    const propertyLabel = [prop?.alias, prop?.address && `${prop.address}${prop.unit_number ? ` depto ${prop.unit_number}` : ''}`, prop?.comuna]
      .filter(Boolean).join(', ')

    const pdf = await buildRentAdjustmentPdf({
      propertyLabel: propertyLabel || 'Propiedad arrendada',
      landlordName:  profile?.full_name?.trim() || profile?.display_name || 'Arrendadora',
      tenantName:    lease.tenant_name,
      adjustment:    adj,
      issuedOn:      today,
    })

    const pdfPath = `${lease.user_id}/${lease.property_id}/reajuste-${adjustmentMonth.slice(0, 7)}.pdf`
    const { error: upErr } = await supabase.storage.from('property-docs')
      .upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true })
    if (upErr) { report.push({ lease: lease.id, error: `PDF: ${upErr.message}` }); continue }

    const { error: rowErr } = await supabase.from('rent_adjustments').upsert({
      user_id: lease.user_id, lease_id: lease.id, adjustment_month: adjustmentMonth,
      previous_rent: adj.previousRent, new_rent: adj.newRent,
      cumulative_pct: adj.cumulativePct, floored: adj.floored,
      window_months: adj.windowMonths, pdf_path: pdfPath,
    }, { onConflict: 'lease_id,adjustment_month' })
    if (rowErr) { report.push({ lease: lease.id, error: rowErr.message }); continue }
    created++
  }

  // Aplicación automática: el contrato reajusta solo, así que el primer día del
  // mes del reajuste se aplica lo ya calculado y avisado por correo. (Confirmar
  // a mano en la app antes es opcional.)
  const applied: string[] = []
  if (!dry) {
    const { data: due } = await supabase
      .from('rent_adjustments').select('id, user_id')
      .is('applied_at', null).not('notified_at', 'is', null)
      .lte('adjustment_month', monthStart(today))
    for (const row of due ?? []) {
      const r = await applyRentAdjustmentCore(supabase, row.user_id as string, row.id as string)
      if (r.ok) applied.push(row.id as string)
    }
  }

  // La Edge Function manda los correos pendientes (notified_at null + pdf_path).
  const mail = dry || created === 0 ? null : await invokeEdgeFunction(url, key, 'notify-rent-adjustment')
  return NextResponse.json({ today, dry, leases: leases.length, created, applied: applied.length, mail, report })
}
