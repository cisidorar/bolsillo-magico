'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCLP } from '@/lib/utils'
import { getPayslipDownloadUrl, deletePayslip } from '@/app/actions/payslips'
import type { BreakdownLine } from '@/lib/payslip-parser'
import { FileText, Download, Trash2, RefreshCw, Loader2 } from 'lucide-react'

export interface PayslipData {
  employerName: string | null
  employerRut: string | null
  position: string | null
  contractType: string | null
  contractStart: string | null
  daysWorked: number | null
  ufValue: number | null
  previsionLabel: string | null
  saludLabel: string | null
  haberesImponibles: BreakdownLine[]
  haberesNoImponibles: BreakdownLine[]
  descuentosLegales: BreakdownLine[]
  otrosDescuentos: BreakdownLine[]
  totalHaberes: number
  totalDescuentos: number
  liquido: number
  pdfPath: string | null
}

interface Props {
  month: number
  year: number
  monthName: string
  payslip: PayslipData
}

function Group({ title, items }: { title: string; items: BreakdownLine[] }) {
  if (items.length === 0) return null
  const subtotal = items.reduce((s, i) => s + i.amount, 0)
  return (
    <div className="rounded-2xl overflow-hidden divide-y" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderColor: 'var(--border)' }}>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>{title}</span>
        <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>{formatCLP(subtotal)}</span>
      </div>
      {items.map((it, i) => (
        <div key={i} className="flex items-center justify-between px-4 py-2" style={{ borderColor: 'var(--border)' }}>
          <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{it.label}</span>
          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>{formatCLP(it.amount)}</span>
        </div>
      ))}
    </div>
  )
}

// Todo el detalle de la liquidación EN LÍNEA dentro del sheet de Ingresos
// (pedido de Cas, ago 2026: "me gustaria que se viera todo de una" — antes
// había que tocar "Ver liquidación" y se abría un segundo sheet encima;
// ahora el desglose completo vive directo en el detalle del ingreso).
export default function PayslipInlineDetail({ month, year, monthName, payslip }: Props) {
  const router = useRouter()
  const [downloading, setDownloading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)

  async function handleDownload() {
    if (!payslip.pdfPath) return
    setDownloading(true)
    const url = await getPayslipDownloadUrl(payslip.pdfPath)
    setDownloading(false)
    if (url) window.open(url, '_blank')
  }

  async function handleDelete() {
    setDeleting(true)
    await deletePayslip(month, year)
    setDeleting(false)
    setDeleted(true) // ocultar de inmediato sin esperar el refresh
    router.refresh()
  }

  if (deleted) return null

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'var(--primary-soft)' }}>
        <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--primary)' }} />
        <span className="flex-1 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--primary)' }}>
          Liquidación de {monthName}
        </span>
        <button
          onClick={handleDownload}
          disabled={!payslip.pdfPath || downloading}
          className="flex items-center gap-1 text-[11px] font-semibold disabled:opacity-50"
          style={{ color: 'var(--primary)' }}
        >
          {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          PDF
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          className="p-0.5"
          style={{ color: 'var(--coral)' }}
          aria-label="Eliminar liquidación"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3 space-y-2.5" style={{ background: 'var(--surface)' }}>
        {confirmDelete && (
          <div className="rounded-2xl p-3.5 space-y-2.5" style={{ background: 'rgba(255,111,97,0.08)', border: '1px solid rgba(255,111,97,0.25)' }}>
            <p className="text-xs text-center font-medium" style={{ color: 'var(--ink-2)' }}>
              ¿Eliminar la liquidación de {monthName}? El PDF y el ingreso no se tocan.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2 text-xs font-semibold rounded-xl border"
                style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl"
                style={{ background: 'var(--coral)', color: 'white' }}
              >
                {deleting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                {deleting ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        )}

        {(payslip.position || payslip.contractType || payslip.daysWorked !== null) && (
          <div className="rounded-2xl overflow-hidden divide-y" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            {payslip.position && (
              <div className="flex items-center justify-between px-4 py-2" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>Cargo</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>{payslip.position}</span>
              </div>
            )}
            {payslip.contractType && (
              <div className="flex items-center justify-between px-4 py-2" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>Contrato</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>{payslip.contractType}</span>
              </div>
            )}
            {payslip.daysWorked !== null && (
              <div className="flex items-center justify-between px-4 py-2" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>Días trabajados</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>{payslip.daysWorked}</span>
              </div>
            )}
          </div>
        )}

        <Group title="Haberes imponibles" items={payslip.haberesImponibles} />
        <Group title="Haberes no imponibles" items={payslip.haberesNoImponibles} />
        <Group title="Descuentos legales" items={payslip.descuentosLegales} />
        <Group title="Otros descuentos" items={payslip.otrosDescuentos} />

        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Total haberes</span>
          <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatCLP(payslip.totalHaberes)}</span>
        </div>
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Total descuentos</span>
          <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--coral)' }}>−{formatCLP(payslip.totalDescuentos)}</span>
        </div>
      </div>
    </div>
  )
}
