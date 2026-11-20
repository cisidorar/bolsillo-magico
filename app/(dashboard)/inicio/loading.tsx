// Esqueleto de /inicio. Replica la estructura REAL de page.tsx con las alturas reales
// (en px, calculadas desde las clases de la página y de ExpenseList / CicloSueldo /
// BudgetBarDetail) para que al cargar no haya salto:
//   desktop → encabezado · hero azul · grilla 1fr 1fr 310px
//             (Últimos gastos | Por categoría | Ciclo de sueldo + Próximos pagos)
//   mobile  → hero · Ciclo de sueldo · Por categoría · Últimos gastos · Próximos pagos
// Si cambias el padding o la tipografía de una fila en page.tsx, cambia su altura acá.
const bone = { background: 'var(--surface-2)' }
const onBrand = (a: number) => ({ background: `rgba(255,255,255,${a})` })

/** Hueso de texto: la caja ocupa la altura de la línea real y la barra (más baja) queda centrada. */
function Line({ w, h, bar = 12, className = '', brand }: { w: number | string; h: number; bar?: number; className?: string; brand?: number }) {
  return (
    <div className={`flex items-center ${className}`} style={{ height: h }}>
      <div className="rounded-md" style={{ ...(brand ? onBrand(brand) : bone), width: w, height: bar }} />
    </div>
  )
}

/** Fila de lista con altura fija (la que tiene la fila real). */
function Row({ h, icon, trailing = 64, className = '' }: { h: number; icon: number; trailing?: number | null; className?: string }) {
  return (
    <div className={`flex items-center gap-3 px-4 ${className}`} style={{ height: h }}>
      <div className="rounded-xl flex-shrink-0" style={{ ...bone, width: icon, height: icon }} />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="rounded-md" style={{ ...bone, width: '55%', height: 13 }} />
        <div className="rounded-md" style={{ ...bone, width: '35%', height: 10 }} />
      </div>
      {trailing && <div className="rounded-md flex-shrink-0" style={{ ...bone, width: trailing, height: 14 }} />}
    </div>
  )
}

/** Fila de categoría: ícono + (nombre · monto) + barra + estado. */
function CategoryRow({ h, icon }: { h: number; icon: number }) {
  return (
    <div className="flex items-center gap-3 px-4" style={{ height: h }}>
      <div className="rounded-xl flex-shrink-0" style={{ ...bone, width: icon, height: icon }} />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="rounded-md" style={{ ...bone, width: '40%', height: 13 }} />
          <div className="rounded-md" style={{ ...bone, width: 64, height: 13 }} />
        </div>
        <div className="rounded-full" style={{ ...bone, width: '100%', height: 6 }} />
      </div>
    </div>
  )
}

function SectionHead({ w, h = 20, link = 60 }: { w: number; h?: number; link?: number | null }) {
  return (
    <div className="flex items-center justify-between mb-2.5" style={{ height: h }}>
      <div className="rounded-md" style={{ ...bone, width: w, height: 14 }} />
      {link && <div className="rounded-md" style={{ ...bone, width: link, height: 13 }} />}
    </div>
  )
}

/** Ciclo de sueldo: encabezado 48 · filas (sueldo, tarjeta, invertido, débito) · pie "Queda para ahorro" 52. */
function CicloSueldoSkeleton() {
  const rows = [20, 52, 35, 35]
  return (
    <div className="card-flat overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3" style={{ height: 48 }}>
        <div className="flex items-center gap-2">
          <div className="rounded-md" style={{ ...bone, width: 14, height: 14 }} />
          <div className="rounded-md" style={{ ...bone, width: 96, height: 14 }} />
        </div>
        <div className="rounded-md" style={{ ...bone, width: 56, height: 10 }} />
      </div>
      <div className="px-4 pb-3 space-y-2.5">
        {rows.map((h, i) => (
          <div key={i} className="flex items-center justify-between" style={{ height: h }}>
            <div className="flex items-center gap-2">
              <div className="rounded-md" style={{ ...bone, width: i === 1 ? 20 : 14, height: i === 1 ? 20 : 14 }} />
              <div className="space-y-1.5">
                <div className="rounded-md" style={{ ...bone, width: 96, height: 13 }} />
                {i > 0 && <div className="rounded-md" style={{ ...bone, width: 72, height: 10 }} />}
              </div>
            </div>
            <div className="rounded-md" style={{ ...bone, width: 72, height: 14 }} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-4" style={{ ...bone, height: 52 }}>
        <div className="rounded-md" style={{ background: 'var(--surface)', width: 130, height: 14 }} />
        <div className="rounded-md" style={{ background: 'var(--surface)', width: 80, height: 16 }} />
      </div>
    </div>
  )
}

export default function LoadingInicio() {
  return (
    <div className="px-4 lg:px-8 pt-2 lg:pt-6 pb-2 animate-pulse" aria-busy="true" aria-label="Cargando inicio">

      {/* ══════════ DESKTOP ══════════ */}

      {/* Encabezado: saludo (32) + fecha (2 + 20) · badges de sueldo y mes (36) */}
      <div className="hidden lg:flex items-center justify-between mb-5" style={{ height: 54 }}>
        <div>
          <Line w={260} h={32} bar={22} />
          <Line w={180} h={20} bar={13} className="mt-0.5" />
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl" style={{ ...bone, width: 150, height: 36 }} />
          <div className="rounded-xl" style={{ ...bone, width: 120, height: 36 }} />
        </div>
      </div>

      {/* Hero azul: py-7 · fila superior 116 · barra 28+12+8+16 · fila inferior 40+40 */}
      <div className="hidden lg:block mb-5">
        <div className="hero-gradient rounded-3xl px-8 py-7 flex flex-col">
          <div className="flex items-start justify-between gap-6">
            <div>
              <Line w={112} h={20} bar={14} brand={0.22} />
              <div className="rounded-xl mt-2" style={{ ...onBrand(0.28), width: 288, height: 60 }} />
              <Line w={176} h={20} bar={14} brand={0.2} className="mt-2" />
            </div>
            <div className="flex flex-col items-end">
              <Line w={80} h={20} bar={14} brand={0.22} className="mb-2" />
              <div className="rounded-lg" style={{ ...onBrand(0.28), width: 144, height: 30 }} />
            </div>
          </div>
          <div className="mt-7">
            <div className="rounded-full" style={{ ...onBrand(0.18), height: 12 }} />
            <div className="flex justify-between mt-2" style={{ height: 16 }}>
              <div className="rounded" style={{ ...onBrand(0.2), width: 160, height: 12 }} />
              <div className="rounded" style={{ ...onBrand(0.2), width: 96, height: 12 }} />
            </div>
          </div>
          <div className="flex items-center gap-6 mt-5 pt-5">
            <div>
              <Line w={80} h={16} bar={12} brand={0.2} />
              <Line w={112} h={20} bar={16} brand={0.28} className="mt-1" />
            </div>
            <div className="w-px h-8" style={onBrand(0.14)} />
            <div>
              <Line w={64} h={16} bar={12} brand={0.2} />
              <Line w={128} h={20} bar={16} brand={0.28} className="mt-1" />
            </div>
          </div>
        </div>
      </div>

      {/* Grilla de 3 columnas */}
      <div className="hidden lg:grid gap-5 items-start" style={{ gridTemplateColumns: '1fr 1fr 310px' }}>
        {/* Últimos gastos: filas de 67,5 */}
        <div>
          <SectionHead w={110} h={28} link={70} />
          <div className="card-flat overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => <Row key={i} h={67.5} icon={32} />)}
          </div>
        </div>

        {/* Por categoría: filas de 75,5 */}
        <div>
          <SectionHead w={100} h={38.5} link={82} />
          <div className="card-flat overflow-hidden">
            {Array.from({ length: 7 }).map((_, i) => <CategoryRow key={i} h={75.5} icon={36} />)}
          </div>
        </div>

        {/* Ciclo de sueldo + Próximos pagos */}
        <div className="space-y-4">
          <CicloSueldoSkeleton />
          <div className="card-flat p-4">
            <div className="flex items-center justify-between mb-3" style={{ height: 20 }}>
              <div className="rounded-md" style={{ ...bone, width: 110, height: 14 }} />
              <div className="rounded-md" style={{ ...bone, width: 56, height: 12 }} />
            </div>
            <div className="space-y-3.5">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-3" style={{ height: 36 }}>
                  <div className="rounded-xl flex-shrink-0" style={{ ...bone, width: 36, height: 36 }} />
                  <div className="flex-1 space-y-1.5">
                    <div className="rounded-md" style={{ ...bone, width: '55%', height: 13 }} />
                    <div className="rounded-md" style={{ ...bone, width: '40%', height: 10 }} />
                  </div>
                  <div className="rounded-md" style={{ ...bone, width: 56, height: 14 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════ MOBILE ══════════ */}
      <div className="lg:hidden space-y-4">

        {/* Hero: pt-5 pb-4 · saludo 24+16 · cifras 78 · barra 16+8+6+16 · chips 68,5 */}
        <div className="hero-gradient rounded-3xl px-5 pt-5 pb-4 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-4" style={{ height: 24 }}>
            <div className="rounded" style={{ ...onBrand(0.28), width: 144, height: 16 }} />
            <div className="rounded-full" style={{ ...onBrand(0.15), width: 96, height: 24 }} />
          </div>
          <div className="flex items-start justify-between gap-3 mb-1">
            <div>
              <Line w={96} h={16} bar={12} brand={0.22} className="mb-1" />
              <div className="rounded-lg" style={{ ...onBrand(0.28), width: 176, height: 36 }} />
              <Line w={144} h={16} bar={12} brand={0.2} className="mt-1.5" />
            </div>
            <div className="flex flex-col items-end">
              <Line w={64} h={16} bar={12} brand={0.22} className="mb-1" />
              <div className="rounded-md" style={{ ...onBrand(0.28), width: 96, height: 24 }} />
            </div>
          </div>
          <div className="mt-4 mb-4">
            <div className="rounded-full" style={{ ...onBrand(0.15), height: 8 }} />
            <div className="flex justify-between mt-1.5" style={{ height: 16 }}>
              <div className="rounded" style={{ ...onBrand(0.2), width: 80, height: 12 }} />
              <div className="rounded" style={{ ...onBrand(0.2), width: 96, height: 12 }} />
            </div>
          </div>
          <div className="flex gap-2 mt-1">
            {[0, 1].map(i => (
              <div key={i} className="flex-1 rounded-2xl px-4 py-3" style={onBrand(0.15)}>
                <Line w={64} h={16.5} bar={12} brand={0.22} className="mb-1" />
                <div className="rounded" style={{ ...onBrand(0.28), width: 80, height: 24 }} />
              </div>
            ))}
          </div>
        </div>

        {/* Ciclo de sueldo */}
        <CicloSueldoSkeleton />

        {/* Por categoría: filas de 77,5 */}
        <div>
          <SectionHead w={100} h={38.5} link={82} />
          <div className="card-flat overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => <CategoryRow key={i} h={77.5} icon={40} />)}
          </div>
        </div>

        {/* Últimos gastos: filas de 63,5 */}
        <div>
          <SectionHead w={110} link={60} />
          <div className="card-flat overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => <Row key={i} h={63.5} icon={36} />)}
          </div>
        </div>

        {/* Próximos pagos: filas de 61,5 */}
        <div>
          <SectionHead w={120} link={90} />
          <div className="card-flat overflow-hidden">
            {Array.from({ length: 3 }).map((_, i) => <Row key={i} h={61.5} icon={32} />)}
          </div>
        </div>
      </div>
    </div>
  )
}
