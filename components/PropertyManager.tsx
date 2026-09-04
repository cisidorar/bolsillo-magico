'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, Plus, Check, Clock, CalendarDays, Trash2,
  Pencil, X, CircleCheck, Undo2, Sparkles, Info, Upload, FileText,
} from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { useBackdropClose } from '@/components/useBackdropClose'
import {
  chargeStatus, chargeTotal, chargeOutstanding, propertyHealth, mortgageProgress,
  daysBetween, KIND_LABEL, type ChargeStatus,
} from '@/lib/property-charges'
import { propertySummary, monthBills, pendingIncome, overdueOwnerBills } from '@/lib/property-summary'
import {
  saveProperty, deleteProperty, saveCharge, markChargePaid,
  unmarkChargePaid, confirmCharge, deleteCharge, generateAseoCharges,
  saveLease, deleteLease, generateLeaseCharges, getPropertyDocUrl,
  extractAseoReceiptDraft,
} from '@/app/actions/property'
import type { ParsedAseoReceipt } from '@/lib/aseo-receipt-parser'
import {
  nextAdjustmentDate, computeAdjustedRent, noticeDeadline, type LeaseLike,
} from '@/lib/lease'
import type { IpcObservation } from '@/lib/cl-indicators'
import UtilityBillUploader from '@/components/UtilityBillUploader'
import { suggestUtilities } from '@/lib/cl-utilities'

export interface Property {
  id: string
  alias: string
  property_type: 'departamento' | 'casa' | 'otro' | null
  unit_number: string | null
  address: string | null
  region: string | null
  comuna: string | null
  rol_sii: string | null
  contribuciones_status: 'afecto' | 'exento' | null
  aseo_billing: 'included' | 'separate' | 'exempt' | null
  mortgage_amount: number | null
  mortgage_due_day: number | null
  mortgage_account_label: string | null
  mortgage_principal: number | null
  mortgage_rate: number | null
  mortgage_grace_months: number | null
  mortgage_total_installments: number | null
  mortgage_signed_date: string | null
  mortgage_end_date: string | null
  electricity_client_id: string | null
  water_client_id: string | null
}

// ── Datos de Chile ───────────────────────────────────────────────────────────

const BANCOS_CHILE = [
  'BancoEstado',
  'Banco de Chile',
  'Santander',
  'BCI',
  'Scotiabank',
  'Itaú',
  'BICE',
  'Security',
  'Banco Falabella',
  'Banco Ripley',
  'Consorcio',
  'Banco Internacional',
  'BTG Pactual',
  'Coopeuch',
  'HSBC',
  'Citibank',
  'JP Morgan',
  'Rabobank',
]

// Regiones y comunas de Chile
const REGIONES_COMUNAS: Record<string, string[]> = {
  'Arica y Parinacota': ['Arica','Camarones','Putre','General Lagos'],
  'Tarapacá': ['Iquique','Alto Hospicio','Pozo Almonte','Camiña','Colchane','Huara','Pica'],
  'Antofagasta': ['Antofagasta','Mejillones','Sierra Gorda','Taltal','Calama','Ollagüe','San Pedro de Atacama','Tocopilla','María Elena'],
  'Atacama': ['Copiapó','Caldera','Tierra Amarilla','Chañaral','Diego de Almagro','Vallenar','Alto del Carmen','Freirina','Huasco'],
  'Coquimbo': ['La Serena','Coquimbo','Andacollo','La Higuera','Paihuano','Vicuña','Illapel','Canela','Los Vilos','Salamanca','Ovalle','Combarbalá','Monte Patria','Punitaqui','Río Hurtado'],
  'Valparaíso': ['Valparaíso','Casablanca','Concón','Juan Fernández','Puchuncaví','Quintero','Viña del Mar','Isla de Pascua','Los Andes','Calle Larga','Rinconada','San Esteban','La Ligua','Cabildo','Papudo','Petorca','Zapallar','Quillota','Calera','Hijuelas','La Cruz','Nogales','San Antonio','Algarrobo','Cartagena','El Quisco','El Tabo','Santo Domingo','San Felipe','Catemu','Llaillay','Panquehue','Putaendo','Santa María','Quilpué','Limache','Olmué','Villa Alemana'],
  'Metropolitana': ['Cerrillos','Cerro Navia','Conchalí','El Bosque','Estación Central','Huechuraba','Independencia','La Cisterna','La Florida','La Granja','La Pintana','La Reina','Las Condes','Lo Barnechea','Lo Espejo','Lo Prado','Macul','Maipú','Miraflores','Ñuñoa','Pedro Aguirre Cerda','Peñalolén','Providencia','Pudahuel','Quilicura','Quinta Normal','Recoleta','Renca','San Joaquín','San Miguel','San Ramón','Santiago','Vitacura','Puente Alto','Pirque','San José de Maipo','Colina','Lampa','Tiltil','San Bernardo','Buin','Calera de Tango','Paine','Melipilla','Alhué','Curacaví','María Pinto','San Pedro','Talagante','El Monte','Isla de Maipo','Padre Hurtado','Peñaflor'],
  "O'Higgins": ['Rancagua','Codegua','Coinco','Coltauco','Doñihue','Graneros','Las Cabras','Machalí','Malloa','Mostazal','Olivar','Peumo','Pichidegua','Quinta de Tilcoco','Rengo','Requínoa','San Vicente','Pichilemu','La Estrella','Litueche','Marchigüe','Navidad','Paredones','San Fernando','Chépica','Chimbarongo','Lolol','Nancagua','Palmilla','Peralillo','Placilla','Pumanque','Santa Cruz'],
  'Maule': ['Talca','Constitución','Curepto','Empedrado','Maule','Pelarco','Pencahue','Río Claro','San Clemente','San Rafael','Cauquenes','Chanco','Pelluhue','Curicó','Hualañé','Licantén','Molina','Rauco','Romeral','Sagrada Familia','Teno','Vichuquén','Linares','Colbún','Longaví','Parral','Retiro','San Javier','Villa Alegre','Yerbas Buenas'],
  'Ñuble': ['Chillán','Bulnes','Cobquecura','Coelemu','Coihueco','Chillán Viejo','El Carmen','Ninhue','Ñiquén','Pemuco','Pinto','Portezuelo','Quillón','Quirihue','Ránquil','San Carlos','San Fabián','San Ignacio','San Nicolás','Treguaco','Yungay'],
  'Biobío': ['Concepción','Coronel','Chiguayante','Florida','Hualqui','Lota','Penco','San Pedro de la Paz','Santa Juana','Talcahuano','Tomé','Hualpén','Lebu','Arauco','Cañete','Contulmo','Curanilahue','Los Álamos','Tirúa','Los Ángeles','Antuco','Cabrero','Laja','Mulchén','Nacimiento','Negrete','Quilaco','Quilleco','San Rosendo','Santa Bárbara','Tucapel','Yumbel','Alto Biobío'],
  'La Araucanía': ['Temuco','Carahue','Cunco','Curarrehue','Freire','Galvarino','Gorbea','Lautaro','Loncoche','Melipeuco','Nueva Imperial','Padre las Casas','Perquenco','Pitrufquén','Pucón','Saavedra','Teodoro Schmidt','Toltén','Vilcún','Villarrica','Cholchol','Angol','Collipulli','Curacautín','Ercilla','Lonquimay','Los Sauces','Lumaco','Purén','Renaico','Traiguén','Victoria'],
  'Los Ríos': ['Valdivia','Corral','Futrono','La Unión','Lago Ranco','Lanco','Los Lagos','Máfil','Mariquina','Paillaco','Panguipulli','Río Bueno'],
  'Los Lagos': ['Puerto Montt','Calbuco','Cochamó','Fresia','Frutillar','Los Muermos','Llanquihue','Maullín','Puerto Varas','Castro','Ancud','Chonchi','Curaco de Vélez','Dalcahue','Puqueldón','Queilén','Quellón','Quemchi','Quinchao','Osorno','Puerto Octay','Purranque','Puyehue','Río Negro','San Juan de la Costa','San Pablo','Chaitén','Futaleufú','Hualaihué','Palena'],
  'Aysén': ['Coyhaique','Lago Verde','Aysén','Cisnes','Guaitecas','Cochrane','O\'Higgins','Tortel','Chile Chico','Río Ibáñez'],
  'Magallanes': ['Punta Arenas','Laguna Blanca','Río Verde','San Gregorio','Cabo de Hornos','Antártica','Porvenir','Primavera','Timaukel','Natales','Torres del Paine'],
}

export interface Charge {
  id: string
  property_id: string
  kind: string
  direction: 'in' | 'out'
  due_date: string
  amount: number
  penalty: number
  inflation_adj: number
  arrears_estimated: boolean
  paid_date: string | null
  paid_amount: number | null
  auto_debit: boolean
  confirmed: boolean
  responsible: 'owner' | 'tenant'
  external_ref: string | null
  notes: string | null
  period_month: number | null
  period_year: number | null
  document_path: string | null
}

export interface Lease {
  id: string
  tenant_name: string
  tenant_email: string | null
  tenant_phone: string | null
  start_date: string
  end_date: string | null
  notice_days: number
  rent_amount: number
  rent_due_day: number
  late_fee_per_day: number | null
  termination_days: number | null
  adjustment_kind: 'ipc' | 'uf' | 'none'
  adjustment_months: number | null
  last_adjustment_date: string | null
  deposit_amount: number | null
  notes: string | null
}

interface Props {
  property: Property | null
  charges: Charge[]
  lease: Lease | null
  ipcSeries: IpcObservation[] | null
  today: string
  view: 'estado' | 'cobros'
  /** ?nueva=1 — el switcher pide abrir el formulario de propiedad en blanco. */
  openNew?: boolean
}

const STATUS_STYLE: Record<ChargeStatus, { label: string; color: string; bg: string }> = {
  // Tokens del tema, no hex: en dark el fondo se mezcla con --surface y el
  // texto sigue legible. Un hex claro fijo dejaba el texto invisible en dark.
  paid:     { label: 'Pagado',    color: 'var(--mint)',  bg: 'color-mix(in srgb, var(--mint) 14%, var(--surface))' },
  partial:  { label: 'Parcial',   color: 'var(--gold)',  bg: 'color-mix(in srgb, var(--gold) 14%, var(--surface))' },
  overdue:  { label: 'Vencido',   color: 'var(--coral)', bg: 'color-mix(in srgb, var(--coral) 14%, var(--surface))' },
  due_soon: { label: 'Por vencer',color: 'var(--gold)',  bg: 'color-mix(in srgb, var(--gold) 14%, var(--surface))' },
  pending:  { label: 'Pendiente', color: 'var(--ink-3)', bg: 'var(--surface-2)' },
}

const KIND_OPTIONS = [
  { value: 'aseo',           direction: 'out', responsible: 'owner'  },
  { value: 'contribuciones', direction: 'out', responsible: 'owner'  },
  { value: 'mortgage',       direction: 'out', responsible: 'owner'  },
  { value: 'rent',           direction: 'in',  responsible: 'owner'  },
  { value: 'electricity',    direction: 'out', responsible: 'tenant' },
  { value: 'water',          direction: 'out', responsible: 'tenant' },
  { value: 'gas',            direction: 'out', responsible: 'tenant' },
  { value: 'gastos_comunes', direction: 'out', responsible: 'tenant' },
  { value: 'repair',         direction: 'out', responsible: 'owner'  },
  { value: 'deposit',        direction: 'in',  responsible: 'owner'  },
  { value: 'other',          direction: 'out', responsible: 'owner'  },
] as const

const MONTH_NAMES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
]

/** Iniciales para el avatar del arrendatario: "Bruno Adrián Soto" → "BS". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  // Nombre + primer apellido, saltándose el segundo nombre: en Chile el
  // apellido es el que identifica, y "BA" de "Bruno Adrián" no dice nada.
  const first = parts[0][0]
  const last  = parts.length > 2 ? parts[2][0] : parts.length > 1 ? parts[1][0] : ''
  return (first + last).toUpperCase()
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function relativeDue(dueDate: string, today: string): string {
  const days = daysBetween(today, dueDate)
  if (days === 0)  return 'vence hoy'
  if (days === 1)  return 'vence mañana'
  if (days > 1)    return `en ${days} días`
  if (days === -1) return 'venció ayer'
  return `hace ${Math.abs(days)} días`
}

export default function PropertyManager({ property, charges, lease, ipcSeries, today, view, openNew }: Props) {
  const router = useRouter()
  // `propForm` guarda a quién edita: 'new' es una propiedad nueva, un objeto
  // Property es edición. Antes era boolean y no podía distinguir los dos casos
  // — con varias propiedades, "agregar" habría abierto el form de la actual.
  const [propForm, setPropForm]   = useState<Property | 'new' | null>(openNew ? 'new' : null)
  const [chargeForm, setChargeForm] = useState<Charge | 'new' | null>(null)
  const [aseoForm, setAseoForm]   = useState(false)
  const [leaseForm, setLeaseForm] = useState(false)
  const [billUploader, setBillUploader] = useState(false)
  const [divForm, setDivForm]     = useState(false)
  const [utilsForm, setUtilsForm] = useState(false)
  const [payFor, setPayFor]       = useState<Charge | null>(null)
  // Marcar-todo-pagado de "Vencidas": abre un modal en vez de marcar directo,
  // para poder adjuntar los comprobantes (se emparejan solos por N° de giro).
  const [bulkPayFor, setBulkPayFor] = useState<Charge[] | null>(null)
  // La fila en Cobros ya no expone pagar/editar/eliminar como íconos — se
  // abre este detalle (misma lógica que la billetera USD) y de ahí salen.
  const [detailCharge, setDetailCharge] = useState<Charge | null>(null)
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const health = useMemo(() => propertyHealth(charges, today), [charges, today])

  const propBackdrop   = useBackdropClose(() => closePropForm())
  const chargeBackdrop = useBackdropClose(() => setChargeForm(null))
  const aseoBackdrop   = useBackdropClose(() => setAseoForm(false))
  const leaseBackdrop  = useBackdropClose(() => setLeaseForm(false))
  const divBackdrop    = useBackdropClose(() => setDivForm(false))
  const utilsBackdrop  = useBackdropClose(() => setUtilsForm(false))
  const payBackdrop    = useBackdropClose(() => setPayFor(null))
  const bulkPayBackdrop = useBackdropClose(() => setBulkPayFor(null))
  const detailBackdrop = useBackdropClose(() => setDetailCharge(null))

  // Cerrar el form limpia ?nueva=1 de la URL. Sin esto, el router.refresh()
  // que dispara cualquier guardado volvería a montar el manager con openNew
  // en true y el modal reaparecería solo.
  function closePropForm() {
    setPropForm(null)
    if (openNew) router.replace(property ? `/propiedad?prop=${property.id}` : '/propiedad')
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setError(null)
    const res = await fn()
    setBusy(false)
    if (!res.ok) { setError(res.error ?? 'Algo salió mal'); return false }
    router.refresh()
    return true
  }

  /**
   * Guardado de la propiedad. No pasa por `run()` porque necesita el id que
   * devuelve el insert: al crear una propiedad nueva hay que saltar a ella.
   * Quedarse en la anterior sería raro — acabas de decir que existe una
   * segunda y la app te seguiría mostrando la primera, con el agregado de que
   * lo siguiente que quieres hacer (dividendo, contrato, cuentas) es sobre la
   * recién creada.
   */
  async function handlePropertySave(input: Parameters<typeof saveProperty>[0]) {
    const isNew = propForm === 'new'
    const editingId = propForm && propForm !== 'new' ? propForm.id : undefined

    setBusy(true); setError(null)
    const res = await saveProperty(input, editingId)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }

    setPropForm(null)
    if (isNew && res.id) {
      // La navegación ya refetchea el server component; no hace falta refresh.
      router.replace(`/propiedad?prop=${res.id}`)
      return
    }
    if (openNew) router.replace(property ? `/propiedad?prop=${property.id}` : '/propiedad')
    router.refresh()
  }

  // ── Sin propiedad todavía ─────────────────────────────────────────────────
  if (!property) {
    return (
      <>
        <div className="card p-8 text-center">
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--gold) 14%, var(--surface))' }}
          >
            <Building2 className="w-7 h-7" style={{ color: '#D97706' }} />
          </div>
          <h2 className="text-base font-bold mb-1.5" style={{ color: 'var(--ink)' }}>
            Aún no has agregado tu propiedad
          </h2>
          <p className="text-sm mb-5 max-w-sm mx-auto" style={{ color: 'var(--ink-3)' }}>
            Acá vas a llevar el chequeo del departamento: arriendo, dividendo,
            cuentas y derechos de aseo. No se mezcla con tus gastos personales.
          </p>
          <button
            onClick={() => setPropForm('new')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold active:scale-[.98] transition-transform"
            style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Agregar propiedad
          </button>
        </div>
        {propForm && (
          <PropertyForm
            property={null} busy={busy} error={error} backdrop={propBackdrop}
            onCancel={closePropForm}
            onSave={handlePropertySave}
          />
        )}
      </>
    )
  }

  const ownerCharges  = charges.filter(c => c.responsible === 'owner')
  const tenantCharges = charges.filter(c => c.responsible === 'tenant')

  // Consumos anteriores por servicio, más reciente primero — alimentan la
  // detección de saltos del uploader. Se leen de las notas del cobro porque
  // el consumo no es un campo de property_charges: es dato de la boleta, no
  // de la obligación.
  const priorConsumption = useMemo(() => {
    const pick = (k: string) => charges
      .filter(c => c.kind === k && c.notes)
      .map(c => Number(c.notes!.match(/consumo[:\s]*(\d+)/i)?.[1] ?? 0))
      .filter(n => n > 0)
      .slice(0, 6)
    return { electricity: pick('electricity'), water: pick('water') }
  }, [charges])

  // ── Derivados de la banda de stats y las listas ───────────────────────────
  const summary = useMemo(
    () => propertySummary(charges, today, lease?.rent_amount ?? null, property.mortgage_amount),
    [charges, today, lease, property.mortgage_amount],
  )
  const pending = useMemo(() => pendingIncome(charges, today), [charges, today])
  const overdueBills = useMemo(() => overdueOwnerBills(charges, today), [charges, today])
  // "Cuentas del mes" ya no repite lo que vive en "Vencidas": una cuenta
  // vencida es siempre del mes en que venció, así que sin este filtro
  // aparecería duplicada en las dos tarjetas apenas se atrasa.
  const bills = useMemo(
    () => monthBills(charges, today).filter(c => !overdueBills.includes(c)),
    [charges, today, overdueBills],
  )
  // El arriendo pendiente ya tiene su propia tarjeta de acción en "Cobros
  // pendientes" (pending, por dirección) — ahora que el arriendo también es
  // responsible='tenant', sin este filtro aparecería repetido en "Del
  // arrendatario" (mismo criterio que bills arriba con Vencidas).
  const tenantCardCharges = useMemo(
    () => tenantCharges.filter(c => !pending.includes(c)),
    [tenantCharges, pending],
  )

  const pendingOverdue = pending.filter(c => chargeStatus(c, today) === 'overdue')
  const pendingSoon    = pending.filter(c => chargeStatus(c, today) === 'due_soon')
  const pendingCaption = [
    pendingOverdue.length > 0 ? `${pendingOverdue.length} ${pendingOverdue.length === 1 ? 'vencido' : 'vencidos'}` : null,
    pendingSoon.length    > 0 ? `${pendingSoon.length} por vencer` : null,
  ].filter(Boolean).join(' · ') || `${pending.length} pendiente${pending.length === 1 ? '' : 's'}`

  const overdueBillsTotal = overdueBills.reduce((s, c) => s + chargeOutstanding(c), 0)

  const billsTotal   = bills.reduce((s, c) => s + chargeTotal(c), 0)
  const billsUnpaid  = bills.filter(c => chargeStatus(c, today) !== 'paid').length
  const billsCaption = billsUnpaid > 0 ? `${billsUnpaid} por pagar` : 'todo pagado'
  const monthLabel   = new Date(today + 'T12:00:00')
    .toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })

  // El dividendo del mes ya cargado manda sobre el dato del contrato: si está
  // pagado, eso es lo que quieres ver, no una promesa de "día 1 c/mes".
  const mortgageThisMonth = bills.find(c => c.kind === 'mortgage')
  const mortgageCaption = !property.mortgage_amount
    ? 'Sin dividendo cargado'
    : mortgageThisMonth?.paid_date
      ? `pagado · ${fmtDate(mortgageThisMonth.paid_date)}`
      : property.mortgage_due_day
        ? `vence el día ${property.mortgage_due_day} de cada mes`
        : 'sin día de cargo'

  /** Marca cobrado todo lo vencido de una, con la fecha de hoy y su total. */
  async function markAllPending() {
    setBusy(true); setError(null)
    for (const c of pendingOverdue) {
      const res = await markChargePaid(c.id, today, chargeTotal(c))
      if (!res.ok) { setError(res.error); setBusy(false); return }
    }
    setBusy(false)
    router.refresh()
  }

  return (
    <>
      {view === 'estado' ? (
        <div className="space-y-5">
          {/* ── Banda de stats ───────────────────────────────────────────
              Reemplaza al hero semáforo. El semáforo respondía "¿está todo
              al día?" con un sí/no; estas cuatro tarjetas responden además
              "¿cuánto?", que es lo que efectivamente haces con la respuesta.
              El estado no se pierde: vive en el color de "Por cobrar". */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <StatCard
              label="Por cobrar"
              value={formatCLP(summary.toReceive)}
              caption={summary.toReceiveCount > 0
                ? `${summary.toReceiveCount} ${summary.toReceiveCount === 1 ? 'arriendo vencido' : 'arriendos vencidos'}`
                : 'Nada pendiente de cobro'}
              tone={summary.toReceive > 0 ? 'var(--coral)' : 'var(--mint)'}
              accent
            />
            <StatCard
              label="Arriendo mensual"
              value={lease ? formatCLP(lease.rent_amount) : '—'}
              caption={lease ? `vence el día ${lease.rent_due_day} de cada mes` : 'Sin contrato cargado'}
            />
            <StatCard
              label="Dividendo"
              value={property.mortgage_amount ? formatCLP(property.mortgage_amount) : '—'}
              caption={mortgageCaption}
            />
            <StatCard
              label="Margen del mes"
              value={summary.margin != null
                ? `${summary.margin >= 0 ? '+' : '−'}${formatCLP(Math.abs(summary.margin))}`
                : '—'}
              caption={summary.margin != null
                ? 'arriendo − dividendo − cuentas'
                : 'Falta el arriendo o el dividendo'}
              tone={summary.margin == null ? undefined
                  : summary.margin >= 0 ? 'var(--mint)' : 'var(--coral)'}
            />
          </div>

          <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-5 lg:space-y-0">
            {/* Columna izquierda: lo que se mueve mes a mes */}
            <div className="space-y-5">

              {/* Vencidas — sin importar de qué mes son. "Cuentas del mes"
                  solo mira el mes en curso, así que una cuenta de un
                  trimestre atrás que nadie pagó quedaba invisible apenas
                  cambiaba el mes. Coral porque es la única urgencia real de
                  "algo que tú debes" (UX5: por cobrar ya tiene su propio
                  coral en la banda de stats, así que esta es la otra mitad). */}
              {overdueBills.length > 0 && (
                <div className="card p-4" style={{ borderColor: 'color-mix(in srgb, var(--coral) 35%, var(--border))' }}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Vencidas</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--coral)' }}>
                        {overdueBills.length} {overdueBills.length === 1 ? 'cuenta' : 'cuentas'} · {formatCLP(overdueBillsTotal)}
                      </p>
                    </div>
                    {overdueBills.length > 1 && (
                      <button
                        onClick={() => setBulkPayFor(overdueBills)}
                        disabled={busy}
                        className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border disabled:opacity-50"
                        style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                      >
                        Marcar todo pagado
                      </button>
                    )}
                  </div>
                  <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {overdueBills.map(c => (
                      <ChargeRowCompact
                        key={c.id} charge={c} today={today}
                        subtitle={billSubtitle(c) ?? `venció ${fmtDate(c.due_date)} · ${relativeDue(c.due_date, today)}`}
                        actionLabel="Pagué" onAction={() => setPayFor(c)}
                        onEdit={() => setChargeForm(c)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Cobros pendientes — una sola lista en vez de tres bloques de
                  alerta apilados. La severidad de cada fila la lleva su punto
                  de color, así que no hace falta un banner coral por grupo
                  (UX5: máximo uno por pantalla, y acá el coral vive en la
                  tarjeta "Por cobrar"). */}
              {pending.length > 0 && (
                <div className="card p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Cobros pendientes</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                        {pendingCaption}
                      </p>
                    </div>
                    {pendingOverdue.length > 1 && (
                      <button
                        onClick={() => markAllPending()}
                        disabled={busy}
                        className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border disabled:opacity-50"
                        style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                      >
                        Marcar todo cobrado
                      </button>
                    )}
                  </div>
                  <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {pending.map(c => (
                      <ChargeRowCompact
                        key={c.id} charge={c} today={today}
                        actionLabel="Cobré" onAction={() => setPayFor(c)}
                        onEdit={() => setChargeForm(c)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Cuentas del mes */}
              {bills.length > 0 && (
                <div className="card p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Cuentas del mes</p>
                      <p className="text-xs mt-0.5 capitalize" style={{ color: 'var(--ink-3)' }}>
                        {monthLabel} · {billsCaption}
                      </p>
                    </div>
                    <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>
                      {formatCLP(billsTotal)}
                    </p>
                  </div>
                  <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {bills.map(c => (
                      <ChargeRowCompact
                        key={c.id} charge={c} today={today}
                        subtitle={billSubtitle(c)}
                        actionLabel="Pagué" onAction={() => setPayFor(c)}
                        onEdit={() => setChargeForm(c)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Cuentas del arrendatario: incluye el arriendo (te lo paga él,
                  es tu ingreso) y las cuentas que por contrato paga él
                  (no son costo tuyo). Su mora en cualquiera de las dos es
                  causal de término, así que tampoco se pueden esconder. */}
              {tenantCardCharges.length > 0 && (
                <div className="card p-4">
                  <div className="mb-3">
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Del arrendatario</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                      Lo que paga él — tu arriendo y las cuentas por contrato. Se vigilan por la mora.
                    </p>
                  </div>
                  <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {tenantCardCharges.slice(0, 5).map(c => (
                      <ChargeRowCompact key={c.id} charge={c} today={today}
                                        subtitle={billSubtitle(c)}
                                        actionLabel={c.direction === 'in' ? 'Cobré' : 'Pagó'}
                                        onAction={() => setPayFor(c)}
                                        onEdit={() => setChargeForm(c)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Cargos automáticos que nadie revisó en la cartola */}
              {health.unconfirmed.length > 0 && (
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                      Sin confirmar en la cartola
                    </p>
                  </div>
                  <div className="space-y-2">
                    {(health.unconfirmed as Charge[]).map(c => (
                      <div key={c.id} className="flex items-center justify-between gap-3">
                        <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
                          {KIND_LABEL[c.kind] ?? c.kind} · {fmtDate(c.due_date)} · {formatCLP(chargeTotal(c))}
                        </span>
                        <button
                          onClick={() => run(() => confirmCharge(c.id))}
                          disabled={busy}
                          className="text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0 disabled:opacity-50"
                          style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
                        >
                          Confirmar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Nada que mostrar arriba: confirmación explícita, no una
                  columna vacía que parezca un error de carga. */}
              {overdueBills.length === 0 && pending.length === 0 && bills.length === 0 && tenantCharges.length === 0 && (
                <div className="card p-6 flex items-start gap-3">
                  <CircleCheck className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--mint)' }} />
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Todo al día</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                      {lease
                        ? 'Genera los meses del contrato para ver los arriendos acá.'
                        : 'Carga el contrato para empezar a seguir los arriendos.'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Columna derecha: lo que casi no cambia */}
            <div className="space-y-5">
              <LeaseCard
                lease={lease} ipcSeries={ipcSeries} today={today} busy={busy}
                onEdit={() => setLeaseForm(true)}
                onGenerate={() => run(() => generateLeaseCharges(property.id, today))}
              />
              {property.mortgage_principal && (
                <MortgageCard property={property} charges={charges}
                              onEdit={() => setDivForm(true)} />
              )}
              <PropertyCard property={property} onEdit={() => setPropForm(property)}
                            onAddMortgage={() => setDivForm(true)}
                            onAddUtilities={() => setUtilsForm(true)} />
            </div>
          </div>
        </div>
      ) : (
        // ── Cobros ────────────────────────────────────────────────────────
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setChargeForm('new')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold active:scale-[.98] transition-transform"
              style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} /> Agregar cobro
            </button>
            <button
              onClick={() => setBillUploader(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}
            >
              <Upload className="w-4 h-4" /> Subir boleta
            </button>
            {/* Solo si la municipalidad los cobra aparte: en una propiedad
                afecta el aseo viene dentro del giro de contribuciones y
                generarlo acá sería duplicar un cobro que ya existe. */}
            {property.aseo_billing === 'separate' && (
              <button
                onClick={() => setAseoForm(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}
              >
                <Sparkles className="w-4 h-4" /> Generar aseo del año
              </button>
            )}
          </div>

          <ChargeList
            title="Tuyos"
            charges={ownerCharges} today={today}
            onOpen={c => setDetailCharge(c)}
          />

          {tenantCharges.length > 0 && (
            <ChargeList
              title="Del arrendatario"
              subtitle="Lo que paga él: tu arriendo y las cuentas por contrato. Se listan para vigilar la mora."
              charges={tenantCharges} today={today}
              onOpen={c => setDetailCharge(c)}
            />
          )}
        </div>
      )}

      {error && (
        <p className="text-sm mt-4 px-1" style={{ color: 'var(--coral)' }}>{error}</p>
      )}

      {/* ── Modales ────────────────────────────────────────────────────── */}
      {propForm && (
        <PropertyForm
          property={propForm === 'new' ? null : propForm}
          busy={busy} error={error} backdrop={propBackdrop}
          onCancel={closePropForm}
          onSave={handlePropertySave}
          onDelete={propForm === 'new' ? undefined : async () => {
            if (await run(() => deleteProperty(propForm.id))) closePropForm()
          }}
        />
      )}

      {chargeForm && (
        <ChargeForm
          charge={chargeForm === 'new' ? null : chargeForm}
          propertyId={property.id} busy={busy} error={error} backdrop={chargeBackdrop}
          onCancel={() => setChargeForm(null)}
          onSave={async input => {
            const id = chargeForm === 'new' ? undefined : chargeForm.id
            if (await run(() => saveCharge(input, id))) setChargeForm(null)
          }}
        />
      )}

      {aseoForm && (
        <AseoForm
          propertyId={property.id} busy={busy} error={error} backdrop={aseoBackdrop}
          onCancel={() => setAseoForm(false)}
          onGenerate={async (year, base) => {
            const res = await generateAseoCharges(property.id, year, base)
            if (!res.ok) { setError(res.error); return }
            router.refresh(); setAseoForm(false)
          }}
        />
      )}

      {leaseForm && (
        <LeaseForm
          lease={lease} propertyId={property.id} busy={busy} error={error} backdrop={leaseBackdrop}
          onCancel={() => setLeaseForm(false)}
          onSave={async input => { if (await run(() => saveLease(input, lease?.id))) setLeaseForm(false) }}
          onDelete={lease ? async () => {
            if (await run(() => deleteLease(lease.id))) setLeaseForm(false)
          } : undefined}
        />
      )}

      {divForm && (
        <MortgageForm
          property={property} busy={busy} error={error} backdrop={divBackdrop}
          onCancel={() => setDivForm(false)}
          onSave={async input => { if (await run(() => saveProperty(input, property.id))) setDivForm(false) }}
        />
      )}

      {utilsForm && (
        <UtilityAccountsForm
          property={property} busy={busy} error={error} backdrop={utilsBackdrop}
          onCancel={() => setUtilsForm(false)}
          onSave={async input => { if (await run(() => saveProperty(input, property.id))) setUtilsForm(false) }}
        />
      )}

      {billUploader && (
        <UtilityBillUploader
          propertyId={property.id}
          priorConsumption={priorConsumption}
          onClose={() => setBillUploader(false)}
        />
      )}

      {payFor && (
        <PayForm
          charge={payFor} today={today} busy={busy} error={error} backdrop={payBackdrop}
          onCancel={() => setPayFor(null)}
          onPay={async (date, amount, receipt, externalRef, billBreakdown) => {
            let fd: FormData | null = null
            if (receipt) { fd = new FormData(); fd.append('file', receipt) }
            if (await run(() => markChargePaid(payFor.id, date, amount, {
              receiptForm: fd, externalRef, billBreakdown,
            }))) setPayFor(null)
          }}
        />
      )}

      {bulkPayFor && (
        <BulkPayModal
          charges={bulkPayFor} today={today} busy={busy} backdrop={bulkPayBackdrop}
          onClose={() => setBulkPayFor(null)}
          onConfirm={async matches => {
            setBusy(true); setError(null)
            for (const c of bulkPayFor) {
              const m = matches.get(c.id)
              let fd: FormData | null = null
              if (m) { fd = new FormData(); fd.append('file', m.file) }
              const bd = m && m.draft.subtotal != null && m.draft.ipc != null && m.draft.interes != null
                ? { amount: m.draft.subtotal, penalty: m.draft.interes, inflationAdj: m.draft.ipc }
                : null
              const res = await markChargePaid(
                c.id,
                m?.draft.paidDate ?? today,
                m?.draft.totalPagado ?? chargeTotal(c),
                { receiptForm: fd, externalRef: m?.draft.ingresoNumero ?? null, billBreakdown: bd },
              )
              if (!res.ok) { setError(res.error); setBusy(false); return }
            }
            setBusy(false)
            setBulkPayFor(null)
            router.refresh()
          }}
        />
      )}

      {detailCharge && !payFor && !chargeForm && (
        <ChargeDetailSheet
          charge={detailCharge} today={today} busy={busy} backdrop={detailBackdrop}
          onClose={() => setDetailCharge(null)}
          onEdit={() => { setChargeForm(detailCharge); setDetailCharge(null) }}
          onPay={() => { setPayFor(detailCharge); setDetailCharge(null) }}
          onUnpay={async () => {
            if (await run(() => unmarkChargePaid(detailCharge.id))) setDetailCharge(null)
          }}
          onDelete={async () => {
            if (await run(() => deleteCharge(detailCharge.id))) setDetailCharge(null)
          }}
        />
      )}
    </>
  )
}

// ── Bloque de alerta ────────────────────────────────────────────────────────

/**
 * Tarjeta de stat de la banda superior.
 *
 * `accent` agrega la barra lateral de color: se reserva para la tarjeta que
 * pide acción (Por cobrar). Si todas la tuvieran, ninguna destacaría.
 */
function StatCard({ label, value, caption, tone, accent }: {
  label: string
  value: string
  caption: string
  tone?: string
  accent?: boolean
}) {
  return (
    <div
      className="card p-4 lg:p-5 relative overflow-hidden"
      style={accent && tone ? { borderLeft: `4px solid ${tone}` } : undefined}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--ink-3)' }}>
        {label}
      </p>
      <p
        className="text-xl lg:text-2xl font-extrabold tabular-nums leading-none whitespace-nowrap"
        style={{ color: tone ?? 'var(--ink)', fontFamily: 'Fredoka, sans-serif' }}
      >
        {value}
      </p>
      <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-3)' }}>{caption}</p>
    </div>
  )
}

/** Subtítulo de una cuenta: el número de cliente o la unidad, si lo hay. */
function billSubtitle(c: Charge): string | undefined {
  return c.notes?.split('\n')[0] || undefined
}

/**
 * Fila compacta de cobro para las listas del Estado.
 *
 * El punto de color lleva la severidad y reemplaza al banner por grupo: con
 * una lista mixta (vencidos y por vencer juntos) agrupar por color obligaría
 * a partirla en dos tarjetas que dicen lo mismo.
 */
/**
 * Fila compacta con el total como protagonista, pero clickeable: tocarla
 * abre el mismo formulario de edición que "Agregar cobro", donde vive el
 * desglose completo (base, interés penal, reajuste IPC, N° de giro). Cuando
 * hay recargo, además se ve un renglón chico con el desglose sin necesidad
 * de tocar nada — la fila sola con un total mayor a la base no explicaba de
 * dónde salía la diferencia.
 */
function ChargeRowCompact({ charge, today, subtitle, actionLabel, onAction, onEdit }: {
  charge: Charge
  today: string
  subtitle?: string
  actionLabel?: string
  onAction?: () => void
  onEdit?: () => void
}) {
  const status  = chargeStatus(charge, today)
  const style   = STATUS_STYLE[status]
  const isPaid  = status === 'paid'
  const recargo = charge.penalty + charge.inflation_adj

  return (
    <div
      onClick={onEdit}
      className={`flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 -mx-1 px-1 rounded-lg ${onEdit ? 'cursor-pointer hover:brightness-125 transition-[filter]' : ''}`}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: isPaid ? 'var(--mint)' : style.color }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
          {KIND_LABEL[charge.kind] ?? charge.kind}
          {charge.period_month && charge.kind === 'rent'
            ? ` ${MONTH_NAMES[charge.period_month - 1]}` : ''}
        </p>
        <p className="text-xs truncate" style={{ color: 'var(--ink-3)' }}>
          {subtitle ?? `${fmtDate(charge.due_date)} · ${relativeDue(charge.due_date, today)}`}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold tabular-nums" style={{ color: isPaid ? 'var(--ink)' : style.color }}>
          {formatCLP(chargeTotal(charge))}
        </p>
        {recargo > 0 && (
          <p className="text-[10px] tabular-nums" style={{ color: 'var(--ink-3)' }}>
            {formatCLP(charge.amount)} + {formatCLP(recargo)} rec.
          </p>
        )}
        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: style.color }}>
          {style.label}
        </p>
      </div>
      {actionLabel && onAction && !isPaid && (
        <button
          onClick={e => { e.stopPropagation(); onAction() }}
          className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold"
          style={{ background: style.bg, color: style.color }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

// ── Lista de cobros ─────────────────────────────────────────────────────────

/**
 * Lista de la pestaña Cobros — misma lógica que la billetera USD: la fila
 * entera es un botón que abre un detalle (ChargeDetailSheet); las acciones
 * (pagar, editar, eliminar) viven ahí, no como íconos apretados en la fila.
 */
function ChargeList({ title, subtitle, charges, today, onOpen }: {
  title: string
  subtitle?: string
  charges: Charge[]
  today: string
  onOpen: (c: Charge) => void
}) {
  const sorted = [...charges].sort((a, b) => b.due_date.localeCompare(a.due_date))

  return (
    <div className="card overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{title}</h3>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{subtitle}</p>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="px-4 pb-5 text-sm" style={{ color: 'var(--ink-3)' }}>
          Nada registrado todavía.
        </p>
      ) : (
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {sorted.map(c => {
            const status = chargeStatus(c, today)
            const style  = STATUS_STYLE[status]
            return (
              <button
                key={c.id}
                onClick={() => onOpen(c)}
                className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)] transition-colors active:opacity-80"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                      {KIND_LABEL[c.kind] ?? c.kind}
                    </span>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                      style={{ background: style.bg, color: style.color }}
                    >
                      {style.label}
                    </span>
                    {c.arrears_estimated && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                            style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                        recargo estimado
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                    Vence {fmtDate(c.due_date)}
                    {c.external_ref && ` · N° ${c.external_ref}`}
                    {c.paid_date && ` · pagado ${fmtDate(c.paid_date)}`}
                  </p>
                  {(c.penalty > 0 || c.inflation_adj > 0) && (
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                      Base {formatCLP(c.amount)}
                      {c.penalty > 0 && ` + penal ${formatCLP(c.penalty)}`}
                      {c.inflation_adj > 0 && ` + IPC ${formatCLP(c.inflation_adj)}`}
                    </p>
                  )}
                </div>

                <p className="text-sm font-bold whitespace-nowrap flex-shrink-0"
                   style={{ color: c.direction === 'in' ? 'var(--mint)' : 'var(--ink)' }}>
                  {c.direction === 'in' ? '+' : ''}{formatCLP(chargeTotal(c))}
                </p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Detalle de un cobro — se abre al tocar una fila de ChargeList, misma
 * lógica que la billetera USD: la fila no carga íconos, el tap abre esto y
 * acá viven pagar/cobrar, editar y eliminar, más el desglose completo
 * (base, interés penal, IPC, N° de giro) que en la fila compacta no cabía.
 */
function ChargeDetailSheet({ charge, today, busy, backdrop, onClose, onEdit, onPay, onUnpay, onDelete }: {
  charge: Charge
  today: string
  busy: boolean
  backdrop: Backdrop
  onClose: () => void
  onEdit: () => void
  onPay: () => void
  onUnpay: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [openingDoc, setOpeningDoc] = useState(false)
  const status = chargeStatus(charge, today)
  const style  = STATUS_STYLE[status]
  const isPaid = status === 'paid'
  const isIncome = charge.direction === 'in'

  async function openDoc() {
    if (!charge.document_path || openingDoc) return
    setOpeningDoc(true)
    const url = await getPropertyDocUrl(charge.document_path)
    setOpeningDoc(false)
    if (url) window.open(url, '_blank')
  }

  return (
    <Modal title={KIND_LABEL[charge.kind] ?? charge.kind} backdrop={backdrop} onCancel={onClose}>
      <div className="flex items-center gap-2 mb-4">
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
          style={{ background: style.bg, color: style.color }}
        >
          {style.label}
        </span>
        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>Vence {fmtDate(charge.due_date)}</span>
      </div>

      <div className="rounded-2xl overflow-hidden divide-y mb-4" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
        <Fact label="Monto base" value={formatCLP(charge.amount)} />
        {charge.penalty > 0 && <Fact label="Interés penal" value={formatCLP(charge.penalty)} />}
        {charge.inflation_adj > 0 && <Fact label="Reajuste IPC" value={formatCLP(charge.inflation_adj)} />}
        <Fact label="Total" value={`${isIncome ? '+' : ''}${formatCLP(chargeTotal(charge))}`} bold
              color={isIncome ? 'var(--mint)' : undefined} />
        {charge.external_ref && <Fact label="N° de giro o boleta" value={charge.external_ref} />}
        {/* "responsible" dice de quién es la carga financiera (para saber si
            suma a tu deuda), no quién hace materialmente el pago — para un
            cobro de ingreso (arriendo) eso es siempre el arrendatario, sin
            importar que responsible='owner' (porque el ingreso es tuyo). */}
        <Fact
          label={isIncome ? 'Quién paga' : 'Quién lo paga'}
          value={isIncome ? 'El arrendatario' : (charge.responsible === 'tenant' ? 'El arrendatario' : 'Yo')}
        />
        {charge.paid_date && (
          <Fact label={isIncome ? 'Cobrado el' : 'Pagado el'} value={fmtDate(charge.paid_date)} />
        )}
      </div>

      {charge.notes && (
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-3)' }}>Nota</p>
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>{charge.notes}</p>
        </div>
      )}

      {charge.document_path && (
        <button
          onClick={openDoc}
          disabled={openingDoc}
          className="w-full flex items-center gap-2 p-3 rounded-2xl mb-4 disabled:opacity-60"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-semibold flex-1 text-left" style={{ color: 'var(--ink)' }}>
            {openingDoc ? 'Abriendo…' : 'Ver la boleta original'}
          </span>
        </button>
      )}

      {confirmDelete ? (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: 'color-mix(in srgb, var(--coral) 8%, var(--surface))', border: '1px solid color-mix(in srgb, var(--coral) 25%, transparent)' }}>
          <p className="text-sm text-center font-medium" style={{ color: 'var(--ink-2)' }}>
            ¿Eliminar este cobro?
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 py-3 text-sm font-semibold rounded-2xl border"
              style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              Cancelar
            </button>
            <button
              disabled={busy}
              onClick={onDelete}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold rounded-2xl disabled:opacity-60"
              style={{ background: 'var(--coral)', color: 'white' }}
            >
              <Trash2 className="w-3.5 h-3.5" /> Eliminar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-11 h-11 flex items-center justify-center rounded-2xl border flex-shrink-0"
            style={{ borderColor: 'var(--border)', color: 'var(--coral)', background: 'var(--surface-2)' }}
            aria-label="Eliminar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={onEdit}
            className="w-11 h-11 flex items-center justify-center rounded-2xl border flex-shrink-0"
            style={{ borderColor: 'var(--border)', color: 'var(--ink-2)', background: 'var(--surface-2)' }}
            aria-label="Editar"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={isPaid ? onUnpay : onPay}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold rounded-2xl disabled:opacity-60 active:scale-[.98] transition-transform"
            style={isPaid
              ? { color: 'var(--ink-2)', border: '1px solid var(--border)', background: 'var(--surface-2)' }
              : { background: 'var(--primary)', color: 'var(--primary-ink)' }}
          >
            {isPaid
              ? <><Undo2 className="w-3.5 h-3.5" /> Deshacer {isIncome ? 'cobro' : 'pago'}</>
              : <><Check className="w-4 h-4" strokeWidth={2.5} /> {isIncome ? 'Marcar cobrado' : 'Marcar pagado'}</>}
          </button>
        </div>
      )}
    </Modal>
  )
}

/** Fila label/valor de la caja de datos del detalle. */
function Fact({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>{label}</span>
      <span className={`text-sm tabular-nums ${bold ? 'font-bold' : 'font-semibold'}`} style={{ color: color ?? 'var(--ink)' }}>
        {value}
      </span>
    </div>
  )
}

// ── Ficha de la propiedad ───────────────────────────────────────────────────

// ── El contrato ─────────────────────────────────────────────────────────────

/**
 * Muestra el contrato y, sobre todo, las tres cosas que se pierden por olvido:
 * cuándo toca reajustar, cuándo hay que avisar si no se renueva, y si faltan
 * meses de arriendo por generar.
 */
function LeaseCard({ lease, ipcSeries, today, busy, onEdit, onGenerate }: {
  lease: Lease | null
  ipcSeries: IpcObservation[] | null
  today: string
  busy: boolean
  onEdit: () => void
  onGenerate: () => void
}) {
  if (!lease) {
    return (
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: 'var(--surface-2)' }}>
            <CalendarDays className="w-5 h-5" style={{ color: 'var(--ink-3)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold mb-0.5" style={{ color: 'var(--ink)' }}>Sin contrato registrado</p>
            <p className="text-xs mb-3" style={{ color: 'var(--ink-3)' }}>
              Con el contrato cargado se generan solos los arriendos de cada mes y te aviso del reajuste.
            </p>
            <button onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border"
              style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
              <Plus className="w-3.5 h-3.5" /> Agregar contrato
            </button>
          </div>
        </div>
      </div>
    )
  }

  const l = lease as unknown as LeaseLike
  const nextAdj = nextAdjustmentDate(l)
  const adjDays = nextAdj ? daysBetween(today, nextAdj) : null
  // El reajuste se avisa con 45 días: el IPC de noviembre se publica ~8 dic,
  // así que avisar el 1 de diciembre no serviría de nada — hay que tener el
  // dato antes de emitir el cobro del mes.
  const adjSoon = adjDays !== null && adjDays <= 45 && adjDays >= 0
  const adjusted = adjSoon && ipcSeries ? computeAdjustedRent(l, ipcSeries, nextAdj!) : null

  const notice = noticeDeadline(l)
  const noticeDays = notice ? daysBetween(today, notice) : null
  const noticeSoon = noticeDays !== null && noticeDays <= 30 && noticeDays >= 0

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>El contrato</h3>
        <button onClick={onEdit} className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--primary)' }}>
          Editar
        </button>
      </div>

      {/* El arrendatario con su avatar: es la persona, no un dato más de la
          lista de abajo. Bajarlo a una fila `dl` lo igualaba a "Multa por
          atraso", y es lo primero que buscas cuando abres esta tarjeta. */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
             style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
          {initials(lease.tenant_name)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{lease.tenant_name}</p>
          <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
            arrendatario desde {fmtDate(lease.start_date)}
          </p>
        </div>
      </div>

      <dl className="space-y-1.5 text-sm">
        <Row label="Arriendo" value={`${formatCLP(lease.rent_amount)} · día ${lease.rent_due_day}`} />
        {lease.late_fee_per_day && (
          <Row label="Multa por atraso" value={`${formatCLP(lease.late_fee_per_day)} por día`} />
        )}
        {nextAdj && (
          <Row label="Próximo reajuste" value={`${fmtDate(nextAdj)}${
            lease.adjustment_months ? ` · IPC ${lease.adjustment_months}m` : ''}`} />
        )}
      </dl>

      {/* Reajuste — gold, es accionable pero no urgente (UX5) */}
      {adjSoon && (
        <div className="mt-3 p-3 rounded-xl flex items-start gap-2"
             style={{ background: 'color-mix(in srgb, var(--gold) 12%, var(--surface))' }}>
          <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} />
          <div className="min-w-0">
            <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>
              Toca reajustar {adjDays === 0 ? 'hoy' : `en ${adjDays} ${adjDays === 1 ? 'día' : 'días'}`}
            </p>
            {adjusted && !adjusted.floored && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>
                Con el IPC del período la renta sube a {formatCLP(adjusted.newRent)}
                {' '}(+{formatCLP(adjusted.delta)}, {adjusted.pctApplied.toFixed(1)}%)
              </p>
            )}
            {adjusted?.floored && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>
                El IPC del período fue negativo — la renta se mantiene en {formatCLP(lease.rent_amount)}.
              </p>
            )}
            {!adjusted && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                El IPC del período todavía no se publica.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Aviso de no renovación */}
      {noticeSoon && (
        <div className="mt-2 p-3 rounded-xl flex items-start gap-2"
             style={{ background: 'color-mix(in srgb, var(--gold) 12%, var(--surface))' }}>
          <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} />
          <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
            Si no quieres renovar, el plazo para avisar vence el {fmtDate(notice!)}
            {' '}({noticeDays === 0 ? 'hoy' : `en ${noticeDays} días`}).
          </p>
        </div>
      )}

      <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <button onClick={onGenerate} disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border disabled:opacity-50"
          style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <Sparkles className="w-3.5 h-3.5" /> Generar arriendos y dividendos al día
        </button>
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-3)' }}>
          Crea los meses que falten desde el inicio del contrato. Correrlo dos veces no duplica.
        </p>
      </div>
    </div>
  )
}

/**
 * Detalle del crédito hipotecario: capital, tasa, cuotas y vencimiento.
 *
 * Cuotas pagadas/pendientes se leen de `mortgageProgress`, no de un contador
 * guardado — si agregas o borras una cuota a mano en Cobros, este número se
 * actualiza solo, sin que nadie tenga que sincronizarlo.
 */
function MortgageCard({ property, charges, onEdit }: {
  property: Property
  charges: Charge[]
  onEdit: () => void
}) {
  const progress = mortgageProgress(charges, property.mortgage_total_installments)
  const pct = property.mortgage_total_installments
    ? Math.min(100, Math.round((progress.paidCount / property.mortgage_total_installments) * 100))
    : null

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>El crédito</h3>
        <button onClick={onEdit} className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--primary)' }}>
          Editar
        </button>
      </div>

      {pct !== null && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
              {progress.paidCount} de {property.mortgage_total_installments} cuotas
            </p>
            <p className="text-xs font-bold" style={{ color: 'var(--primary)' }}>{pct}%</p>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
          </div>
        </div>
      )}

      <dl className="space-y-1.5 text-sm">
        {property.mortgage_principal && <Row label="Capital inicial" value={formatCLP(property.mortgage_principal)} />}
        {property.mortgage_rate != null && <Row label="Tasa de interés" value={`${property.mortgage_rate}%`} />}
        {progress.pendingCount != null && <Row label="Cuotas pendientes" value={String(progress.pendingCount)} />}
        {progress.lastPaidAmount && (
          <Row label="Última cuota" value={`${formatCLP(progress.lastPaidAmount)}${
            property.mortgage_rate ? ' · sube con la UF' : ''}`} />
        )}
        {property.mortgage_signed_date && <Row label="Firma escritura" value={fmtDate(property.mortgage_signed_date)} />}
        {property.mortgage_end_date && <Row label="Vencimiento" value={fmtDate(property.mortgage_end_date)} />}
      </dl>
    </div>
  )
}

function PropertyCard({ property, onEdit, onAddMortgage, onAddUtilities }: {
  property: Property
  onEdit: () => void
  onAddMortgage: () => void
  onAddUtilities: () => void
}) {
  const sug = suggestUtilities(property.region, property.comuna)
  const missingDiv = !property.mortgage_amount
  const missingUtils = !property.electricity_client_id && !property.water_client_id
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>La propiedad</h3>
        <button onClick={onEdit} className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>
          Editar
        </button>
      </div>
      {/* Tipo, dirección, región y comuna ya no van acá: viven en el H1 y su
          bajada. Esta tarjeta quedó con lo administrativo — lo que necesitas
          tener a mano para pagar algo o llamar a una empresa. */}
      <dl className="space-y-1.5 text-sm">
        {property.rol_sii && <Row label="ROL" value={property.rol_sii} />}
        {property.contribuciones_status && (
          <Row label="Contribuciones"
               value={property.contribuciones_status === 'afecto' ? 'Afecta' : 'Exenta'} />
        )}
        {property.aseo_billing && (
          <Row label="Derechos de aseo"
               value={property.aseo_billing === 'separate' ? 'Se cobran aparte'
                    : property.aseo_billing === 'included' ? 'En las contribuciones'
                    : 'Exenta'} />
        )}
        {property.mortgage_amount && (
          <Row label="Dividendo" value={`${formatCLP(property.mortgage_amount)}${
            property.mortgage_due_day ? ` · día ${property.mortgage_due_day}` : ''}`} />
        )}
        {property.mortgage_account_label && (
          <Row label="Se carga a" value={property.mortgage_account_label} />
        )}
        {property.electricity_client_id && (
          <Row label={sug?.electricity.name ?? 'Luz'} value={property.electricity_client_id} />
        )}
        {property.water_client_id && (
          <Row label={sug?.water.name ?? 'Agua'} value={property.water_client_id} />
        )}
      </dl>

      {/* Siempre visibles: si el dato está, el chip pasa de "Agregar" a
          "Editar" — antes desaparecía y no había forma de corregirlo sin
          abrir el formulario completo. */}
      <div className="mt-3 pt-3 border-t flex flex-wrap gap-2" style={{ borderColor: 'var(--border)' }}>
        <button onClick={onAddMortgage}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border"
          style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          {missingDiv ? <Plus className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          {missingDiv ? 'Agregar dividendo' : 'Dividendo'}
        </button>
        <button onClick={onAddUtilities}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border"
          style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          {missingUtils ? <Plus className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          {missingUtils ? 'Agregar cuentas de servicios' : 'Cuentas de servicios'}
        </button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt style={{ color: 'var(--ink-3)' }}>{label}</dt>
      <dd className="font-semibold text-right" style={{ color: 'var(--ink)' }}>{value}</dd>
    </div>
  )
}

// ── Modales ─────────────────────────────────────────────────────────────────

type Backdrop = ReturnType<typeof useBackdropClose>

function Modal({ title, backdrop, onCancel, children }: {
  title: string
  backdrop: Backdrop
  onCancel: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end lg:items-center justify-center p-0 lg:p-4"
      style={{ background: 'rgba(10,31,68,0.45)' }}
      {...backdrop}
    >
      <div
        className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--surface)' }}
      >
        <div
          className="sticky top-0 flex items-center justify-between px-5 py-4 border-b"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>{title}</h2>
          <button onClick={onCancel} className="p-1 rounded-lg" style={{ color: 'var(--ink-3)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <label className="block mb-3.5">
      <span className="block text-xs font-bold mb-1.5" style={{ color: 'var(--ink-2)' }}>{label}</span>
      {children}
      {hint && <span className="block text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>{hint}</span>}
    </label>
  )
}

const inputCls = 'w-full px-3 py-2.5 rounded-xl text-sm outline-none'
const inputStyle = {
  background: 'var(--surface-2)',
  color: 'var(--ink)',
  border: '1.5px solid var(--border)',
} as const

function Actions({ busy, onCancel, submitLabel, danger }: {
  busy: boolean
  onCancel: () => void
  submitLabel: string
  danger?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex items-center gap-2 mt-5">
      {danger && (
        <button
          type="button"
          onClick={() => { if (confirm('¿Seguro? Esto borra también todos sus cobros.')) danger.onClick() }}
          className="p-2.5 rounded-xl" style={{ color: 'var(--coral)' }}
          title={danger.label}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
      <button
        type="button" onClick={onCancel}
        className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
        style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}
      >
        Cancelar
      </button>
      <button
        type="submit" disabled={busy}
        className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
        style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }}
      >
        {busy ? 'Guardando…' : submitLabel}
      </button>
    </div>
  )
}

// Formatea número como CLP mientras el usuario escribe
function fmtClpInput(raw: string): string {
  if (!raw) return ''
  const n = Number(raw.replace(/\D/g, ''))
  return isNaN(n) ? '' : n.toLocaleString('es-CL')
}

function PropertyForm({ property, busy, error, backdrop, onCancel, onSave, onDelete }: {
  property: Property | null
  busy: boolean
  error: string | null
  backdrop: Backdrop
  onCancel: () => void
  onSave: (input: Parameters<typeof saveProperty>[0]) => void
  onDelete?: () => void
}) {
  const [propType, setPropType]   = useState<string>(property?.property_type ?? '')
  const [unitNum, setUnitNum]     = useState(property?.unit_number ?? '')
  const [address, setAddress]     = useState(property?.address ?? '')
  const [region, setRegion]       = useState(property?.region ?? '')
  const [comuna, setComuna]   = useState(property?.comuna ?? '')
  const [rol, setRol]         = useState(property?.rol_sii ?? '')
  const [contrib, setContrib] = useState<string>(property?.contribuciones_status ?? '')
  const [aseo, setAseo]       = useState<string>(property?.aseo_billing ?? '')

  const comunasDeRegion = region ? (REGIONES_COMUNAS[region] ?? []) : []

  function handleRegion(r: string) {
    setRegion(r)
    setComuna('')  // reset al cambiar región
  }

  return (
    <Modal title={property ? 'Editar propiedad' : 'Nueva propiedad'} backdrop={backdrop} onCancel={onCancel}>
      <form onSubmit={e => {
        e.preventDefault()
        // Alias auto-generado: "Depto 42, Santiago" / "Casa, Las Condes" etc.
        const autoAlias = [
          propType === 'departamento' ? `Depto${unitNum ? ` ${unitNum}` : ''}` : 'Casa',
          comuna || undefined,
        ].filter(Boolean).join(', ')
        onSave({
          alias: autoAlias || (property?.alias ?? 'Propiedad'),
          propertyType: (propType || null) as 'departamento' | 'casa' | 'otro' | null,
          unitNumber: propType === 'departamento' ? (unitNum || null) : null,
          address: address || null, region: region || null,
          comuna: comuna || null, rolSii: rol || null,
          contribucionesStatus: (contrib || null) as 'afecto' | 'exento' | null,
          aseoBilling: (aseo || null) as 'included' | 'separate' | 'exempt' | null,
          // Dividendo y cuentas de servicio tienen su propio formulario —
          // acá solo se pasan por para no borrarlos al editar lo básico.
          mortgageAmount: property?.mortgage_amount ?? null,
          mortgageDueDay: property?.mortgage_due_day ?? null,
          mortgageAccountLabel: property?.mortgage_account_label ?? null,
          mortgagePrincipal: property?.mortgage_principal ?? null,
          mortgageRate: property?.mortgage_rate ?? null,
          mortgageGraceMonths: property?.mortgage_grace_months ?? null,
          mortgageTotalInstallments: property?.mortgage_total_installments ?? null,
          mortgageSignedDate: property?.mortgage_signed_date ?? null,
          mortgageEndDate: property?.mortgage_end_date ?? null,
          electricityClientId: property?.electricity_client_id ?? null,
          waterClientId: property?.water_client_id ?? null,
        })
      }}>
        {/* ── Datos básicos — siempre visibles ─────────────────── */}
        <Field label="Dirección">
          <input className={inputCls} style={inputStyle} value={address}
                 onChange={e => setAddress(e.target.value)} placeholder="Av. Providencia 1234" />
        </Field>
        <Field label="Tipo de propiedad">
          <div className="flex gap-2">
            {(['departamento', 'casa'] as const).map(t => (
              <button
                key={t} type="button"
                onClick={() => { setPropType(t); if (t !== 'departamento') setUnitNum('') }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold border transition-all"
                style={propType === t ? {
                  background: 'var(--primary-soft)', color: 'var(--primary)',
                  borderColor: 'var(--primary)',
                } : {
                  background: 'var(--surface)', color: 'var(--ink-2)',
                  borderColor: 'var(--border)',
                }}
              >
                {t === 'departamento' ? 'Departamento' : 'Casa'}
              </button>
            ))}
          </div>
        </Field>
        {propType === 'departamento' && (
          <Field label="Número de departamento">
            <input className={inputCls} style={inputStyle} value={unitNum} inputMode="numeric"
                   onChange={e => setUnitNum(e.target.value.replace(/\D/g, ''))} placeholder="42" />
          </Field>
        )}
        <Field label="Región">
          <select className={inputCls} style={inputStyle} value={region} onChange={e => handleRegion(e.target.value)}>
            <option value="">Selecciona una región…</option>
            {Object.keys(REGIONES_COMUNAS).map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="Comuna">
          <select className={inputCls} style={inputStyle} value={comuna}
                  onChange={e => setComuna(e.target.value)}
                  disabled={comunasDeRegion.length === 0}>
            <option value="">{comunasDeRegion.length ? 'Selecciona una comuna…' : 'Elige región primero'}</option>
            {comunasDeRegion.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="ROL de avalúo (opcional)" hint="Con este número se consultan los derechos de aseo y las contribuciones.">
          <input className={inputCls} style={inputStyle} value={rol}
                 onChange={e => setRol(e.target.value)} placeholder="20304050" />
        </Field>

        <Field label="Contribuciones">
          <div className="flex gap-2">
            {([['afecto', 'Paga'], ['exento', 'Exenta']] as const).map(([v, label]) => (
              <button key={v} type="button"
                onClick={() => {
                  setContrib(v)
                  // Regla del SII: si es exenta no hay giro de contribuciones y
                  // la municipalidad cobra el aseo aparte. Si es afecta, el aseo
                  // suele venir dentro del mismo giro. Es solo un default —
                  // queda editable abajo.
                  setAseo(v === 'exento' ? 'separate' : 'included')
                }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold border transition-all"
                style={contrib === v ? {
                  background: 'var(--primary-soft)', color: 'var(--primary)', borderColor: 'var(--primary)',
                } : { background: 'var(--surface)', color: 'var(--ink-2)', borderColor: 'var(--border)' }}>
                {label}
              </button>
            ))}
          </div>
        </Field>

        {contrib && (
          <Field label="Derechos de aseo"
                 hint={aseo === 'separate'
                   ? 'La municipalidad los cobra en giros aparte — se pueden generar acá.'
                   : aseo === 'included'
                   ? 'Vienen dentro del giro de contribuciones, no se registran aparte.'
                   : 'La propiedad no paga aseo.'}>
            <select className={inputCls} style={inputStyle} value={aseo}
                    onChange={e => setAseo(e.target.value)}>
              <option value="separate">Se cobran aparte (municipalidad)</option>
              <option value="included">Vienen en las contribuciones</option>
              <option value="exempt">Exenta de aseo</option>
            </select>
          </Field>
        )}


        {error && <p className="text-sm mb-2" style={{ color: 'var(--coral)' }}>{error}</p>}
        <Actions
          busy={busy} onCancel={onCancel} submitLabel={property ? 'Guardar' : 'Crear propiedad'}
          danger={onDelete ? { label: 'Eliminar propiedad', onClick: onDelete } : undefined}
        />
      </form>
    </Modal>
  )
}

function ChargeForm({ charge, propertyId, busy, error, backdrop, onCancel, onSave }: {
  charge: Charge | null
  propertyId: string
  busy: boolean
  error: string | null
  backdrop: Backdrop
  onCancel: () => void
  onSave: (input: Parameters<typeof saveCharge>[0]) => void
}) {
  const [kind, setKind]       = useState(charge?.kind ?? 'aseo')
  const [dueDate, setDueDate] = useState(charge?.due_date ?? '')
  const [amount, setAmount]   = useState(charge?.amount?.toString() ?? '')
  const [penalty, setPenalty] = useState(charge?.penalty?.toString() ?? '')
  const [ipc, setIpc]         = useState(charge?.inflation_adj?.toString() ?? '')
  const [ref, setRef]         = useState(charge?.external_ref ?? '')
  const [notes, setNotes]     = useState(charge?.notes ?? '')

  const preset = KIND_OPTIONS.find(k => k.value === kind)!
  const [responsible, setResponsible] =
    useState<'owner' | 'tenant'>(charge?.responsible ?? preset.responsible)

  // Al cambiar el tipo se re-sugiere quién paga, pero queda editable: hay
  // contratos donde los gastos comunes los asume el propietario.
  function changeKind(next: string) {
    setKind(next)
    const p = KIND_OPTIONS.find(k => k.value === next)
    if (p) setResponsible(p.responsible)
  }

  return (
    <Modal title={charge ? 'Editar cobro' : 'Nuevo cobro'} backdrop={backdrop} onCancel={onCancel}>
      <form onSubmit={e => {
        e.preventDefault()
        const d = KIND_OPTIONS.find(k => k.value === kind)!
        onSave({
          propertyId, kind, direction: d.direction, dueDate,
          amount: Number(amount || 0),
          penalty: Number(penalty || 0),
          inflationAdj: Number(ipc || 0),
          responsible,
          externalRef: ref || null,
          notes: notes || null,
          periodMonth: dueDate ? Number(dueDate.slice(5, 7)) : null,
          periodYear:  dueDate ? Number(dueDate.slice(0, 4)) : null,
        })
      }}>
        <Field label="Tipo">
          <select className={inputCls} style={inputStyle} value={kind}
                  onChange={e => changeKind(e.target.value)}>
            {KIND_OPTIONS.map(k => (
              <option key={k.value} value={k.value}>{KIND_LABEL[k.value]}</option>
            ))}
          </select>
        </Field>
        <Field label="Vence el">
          <input type="date" className={inputCls} style={inputStyle} value={dueDate} required
                 onChange={e => setDueDate(e.target.value)} />
        </Field>
        <Field label="Monto base">
          <input className={inputCls} style={inputStyle} value={amount} inputMode="numeric" required
                 onChange={e => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="14330" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Interés penal">
            <input className={inputCls} style={inputStyle} value={penalty} inputMode="numeric"
                   onChange={e => setPenalty(e.target.value.replace(/\D/g, ''))} placeholder="0" />
          </Field>
          <Field label="Reajuste IPC">
            <input className={inputCls} style={inputStyle} value={ipc} inputMode="numeric"
                   onChange={e => setIpc(e.target.value.replace(/\D/g, ''))} placeholder="0" />
          </Field>
        </div>

        <Field label="Quién lo paga">
          <select className={inputCls} style={inputStyle} value={responsible}
                  onChange={e => setResponsible(e.target.value as 'owner' | 'tenant')}>
            <option value="owner">Yo</option>
            <option value="tenant">El arrendatario</option>
          </select>
        </Field>

        <Field label="N° de giro o boleta" hint="Sirve para que el mismo documento no se cargue dos veces.">
          <input className={inputCls} style={inputStyle} value={ref}
                 onChange={e => setRef(e.target.value)} placeholder="2601679116" />
        </Field>

        <Field label="Nota">
          <input className={inputCls} style={inputStyle} value={notes}
                 onChange={e => setNotes(e.target.value)} placeholder="Opcional" />
        </Field>

        {error && <p className="text-sm mb-2" style={{ color: 'var(--coral)' }}>{error}</p>}
        <Actions busy={busy} onCancel={onCancel} submitLabel="Guardar" />
      </form>
    </Modal>
  )
}

function AseoForm({ propertyId, busy, error, backdrop, onCancel, onGenerate }: {
  propertyId: string
  busy: boolean
  error: string | null
  backdrop: Backdrop
  onCancel: () => void
  onGenerate: (year: number, base: number) => void
}) {
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [base, setBase] = useState('')

  return (
    <Modal title="Generar derechos de aseo" backdrop={backdrop} onCancel={onCancel}>
      <form onSubmit={e => { e.preventDefault(); onGenerate(Number(year), Number(base || 0)) }}>
        <div className="card p-3 mb-4" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
          <div className="flex gap-2">
            <CalendarDays className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--ink-3)' }} />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              Crea las 4 cuotas del año con vencimiento el <strong>30 de abril, junio,
              septiembre y noviembre</strong>. Después puedes editar cada una con el
              monto y el N° de giro reales.
            </p>
          </div>
        </div>

        <Field label="Año">
          <input className={inputCls} style={inputStyle} value={year} inputMode="numeric" required
                 onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        </Field>
        <Field label="Monto base por cuota" hint="El que aparece antes de intereses y reajuste.">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none"
                  style={{ color: 'var(--ink-3)' }}>$</span>
            <input className={inputCls} style={{ ...inputStyle, paddingLeft: '1.5rem' }}
                   value={fmtClpInput(base)} inputMode="numeric" required
                   onChange={e => setBase(e.target.value.replace(/\D/g, ''))} placeholder="14.330" />
          </div>
        </Field>

        {error && <p className="text-sm mb-2" style={{ color: 'var(--coral)' }}>{error}</p>}
        <Actions busy={busy} onCancel={onCancel} submitLabel="Generar" />
      </form>
    </Modal>
  )
}

function PayForm({ charge, today, busy, error, backdrop, onCancel, onPay }: {
  charge: Charge
  today: string
  busy: boolean
  error: string | null
  backdrop: Backdrop
  onCancel: () => void
  onPay: (
    date: string, amount: number, receipt: File | null, externalRef: string | null,
    billBreakdown: { amount: number; penalty: number; inflationAdj: number } | null,
  ) => void
}) {
  const total = chargeTotal(charge)
  const [date, setDate]     = useState(today)
  const [amount, setAmount] = useState(total.toString())
  const [receipt, setReceipt]     = useState<File | null>(null)
  const [ingresoNumero, setIngresoNumero] = useState<string | null>(null)
  const [billBreakdown, setBillBreakdown] = useState<{ amount: number; penalty: number; inflationAdj: number } | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)

  const isIncome = charge.direction === 'in'
  const partial  = Number(amount || 0) < total

  // Si el comprobante es de aseo (portal WebAseo), precarga fecha y monto —
  // igual que el uploader de boletas: precarga, nunca escribe directo. El N°
  // de giro real (ingresoNumero) reemplaza la referencia provisoria del
  // cobro (aseoRef genera "aseo-2026-Q2" hasta que se conoce el folio), y el
  // desglose SUBTOTAL/IPC/INTERÉS corrige amount/penalty/inflation_adj —
  // sin esto un giro con mora real queda mostrando "Parcial" para siempre
  // aunque se pague el total exacto.
  async function handleReceipt(f: File) {
    setReceipt(f); setExtracting(true); setExtractMsg(null); setIngresoNumero(null); setBillBreakdown(null)
    const fd = new FormData()
    fd.append('file', f)
    const res = await extractAseoReceiptDraft(fd)
    setExtracting(false)
    if (!res.ok) { setExtractMsg('No se pudo leer el PDF, pero igual queda archivado.'); return }
    const d = res.draft
    if (d.totalPagado || d.paidDate) {
      if (d.paidDate) setDate(d.paidDate)
      if (d.totalPagado) setAmount(String(d.totalPagado))
      if (d.ingresoNumero) setIngresoNumero(d.ingresoNumero)
      if (d.subtotal != null && d.ipc != null && d.interes != null) {
        setBillBreakdown({ amount: d.subtotal, penalty: d.interes, inflationAdj: d.ipc })
      }
      setExtractMsg('Fecha y monto precargados del comprobante — revisa antes de guardar.')
    } else {
      setExtractMsg('No reconocí el formato del comprobante, pero igual queda archivado.')
    }
  }

  return (
    <Modal
      title={isIncome ? 'Registrar cobro' : 'Registrar pago'}
      backdrop={backdrop} onCancel={onCancel}
    >
      <form onSubmit={e => { e.preventDefault(); onPay(date, Number(amount || 0), receipt, ingresoNumero, billBreakdown) }}>
        <p className="text-sm mb-4" style={{ color: 'var(--ink-2)' }}>
          {KIND_LABEL[charge.kind] ?? charge.kind} · vence {fmtDate(charge.due_date)} ·{' '}
          <strong>{formatCLP(total)}</strong>
        </p>

        <Field label={isIncome ? 'Fecha en que llegó' : 'Fecha de pago'}>
          <input type="date" className={inputCls} style={inputStyle} value={date} required
                 onChange={e => setDate(e.target.value)} />
        </Field>
        <Field
          label="Monto"
          hint={partial ? `Queda un saldo de ${formatCLP(total - Number(amount || 0))}` : undefined}
        >
          <input className={inputCls} style={inputStyle} value={amount} inputMode="numeric" required
                 onChange={e => setAmount(e.target.value.replace(/\D/g, ''))} />
        </Field>

        <Field label="Comprobante (opcional)">
          <label
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm cursor-pointer"
            style={inputStyle}
          >
            <Upload className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
            <span className="truncate" style={{ color: receipt ? 'var(--ink)' : 'var(--ink-3)' }}>
              {extracting ? 'Leyendo el PDF…' : receipt ? receipt.name : 'Adjuntar PDF del pago'}
            </span>
            <input type="file" accept="application/pdf" className="hidden"
                   onChange={e => { const f = e.target.files?.[0]; if (f) handleReceipt(f) }} />
          </label>
          {extractMsg && <p className="text-xs mt-1.5" style={{ color: 'var(--ink-3)' }}>{extractMsg}</p>}
        </Field>

        {error && <p className="text-sm mb-2" style={{ color: 'var(--coral)' }}>{error}</p>}
        <Actions busy={busy} onCancel={onCancel} submitLabel={isIncome ? 'Registrar' : 'Pagar'} />
      </form>
    </Modal>
  )
}

/**
 * Modal de "Marcar todo pagado" para varias cuentas a la vez (Vencidas).
 * Antes marcaba todo con la fecha de hoy sin más — ahora deja soltar los
 * comprobantes de una: cada PDF se parsea y se empareja solo con su cobro.
 *
 * El emparejamiento NO es por N° de giro (external_ref): generateAseoCharges
 * genera una referencia provisoria tipo "aseo-2026-Q2" (aseoRef, hasta que
 * se conoce el folio real), así que un cobro recién creado nunca va a tener
 * el N° de giro real como external_ref — comparar por ahí nunca matchea. La
 * clave confiable es el vencimiento: PLAZO PARA PAGAR del comprobante
 * coincide exacto con la due_date del cobro (los 4 vencimientos de aseo son
 * fechas fijas). Si matchea, además reemplaza el external_ref provisorio
 * por el N° de giro real que sí trae el comprobante.
 */
function BulkPayModal({ charges, today, busy, backdrop, onClose, onConfirm }: {
  charges: Charge[]
  today: string
  busy: boolean
  backdrop: Backdrop
  onClose: () => void
  onConfirm: (matches: Map<string, { file: File; draft: ParsedAseoReceipt }>) => void
}) {
  const [matches, setMatches]       = useState<Map<string, { file: File; draft: ParsedAseoReceipt }>>(new Map())
  const [extracting, setExtracting] = useState(false)
  const [dragOver, setDragOver]     = useState(false)
  // Antes un comprobante que no calzaba con nada fallaba en silencio — el
  // recuadro decía "Leyendo…" y después no pasaba nada, sin explicar por
  // qué. Ahora cada archivo deja rastro: coincidió, no coincidió, o no se
  // pudo leer.
  const [notMatched, setNotMatched] = useState<string[]>([])
  const [failed, setFailed]         = useState<string[]>([])

  async function addFiles(files: File[]) {
    setExtracting(true)
    for (const f of files) {
      const fd = new FormData()
      fd.append('file', f)
      const res = await extractAseoReceiptDraft(fd)
      if (!res.ok) {
        setFailed(prev => [...prev, f.name])
        continue
      }
      const match =
        // Primero por vencimiento — la clave real y confiable.
        (res.draft.plazoParaPagar && charges.find(c => c.due_date === res.draft.plazoParaPagar)) ||
        // external_ref como respaldo, por si ya se corrigió a mano antes.
        (res.draft.ingresoNumero && charges.find(c => c.external_ref === res.draft.ingresoNumero))
      if (match) {
        setMatches(prev => new Map(prev).set(match.id, { file: f, draft: res.draft }))
      } else {
        setNotMatched(prev => [...prev, f.name])
      }
    }
    setExtracting(false)
  }

  return (
    <Modal title="Marcar todo pagado" backdrop={backdrop} onCancel={onClose}>
      <form onSubmit={e => { e.preventDefault(); onConfirm(matches) }}>
        <p className="text-sm mb-4" style={{ color: 'var(--ink-2)' }}>
          {charges.length} {charges.length === 1 ? 'cuenta' : 'cuentas'} · lo que no traiga comprobante se marca con la fecha de hoy.
        </p>

        <label
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={e => { e.preventDefault(); setDragOver(false) }}
          onDrop={e => {
            e.preventDefault(); setDragOver(false)
            const fs = Array.from(e.dataTransfer.files ?? []).filter(f => f.type === 'application/pdf')
            if (fs.length > 0) addFiles(fs)
          }}
          className="flex flex-col items-center gap-1.5 py-6 rounded-2xl border-2 border-dashed cursor-pointer mb-4 text-center transition-colors"
          style={dragOver
            ? { borderColor: 'var(--primary)', background: 'var(--primary-soft)', color: 'var(--primary)' }
            : { borderColor: 'var(--border)', color: 'var(--ink-3)' }}
        >
          <Upload className="w-5 h-5" />
          <span className="text-xs font-semibold px-4">
            {extracting ? 'Leyendo comprobantes…' : 'Adjuntar comprobantes (opcional) — se emparejan solos por N° de giro'}
          </span>
          <input type="file" accept="application/pdf" multiple className="hidden"
                 onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length > 0) addFiles(fs) }} />
        </label>

        {(notMatched.length > 0 || failed.length > 0) && (
          <div className="mb-4 space-y-1">
            {notMatched.map(name => (
              <p key={name} className="text-xs" style={{ color: 'var(--gold)' }}>
                {name}: se leyó bien pero no coincide con ninguna de estas cuentas (¿vencimiento distinto?).
              </p>
            ))}
            {failed.map(name => (
              <p key={name} className="text-xs" style={{ color: 'var(--coral)' }}>
                {name}: no se pudo leer el PDF.
              </p>
            ))}
          </div>
        )}

        <div className="divide-y mb-2" style={{ borderColor: 'var(--border)' }}>
          {charges.map(c => {
            const m = matches.get(c.id)
            return (
              <div key={c.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
                    {KIND_LABEL[c.kind] ?? c.kind}{c.external_ref ? ` · N° ${c.external_ref}` : ''}
                  </p>
                  <p className="text-xs truncate" style={{ color: m ? 'var(--mint)' : 'var(--ink-3)' }}>
                    {m ? `Comprobante: ${m.file.name}` : `Sin comprobante · vence ${fmtDate(c.due_date)}`}
                  </p>
                </div>
                <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--ink)' }}>
                  {formatCLP(m?.draft.totalPagado ?? chargeTotal(c))}
                </p>
              </div>
            )
          })}
        </div>

        <Actions busy={busy || extracting} onCancel={onClose} submitLabel="Marcar todo pagado" />
      </form>
    </Modal>
  )
}

// ── Formulario del contrato ─────────────────────────────────────────────────

function LeaseForm({ lease, propertyId, busy, error, backdrop, onCancel, onSave, onDelete }: {
  lease: Lease | null
  propertyId: string
  busy: boolean
  error: string | null
  backdrop: Backdrop
  onCancel: () => void
  onSave: (input: Parameters<typeof saveLease>[0]) => void
  onDelete?: () => void
}) {
  const [name, setName]       = useState(lease?.tenant_name ?? '')
  const [email, setEmail]     = useState(lease?.tenant_email ?? '')
  const [phone, setPhone]     = useState(lease?.tenant_phone ?? '')
  const [start, setStart]     = useState(lease?.start_date ?? '')
  const [end, setEnd]         = useState(lease?.end_date ?? '')
  const [notice, setNotice]   = useState(String(lease?.notice_days ?? 60))
  const [rent, setRent]       = useState(lease?.rent_amount?.toString() ?? '')
  const [dueDay, setDueDay]   = useState(String(lease?.rent_due_day ?? 5))
  const [fee, setFee]         = useState(lease?.late_fee_per_day?.toString() ?? '')
  const [termDays, setTerm]   = useState(lease?.termination_days?.toString() ?? '')
  const [adjKind, setAdjKind] = useState<'ipc' | 'uf' | 'none'>(lease?.adjustment_kind ?? 'ipc')
  const [adjMonths, setAdjM]  = useState(String(lease?.adjustment_months ?? 6))
  const [deposit, setDep]     = useState(lease?.deposit_amount?.toString() ?? '')

  return (
    <Modal title={lease ? 'Editar contrato' : 'Nuevo contrato'} backdrop={backdrop} onCancel={onCancel}>
      <form onSubmit={e => {
        e.preventDefault()
        onSave({
          propertyId,
          tenantName: name, tenantEmail: email || null, tenantPhone: phone || null,
          startDate: start, endDate: end || null,
          noticeDays: Number(notice || 60),
          rentAmount: Number(rent.replace(/\D/g, '') || 0),
          rentDueDay: Number(dueDay || 5),
          lateFeePerDay: fee ? Number(fee.replace(/\D/g, '')) : null,
          terminationDays: termDays ? Number(termDays) : null,
          adjustmentKind: adjKind,
          adjustmentMonths: adjKind === 'none' ? null : Number(adjMonths || 6),
          lastAdjustmentDate: lease?.last_adjustment_date ?? null,
          depositAmount: deposit ? Number(deposit.replace(/\D/g, '')) : null,
          notes: null,
        })
      }}>
        <Field label="Arrendatario">
          <input className={inputCls} style={inputStyle} value={name} required
                 onChange={e => setName(e.target.value)} placeholder="Nombre completo" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <input className={inputCls} style={inputStyle} value={email} type="email"
                   onChange={e => setEmail(e.target.value)} placeholder="opcional" />
          </Field>
          <Field label="Teléfono">
            <input className={inputCls} style={inputStyle} value={phone}
                   onChange={e => setPhone(e.target.value)} placeholder="opcional" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Inicio">
            <input className={inputCls} style={inputStyle} value={start} type="date" required
                   onChange={e => setStart(e.target.value)} />
          </Field>
          <Field label="Término" hint="Vacío = indefinido">
            <input className={inputCls} style={inputStyle} value={end} type="date"
                   onChange={e => setEnd(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Renta mensual">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none"
                    style={{ color: 'var(--ink-3)' }}>$</span>
              <input className={inputCls} style={{ ...inputStyle, paddingLeft: '1.5rem' }}
                     value={fmtClpInput(rent)} inputMode="numeric" required
                     onChange={e => setRent(e.target.value.replace(/\D/g, ''))} placeholder="335.000" />
            </div>
          </Field>
          <Field label="Día de pago" hint="1 a 28">
            <input className={inputCls} style={inputStyle} value={dueDay} inputMode="numeric"
                   onChange={e => setDueDay(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="5" />
          </Field>
        </div>

        <div className="pt-2 mt-1 mb-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-bold pt-3 mb-3" style={{ color: 'var(--ink-2)' }}>Reajuste</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <select className={inputCls} style={inputStyle} value={adjKind}
                    onChange={e => setAdjKind(e.target.value as 'ipc' | 'uf' | 'none')}>
              <option value="ipc">Por IPC</option>
              <option value="uf">En UF</option>
              <option value="none">Sin reajuste</option>
            </select>
          </Field>
          {adjKind !== 'none' && (
            <Field label="Cada cuántos meses">
              <input className={inputCls} style={inputStyle} value={adjMonths} inputMode="numeric"
                     onChange={e => setAdjM(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="6" />
            </Field>
          )}
        </div>

        <div className="pt-2 mt-1 mb-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-bold pt-3 mb-3" style={{ color: 'var(--ink-2)' }}>Cláusulas de mora</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Multa por día">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none"
                    style={{ color: 'var(--ink-3)' }}>$</span>
              <input className={inputCls} style={{ ...inputStyle, paddingLeft: '1.5rem' }}
                     value={fmtClpInput(fee)} inputMode="numeric"
                     onChange={e => setFee(e.target.value.replace(/\D/g, ''))} placeholder="5.000" />
            </div>
          </Field>
          <Field label="Días para término" hint="Mora que habilita fin de contrato">
            <input className={inputCls} style={inputStyle} value={termDays} inputMode="numeric"
                   onChange={e => setTerm(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="30" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Garantía">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none"
                    style={{ color: 'var(--ink-3)' }}>$</span>
              <input className={inputCls} style={{ ...inputStyle, paddingLeft: '1.5rem' }}
                     value={fmtClpInput(deposit)} inputMode="numeric"
                     onChange={e => setDep(e.target.value.replace(/\D/g, ''))} placeholder="335.000" />
            </div>
          </Field>
          <Field label="Días de aviso" hint="Para no renovar">
            <input className={inputCls} style={inputStyle} value={notice} inputMode="numeric"
                   onChange={e => setNotice(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="60" />
          </Field>
        </div>

        {error && <p className="text-sm mb-2" style={{ color: 'var(--coral)' }}>{error}</p>}
        <Actions
          busy={busy} onCancel={onCancel} submitLabel="Guardar"
          danger={onDelete ? { label: 'Eliminar contrato', onClick: onDelete } : undefined}
        />
      </form>
    </Modal>
  )
}

// ── Formularios enfocados ───────────────────────────────────────────────────
//
// Dividendo y cuentas de servicio viven en modales propios en vez de dentro
// del formulario de la propiedad: para llenar dos campos no vale la pena
// scrollear doce. Ambos guardan con saveProperty pasando por los valores que
// no editan, así ninguno pisa lo que cargó el otro.

/** Datos base compartidos: lo que un form enfocado NO toca pero debe conservar. */
function baseInput(property: Property) {
  return {
    alias:        property.alias,
    propertyType: property.property_type,
    unitNumber:   property.unit_number,
    address:      property.address,
    region:       property.region,
    comuna:       property.comuna,
    rolSii:       property.rol_sii,
    contribucionesStatus: property.contribuciones_status,
    aseoBilling:          property.aseo_billing,
    mortgageAmount:       property.mortgage_amount,
    mortgageDueDay:       property.mortgage_due_day,
    mortgageAccountLabel: property.mortgage_account_label,
    mortgagePrincipal:         property.mortgage_principal,
    mortgageRate:               property.mortgage_rate,
    mortgageGraceMonths:        property.mortgage_grace_months,
    mortgageTotalInstallments:  property.mortgage_total_installments,
    mortgageSignedDate:         property.mortgage_signed_date,
    mortgageEndDate:            property.mortgage_end_date,
    electricityClientId: property.electricity_client_id,
    waterClientId:       property.water_client_id,
  }
}

function MortgageForm({ property, busy, error, backdrop, onCancel, onSave }: {
  property: Property
  busy: boolean
  error: string | null
  backdrop: Backdrop
  onCancel: () => void
  onSave: (input: Parameters<typeof saveProperty>[0]) => void
}) {
  const [amt, setAmt] = useState(property.mortgage_amount?.toString() ?? '')
  const [day, setDay] = useState(property.mortgage_due_day?.toString() ?? '')
  const [acc, setAcc] = useState(property.mortgage_account_label ?? '')

  // Detalle del crédito, opcional: sin esto el módulo sigue generando los
  // cobros mensuales igual, solo que "La propiedad" no muestra capital,
  // tasa ni cuotas. Por eso vive plegado, no mezclado con lo que sí hace
  // falta para que la app funcione.
  const [showLoan, setShowLoan] = useState(!!property.mortgage_principal)
  const [principal, setPrincipal] = useState(property.mortgage_principal?.toString() ?? '')
  const [rate, setRate]           = useState(property.mortgage_rate?.toString() ?? '')
  const [grace, setGrace]         = useState(property.mortgage_grace_months?.toString() ?? '')
  const [total, setTotal]         = useState(property.mortgage_total_installments?.toString() ?? '')
  const [signed, setSigned]       = useState(property.mortgage_signed_date ?? '')
  const [ends, setEnds]           = useState(property.mortgage_end_date ?? '')

  return (
    <Modal title="Dividendo" backdrop={backdrop} onCancel={onCancel}>
      <form onSubmit={e => {
        e.preventDefault()
        onSave({
          ...baseInput(property),
          mortgageAmount: amt ? Number(amt.replace(/\D/g, '')) : null,
          mortgageDueDay: day ? Number(day) : null,
          mortgageAccountLabel: acc || null,
          mortgagePrincipal: principal ? Number(principal.replace(/\D/g, '')) : null,
          mortgageRate: rate ? Number(rate.replace(',', '.')) : null,
          mortgageGraceMonths: grace ? Number(grace) : null,
          mortgageTotalInstallments: total ? Number(total) : null,
          mortgageSignedDate: signed || null,
          mortgageEndDate: ends || null,
          electricityClientId: property.electricity_client_id,
          waterClientId:       property.water_client_id,
        })
      }}>
        <p className="text-xs mb-4" style={{ color: 'var(--ink-3)' }}>
          Se descuenta solo de tu cuenta. Con esto cargado se generan los cobros de cada mes.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto mensual" hint={showLoan ? 'El más reciente si es UF: sube cada mes.' : undefined}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none"
                    style={{ color: 'var(--ink-3)' }}>$</span>
              <input className={inputCls} style={{ ...inputStyle, paddingLeft: '1.5rem' }}
                     value={fmtClpInput(amt)} inputMode="numeric" autoFocus
                     onChange={e => setAmt(e.target.value.replace(/\D/g, ''))} placeholder="580.000" />
            </div>
          </Field>
          <Field label="Día de cobro">
            <input className={inputCls} style={inputStyle} value={day} inputMode="numeric"
                   onChange={e => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="15" />
          </Field>
        </div>

        <Field label="Banco" hint="Solo un rótulo. No guardamos números de cuenta.">
          <select className={inputCls} style={inputStyle} value={acc} onChange={e => setAcc(e.target.value)}>
            <option value="">Sin especificar</option>
            {BANCOS_CHILE.map(b => <option key={b} value={`Cta cte ${b}`}>{b}</option>)}
          </select>
        </Field>

        {!showLoan ? (
          <button type="button" onClick={() => setShowLoan(true)}
            className="flex items-center gap-1.5 text-xs font-semibold mb-4" style={{ color: 'var(--primary)' }}>
            <Plus className="w-3.5 h-3.5" /> Agregar detalle del crédito
          </button>
        ) : (
          <div className="mb-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-bold mb-2" style={{ color: 'var(--ink-2)' }}>
              Detalle del crédito
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Field label="Capital inicial">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none"
                        style={{ color: 'var(--ink-3)' }}>$</span>
                  <input className={inputCls} style={{ ...inputStyle, paddingLeft: '1.5rem' }}
                         value={fmtClpInput(principal)} inputMode="numeric"
                         onChange={e => setPrincipal(e.target.value.replace(/\D/g, ''))} placeholder="50.997.402" />
                </div>
              </Field>
              <Field label="Tasa anual">
                <div className="relative">
                  <input className={inputCls} style={{ ...inputStyle, paddingRight: '1.75rem' }}
                         value={rate} inputMode="decimal"
                         onChange={e => setRate(e.target.value.replace(/[^0-9,.]/g, ''))} placeholder="4,4" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none"
                        style={{ color: 'var(--ink-3)' }}>%</span>
                </div>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Field label="Cuotas totales">
                <input className={inputCls} style={inputStyle} value={total} inputMode="numeric"
                       onChange={e => setTotal(e.target.value.replace(/\D/g, ''))} placeholder="360" />
              </Field>
              <Field label="Meses de gracia">
                <input className={inputCls} style={inputStyle} value={grace} inputMode="numeric"
                       onChange={e => setGrace(e.target.value.replace(/\D/g, ''))} placeholder="0" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Firma de escritura">
                <input type="date" className={inputCls} style={inputStyle} value={signed}
                       onChange={e => setSigned(e.target.value)} />
              </Field>
              <Field label="Vencimiento del crédito">
                <input type="date" className={inputCls} style={inputStyle} value={ends}
                       onChange={e => setEnds(e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        {error && <p className="text-sm mb-2" style={{ color: 'var(--coral)' }}>{error}</p>}
        <Actions busy={busy} onCancel={onCancel} submitLabel="Guardar" />
      </form>
    </Modal>
  )
}

function UtilityAccountsForm({ property, busy, error, backdrop, onCancel, onSave }: {
  property: Property
  busy: boolean
  error: string | null
  backdrop: Backdrop
  onCancel: () => void
  onSave: (input: Parameters<typeof saveProperty>[0]) => void
}) {
  const [elec, setElec]   = useState(property.electricity_client_id ?? '')
  const [water, setWater] = useState(property.water_client_id ?? '')

  // La empresa se deduce de la comuna: el agua está concesionada por
  // territorio, así que "Aguas Andinas" solo es correcto en parte de Santiago.
  const sug = suggestUtilities(property.region, property.comuna)

  return (
    <Modal title="Cuentas de servicios" backdrop={backdrop} onCancel={onCancel}>
      <form onSubmit={e => {
        e.preventDefault()
        onSave({
          ...baseInput(property),
          electricityClientId: elec || null,
          waterClientId:       water || null,
        })
      }}>
        <p className="text-xs mb-4" style={{ color: 'var(--ink-3)' }}>
          {sug
            ? `Según la comuna, tus servicios son ${sug.electricity.name} y ${sug.water.name}.`
            : 'Los números que aparecen en tus boletas.'}
        </p>

        {sug && !sug.confident && (
          <div className="flex items-start gap-2 p-3 rounded-xl mb-4"
               style={{ background: 'color-mix(in srgb, var(--gold) 12%, var(--surface))' }}>
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} />
            <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
              En {property.comuna} la concesión está repartida entre empresas — confirma
              cuál aparece en tu boleta.
            </p>
          </div>
        )}

        <Field label={sug ? `Número de cliente ${sug.electricity.name}` : 'Número de cliente (luz)'}>
          <input className={inputCls} style={inputStyle} value={elec} autoFocus
                 onChange={e => setElec(e.target.value)} placeholder="4521083-2" />
        </Field>
        <Field label={sug ? `Número de cliente ${sug.water.name}` : 'Número de cliente (agua)'}>
          <input className={inputCls} style={inputStyle} value={water}
                 onChange={e => setWater(e.target.value)} placeholder="1847362-5" />
        </Field>

        {error && <p className="text-sm mb-2" style={{ color: 'var(--coral)' }}>{error}</p>}
        <Actions busy={busy} onCancel={onCancel} submitLabel="Guardar" />
      </form>
    </Modal>
  )
}
