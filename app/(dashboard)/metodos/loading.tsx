// Espeja la vista real: título + bajada, lista dentro de una .card con filas
// de logo + nombre + chip, y el botón punteado de agregar.
export default function LoadingMetodos() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 space-y-5 animate-pulse">
      <div className="space-y-2">
        <div className="h-9 w-56 rounded-xl" style={{ background: 'var(--surface-2)' }} />
        <div className="h-4 w-72 max-w-full rounded-lg" style={{ background: 'var(--surface-2)' }} />
      </div>
      <div className="card overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-4">
            <div className="w-11 h-11 rounded-2xl flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/5 rounded" style={{ background: 'var(--surface-2)' }} />
              <div className="h-3 w-1/4 rounded-full" style={{ background: 'var(--surface-2)' }} />
            </div>
            <div className="w-4 h-4 rounded" style={{ background: 'var(--surface-2)' }} />
          </div>
        ))}
      </div>
      <div className="h-12 rounded-3xl border-2 border-dashed" style={{ borderColor: 'var(--border)' }} />
    </div>
  )
}
