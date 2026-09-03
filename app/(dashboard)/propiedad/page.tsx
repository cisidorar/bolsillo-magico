import { createClient, getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getNowChile } from '@/lib/utils'
import PropiedadToggle, { type PropiedadView } from '@/components/PropiedadToggle'
import PropertyManager, { type Property, type Charge } from '@/components/PropertyManager'

export const dynamic = 'force-dynamic'

// ── P1 (PLAN_PROPIEDAD, sep 2026) ───────────────────────────────────────────
// Mundo aparte por decisión D1: esta página no lee ni escribe expenses,
// incomes, budgets ni nada del resto de la app. Se puede borrar entera sin
// afectar ninguna otra vista.

export default async function PropiedadPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const [user, supabase, params] = await Promise.all([
    getServerSession(), createClient(), searchParams,
  ])
  if (!user) redirect('/login')

  const view: PropiedadView = params.view === 'cobros' ? 'cobros' : 'estado'

  // Fecha de Santiago, no del servidor: un vencimiento "de hoy" tiene que
  // seguir siendo de hoy aunque Vercel corra en UTC.
  const today = getNowChile().dateStr

  // Una sola propiedad por ahora. Cuando aparezca una segunda, esta ruta pasa
  // a ser índice y el detalle vive en /propiedad/[id] — el esquema ya lo
  // soporta, no hay que rehacer nada.
  const { data: properties } = await supabase
    .from('properties')
    .select('id, alias, property_type, unit_number, address, region, comuna, rol_sii, mortgage_amount, mortgage_due_day, mortgage_account_label, electricity_client_id, water_client_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)

  const property = (properties?.[0] ?? null) as Property | null

  const { data: chargesRaw } = property
    ? await supabase
        .from('property_charges')
        .select('id, property_id, kind, direction, due_date, amount, penalty, inflation_adj, arrears_estimated, paid_date, paid_amount, auto_debit, confirmed, responsible, external_ref, notes, period_month, period_year')
        .eq('user_id', user.id)
        .eq('property_id', property.id)
        .order('due_date', { ascending: false })
    : { data: [] }

  const charges = (chargesRaw ?? []) as Charge[]

  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl lg:text-3xl font-extrabold" style={{ color: 'var(--ink)' }}>
          Propiedad
        </h1>
        {property && (
          <div className="ml-auto">
            <PropiedadToggle active={view} />
          </div>
        )}
      </div>
      <p className="text-sm mb-6" style={{ color: 'var(--ink-3)' }}>
        El chequeo del departamento en arriendo. No se mezcla con tus gastos.
      </p>

      <PropertyManager property={property} charges={charges} today={today} view={view} />
    </div>
  )
}
