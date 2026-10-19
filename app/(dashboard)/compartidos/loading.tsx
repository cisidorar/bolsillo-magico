// Espeja la lista de viajes: título + botón, y tarjetas en dos columnas.
export default function Loading() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 animate-pulse">
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded-xl" style={{ background: 'var(--surface-2)' }} />
          <div className="h-4 w-72 rounded-lg" style={{ background: 'var(--surface-2)' }} />
        </div>
        <div className="h-10 w-32 rounded-xl" style={{ background: 'var(--surface-2)' }} />
      </div>
      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl" style={{ background: 'var(--surface-2)' }} />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 rounded" style={{ background: 'var(--surface-2)' }} />
              <div className="h-3 w-52 rounded" style={{ background: 'var(--surface-2)' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
