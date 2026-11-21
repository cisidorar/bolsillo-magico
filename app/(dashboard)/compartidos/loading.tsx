// Esqueleto de /compartidos (pestaña Viajes). Replica page.tsx + components/TripList.tsx con sus
// alturas reales para que al cargar no haya salto:
//   encabezado (título 36 + bajada 20 · toggle + "Nuevo viaje" 40)
//   → viaje principal en azul (min 260 en escritorio, 220 en celular)
//   → columna derecha: "Otros viajes" y "Anteriores" (tarjetas p-2, filas de 64)
// Una sola loading.tsx cubre también el detalle de un viaje (?g=), que no se puede distinguir acá.
const bone = { background: 'var(--surface-2)' }
const onBrand = (a: number) => ({ background: `rgba(255,255,255,${a})` })

function Row({ amount = true }: { amount?: boolean }) {
  return (
    <div className="flex items-center gap-3.5 px-3 py-3" style={{ height: 64 }}>
      <div className="w-12 h-12 rounded-xl flex-shrink-0" style={bone} />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="rounded-md" style={{ ...bone, width: '50%', height: 14 }} />
        <div className="rounded-md" style={{ ...bone, width: '70%', height: 12 }} />
      </div>
      {amount && (
        <div className="space-y-1.5 flex-shrink-0 flex flex-col items-end">
          <div className="rounded-md" style={{ ...bone, width: 64, height: 14 }} />
          <div className="rounded-md" style={{ ...bone, width: 48, height: 11 }} />
        </div>
      )}
    </div>
  )
}

function SideCard({ title, rows }: { title: number; rows: number }) {
  return (
    <div className="card p-2">
      <div className="px-3 pt-3 pb-1" style={{ height: 36 }}>
        <div className="rounded-md" style={{ ...bone, width: title, height: 14 }} />
      </div>
      {Array.from({ length: rows }).map((_, i) => <Row key={i} amount={i === 0} />)}
    </div>
  )
}

export default function Loading() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 space-y-6 animate-pulse" aria-busy="true" aria-label="Cargando viajes">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="rounded-xl" style={{ ...bone, width: 200, height: 32 }} />
          <div className="rounded-lg mt-2.5 max-w-full" style={{ ...bone, width: 380, height: 14 }} />
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <div className="rounded-xl" style={{ ...bone, width: 176, height: 40 }} />
          <div className="rounded-xl" style={{ ...bone, width: 132, height: 40 }} />
        </div>
      </div>

      {/* Viaje principal + columna lateral */}
      <div className="lg:grid lg:gap-6 lg:items-start space-y-5 lg:space-y-0" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)' }}>
        <div className="hero-gradient rounded-3xl p-6 lg:p-8 flex flex-col justify-between gap-8 min-h-[220px] lg:min-h-[260px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="rounded-xl" style={{ ...onBrand(0.28), width: 220, height: 30 }} />
              <div className="rounded-md mt-2.5" style={{ ...onBrand(0.2), width: 170, height: 14 }} />
            </div>
            <div className="rounded-full flex-shrink-0" style={{ ...onBrand(0.18), width: 76, height: 26 }} />
          </div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="rounded-xl" style={{ ...onBrand(0.28), width: 'min(320px, 62vw)', height: 44 }} />
              <div className="rounded-md mt-3" style={{ ...onBrand(0.2), width: 190, height: 14 }} />
            </div>
            <div className="w-11 h-11 rounded-full flex-shrink-0" style={onBrand(0.18)} />
          </div>
        </div>

        <div className="space-y-5">
          <SideCard title={96} rows={2} />
          <SideCard title={84} rows={1} />
        </div>
      </div>
    </div>
  )
}
