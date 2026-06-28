export default function Loading() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-12 animate-pulse">
      <div className="h-7 w-32 rounded-xl mb-2" style={{ background: 'var(--surface-2)' }} />
      <div className="h-4 w-64 rounded-lg mb-6" style={{ background: 'var(--surface-2)' }} />
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[1,2,3].map(i => (
          <div key={i} className="card p-4 h-20" style={{ background: 'var(--surface-2)' }} />
        ))}
      </div>
      <div className="card overflow-hidden divide-y" style={{ borderColor: 'var(--border)' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-4 py-4 flex gap-4">
            <div className="h-5 w-20 rounded-lg" style={{ background: 'var(--surface-2)' }} />
            <div className="flex-1 h-5 rounded-lg" style={{ background: 'var(--surface-2)' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
