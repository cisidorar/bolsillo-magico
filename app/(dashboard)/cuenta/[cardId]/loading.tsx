export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="hero-gradient rounded-b-3xl px-5 pt-14 pb-8">
        <div className="w-14 h-14 rounded-2xl bg-white/20 mb-3" />
        <div className="h-5 w-40 bg-white/20 rounded-xl mb-2" />
        <div className="h-8 w-32 bg-white/20 rounded-xl mb-3" />
        <div className="h-3 w-56 bg-white/15 rounded-xl" />
      </div>
      <div className="px-4 lg:px-8 pt-5 space-y-4">
        <div className="card h-28" />
        <div className="card h-40" />
        <div className="card h-64" />
      </div>
    </div>
  )
}
