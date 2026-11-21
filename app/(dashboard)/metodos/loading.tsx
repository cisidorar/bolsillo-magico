// Espeja la vista real: título + bajada · tarjetas de crédito (cada una con su período) ·
// lista de débito y cuentas dentro de una .card · botón de agregar.
const bone = { background: 'var(--surface-2)' }
export default function LoadingMetodos() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-8 space-y-7 animate-pulse">
      <div>
        <div className="rounded-xl" style={{ ...bone, width: 224, height: 32 }} />
        <div className="rounded-lg mt-2 max-w-full" style={{ ...bone, width: 288, height: 20 }} />
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2.5">
          <div className="rounded-md" style={{ ...bone, width: 130, height: 14 }} />
          <div className="rounded-md" style={{ ...bone, width: 170, height: 12 }} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {[0, 1].map(i => (
            <div key={i} className="card p-4 lg:p-5">
              <div className="flex items-center gap-3" style={{ minHeight: 44 }}>
                <div className="w-11 h-11 rounded-full flex-shrink-0" style={bone} />
                <div className="flex-1 space-y-2">
                  <div className="rounded-md" style={{ ...bone, width: '45%', height: 13 }} />
                  <div className="rounded-md" style={{ ...bone, width: '65%', height: 11 }} />
                </div>
              </div>
              <div className="mt-4 rounded-2xl p-4" style={bone}>
                <div className="rounded-md" style={{ background: 'var(--surface)', width: '55%', height: 12 }} />
                <div className="rounded-lg mt-2" style={{ background: 'var(--surface)', width: 130, height: 28 }} />
                <div className="rounded-full mt-4" style={{ background: 'var(--surface)', height: 6 }} />
                <div className="rounded-md mt-2" style={{ background: 'var(--surface)', width: '40%', height: 11 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="rounded-md mb-2.5" style={{ ...bone, width: 170, height: 14 }} />
        <div className="card p-1.5 lg:max-w-2xl">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-11 h-11 rounded-full flex-shrink-0" style={bone} />
              <div className="flex-1 space-y-2">
                <div className="rounded-md" style={{ ...bone, width: '40%', height: 13 }} />
                <div className="rounded-md" style={{ ...bone, width: '20%', height: 11 }} />
              </div>
              <div className="rounded" style={{ ...bone, width: 16, height: 16 }} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl lg:w-60" style={{ ...bone, height: 48 }} />
    </div>
  )
}
