'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, Plus, Check, AlertTriangle, Clock, CalendarDays, Trash2,
  Pencil, X, CircleCheck, Undo2, Sparkles, Info,
} from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { useBackdropClose } from '@/components/useBackdropClose'
import {
  chargeStatus, chargeTotal, chargeOutstanding, propertyHealth, nextDue,
  daysBetween, KIND_LABEL, type ChargeStatus,
} from '@/lib/property-charges'
import {
  saveProperty, deleteProperty, saveCharge, markChargePaid,
  unmarkChargePaid, confirmCharge, deleteCharge, generateAseoCharges,
} from '@/app/actions/property'

export interface Property {
  id: string
  alias: string
  property_type: 'departamento' | 'casa' | 'otro' | null
  unit_number: string | null
  address: string | null
  region: string | null
  comuna: string | null
  rol_sii: string | null
  mortgage_amount: number | null
  mortgage_due_day: number | null
  mortgage_account_label: string | null
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
}

interface Props {
  property: Property | null
  charges: Charge[]
  today: string
  view: 'estado' | 'cobros'
}

const STATUS_STYLE: Record<ChargeStatus, { label: string; color: string; bg: string }> = {
  paid:     { label: 'Pagado',    color: '#0F9D6E', bg: '#E6FAF3' },
  partial:  { label: 'Parcial',   color: '#B45309', bg: '#FFF7ED' },
  overdue:  { label: 'Vencido',   color: '#DC2626', bg: '#FEF2F2' },
  due_soon: { label: 'Por vencer',color: '#B45309', bg: '#FFF7ED' },
  pending:  { label: 'Pendiente', color: '#64748B', bg: '#F1F5F9' },
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

export default function PropertyManager({ property, charges, today, view }: Props) {
  const router = useRouter()
  const [propForm, setPropForm]   = useState(false)
  const [chargeForm, setChargeForm] = useState<Charge | 'new' | null>(null)
  const [aseoForm, setAseoForm]   = useState(false)
  const [payFor, setPayFor]       = useState<Charge | null>(null)
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const health = useMemo(() => propertyHealth(charges, today), [charges, today])
  const next   = useMemo(() => nextDue(charges, today), [charges, today])

  const propBackdrop   = useBackdropClose(() => setPropForm(false))
  const chargeBackdrop = useBackdropClose(() => setChargeForm(null))
  const aseoBackdrop   = useBackdropClose(() => setAseoForm(false))
  const payBackdrop    = useBackdropClose(() => setPayFor(null))

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setError(null)
    const res = await fn()
    setBusy(false)
    if (!res.ok) { setError(res.error ?? 'Algo salió mal'); return false }
    router.refresh()
    return true
  }

  // ── Sin propiedad todavía ─────────────────────────────────────────────────
  if (!property) {
    return (
      <>
        <div className="card p-8 text-center">
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: '#FFF7ED' }}
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
            onClick={() => setPropForm(true)}
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
            onCancel={() => setPropForm(false)}
            onSave={async input => { if (await run(() => saveProperty(input))) setPropForm(false) }}
          />
        )}
      </>
    )
  }

  const ownerCharges  = charges.filter(c => c.responsible === 'owner')
  const tenantCharges = charges.filter(c => c.responsible === 'tenant')

  return (
    <>
      {view === 'estado' ? (
        <div className="space-y-5">
          {/* ── Hero semáforo ─────────────────────────────────────────────
              No muestra margen a propósito: entre arriendo y dividendo no hay
              ganancia, así que un número de rentabilidad sería ruido. La única
              pregunta que importa es si está todo al día. */}
          <div
            className="card p-6"
            style={{
              background: health.ok ? '#E6FAF3' : health.overdue.length > 0 ? '#FEF2F2' : '#FFF7ED',
              borderColor: health.ok ? '#A7E8D0' : health.overdue.length > 0 ? '#FCA5A5' : '#FDE68A',
            }}
          >
            <div className="flex items-start gap-4">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.7)' }}
              >
                {health.ok
                  ? <CircleCheck className="w-6 h-6" style={{ color: '#0F9D6E' }} />
                  : <AlertTriangle className="w-6 h-6" style={{ color: health.overdue.length > 0 ? '#DC2626' : '#B45309' }} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1"
                   style={{ color: health.ok ? '#0F9D6E' : health.overdue.length > 0 ? '#DC2626' : '#B45309' }}>
                  {property.alias}
                </p>
                <h2 className="text-2xl lg:text-3xl font-extrabold leading-tight mb-1"
                    style={{ color: 'var(--ink)' }}>
                  {health.ok
                    ? 'Todo al día'
                    : `${health.overdue.length + health.dueSoon.length + health.tenantOverdue.length} ${
                        health.overdue.length + health.dueSoon.length + health.tenantOverdue.length === 1
                          ? 'cosa pendiente' : 'cosas pendientes'}`}
                </h2>
                {health.debtTotal > 0 && (
                  <p className="text-sm font-semibold" style={{ color: '#DC2626' }}>
                    Deuda viva: {formatCLP(health.debtTotal)}
                  </p>
                )}
                {health.ok && next && (
                  <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
                    Próximo: {KIND_LABEL[next.kind ?? ''] ?? next.kind} · {relativeDue(next.due_date, today)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Vencidos — un solo bloque coral, nunca uno por cobro (UX5) */}
          {health.overdue.length > 0 && (
            <AlertBlock
              tone="coral"
              title={`${health.overdue.length} ${health.overdue.length === 1 ? 'cobro vencido' : 'cobros vencidos'}`}
              items={health.overdue as Charge[]}
              today={today}
              onPay={c => setPayFor(c)}
            />
          )}

          {/* Por vencer — chip gold, nunca banner del tamaño de uno coral */}
          {health.dueSoon.length > 0 && (
            <AlertBlock
              tone="gold"
              title={`${health.dueSoon.length} por vencer`}
              items={health.dueSoon as Charge[]}
              today={today}
              onPay={c => setPayFor(c)}
            />
          )}

          {/* Del arrendatario: no es deuda tuya, pero su mora es causal de término */}
          {health.tenantOverdue.length > 0 && (
            <AlertBlock
              tone="gold"
              title="Impagos del arrendatario"
              subtitle="No son costo tuyo, pero su mora es causal de término de contrato."
              items={health.tenantOverdue as Charge[]}
              today={today}
              onPay={c => setPayFor(c)}
            />
          )}

          {/* Cargos automáticos que nadie revisó */}
          {health.unconfirmed.length > 0 && (
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
                <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                  Sin confirmar en la cartola
                </h3>
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
                      className="text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0"
                      style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
                    >
                      Confirmar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <PropertyCard property={property} onEdit={() => setPropForm(true)} />
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
              onClick={() => setAseoForm(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}
            >
              <Sparkles className="w-4 h-4" /> Generar aseo del año
            </button>
          </div>

          <ChargeList
            title="Tuyos"
            charges={ownerCharges} today={today} busy={busy}
            onPay={c => setPayFor(c)}
            onEdit={c => setChargeForm(c)}
            onUnpay={c => run(() => unmarkChargePaid(c.id))}
            onDelete={c => run(() => deleteCharge(c.id))}
          />

          {tenantCharges.length > 0 && (
            <ChargeList
              title="Del arrendatario"
              subtitle="Por contrato los paga él. Se listan para vigilar la mora, no suman a tu deuda."
              charges={tenantCharges} today={today} busy={busy}
              onPay={c => setPayFor(c)}
              onEdit={c => setChargeForm(c)}
              onUnpay={c => run(() => unmarkChargePaid(c.id))}
              onDelete={c => run(() => deleteCharge(c.id))}
            />
          )}
        </div>
      )}

      {error && (
        <p className="text-sm mt-4 px-1" style={{ color: '#DC2626' }}>{error}</p>
      )}

      {/* ── Modales ────────────────────────────────────────────────────── */}
      {propForm && (
        <PropertyForm
          property={property} busy={busy} error={error} backdrop={propBackdrop}
          onCancel={() => setPropForm(false)}
          onSave={async input => { if (await run(() => saveProperty(input, property.id))) setPropForm(false) }}
          onDelete={async () => { if (await run(() => deleteProperty(property.id))) setPropForm(false) }}
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

      {payFor && (
        <PayForm
          charge={payFor} today={today} busy={busy} error={error} backdrop={payBackdrop}
          onCancel={() => setPayFor(null)}
          onPay={async (date, amount) => {
            if (await run(() => markChargePaid(payFor.id, date, amount))) setPayFor(null)
          }}
        />
      )}
    </>
  )
}

// ── Bloque de alerta ────────────────────────────────────────────────────────

function AlertBlock({ tone, title, subtitle, items, today, onPay }: {
  tone: 'coral' | 'gold'
  title: string
  subtitle?: string
  items: Charge[]
  today: string
  onPay: (c: Charge) => void
}) {
  const color = tone === 'coral' ? '#DC2626' : '#B45309'
  const bg    = tone === 'coral' ? '#FEF2F2' : '#FFF7ED'
  const brd   = tone === 'coral' ? '#FCA5A5' : '#FDE68A'

  return (
    <div className="card p-4" style={{ background: bg, borderColor: brd }}>
      <div className="flex items-center gap-2 mb-1">
        {tone === 'coral'
          ? <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color }} />
          : <Clock className="w-4 h-4 flex-shrink-0" style={{ color }} />}
        <h3 className="text-sm font-bold" style={{ color }}>{title}</h3>
      </div>
      {subtitle && (
        <p className="text-xs mb-3 ml-6" style={{ color: 'var(--ink-3)' }}>{subtitle}</p>
      )}
      <div className={`space-y-2 ${subtitle ? '' : 'mt-3'}`}>
        {items.map(c => (
          <div key={c.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
                {KIND_LABEL[c.kind] ?? c.kind}
              </p>
              <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                {fmtDate(c.due_date)} · {relativeDue(c.due_date, today)}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-sm font-bold whitespace-nowrap" style={{ color }}>
                {formatCLP(chargeOutstanding(c))}
              </span>
              <button
                onClick={() => onPay(c)}
                className="text-xs font-bold px-2.5 py-1 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.8)', color }}
              >
                {c.direction === 'in' ? 'Cobré' : 'Pagué'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Lista de cobros ─────────────────────────────────────────────────────────

function ChargeList({ title, subtitle, charges, today, busy, onPay, onEdit, onUnpay, onDelete }: {
  title: string
  subtitle?: string
  charges: Charge[]
  today: string
  busy: boolean
  onPay: (c: Charge) => void
  onEdit: (c: Charge) => void
  onUnpay: (c: Charge) => void
  onDelete: (c: Charge) => void
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
              <div key={c.id} className="px-4 py-3 flex items-center gap-3">
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

                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold whitespace-nowrap"
                     style={{ color: c.direction === 'in' ? '#0F9D6E' : 'var(--ink)' }}>
                    {c.direction === 'in' ? '+' : ''}{formatCLP(chargeTotal(c))}
                  </p>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {status === 'paid' ? (
                    <button
                      onClick={() => onUnpay(c)} disabled={busy}
                      title="Deshacer pago"
                      className="p-1.5 rounded-lg" style={{ color: 'var(--ink-3)' }}
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => onPay(c)} disabled={busy}
                      title={c.direction === 'in' ? 'Marcar cobrado' : 'Marcar pagado'}
                      className="p-1.5 rounded-lg" style={{ color: '#0F9D6E' }}
                    >
                      <Check className="w-4 h-4" strokeWidth={2.5} />
                    </button>
                  )}
                  <button
                    onClick={() => onEdit(c)} disabled={busy}
                    title="Editar"
                    className="p-1.5 rounded-lg" style={{ color: 'var(--ink-3)' }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { if (confirm('¿Eliminar este cobro?')) onDelete(c) }}
                    disabled={busy}
                    title="Eliminar"
                    className="p-1.5 rounded-lg" style={{ color: '#DC2626' }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Ficha de la propiedad ───────────────────────────────────────────────────

function PropertyCard({ property, onEdit }: { property: Property; onEdit: () => void }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>La propiedad</h3>
        <button onClick={onEdit} className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>
          Editar
        </button>
      </div>
      <dl className="space-y-1.5 text-sm">
        {property.property_type && (
          <Row label="Tipo"
            value={property.property_type === 'departamento'
              ? `Departamento${property.unit_number ? ` · ${property.unit_number}` : ''}`
              : property.property_type === 'casa' ? 'Casa' : 'Otro'} />
        )}
        {property.address && <Row label="Dirección" value={property.address} />}
        {(property.comuna || property.region) && (
          <Row label="Comuna" value={[property.comuna, property.region].filter(Boolean).join(', ')} />
        )}
        {property.rol_sii && <Row label="ROL" value={property.rol_sii} />}
        {property.mortgage_amount && (
          <Row label="Dividendo" value={`${formatCLP(property.mortgage_amount)}${
            property.mortgage_due_day ? ` · día ${property.mortgage_due_day}` : ''}`} />
        )}
        {property.mortgage_account_label && (
          <Row label="Se carga a" value={property.mortgage_account_label} />
        )}
        {property.electricity_client_id && (
          <Row label="NHE (luz)" value={property.electricity_client_id} />
        )}
        {property.water_client_id && (
          <Row label="Nº cliente (agua)" value={property.water_client_id} />
        )}
      </dl>
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
          className="p-2.5 rounded-xl" style={{ color: '#DC2626' }}
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
  const [alias, setAlias]         = useState(property?.alias ?? '')
  const [propType, setPropType]   = useState<string>(property?.property_type ?? '')
  const [unitNum, setUnitNum]     = useState(property?.unit_number ?? '')
  const [address, setAddress]     = useState(property?.address ?? '')
  const [region, setRegion]       = useState(property?.region ?? '')
  const [comuna, setComuna]   = useState(property?.comuna ?? '')
  const [rol, setRol]         = useState(property?.rol_sii ?? '')
  const [divAmt, setDivAmt]   = useState(property?.mortgage_amount?.toString() ?? '')
  const [divDay, setDivDay]   = useState(property?.mortgage_due_day?.toString() ?? '')
  const [divAcc, setDivAcc]   = useState(property?.mortgage_account_label ?? '')
  const [elecId, setElecId]   = useState(property?.electricity_client_id ?? '')
  const [waterId, setWaterId] = useState(property?.water_client_id ?? '')

  const comunasDeRegion = region ? (REGIONES_COMUNAS[region] ?? []) : []

  function handleRegion(r: string) {
    setRegion(r)
    setComuna('')  // reset al cambiar región
  }

  return (
    <Modal title={property ? 'Editar propiedad' : 'Nueva propiedad'} backdrop={backdrop} onCancel={onCancel}>
      <form onSubmit={e => {
        e.preventDefault()
        onSave({
          alias,
          propertyType: (propType || null) as 'departamento' | 'casa' | 'otro' | null,
          unitNumber: propType === 'departamento' ? (unitNum || null) : null,
          address: address || null, region: region || null,
          comuna: comuna || null, rolSii: rol || null,
          mortgageAmount: divAmt ? Number(divAmt.replace(/\D/g, '')) : null,
          mortgageDueDay: divDay ? Number(divDay) : null,
          mortgageAccountLabel: divAcc || null,
          electricityClientId: elecId || null,
          waterClientId: waterId || null,
        })
      }}>
        <Field label="Nombre">
          <input className={inputCls} style={inputStyle} value={alias} required
                 onChange={e => setAlias(e.target.value)} placeholder="Depto Santa Victoria" />
        </Field>
        <Field label="Tipo de propiedad">
          <div className="flex gap-2">
            {(['departamento', 'casa', 'otro'] as const).map(t => (
              <button
                key={t} type="button"
                onClick={() => { setPropType(t); if (t !== 'departamento') setUnitNum('') }}
                className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-all capitalize"
                style={propType === t ? {
                  background: 'var(--primary-soft)', color: 'var(--primary)',
                  borderColor: 'var(--primary)',
                } : {
                  background: 'var(--surface)', color: 'var(--ink-2)',
                  borderColor: 'var(--border)',
                }}
              >
                {t === 'departamento' ? 'Depto' : t === 'casa' ? 'Casa' : 'Otro'}
              </button>
            ))}
          </div>
        </Field>
        {propType === 'departamento' && (
          <Field label="Número / piso">
            <input className={inputCls} style={inputStyle} value={unitNum}
                   onChange={e => setUnitNum(e.target.value)} placeholder="Ej. 921, piso 9" />
          </Field>
        )}
        <Field label="Dirección">
          <input className={inputCls} style={inputStyle} value={address}
                 onChange={e => setAddress(e.target.value)} placeholder="Santa Victoria 562, depto 921" />
        </Field>
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
        <Field label="ROL de avalúo" hint="Con este número se consultan los derechos de aseo y las contribuciones.">
          <input className={inputCls} style={inputStyle} value={rol}
                 onChange={e => setRol(e.target.value)} placeholder="105980225" />
        </Field>

        <div className="pt-2 mt-1 mb-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-bold pt-3 mb-3" style={{ color: 'var(--ink-2)' }}>Dividendo</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto mensual">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none" style={{ color: 'var(--ink-3)' }}>$</span>
              <input
                className={inputCls} style={{ ...inputStyle, paddingLeft: '1.5rem' }}
                value={fmtClpInput(divAmt)} inputMode="numeric"
                onChange={e => setDivAmt(e.target.value.replace(/\D/g, ''))}
                placeholder="420.000"
              />
            </div>
          </Field>
          <Field label="Día de cobro">
            <input className={inputCls} style={inputStyle} value={divDay} inputMode="numeric"
                   onChange={e => setDivDay(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="5" />
          </Field>
        </div>
        <Field label="Banco del dividendo" hint="Solo un rótulo. No guardamos números de cuenta.">
          <select className={inputCls} style={inputStyle} value={divAcc} onChange={e => setDivAcc(e.target.value)}>
            <option value="">Sin especificar</option>
            {BANCOS_CHILE.map(b => <option key={b} value={`Cta cte ${b}`}>{b}</option>)}
          </select>
        </Field>

        <div className="pt-2 mt-1 mb-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-bold pt-3 mb-1" style={{ color: 'var(--ink-2)' }}>Cuentas de servicios</p>
          <p className="text-xs mb-3" style={{ color: 'var(--ink-3)' }}>Para futura descarga automática de boletas</p>
        </div>
        <Field label="NHE — Número de Medidor (luz)">
          <input className={inputCls} style={inputStyle} value={elecId}
                 onChange={e => setElecId(e.target.value)} placeholder="Ej. 123456789" />
        </Field>
        <Field label="Número de cliente (agua)">
          <input className={inputCls} style={inputStyle} value={waterId}
                 onChange={e => setWaterId(e.target.value)} placeholder="Ej. 9876543" />
        </Field>

        {error && <p className="text-sm mb-2" style={{ color: '#DC2626' }}>{error}</p>}
        <Actions
          busy={busy} onCancel={onCancel} submitLabel="Guardar"
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

        {error && <p className="text-sm mb-2" style={{ color: '#DC2626' }}>{error}</p>}
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
          <input className={inputCls} style={inputStyle} value={base} inputMode="numeric" required
                 onChange={e => setBase(e.target.value.replace(/\D/g, ''))} placeholder="14330" />
        </Field>

        {error && <p className="text-sm mb-2" style={{ color: '#DC2626' }}>{error}</p>}
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
  onPay: (date: string, amount: number) => void
}) {
  const total = chargeTotal(charge)
  const [date, setDate]     = useState(today)
  const [amount, setAmount] = useState(total.toString())

  const isIncome = charge.direction === 'in'
  const partial  = Number(amount || 0) < total

  return (
    <Modal
      title={isIncome ? 'Registrar cobro' : 'Registrar pago'}
      backdrop={backdrop} onCancel={onCancel}
    >
      <form onSubmit={e => { e.preventDefault(); onPay(date, Number(amount || 0)) }}>
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

        {error && <p className="text-sm mb-2" style={{ color: '#DC2626' }}>{error}</p>}
        <Actions busy={busy} onCancel={onCancel} submitLabel={isIncome ? 'Registrar' : 'Pagar'} />
      </form>
    </Modal>
  )
}
