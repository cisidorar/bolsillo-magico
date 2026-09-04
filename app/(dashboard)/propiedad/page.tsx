import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getNowChile } from '@/lib/utils'
import PropiedadToggle, { type PropiedadView } from '@/components/PropiedadToggle'
import PropertySwitcher from '@/components/PropertySwitcher'
import PropertyManager, { type Property, type Charge, type Lease } from '@/components/PropertyManager'
import { fetchClIpcSeries } from '@/lib/cl-indicators'

export const dynamic = 'force-dynamic'

// ── P1 (PLAN_PROPIEDAD, sep 2026) ───────────────────────────────────────────
// Mundo aparte por decisión D1: esta página no lee ni escribe expenses,
// incomes, budgets ni nada del resto de la app. Se puede borrar entera sin
// afectar ninguna otra vista.

export default async function PropiedadPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; prop?: string; nueva?: string }>
}) {
  const [user, supabase, params] = await Promise.all([
    getServerSession(), createClient(), searchParams,
  ])
  if (!user) redirect('/login')

  const view: PropiedadView = params.view === 'cobros' ? 'cobros' : 'estado'

  // Fecha de Santiago, no del servidor: un vencimiento "de hoy" tiene que
  // seguir siendo de hoy aunque Vercel corra en UTC.
  const today = getNowChile().dateStr

  // Todas las propiedades activas: el selector necesita la lista completa.
  // El detalle sigue siendo de una sola a la vez — cuál, lo dice ?prop=.
  const { data: propertiesRaw } = await supabase
    .from('properties')
    .select('id, alias, property_type, unit_number, address, region, comuna, rol_sii, contribuciones_status, aseo_billing, mortgage_amount, mortgage_due_day, mortgage_account_label, mortgage_principal, mortgage_rate, mortgage_grace_months, mortgage_total_installments, mortgage_signed_date, mortgage_end_date, electricity_client_id, water_client_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  const properties = (propertiesRaw ?? []) as Property[]

  // Un ?prop= que ya no existe (propiedad borrada, link viejo) cae a la
  // primera en vez de romper la página.
  const property =
    properties.find(p => p.id === params.prop) ?? properties[0] ?? null

  const { data: chargesRaw } = property
    ? await supabase
        .from('property_charges')
        .select('id, property_id, kind, direction, due_date, amount, penalty, inflation_adj, arrears_estimated, paid_date, paid_amount, auto_debit, confirmed, responsible, external_ref, notes, period_month, period_year, document_path')
        .eq('user_id', user.id)
        .eq('property_id', property.id)
        .order('due_date', { ascending: false })
    : { data: [] }

  const charges = (chargesRaw ?? []) as Charge[]

  // Contrato + IPC en paralelo. La serie de IPC alimenta el aviso de reajuste;
  // si mindicador.cl falla queda null y la tarjeta simplemente no muestra el
  // monto sugerido — nunca rompe la página.
  const [leaseRes, ipcSeries] = property
    ? await Promise.all([
        supabase.from('lease_contracts')
          .select('id, tenant_name, tenant_email, tenant_phone, start_date, end_date, notice_days, rent_amount, rent_due_day, late_fee_per_day, termination_days, adjustment_kind, adjustment_months, last_adjustment_date, deposit_amount, notes')
          .eq('user_id', user.id).eq('property_id', property.id).eq('is_active', true).maybeSingle(),
        fetchClIpcSeries(supabase),
      ])
    : [{ data: null }, null]

  const lease = (leaseRes.data ?? null) as Lease | null

  // El H1 es la dirección de la propiedad que estás mirando, no el nombre del
  // módulo: con varias propiedades "Propiedad" no dice cuál. La bajada carga
  // el resto del contexto (unidad, comuna, arrendatario) para que el hero no
  // tenga que repetirlo.
  const title = property
    ? (property.address || property.alias)
    : 'Propiedad'

  const subtitleBits = property
    ? [
        property.property_type === 'departamento' && property.unit_number
          ? `Depto ${property.unit_number}`
          : property.property_type === 'casa' ? 'Casa' : null,
        property.comuna,
        lease?.tenant_name,
      ].filter(Boolean)
    : []

  const subtitle = property
    ? (subtitleBits.length > 0 ? subtitleBits.join(' · ') : 'Sin datos todavía')
    : 'El chequeo del departamento en arriendo. No se mezcla con tus gastos.'

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl lg:text-3xl font-extrabold leading-tight truncate"
                style={{ color: 'var(--ink)' }}>
              {title}
            </h1>
            {/* Mint porque es confirmación, no alerta (UX5): que esté arrendada
                es el estado bueno. Sin contrato el chip es gris, no coral —
                una propiedad vacía no es una urgencia de hoy. */}
            {property && (
              <span
                className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full flex-shrink-0"
                style={lease
                  ? { color: 'var(--mint)', background: 'color-mix(in srgb, var(--mint) 14%, var(--surface))' }
                  : { color: 'var(--ink-3)', background: 'var(--surface-2)' }}
              >
                {lease ? 'Arrendada' : 'Sin contrato'}
              </span>
            )}
          </div>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>
            {subtitle}
          </p>
        </div>
        {property && (
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            <PropertySwitcher
              properties={properties}
              activeId={property.id}
              view={view}
            />
            <PropiedadToggle active={view} propId={property.id} />
          </div>
        )}
      </div>

      <PropertyManager property={property} charges={charges} lease={lease}
                       ipcSeries={ipcSeries} today={today} view={view}
                       openNew={params.nueva === '1'} />
    </div>
  )
}
