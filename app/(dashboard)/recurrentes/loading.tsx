export default function LoadingRecurrentes() {
  return (
    <div className="px-4 lg:px-8 pt-2 lg:pt-8 pb-8 space-y-4 animate-pulse">
      <div className="h-5 w-32 bg-gray-200 rounded-full" />
      <div className="rounded-3xl overflow-hidden bg-white divide-y divide-gray-50">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-4">
            <div className="w-10 h-10 rounded-2xl bg-gray-100 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-100 rounded-full w-1/2" />
              <div className="h-3 bg-gray-100 rounded-full w-1/4" />
            </div>
            <div className="h-4 bg-gray-100 rounded-full w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
