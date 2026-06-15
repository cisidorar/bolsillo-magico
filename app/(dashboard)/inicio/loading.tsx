export default function LoadingInicio() {
  return (
    <div className="px-4 pt-6 pb-2 space-y-4 animate-pulse">
      {/* Hero card skeleton */}
      <div className="rounded-3xl p-6 h-48" style={{ backgroundColor: '#1B6DD4', opacity: 0.15 }} />

      {/* Category cards skeleton */}
      <div>
        <div className="h-4 w-24 bg-gray-200 rounded-full mb-3" />
        <div className="grid grid-cols-2 gap-2.5">
          {[1,2,3,4].map(i => (
            <div key={i} className="rounded-3xl p-4 h-24 bg-gray-100" />
          ))}
        </div>
      </div>

      {/* Expense list skeleton */}
      <div>
        <div className="h-4 w-28 bg-gray-200 rounded-full mb-3" />
        <div className="rounded-3xl overflow-hidden divide-y divide-gray-100 bg-white">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-10 h-10 rounded-2xl bg-gray-100 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-100 rounded-full w-3/4" />
                <div className="h-3 bg-gray-100 rounded-full w-1/2" />
              </div>
              <div className="h-3 bg-gray-100 rounded-full w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
