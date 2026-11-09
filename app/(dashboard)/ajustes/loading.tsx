// Espeja la página: título + bajada, acceso a perfil (móvil) y dos columnas
// de secciones con encabezado y tarjetas de filas con ícono.
function Section({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-0.5">
        <div className="w-4 h-4 rounded" style={{ background: 'var(--surface-2)' }} />
        <div className="h-4 w-28 rounded" style={{ background: 'var(--surface-2)' }} />
      </div>
      <div className="card overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4"
            style={i > 0 ? { borderTop: '1px solid var(--border)' } : undefined}>
            <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-36 rounded" style={{ background: 'var(--surface-2)' }} />
              <div className="h-3 w-52 max-w-full rounded" style={{ background: 'var(--surface-2)' }} />
            </div>
            <div className="w-11 h-6 rounded-full flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LoadingAjustes() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 animate-pulse">
      <div className="mb-6 space-y-2">
        <div className="h-9 w-40 rounded-xl" style={{ background: 'var(--surface-2)' }} />
        <div className="h-4 w-72 max-w-full rounded-lg" style={{ background: 'var(--surface-2)' }} />
      </div>
      <div className="lg:hidden card h-[68px] mb-6" />
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-6 lg:space-y-0">
        <div className="space-y-6">
          <Section rows={3} />
          <Section rows={4} />
        </div>
        <div className="space-y-6">
          <Section rows={3} />
          <Section rows={2} />
        </div>
      </div>
    </div>
  )
}
