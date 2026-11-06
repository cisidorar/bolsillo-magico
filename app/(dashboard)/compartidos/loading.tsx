// Espeja "Por cobrar" (nov 2026): lista de personas a la izquierda, detalle
// a la derecha — ya no el viejo listado de viajes (ver PorCobrarView.tsx).
export default function Loading() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 animate-pulse">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="space-y-2">
          <div className="h-8 w-40 rounded-xl" style={{ background: 'var(--surface-2)' }} />
          <div className="h-4 w-64 rounded-lg" style={{ background: 'var(--surface-2)' }} />
        </div>
      </div>

      <div className="flex justify-end mb-5">
        <div className="h-8 w-48 rounded-xl" style={{ background: 'var(--surface-2)' }} />
      </div>

      <div className="space-y-5 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start lg:space-y-0">
        {/* Lista */}
        <div className="card overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="h-3.5 w-28 rounded" style={{ background: 'var(--surface-2)' }} />
                <div className="h-3 w-40 rounded" style={{ background: 'var(--surface-2)' }} />
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <div className="h-3.5 w-16 rounded" style={{ background: 'var(--surface-2)' }} />
                <div className="h-3 w-10 rounded-full" style={{ background: 'var(--surface-2)' }} />
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 px-4 py-4">
            <div className="h-3 w-40 rounded" style={{ background: 'var(--surface-2)' }} />
            <div className="h-5 w-20 rounded" style={{ background: 'var(--surface-2)' }} />
          </div>
        </div>

        {/* Detalle */}
        <div className="card p-5 lg:p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="h-5 w-32 rounded" style={{ background: 'var(--surface-2)' }} />
              <div className="h-3 w-48 rounded" style={{ background: 'var(--surface-2)' }} />
            </div>
            <div className="h-7 w-20 rounded flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg" style={{ background: 'var(--surface-2)' }} />
            ))}
          </div>
          <div className="h-16 rounded-xl" style={{ background: 'var(--surface-2)' }} />
          <div className="flex gap-3">
            <div className="h-11 flex-1 rounded-xl" style={{ background: 'var(--surface-2)' }} />
            <div className="h-11 flex-1 rounded-xl" style={{ background: 'var(--surface-2)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
