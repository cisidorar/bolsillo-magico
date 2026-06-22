export default function LoadingMetodos() {
  return (
    <div className="px-4 lg:px-8 pt-2 lg:pt-8 pb-8 space-y-4 animate-pulse">
      <div className="h-5 w-36 bg-gray-200 rounded-full" />
      <div className="rounded-3xl overflow-hidden bg-white divide-y divide-gray-50">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-4">
            <div className="w-10 h-10 rounded-2xl bg-gray-100 flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-gray-100 rounded-full w-2/5" />
            </div>
            <div className="w-5 h-5 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
