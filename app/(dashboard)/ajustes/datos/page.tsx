import React from 'react'
import { Download } from 'lucide-react'
import { getServerSession } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ImportCSV from '@/components/ImportCSV'
import ExportForm from '@/components/ExportForm'

export const dynamic = 'force-dynamic'

export default async function DatosPage() {
  const user = await getServerSession()
  if (!user) redirect('/login')

  return (
    <div className="card overflow-hidden divide-y" style={{ borderColor: 'var(--border)' }}>

      <div>
        <div className="flex items-center gap-4 px-4 pt-4 pb-2">
          <div className="cat-icon-bg w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ '--cat-bg': '#F0FDF4', '--cat-color': '#16A34A' } as React.CSSProperties}>
            <Download className="w-5 h-5" style={{ color: '#16A34A' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Exportar gastos</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>Descarga tus gastos en CSV.</p>
          </div>
        </div>
        <ExportForm />
      </div>

      <ImportCSV />

    </div>
  )
}
