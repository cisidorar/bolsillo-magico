export default function LoadingAnalisis() {
  return (
    <div className="px-4 pt-6 pb-8 space-y-5 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-5 w-20 bg-gray-200 rounded-full" />
        <div className="h-8 w-28 bg-gray-100 rounded-full" />
      </div>

      {/* KPI chips */}
      <div className="grid grid-cols-3 gap-2.5">
        {[1,2,3].map(i => (
          <div key={i} className="rounded-3xl p-3 h-16 bg-gray-100" />
        ))}
      </div>

      {/* Bar chart */}
      <div className="rounded-3xl p-4 bg-white">
        <div className="h-4 w-32 bg-gray-100 rounded-full mb-4" />
        <div className="flex items-end gap-2 h-32">
          {[60,80,45,90,55,70].map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t-lg bg-gray-100" style={{ height: h * 0.9 }} />
              <div className="h-2.5 w-5 bg-gray-100 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Category list */}
      <div>
        <div className="h-4 w-36 bg-gray-200 rounded-full mb-3" />
        <div className="rounded-3xl overflow-hidden bg-white divide-y divide-gray-50">
          {[1,2,3,4].map(i => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 rounded-xl bg-gray-100 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-100 rounded-full w-24" />
                <div className="h-2 bg-gray-100 rounded-full w-full" />
              </div>
              <div className="h-3 bg-gray-100 rounded-full w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
