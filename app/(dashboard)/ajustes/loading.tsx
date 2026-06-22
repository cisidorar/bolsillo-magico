export default function LoadingAjustes() {
  return (
    <div className="px-4 lg:px-8 pt-2 lg:pt-8 pb-8 space-y-4 animate-pulse">
      <div className="h-5 w-20 bg-gray-200 rounded-full" />
      {[1,2,3].map(i => (
        <div key={i} className="rounded-3xl overflow-hidden bg-white divide-y divide-gray-50">
          {[1,2,3].map(j => (
            <div key={j} className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-100 rounded-full w-32" />
                <div className="h-2.5 bg-gray-100 rounded-full w-48" />
              </div>
              <div className="w-4 h-4 bg-gray-100 rounded-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
