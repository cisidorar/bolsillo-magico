// El skeleton espeja el layout real (banda de 4 stats + dos columnas). Si
// dibuja otra cosa, el contenido "salta" al llegar y se siente más lento de
// lo que es, aunque tarde exactamente igual.
export default function Loading() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 animate-pulse">
      {/* título + selector + toggle */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="space-y-2">
          <div className="h-8 w-56 rounded-xl" style={{ background: 'var(--surface-2)' }} />
          <div className="h-4 w-64 rounded-lg" style={{ background: 'var(--surface-2)' }} />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-40 rounded-xl" style={{ background: 'var(--surface-2)' }} />
          <div className="h-9 w-36 rounded-xl" style={{ background: 'var(--surface-2)' }} />
        </div>
      </div>

      {/* banda de stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 lg:p-5 space-y-2">
            <div className="h-3 w-24 rounded" style={{ background: 'var(--surface-2)' }} />
            <div className="h-7 w-32 rounded-lg" style={{ background: 'var(--surface-2)' }} />
            <div className="h-3 w-28 rounded" style={{ background: 'var(--surface-2)' }} />
          </div>
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-5 lg:space-y-0">
        {/* izquierda: listas de cobros */}
        <div className="space-y-5">
          {Array.from({ length: 2 }).map((_, card) => (
            <div key={card} className="card p-4">
              <div className="h-4 w-36 rounded mb-1" style={{ background: 'var(--surface-2)' }} />
              <div className="h-3 w-24 rounded mb-4" style={{ background: 'var(--surface-2)' }} />
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-32 rounded" style={{ background: 'var(--surface-2)' }} />
                      <div className="h-3 w-40 rounded" style={{ background: 'var(--surface-2)' }} />
                    </div>
                    <div className="h-4 w-20 rounded" style={{ background: 'var(--surface-2)' }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* derecha: contrato + propiedad */}
        <div className="space-y-5">
          {Array.from({ length: 2 }).map((_, card) => (
            <div key={card} className="card p-4 space-y-3">
              <div className="h-4 w-28 rounded" style={{ background: 'var(--surface-2)' }} />
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-40 rounded" style={{ background: 'var(--surface-2)' }} />
                  <div className="h-3 w-32 rounded" style={{ background: 'var(--surface-2)' }} />
                </div>
              </div>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex justify-between gap-3">
                  <div className="h-3 w-28 rounded" style={{ background: 'var(--surface-2)' }} />
                  <div className="h-3 w-24 rounded" style={{ background: 'var(--surface-2)' }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
