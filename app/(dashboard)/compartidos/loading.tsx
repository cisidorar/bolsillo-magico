'use client'

import { useSearchParams } from 'next/navigation'

// Esqueleto de /compartidos. Con las medidas reales de la página (escritorio, 1456 px), para que al cargar no haya salto:
//   encabezado de 60 (título 36 + bajada 20) · toggle 230×40 + «Nuevo viaje» 132×40
//   → viaje principal en azul de 260 de alto, a todo el ancho (con un solo viaje no hay columna lateral)
// Tres variantes, elegidas por la URL: el detalle de un viaje (?g=) tiene el suyo más abajo, y la pestaña
// «Por cobrar» (?tab=cobrar) es una sola tarjeta angosta.
const bone = { background: 'var(--surface-2)' }
const onBrand = (a: number) => ({ background: `rgba(255,255,255,${a})` })

/** Título, bajada y, a la derecha, el toggle Viajes / Por cobrar con su botón. */
function ListHeader({ action = true }: { action?: boolean }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex items-center" style={{ height: 36 }}><div className="rounded-xl" style={{ ...bone, width: 190, height: 28 }} /></div>
        <div className="flex items-center mt-1" style={{ height: 20 }}><div className="rounded-md max-w-full" style={{ ...bone, width: 'min(430px, 100%)', height: 13 }} /></div>
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <div className="rounded-xl" style={{ ...bone, width: 230, height: 40 }} />
        {action && <div className="rounded-xl" style={{ ...bone, width: 132, height: 40 }} />}
      </div>
    </div>
  )
}

function TripListLoading() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 space-y-6 animate-pulse" aria-busy="true" aria-label="Cargando viajes">
      <ListHeader />

      {/* Viaje principal: nombre + fechas · «Por saldar» · título grande + línea · flecha */}
      <div className="hero-gradient rounded-3xl p-6 lg:p-8 flex flex-col justify-between gap-8 min-h-[220px] lg:min-h-[260px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center" style={{ height: 36 }}><div className="rounded-xl" style={{ ...onBrand(0.28), width: 150, height: 28 }} /></div>
            <div className="flex items-center mt-1" style={{ height: 20 }}><div className="rounded-md" style={{ ...onBrand(0.2), width: 150, height: 13 }} /></div>
          </div>
          <div className="rounded-full flex-shrink-0" style={{ ...onBrand(0.2), width: 73, height: 24 }} />
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center" style={{ height: 48 }}><div className="rounded-xl" style={{ ...onBrand(0.28), width: 'min(420px, 66vw)', height: 40 }} /></div>
            <div className="flex items-center mt-2" style={{ height: 20 }}><div className="rounded-md" style={{ ...onBrand(0.2), width: 'min(250px, 50vw)', height: 13 }} /></div>
          </div>
          <div className="w-11 h-11 rounded-full flex-shrink-0" style={onBrand(0.18)} />
        </div>
      </div>
    </div>
  )
}

/** Pestaña «Por cobrar»: una tarjeta angosta con las filas de lo que te deben. */
function ReceivablesLoading() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 space-y-6 animate-pulse" aria-busy="true" aria-label="Cargando lo que te deben">
      <ListHeader action={false} />
      <div className="card p-4 lg:max-w-xl space-y-1">
        <div className="px-1 pb-2" style={{ height: 28 }}><div className="rounded-md" style={{ ...bone, width: 120, height: 14 }} /></div>
        {[0, 1, 2].map(i => (
          <div key={i} className="flex items-center gap-3 px-1" style={{ height: 64 }}>
            <div className="w-11 h-11 rounded-full flex-shrink-0" style={bone} />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="rounded-md" style={{ ...bone, width: '45%', height: 14 }} />
              <div className="rounded-md" style={{ ...bone, width: '65%', height: 12 }} />
            </div>
            <div className="rounded-md flex-shrink-0" style={{ ...bone, width: 70, height: 16 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Esqueleto del detalle de un viaje (SharedTripView), con la forma y alturas reales:
 *   «‹ Compartidos» → encabezado azul (nombre + fechas · título grande + línea + avatares)
 *   → columna principal (cuadratura, resumen, gastos por día) + columna de Personas de 340 px.
 * Se mantiene entero el orden de los bloques para que al llegar el contenido no haya salto.
 */
function Card({ h, children, className = '' }: { h?: number; children?: React.ReactNode; className?: string }) {
  return <div className={`card ${className}`} style={h ? { minHeight: h } : undefined}>{children}</div>
}

function ExpenseRow() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5" style={{ height: 56 }}>
      <div className="w-9 h-9 rounded-xl flex-shrink-0" style={bone} />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="rounded-md" style={{ ...bone, width: '42%', height: 14 }} />
        <div className="rounded-md" style={{ ...bone, width: '62%', height: 11 }} />
      </div>
      <div className="rounded-md flex-shrink-0" style={{ ...bone, width: 62, height: 14 }} />
    </div>
  )
}

function DayGroup({ rows }: { rows: number }) {
  return (
    <div>
      <div className="flex items-center justify-between px-1 mb-2" style={{ height: 20 }}>
        <div className="rounded-md" style={{ ...bone, width: 86, height: 14 }} />
        {rows > 1 && <div className="rounded-md" style={{ ...bone, width: 56, height: 12 }} />}
      </div>
      <div className="card-flat p-1.5 space-y-0.5">
        {Array.from({ length: rows }).map((_, i) => <ExpenseRow key={i} />)}
      </div>
    </div>
  )
}

function PersonRow() {
  return (
    <div className="flex items-center gap-3" style={{ height: 40 }}>
      <div className="w-8 h-8 rounded-full flex-shrink-0" style={bone} />
      <div className="space-y-1.5">
        <div className="rounded-md" style={{ ...bone, width: 84, height: 13 }} />
        <div className="rounded-md" style={{ ...bone, width: 60, height: 10 }} />
      </div>
    </div>
  )
}

function TripDetailLoading() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 space-y-5 animate-pulse" aria-busy="true" aria-label="Cargando el viaje">
      {/* Volver */}
      <div className="rounded-md" style={{ ...bone, width: 96, height: 14, marginTop: 4 }} />

      {/* Encabezado azul */}
      <div className="hero-gradient rounded-3xl p-5 lg:p-7 flex flex-col justify-between min-h-[196px] lg:min-h-[213px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="rounded-xl" style={{ ...onBrand(0.28), width: 150, height: 30 }} />
            <div className="rounded-md mt-2" style={{ ...onBrand(0.2), width: 190, height: 14 }} />
          </div>
          <div className="w-11 h-11 rounded-full flex-shrink-0" style={onBrand(0.18)} />
        </div>
        <div className="mt-8 lg:mt-10 flex items-end justify-between gap-4">
          <div>
            <div className="rounded-xl" style={{ ...onBrand(0.28), width: 'min(340px, 64vw)', height: 44 }} />
            <div className="rounded-md mt-3" style={{ ...onBrand(0.2), width: 'min(280px, 56vw)', height: 14 }} />
          </div>
          <div className="flex flex-shrink-0">
            <div className="w-9 h-9 rounded-full" style={onBrand(0.28)} />
            <div className="w-9 h-9 rounded-full" style={{ ...onBrand(0.22), marginLeft: -10 }} />
          </div>
        </div>
      </div>

      <div className="lg:grid lg:gap-6 lg:items-start space-y-5 lg:space-y-0" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px' }}>
        {/* Columna principal */}
        <div className="space-y-5 min-w-0">
          {/* Cuadratura: banda con el estado, dos columnas y la transferencia */}
          <Card className="overflow-hidden">
            <div className="px-5 py-4" style={{ background: 'var(--surface-2)' }}>
              <div className="rounded-lg" style={{ ...bone, background: 'var(--surface)', width: 190, height: 26 }} />
            </div>
            <div className="grid grid-cols-2 gap-4 p-4">
              {[0, 1].map(c => (
                <div key={c} className="space-y-2.5">
                  <div className="rounded-md" style={{ ...bone, width: 70, height: 12 }} />
                  {[0, 1].map(r => (
                    <div key={r} className="flex justify-between gap-2">
                      <div className="rounded-md" style={{ ...bone, width: 56, height: 14 }} />
                      <div className="rounded-md" style={{ ...bone, width: 70, height: 14 }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="px-4 pb-4">
              <div className="rounded-xl" style={{ ...bone, height: 58 }} />
            </div>
          </Card>

          {/* Resumen del viaje */}
          <Card className="p-5 space-y-4">
            <div className="rounded-md" style={{ ...bone, width: 130, height: 14 }} />
            <div className="rounded-md" style={{ ...bone, width: 240, height: 14 }} />
            <div className="space-y-3.5 pt-1">
              {[100, 62, 38, 18].map(w => (
                <div key={w}>
                  <div className="flex justify-between gap-2 mb-1.5">
                    <div className="rounded-md" style={{ ...bone, width: 90, height: 14 }} />
                    <div className="rounded-md" style={{ ...bone, width: 110, height: 14 }} />
                  </div>
                  <div className="rounded-full" style={{ ...bone, width: `${w}%`, height: 6 }} />
                </div>
              ))}
            </div>
          </Card>

          {/* Gastos del viaje, por día */}
          <Card className="p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="rounded-md" style={{ ...bone, width: 120, height: 14 }} />
                <div className="rounded-md" style={{ ...bone, width: 190, height: 12 }} />
              </div>
              <div className="rounded-xl flex-shrink-0" style={{ ...bone, width: 84, height: 40 }} />
            </div>
            <DayGroup rows={2} />
            <DayGroup rows={1} />
            <DayGroup rows={3} />
          </Card>
        </div>

        {/* Columna lateral: Personas y reparto */}
        <div className="space-y-5">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between" style={{ height: 28 }}>
              <div className="rounded-md" style={{ ...bone, width: 76, height: 14 }} />
              <div className="rounded-md" style={{ ...bone, width: 110, height: 14 }} />
            </div>
            <PersonRow />
            <PersonRow />
            <div className="rounded-xl" style={{ ...bone, height: 44 }} />
            <div className="flex gap-2 pt-1">
              <div className="rounded-full" style={{ ...bone, width: 108, height: 40 }} />
              <div className="rounded-full" style={{ ...bone, width: 170, height: 40 }} />
            </div>
            <div className="rounded-full" style={{ ...bone, height: 10 }} />
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function Loading() {
  const params = useSearchParams()
  if (params.get('g')) return <TripDetailLoading />
  return params.get('tab') === 'cobrar' ? <ReceivablesLoading /> : <TripListLoading />
}
