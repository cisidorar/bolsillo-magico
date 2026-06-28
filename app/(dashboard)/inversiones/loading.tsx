export default function InversionesLoading() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-12 space-y-8 animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl" style={{ background: 'var(--surface-2)' }} />
        <div className="h-8 w-36 rounded-xl" style={{ background: 'var(--surface-2)' }} />
      </div>

      {/* Acciones KPIs */}
      <div>
        <div className="h-6 w-24 rounded-lg mb-4" style={{ background: 'var(--surface-2)' }} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4 space-y-2">
              <div className="h-3 w-20 rounded" style={{ background: 'var(--surface-2)' }} />
              <div className="h-7 w-28 rounded" style={{ background: 'var(--surface-2)' }} />
            </div>
          ))}
        </div>
        <div className="card" style={{ height: 180 }} />
      </div>

      {/* Depósitos */}
      <div>
        <div className="h-6 w-36 rounded-lg mb-4" style={{ background: 'var(--surface-2)' }} />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-4 space-y-2">
              <div className="h-3 w-24 rounded" style={{ background: 'var(--surface-2)' }} />
              <div className="h-7 w-32 rounded" style={{ background: 'var(--surface-2)' }} />
            </div>
          ))}
        </div>
        <div className="card" style={{ height: 140 }} />
      </div>
    </div>
  )
}
