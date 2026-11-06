// Espeja el layout real de Estado (nov 2026): encabezado con selector +
// toggle de 3 vistas, navegador de mes + titular + 2 tiles, "Paga el
// arrendatario" en 4 tarjetas, "Pagas tú" (aseo) y el disclosure colapsado
// de "Últimos N meses". El banner coral de vencidos es condicional según
// datos que el skeleton todavía no tiene, así que no se dibuja acá.
export default function Loading() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 animate-pulse">
      {/* ── Encabezado: nombre + chip, selector + toggle ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-48 rounded-xl" style={{ background: 'var(--surface-2)' }} />
            <div className="h-6 w-20 rounded-full" style={{ background: 'var(--surface-2)' }} />
          </div>
          <div className="h-4 w-56 rounded-lg" style={{ background: 'var(--surface-2)' }} />
        </div>
        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          <div className="h-9 w-36 rounded-xl" style={{ background: 'var(--surface-2)' }} />
          <div className="h-9 w-64 rounded-xl" style={{ background: 'var(--surface-2)' }} />
        </div>
      </div>

      {/* ── Navegador de mes + titular + 2 tiles ── */}
      <div className="card p-5 lg:p-6 mb-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <div className="w-11 h-11 rounded-xl" style={{ background: 'var(--surface-2)' }} />
            <div className="h-5 w-28 rounded mx-2" style={{ background: 'var(--surface-2)' }} />
            <div className="w-11 h-11 rounded-xl" style={{ background: 'var(--surface-2)' }} />
          </div>
          <div className="h-11 w-32 rounded-xl flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
        </div>

        <div className="h-9 w-72 rounded-xl mt-5 mb-4" style={{ background: 'var(--surface-2)' }} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'var(--surface-2)' }}>
              <div className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: 'var(--border)' }} />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-20 rounded" style={{ background: 'var(--border)' }} />
                <div className="h-3.5 w-40 rounded" style={{ background: 'var(--border)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Paga el arrendatario ── */}
      <div className="space-y-3 mb-8">
        <div className="flex items-end justify-between gap-3">
          <div className="h-5 w-40 rounded" style={{ background: 'var(--surface-2)' }} />
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-1.5 w-8 rounded-full" style={{ background: 'var(--surface-2)' }} />
              ))}
            </div>
            <div className="h-3 w-24 rounded" style={{ background: 'var(--surface-2)' }} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 flex flex-col" style={{ minHeight: 168 }}>
              <div className="flex items-center justify-between gap-2">
                <div className="h-3.5 w-16 rounded" style={{ background: 'var(--surface-2)' }} />
                <div className="h-4 w-14 rounded-full" style={{ background: 'var(--surface-2)' }} />
              </div>
              <div className="h-7 w-24 rounded-lg mt-3" style={{ background: 'var(--surface-2)' }} />
              <div className="h-3 w-32 rounded mt-2" style={{ background: 'var(--surface-2)' }} />
              <div className="flex-1" />
              <div className="h-11 rounded-xl" style={{ background: 'var(--surface-2)' }} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Pagas tú ── */}
      <div className="space-y-3 mb-8">
        <div className="h-5 w-24 rounded" style={{ background: 'var(--surface-2)' }} />
        <div className="card p-5 lg:p-6 lg:grid gap-6 items-start space-y-5 lg:space-y-0"
          style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-3.5 w-28 rounded" style={{ background: 'var(--surface-2)' }} />
              <div className="h-4 w-16 rounded-full" style={{ background: 'var(--surface-2)' }} />
            </div>
            <div className="h-7 w-48 rounded-lg" style={{ background: 'var(--surface-2)' }} />
            <div className="h-3 w-32 rounded" style={{ background: 'var(--surface-2)' }} />
            <div className="h-11 w-44 rounded-xl mt-2" style={{ background: 'var(--surface-2)' }} />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-20 rounded" style={{ background: 'var(--surface-2)' }} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[52px] w-full rounded-xl" style={{ background: 'var(--surface-2)' }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Últimos N meses (disclosure colapsado) ── */}
      <div className="card px-4 lg:px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="h-4 w-32 rounded" style={{ background: 'var(--surface-2)' }} />
        <div className="h-3 w-48 rounded" style={{ background: 'var(--surface-2)' }} />
      </div>
    </div>
  )
}
