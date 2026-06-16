export default function LoadingPresupuesto() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 space-y-5 animate-pulse">
      <div className="h-5 w-28 bg-gray-200 rounded-full" />
      {/* Budget card */}
      <div className="h-32 bg-gray-100 rounded-3xl" />
      {/* Category budgets */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-white rounded-3xl" />
        ))}
      </div>
    </div>
  )
}
