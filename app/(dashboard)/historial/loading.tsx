// Espeja el Historial real (nov 2026): título + navegador de mes, tarjetas de
// resumen (móvil: total grande + 2 chips; escritorio: 3 tarjetas), filtros
// (móvil: toggle + búsqueda en dos filas; escritorio: una sola fila), la fila
// "Seleccionar" y los grupos por día (encabezado con barra + conteo + total y
// una tarjeta con filas de ícono, descripción, chips y monto). Los banners
// condicionales (estado de cuenta, filtro por método) no se dibujan: dependen
// de datos que el skeleton todavía no tiene.
const bar = (w: string, h = 'h-3') => (
  <div className={`${h} ${w} rounded-full`} style={{ background: 'var(--surface-2)' }} />
)

function Row({ chips }: { chips: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
      <div className="flex-1 min-w-0 space-y-2">
        {bar('w-2/5', 'h-3.5')}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: chips }).map((_, i) => (
            <div key={i} className="h-4 rounded-full" style={{ background: 'var(--surface-2)', width: i === 0 ? 72 : 56 }} />
          ))}
        </div>
      </div>
      <div className="text-right flex-shrink-0 space-y-1.5">
        {bar('w-16', 'h-3.5')}
        <div className="lg:hidden flex justify-end">{bar('w-10', 'h-2.5')}</div>
      </div>
      <div className="w-4 h-4 rounded flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
    </div>
  )
}

function DayGroup({ rows }: { rows: number }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2.5 mb-2 px-0.5">
        <div className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ background: 'var(--border)' }} />
        <div className="flex-1">{bar('w-28', 'h-4')}</div>
        <div className="h-4 w-6 rounded-full" style={{ background: 'var(--surface-2)' }} />
        {bar('w-16', 'h-4')}
        <div className="w-4 h-4 rounded" style={{ background: 'var(--surface-2)' }} />
      </div>
      <div className="card overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => <Row key={i} chips={i % 2 === 0 ? 2 : 1} />)}
      </div>
    </div>
  )
}

export default function LoadingHistorial() {
  return (
    <div className="px-4 lg:px-8 pt-2 lg:pt-8 pb-4 animate-pulse">
      {/* Header: título + navegador de mes */}
      <div className="flex items-center justify-between mb-4">
        <div className="h-9 w-36 rounded-xl" style={{ background: 'var(--surface-2)' }} />
        <div className="h-8 w-36 rounded-xl" style={{ background: 'var(--surface-2)' }} />
      </div>

      {/* Resumen — móvil */}
      <div className="lg:hidden mb-4 space-y-2">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
          <div className="space-y-1.5">
            {bar('w-24', 'h-3')}
            {bar('w-32', 'h-6')}
            {bar('w-16', 'h-3')}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map(i => (
            <div key={i} className="card p-3.5 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
              <div className="space-y-1.5">
                {bar('w-16', 'h-2.5')}
                {bar('w-12', 'h-4')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Resumen — escritorio */}
      <div className="hidden lg:grid grid-cols-3 gap-4 mb-5">
        {[0, 1, 2].map(i => (
          <div key={i} className="card p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
            <div className="space-y-2">
              {bar('w-28', 'h-3')}
              {bar('w-36', 'h-7')}
              {bar('w-20', 'h-3')}
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="mb-4 card overflow-hidden">
        {/* Móvil: toggle y búsqueda en dos filas */}
        <div className="lg:hidden p-3 space-y-2">
          <div className="h-10 rounded-xl" style={{ background: 'var(--surface-2)' }} />
          <div className="flex items-center gap-2">
            <div className="h-11 flex-1 rounded-xl" style={{ background: 'var(--surface-2)' }} />
            <div className="h-11 w-11 rounded-xl flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
          </div>
        </div>
        {/* Escritorio: una sola fila */}
        <div className="hidden lg:flex items-center gap-3 px-3 py-2.5">
          <div className="h-9 w-52 rounded-xl flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
          <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
          <div className="h-10 flex-1 rounded-xl" style={{ background: 'var(--surface-2)' }} />
          <div className="h-10 w-28 rounded-xl flex-shrink-0" style={{ background: 'var(--surface-2)' }} />
        </div>
      </div>

      {/* Barra de herramientas: N registros + Seleccionar */}
      <div className="flex items-center justify-between mb-4">
        <div className="h-6 w-24 rounded-full" style={{ background: 'var(--surface-2)' }} />
        {bar('w-20', 'h-3.5')}
      </div>

      {/* Grupos por día */}
      <DayGroup rows={3} />
      <DayGroup rows={2} />
      <DayGroup rows={3} />
    </div>
  )
}
