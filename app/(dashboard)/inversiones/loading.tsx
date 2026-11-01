// Esqueleto de /inversiones. loading.tsx no puede leer ?view=, así que replica la
// vista por defecto (Mis acciones), que es la que se abre casi siempre:
// encabezado → fila selector + botón → hero azul + Rendimiento → tabla →
// evolución + riesgo → tarjetas de contexto. Mantener alineado con
// components/Radar.tsx (view="mias") y app/(dashboard)/inversiones/page.tsx.
const bone = { background: 'var(--surface-2)' }

function Bar({ w, h = 12, className = '' }: { w: number | string; h?: number; className?: string }) {
  return <div className={`rounded-md ${className}`} style={{ ...bone, width: w, height: h }} />
}

export default function InversionesLoading() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-12 animate-pulse" aria-busy="true" aria-label="Cargando inversiones">
      {/* Encabezado: título + "N posiciones · acciones" */}
      <div className="mb-1">
        <Bar w={168} h={32} className="rounded-xl mb-2" />
        <Bar w={150} h={14} />
      </div>

      {/* Fila: estado del análisis a la izquierda · selector de vistas + Agregar a la derecha */}
      <div className="flex items-center justify-between gap-2 mt-3 mb-3 flex-wrap">
        <Bar w={190} h={12} className="hidden sm:block" />
        <div className="flex items-center justify-between gap-2 flex-1 sm:flex-initial sm:ml-auto min-w-0">
          <div className="rounded-full" style={{ ...bone, width: 248, height: 40, maxWidth: '62%' }} />
          <div className="rounded-xl shrink-0" style={{ ...bone, width: 104, height: 40 }} />
        </div>
      </div>

      {/* Hero azul (valor + 3 stats) + tarjeta Rendimiento, lado a lado en desktop */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-4 mb-4">
        <div className="card overflow-hidden hero-gradient" style={{ flex: '3 1 auto' }}>
          <div className="px-5 pt-5 pb-4">
            <div className="h-3 w-32 rounded mb-3" style={{ background: 'rgba(255,255,255,0.22)' }} />
            <div className="flex items-baseline justify-between gap-2">
              <div className="h-10 w-48 rounded-lg" style={{ background: 'rgba(255,255,255,0.28)' }} />
              <div className="h-4 w-32 rounded" style={{ background: 'rgba(255,255,255,0.2)' }} />
            </div>
          </div>
          <div className="border-t grid grid-cols-1 sm:grid-cols-3" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-center justify-between gap-3 sm:block px-4 py-3">
                <div className="h-3 w-16 rounded sm:mb-2" style={{ background: 'rgba(255,255,255,0.2)' }} />
                <div className="h-4 w-20 rounded" style={{ background: 'rgba(255,255,255,0.28)' }} />
              </div>
            ))}
          </div>
        </div>

        <div className="card overflow-hidden" style={{ flex: '2 1 auto' }}>
          <div className="px-5 pt-4 pb-3">
            <Bar w={92} h={14} />
          </div>
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center justify-between px-5 py-3">
              <Bar w={84} h={12} />
              <Bar w={72} h={14} />
            </div>
          ))}
        </div>
      </div>

      {/* Tabla de posiciones: encabezado + filas (logo · ticker/nombre · valor/variación) */}
      <div className="card overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 lg:px-5 py-3">
          <Bar w={56} h={11} />
          <Bar w={120} h={11} />
        </div>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex items-center gap-3 px-4 lg:px-5 py-3.5">
            <div className="w-10 h-10 rounded-xl flex-shrink-0" style={bone} />
            <div className="flex-1 min-w-0 space-y-2">
              <Bar w={52} h={14} />
              <Bar w="45%" h={11} />
            </div>
            <div className="space-y-2 flex flex-col items-end">
              <Bar w={84} h={14} />
              <Bar w={56} h={11} />
            </div>
          </div>
        ))}
      </div>

      {/* Evolución del portafolio + riesgo, en dos columnas en desktop */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-4 lg:space-y-0 mb-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <Bar w={150} h={14} />
            <div className="rounded-full" style={{ ...bone, width: 132, height: 28 }} />
          </div>
          <div className="rounded-xl" style={{ ...bone, height: 180 }} />
        </div>
        <div className="card p-5">
          <Bar w={120} h={14} className="mb-4" />
          <div className="flex items-center gap-6">
            <div className="rounded-full flex-shrink-0" style={{ ...bone, width: 132, height: 132 }} />
            <div className="flex-1 space-y-3">
              {[0, 1, 2].map(i => <Bar key={i} w={`${80 - i * 15}%`} h={12} />)}
            </div>
          </div>
        </div>
      </div>

      {/* Tarjetas de contexto: semana y escenarios de tasas */}
      <div className="space-y-4">
        <div className="card p-5 space-y-3">
          <Bar w={140} h={14} />
          <Bar w="85%" h={12} />
          <Bar w="60%" h={12} />
        </div>
        <div className="card p-5 space-y-3">
          <Bar w={170} h={14} />
          <Bar w="75%" h={12} />
        </div>
      </div>
    </div>
  )
}
