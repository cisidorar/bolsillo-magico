// Esqueleto de /inicio. Replica la estructura REAL de page.tsx (mismos
// contenedores, paddings y alturas de fila) para que al cargar no haya salto:
//   desktop → encabezado · hero azul · grilla 1fr 1fr 310px
//             (Últimos gastos | Por categoría | Ciclo de sueldo + Próximos pagos)
//   mobile  → hero · Ciclo de sueldo · Por categoría · Últimos gastos · Próximos pagos
// Mantener alineado con app/(dashboard)/inicio/page.tsx.
const bone = { background: 'var(--surface-2)' }
const onBrand = (a: number) => ({ background: `rgba(255,255,255,${a})` })

function Bar({ w, h = 12, className = '', style }: { w: number | string; h?: number; className?: string; style?: React.CSSProperties }) {
  return <div className={`rounded-md ${className}`} style={{ ...bone, width: w, height: h, ...style }} />
}

/** Fila de lista: ícono + 2 líneas + monto (mismas medidas que RecentRows/CategoryRows/ProximosPagos). */
function ListRow({ icon, pad, trailing = true }: { icon: number; pad: string; trailing?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 ${pad}`}>
      <div className="rounded-xl flex-shrink-0" style={{ ...bone, width: icon, height: icon }} />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Bar w="55%" h={13} />
        <Bar w="35%" h={10} />
      </div>
      {trailing && <Bar w={64} h={14} />}
    </div>
  )
}

/** Fila de categoría: ícono + (nombre · monto) + barra de progreso + estado. */
function CategoryRow({ icon, pad }: { icon: number; pad: string }) {
  return (
    <div className={`flex items-center gap-3 px-4 ${pad}`}>
      <div className="rounded-xl flex-shrink-0" style={{ ...bone, width: icon, height: icon }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <Bar w="40%" h={13} />
          <Bar w={64} h={13} />
        </div>
        <Bar w="100%" h={6} className="rounded-full mb-1.5" />
        <Bar w="30%" h={10} />
      </div>
    </div>
  )
}

const DIVIDED = '[&>*+*]:border-t [&>*+*]:border-[color-mix(in_srgb,var(--border)_55%,transparent)]'

function SectionHead({ w, link = 60 }: { w: number; link?: number | null }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <Bar w={w} h={14} />
      {link && <Bar w={link} h={13} />}
    </div>
  )
}

function CicloSueldoSkeleton() {
  return (
    <div className="card-flat overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Bar w={14} h={14} />
          <Bar w={96} h={14} />
        </div>
        <Bar w={56} h={10} />
      </div>
      <div className="px-4 pb-3 space-y-2.5">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bar w={14} h={14} />
              <div className="space-y-1.5">
                <Bar w={96} h={13} />
                <Bar w={72} h={10} />
              </div>
            </div>
            <Bar w={72} h={14} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LoadingInicio() {
  return (
    <div className="px-4 lg:px-8 pt-2 lg:pt-6 pb-2 animate-pulse" aria-busy="true" aria-label="Cargando inicio">

      {/* ══════════ DESKTOP ══════════ */}

      {/* Encabezado: saludo + fecha · badges de sueldo y mes */}
      <div className="hidden lg:flex items-center justify-between mb-5">
        <div>
          <Bar w={260} h={24} className="rounded-lg mb-2" />
          <Bar w={180} h={14} />
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl" style={{ ...bone, width: 150, height: 36 }} />
          <div className="rounded-xl" style={{ ...bone, width: 120, height: 36 }} />
        </div>
      </div>

      {/* Hero azul */}
      <div className="hidden lg:block mb-5">
        <div className="hero-gradient rounded-3xl px-8 py-7 flex flex-col justify-between" style={{ minHeight: 190 }}>
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="h-3.5 w-28 rounded mb-2" style={onBrand(0.22)} />
              <div className="h-14 w-72 rounded-xl" style={onBrand(0.28)} />
              <div className="h-3.5 w-44 rounded mt-3" style={onBrand(0.2)} />
            </div>
            <div className="flex flex-col items-end">
              <div className="h-3.5 w-20 rounded mb-2" style={onBrand(0.22)} />
              <div className="h-8 w-36 rounded-lg" style={onBrand(0.28)} />
            </div>
          </div>
          <div className="mt-7">
            <div className="h-3 rounded-full" style={onBrand(0.18)} />
            <div className="flex justify-between mt-2">
              <div className="h-3 w-40 rounded" style={onBrand(0.2)} />
              <div className="h-3 w-24 rounded" style={onBrand(0.2)} />
            </div>
          </div>
          <div className="flex items-center gap-6 mt-5 pt-5">
            <div>
              <div className="h-3 w-20 rounded mb-2" style={onBrand(0.2)} />
              <div className="h-4 w-28 rounded" style={onBrand(0.28)} />
            </div>
            <div className="w-px h-8" style={onBrand(0.14)} />
            <div>
              <div className="h-3 w-16 rounded mb-2" style={onBrand(0.2)} />
              <div className="h-4 w-32 rounded" style={onBrand(0.28)} />
            </div>
          </div>
        </div>
      </div>

      {/* Grilla de 3 columnas */}
      <div className="hidden lg:grid gap-5 items-start" style={{ gridTemplateColumns: '1fr 1fr 310px' }}>
        {/* Últimos gastos */}
        <div>
          <SectionHead w={110} link={70} />
          <div className={`card-flat overflow-hidden ${DIVIDED}`}>
            {Array.from({ length: 8 }).map((_, i) => <ListRow key={i} icon={32} pad="py-3.5" />)}
          </div>
        </div>

        {/* Por categoría */}
        <div>
          <SectionHead w={100} link={82} />
          <div className={`card-flat overflow-hidden ${DIVIDED}`}>
            {Array.from({ length: 7 }).map((_, i) => <CategoryRow key={i} icon={36} pad="py-4" />)}
          </div>
        </div>

        {/* Ciclo de sueldo + Próximos pagos */}
        <div className="space-y-4">
          <CicloSueldoSkeleton />
          <div className="card-flat p-4">
            <div className="flex items-center justify-between mb-3">
              <Bar w={110} h={14} />
              <Bar w={56} h={12} />
            </div>
            <div className="space-y-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-3 rounded-2xl px-3 py-3" style={bone}>
                  <div className="rounded-xl flex-shrink-0" style={{ background: 'var(--surface)', width: 36, height: 36 }} />
                  <div className="flex-1 space-y-1.5">
                    <div className="rounded-md" style={{ background: 'var(--surface)', width: '55%', height: 13 }} />
                    <div className="rounded-md" style={{ background: 'var(--surface)', width: '40%', height: 10 }} />
                  </div>
                  <div className="rounded-md" style={{ background: 'var(--surface)', width: 56, height: 14 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════ MOBILE ══════════ */}
      <div className="lg:hidden space-y-4">

        {/* Hero */}
        <div className="hero-gradient rounded-3xl px-5 pt-5 pb-4 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="h-4 w-36 rounded" style={onBrand(0.28)} />
            <div className="h-6 w-24 rounded-full" style={onBrand(0.15)} />
          </div>
          <div className="flex items-start justify-between gap-3 mb-1">
            <div>
              <div className="h-3 w-24 rounded mb-2" style={onBrand(0.22)} />
              <div className="h-9 w-44 rounded-lg" style={onBrand(0.28)} />
              <div className="h-3 w-36 rounded mt-2" style={onBrand(0.2)} />
            </div>
            <div className="flex flex-col items-end">
              <div className="h-3 w-16 rounded mb-2" style={onBrand(0.22)} />
              <div className="h-6 w-24 rounded-md" style={onBrand(0.28)} />
            </div>
          </div>
          <div className="mt-4 mb-4">
            <div className="h-2 rounded-full" style={onBrand(0.15)} />
            <div className="flex justify-between mt-1.5">
              <div className="h-3 w-20 rounded" style={onBrand(0.2)} />
              <div className="h-3 w-24 rounded" style={onBrand(0.2)} />
            </div>
          </div>
          <div className="flex gap-2 mt-1">
            {[0, 1].map(i => (
              <div key={i} className="flex-1 rounded-2xl px-4 py-3" style={onBrand(0.15)}>
                <div className="h-3 w-16 rounded mb-2" style={onBrand(0.22)} />
                <div className="h-5 w-20 rounded" style={onBrand(0.28)} />
              </div>
            ))}
          </div>
        </div>

        {/* Ciclo de sueldo */}
        <CicloSueldoSkeleton />

        {/* Por categoría */}
        <div>
          <SectionHead w={100} link={82} />
          <div className={`card-flat overflow-hidden ${DIVIDED}`}>
            {Array.from({ length: 5 }).map((_, i) => <CategoryRow key={i} icon={40} pad="py-3.5" />)}
          </div>
        </div>

        {/* Últimos gastos */}
        <div>
          <SectionHead w={110} link={60} />
          <div className={`card-flat overflow-hidden ${DIVIDED}`}>
            {Array.from({ length: 6 }).map((_, i) => <ListRow key={i} icon={36} pad="py-3" />)}
          </div>
        </div>

        {/* Próximos pagos */}
        <div>
          <SectionHead w={120} link={90} />
          <div className={`card-flat overflow-hidden ${DIVIDED}`}>
            {Array.from({ length: 3 }).map((_, i) => <ListRow key={i} icon={32} pad="py-3" />)}
          </div>
        </div>
      </div>
    </div>
  )
}
