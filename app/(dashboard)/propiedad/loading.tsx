// El skeleton espeja el layout real de Estado (chip de resumen + dos stats +
// detalle del mes a la izquierda y lista de meses a la derecha). Si dibuja
// otra cosa, el contenido "salta" al llegar y se siente más lento de lo que
// es, aunque tarde exactamente igual.
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

      {/* chip de resumen */}
      <div className="h-6 w-64 rounded-full mb-5" style={{ background: 'var(--surface-2)' }} />

      {/* por pagar / atrasado */}
      <div className="grid grid-cols-2 gap-3 lg:gap-4 mb-5">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card p-4 space-y-2">
            <div className="h-3 w-20 rounded" style={{ background: 'var(--surface-2)' }} />
            <div className="h-7 w-32 rounded-lg" style={{ background: 'var(--surface-2)' }} />
            <div className="h-3 w-36 rounded" style={{ background: 'var(--surface-2)' }} />
          </div>
        ))}
      </div>

      <div className="lg:grid lg:gap-6 lg:items-start space-y-5 lg:space-y-0"
           style={{ gridTemplateColumns: 'minmax(0, 1fr) 300px' }}>
        {/* izquierda: cobros del mes elegido */}
        <div className="card p-4">
          <div className="h-4 w-36 rounded mb-1" style={{ background: 'var(--surface-2)' }} />
          <div className="h-3 w-32 rounded mb-4" style={{ background: 'var(--surface-2)' }} />
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

        {/* derecha: lista de meses */}
        <div className="card p-4">
          <div className="h-4 w-20 rounded mb-1" style={{ background: 'var(--surface-2)' }} />
          <div className="h-3 w-40 rounded mb-4" style={{ background: 'var(--surface-2)' }} />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
                <div className="h-3.5 flex-1 max-w-[88px] rounded" style={{ background: 'var(--surface-2)' }} />
                <div className="h-3.5 w-16 rounded" style={{ background: 'var(--surface-2)' }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
