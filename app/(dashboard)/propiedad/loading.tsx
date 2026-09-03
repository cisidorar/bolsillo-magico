export default function Loading() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 animate-pulse">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="h-8 w-40 rounded-xl" style={{ background: 'var(--surface-2)' }} />
        <div className="h-9 w-40 rounded-xl" style={{ background: 'var(--surface-2)' }} />
      </div>
      <div className="h-4 w-72 rounded-lg mb-6" style={{ background: 'var(--surface-2)' }} />

      {/* hero semáforo */}
      <div className="card p-6 mb-5">
        <div className="flex gap-4">
          <div className="w-12 h-12 rounded-2xl flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-28 rounded" style={{ background: 'var(--surface-2)' }} />
            <div className="h-7 w-48 rounded-lg" style={{ background: 'var(--surface-2)' }} />
            <div className="h-4 w-36 rounded" style={{ background: 'var(--surface-2)' }} />
          </div>
        </div>
      </div>

      {/* contrato */}
      <div className="card p-4 mb-5 space-y-2">
        <div className="h-4 w-28 rounded" style={{ background: 'var(--surface-2)' }} />
        <div className="h-3 w-40 rounded" style={{ background: 'var(--surface-2)' }} />
        <div className="h-3 w-52 rounded" style={{ background: 'var(--surface-2)' }} />
      </div>

      <div className="card overflow-hidden divide-y" style={{ borderColor: 'var(--border)' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-4 py-4 flex items-center gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded" style={{ background: 'var(--surface-2)' }} />
              <div className="h-3 w-44 rounded" style={{ background: 'var(--surface-2)' }} />
            </div>
            <div className="h-5 w-20 rounded" style={{ background: 'var(--surface-2)' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
