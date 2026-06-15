export default function LoadingCategorias() {
  return (
    <div className="px-4 pt-6 pb-8 space-y-4 animate-pulse">
      <div className="h-5 w-24 bg-gray-200 rounded-full" />
      <div className="rounded-3xl overflow-hidden bg-white divide-y divide-gray-50">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-gray-100 rounded-full w-1/3" />
            </div>
            <div className="w-5 h-5 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
