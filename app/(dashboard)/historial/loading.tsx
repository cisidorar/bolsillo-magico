// Espeja el Historial real (nov 2026): título + navegador de mes (48 px), resumen
// (tarjeta azul como Inicio y Recurrentes: total + vs mes anterior + promedio diario), filtros
// (móvil: toggle + búsqueda en dos filas; escritorio: una sola fila), la fila
// "Seleccionar" y los grupos por día (encabezado con día de la semana + fecha +
// conteo + total, y una tarjeta con filas de 68 px: ícono, descripción, chips y monto). Los banners
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
        <div className="flex-1 flex items-center gap-2">{bar('w-20', 'h-4')}{bar('w-16', 'h-3')}</div>
        <div className="hidden sm:block">{bar('w-14', 'h-3')}</div>
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
      <div className="flex items-center justify-between mb-4" style={{ height: 48 }}>
        <div className="h-9 w-36 rounded-xl" style={{ background: 'var(--surface-2)' }} />
        <div className="h-12 w-44 rounded-xl" style={{ background: 'var(--surface-2)' }} />
      </div>

      {/* Resumen — tarjeta azul (móvil ~178 px: total + 2 datos · escritorio ~134 px: total · vs anterior · promedio) */}
      <div className="lg:hidden hero-gradient rounded-3xl p-5 mb-4">
        <div className="h-3 w-24 rounded-full" style={{ background: 'rgba(255,255,255,.22)' }} />
        <div className="h-9 w-44 rounded-xl mt-2" style={{ background: 'rgba(255,255,255,.28)' }} />
        <div className="h-3 w-20 rounded-full mt-2" style={{ background: 'rgba(255,255,255,.2)' }} />
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4">
          {[0, 1].map(i => (
            <div key={i}>
              <div className="h-3 w-24 rounded-full" style={{ background: 'rgba(255,255,255,.2)' }} />
              <div className="h-6 w-20 rounded-lg mt-1.5" style={{ background: 'rgba(255,255,255,.28)' }} />
            </div>
          ))}
        </div>
      </div>

      <div className="hidden lg:flex hero-gradient rounded-3xl px-8 py-5 mb-5 items-end justify-between gap-10">
        <div>
          <div className="h-4 w-28 rounded-full" style={{ background: 'rgba(255,255,255,.22)' }} />
          <div className="h-10 w-64 rounded-xl mt-2" style={{ background: 'rgba(255,255,255,.28)' }} />
          <div className="h-4 w-24 rounded-full mt-2" style={{ background: 'rgba(255,255,255,.2)' }} />
        </div>
        <div className="flex items-end gap-14 flex-shrink-0">
          {[0, 1].map(i => (
            <div key={i}>
              <div className="h-4 rounded-full" style={{ background: 'rgba(255,255,255,.22)', width: i === 0 ? 144 : 112 }} />
              <div className="h-9 rounded-xl mt-1" style={{ background: 'rgba(255,255,255,.28)', width: i === 0 ? 140 : 160 }} />
              <div className="h-4 w-20 rounded-full mt-0.5" style={{ background: 'rgba(255,255,255,.2)' }} />
            </div>
          ))}
        </div>
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
