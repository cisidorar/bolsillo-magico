export default function Loading() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-12 animate-pulse">
      <div className="h-9 w-32 rounded-xl mb-2" style={{ background: 'var(--surface-2)' }} />
      <div className="h-4 w-64 max-w-full rounded-lg mb-6" style={{ background: 'var(--surface-2)' }} />
      {[0, 1].map(i => (
        <div key={i} className="card p-5 mb-5 space-y-3">
          <div className="h-4 w-40 rounded" style={{ background: 'var(--surface-2)' }} />
          {[0, 1, 2].map(j => <div key={j} className="h-12 rounded-xl" style={{ background: 'var(--surface-2)' }} />)}
        </div>
      ))}
    </div>
  )
}
