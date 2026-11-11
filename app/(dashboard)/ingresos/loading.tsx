// Espeja la página: encabezado con 2 botones, nota de faltantes, el hero (2/5)
// + 3 tarjetas de apoyo, y el historial de 12 meses.
export default function Loading() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-12 animate-pulse">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="space-y-2">
          <div className="h-9 w-36 rounded-xl" style={{ background: 'var(--surface-2)' }} />
          <div className="h-4 w-72 max-w-full rounded-lg" style={{ background: 'var(--surface-2)' }} />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-11 w-40 rounded-xl" style={{ background: 'var(--surface-2)' }} />
          <div className="h-11 w-28 rounded-xl" style={{ background: 'var(--surface-2)' }} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <div className="card p-5 lg:p-6 col-span-2 flex flex-col justify-between gap-4" style={{ minHeight: 132 }}>
          <div className="space-y-2">
            <div className="h-3 w-32 rounded" style={{ background: 'var(--surface-2)' }} />
            <div className="h-9 w-48 rounded-xl" style={{ background: 'var(--surface-2)' }} />
          </div>
          <div className="h-7 w-20 rounded" style={{ background: 'var(--surface-2)' }} />
        </div>
        {[0, 1].map(i => (
          <div key={i} className="card p-4 lg:p-5 space-y-2">
            <div className="h-3 w-20 rounded" style={{ background: 'var(--surface-2)' }} />
            <div className="h-7 w-24 rounded-lg" style={{ background: 'var(--surface-2)' }} />
            <div className="h-3 w-20 rounded" style={{ background: 'var(--surface-2)' }} />
          </div>
        ))}
        <div className="card p-4 lg:p-5 col-span-2 lg:col-span-1 space-y-2">
          <div className="h-3 w-20 rounded" style={{ background: 'var(--surface-2)' }} />
          <div className="h-7 w-16 rounded-lg" style={{ background: 'var(--surface-2)' }} />
          <div className="h-3 w-32 rounded" style={{ background: 'var(--surface-2)' }} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 lg:px-6 pt-4 pb-3 space-y-1.5">
          <div className="h-4 w-40 rounded" style={{ background: 'var(--surface-2)' }} />
          <div className="h-3 w-64 max-w-full rounded" style={{ background: 'var(--surface-2)' }} />
        </div>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="px-4 lg:px-6 py-4 flex items-center gap-3 lg:gap-5">
            <div className="h-5 w-32 rounded-lg shrink-0" style={{ background: 'var(--surface-2)' }} />
            <div className="hidden sm:block h-5 w-20 rounded-full" style={{ background: 'var(--surface-2)' }} />
            <div className="flex-1 h-5 rounded-lg" style={{ background: 'var(--surface-2)' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
