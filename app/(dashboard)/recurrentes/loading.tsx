// Esqueleto de /recurrentes. Replica el layout real de page.tsx para que al
// cargar no haya salto:
//   encabezado → hero "Carga mensual" → "Qué mirar" → (toggle móvil) →
//   grilla lg:[1fr_420px]: lista por grupos (Mensuales · En cuotas · Anuales)
//   + "Agregar recurrente" | Ya comprometido · Próximos 30 días · Calendario.
// loading.tsx no puede leer ?view=, así que en móvil muestra la vista por
// defecto (Lista) y la columna derecha solo aparece en desktop.
// Mantener alineado con page.tsx y components/RecurringManager.tsx.
const bone = { background: 'var(--surface-2)' }
const onBrand = (a: number) => ({ background: `rgba(255,255,255,${a})` })
const DIVIDED = '[&>*+*]:border-t [&>*+*]:border-[color-mix(in_srgb,var(--border)_55%,transparent)]'

function Bar({ w, h = 12, className = '', style }: { w: number | string; h?: number; className?: string; style?: React.CSSProperties }) {
  return <div className={`rounded-md ${className}`} style={{ ...bone, width: w, height: h, ...style }} />
}

/** Fila de recurrente: logo 40 + (nombre / chip categoría / próximo) + próximo cargo (sm+) + monto + chevron. */
function RecurringRow() {
  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl flex-shrink-0" style={{ ...bone, width: 40, height: 40 }} />
        <div className="flex-1 min-w-0">
          <Bar w="42%" h={14} />
          <div className="flex items-center gap-1.5 mt-1.5">
            <Bar w={64} h={16} className="rounded-full" />
          </div>
          <Bar w={96} h={11} className="mt-1.5 sm:hidden" />
          <Bar w="55%" h={10} className="mt-1.5" />
        </div>
        <div className="hidden sm:block flex-shrink-0 space-y-1.5 min-w-[90px]">
          <Bar w={70} h={12} className="ml-auto" />
          <Bar w={64} h={10} className="ml-auto" />
        </div>
        <div className="flex-shrink-0 space-y-1.5">
          <Bar w={64} h={14} className="ml-auto" />
          <Bar w={36} h={10} className="ml-auto" />
        </div>
        <Bar w={16} h={16} />
      </div>
    </div>
  )
}

function Group({ labelW, rows }: { labelW: number; rows: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="flex items-center gap-2">
          <span className="w-[3px] h-4 rounded-full" style={{ background: 'var(--primary)', opacity: 0.55 }} />
          <Bar w={labelW} h={14} />
          <Bar w={22} h={11} />
          <Bar w={14} h={14} />
        </span>
        <Bar w={76} h={14} />
      </div>
      <div className={`card-flat overflow-hidden ${DIVIDED}`}>
        {Array.from({ length: rows }).map((_, i) => <RecurringRow key={i} />)}
      </div>
    </div>
  )
}

export default function LoadingRecurrentes() {
  return (
    <div className="px-4 lg:px-8 pt-2 lg:pt-8 pb-8 animate-pulse" aria-busy="true" aria-label="Cargando gastos recurrentes">

      {/* Encabezado */}
      <div className="mb-6">
        <Bar w={280} h={34} className="rounded-lg mb-2" />
        <Bar w="min(420px, 85%)" h={14} />
      </div>

      {/* Hero "Carga mensual" */}
      <div className="rounded-3xl p-5 mb-6 hero-gradient" style={{ boxShadow: '0 8px 18px var(--shadow)' }}>
        <div className="h-3 w-24 rounded mb-2.5" style={onBrand(0.22)} />
        <div className="h-8 w-48 rounded-lg" style={onBrand(0.28)} />
        <div className="h-3 w-56 rounded mt-2.5" style={onBrand(0.2)} />
        <div className="h-3 w-72 max-w-full rounded mt-3.5" style={onBrand(0.16)} />
      </div>

      {/* Qué mirar */}
      <div className="card p-4 lg:p-5 mb-6">
        <Bar w={84} h={14} />
        <div className="mt-3 grid gap-6 lg:grid-cols-3">
          {[0, 1, 2].map(i => (
            <div key={i} className={i > 0 ? 'hidden lg:block' : ''}>
              <Bar w={90} h={12} />
              <Bar w={150} h={22} className="mt-1.5" />
              <div className="mt-2 space-y-1.5">
                {[0, 1, 2].map(j => (
                  <div key={j} className="flex items-center justify-between gap-3">
                    <Bar w="62%" h={11} />
                    <Bar w={52} h={11} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Toggle móvil Lista | Resumen */}
      <div className="flex items-center gap-1.5 rounded-xl p-1 mb-5 lg:hidden" style={bone}>
        <div className="flex-1 rounded-lg" style={{ background: 'var(--surface)', height: 30 }} />
        <div className="flex-1" style={{ height: 30 }} />
      </div>

      {/* Grilla */}
      <div className="lg:grid lg:grid-cols-[1fr_420px] lg:gap-6 space-y-5 lg:space-y-0">

        {/* Lista */}
        <div className="flex flex-col gap-4">
          <div className="space-y-6">
            <Group labelW={78} rows={6} />
            <Group labelW={70} rows={3} />
            <Group labelW={58} rows={2} />
          </div>
          <div
            className="flex items-center justify-center gap-2 w-full rounded-2xl"
            style={{ height: 50, background: 'var(--surface)', border: '1.5px dashed var(--border)' }}
          >
            <Bar w={130} h={14} />
          </div>
        </div>

        {/* Columna derecha — solo desktop */}
        <div className="hidden lg:block space-y-5">

          {/* Ya comprometido */}
          <div className="card overflow-hidden">
            <div className="px-5 pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Bar w={16} h={16} />
                <Bar w={110} h={14} />
              </div>
              <Bar w="80%" h={11} className="mt-2" />
            </div>
            <div className="px-5 pt-4 pb-2">
              <div className="flex items-end justify-between" style={{ gap: 4, minHeight: 104 }}>
                {[70, 64, 58, 52, 52, 40, 28, 18].map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end" style={{ height: 104 }}>
                    <div className="w-full rounded-t-[3px]" style={{ ...bone, height: h, maxWidth: 22 }} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-1.5" style={{ gap: 4 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex-1 flex justify-center"><Bar w={16} h={9} /></div>
                ))}
              </div>
            </div>
            <div className="h-4" />
          </div>

          {/* Próximos 30 días */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <Bar w={112} h={14} />
              <Bar w={104} h={11} />
            </div>
            <div className={`px-4 pb-2 ${DIVIDED}`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <div className="rounded-lg flex-shrink-0" style={{ ...bone, width: 28, height: 28 }} />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Bar w="50%" h={13} />
                    <Bar w="34%" h={10} />
                  </div>
                  <div className="space-y-1.5">
                    <Bar w={64} h={13} className="ml-auto" />
                    <Bar w={72} h={10} className="ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Calendario */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <Bar w={28} h={28} className="rounded-lg" />
              <Bar w={110} h={14} />
              <Bar w={28} h={28} className="rounded-lg" />
            </div>
            <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--border)' }}>
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="py-2 flex justify-center"><Bar w={14} h={11} /></div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: 35 }).map((_, i) => (
                <div
                  key={i}
                  className={`min-h-[68px] p-1.5 flex flex-col items-center gap-1 border-b ${i % 7 === 6 ? '' : 'border-r'}`}
                  style={{ borderColor: 'var(--border)' }}
                >
                  <Bar w={18} h={18} className="rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
