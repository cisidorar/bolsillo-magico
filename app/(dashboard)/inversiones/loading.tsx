export default function InversionesLoading() {
  return (
    <div className="px-4 lg:px-8 pt-6 lg:pt-8 pb-12 space-y-8 animate-pulse">
      {/* Header */}
      <div>
        <div className="h-8 w-36 rounded-xl mb-2" style={{ background: 'var(--surface-2)' }} />
        <div className="h-4 w-48 rounded-lg" style={{ background: 'var(--surface-2)' }} />
      </div>

      {/* Hero de resumen (ej. RentaFijaSummary en Ahorro y depósitos, o el
          hero equivalente de Acciones/Billetera) + KPIs */}
      <div>
        <div className="card mb-4" style={{ height: 160 }} />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-4 space-y-2">
              <div className="h-3 w-20 rounded" style={{ background: 'var(--surface-2)' }} />
              <div className="h-7 w-28 rounded" style={{ background: 'var(--surface-2)' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Lista (posiciones / cuentas / depósitos, según la vista) */}
      <div>
        <div className="h-5 w-28 rounded-lg mb-3" style={{ background: 'var(--surface-2)' }} />
        <div className="card" style={{ height: 220 }} />
      </div>
    </div>
  )
}
