'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBackdropClose } from '@/components/useBackdropClose'
import { formatCLP } from '@/lib/utils'
import { getPayslipDownloadUrl, deletePayslip } from '@/app/actions/payslips'
import type { BreakdownLine } from '@/lib/payslip-parser'
import { X, FileText, Download, Trash2, RefreshCw, Loader2 } from 'lucide-react'

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
  isOpen: boolean
  onOpenChange: (open: boolean) => void
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

export default function PayslipDetailSheet({ month, year, monthName, payslip, isOpen, onOpenChange }: Props) {
  const router = useRouter()
  const [downloading, setDownloading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function close() { onOpenChange(false); setConfirmDelete(false) }
  const backdropClose = useBackdropClose(close)

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
    close()
    router.refresh()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end lg:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      {...backdropClose}
    >
      <div
        className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl overflow-hidden"
        style={{ background: 'var(--surface)', maxHeight: '92dvh' }}
      >
        <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 lg:hidden" style={{ background: 'var(--border)' }} />

        <div className="flex items-center gap-3 px-5 pt-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)' }}>
            <FileText className="w-4 h-4" style={{ color: 'var(--primary)' }} strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold truncate" style={{ color: 'var(--ink)' }}>Liquidación de {monthName}</h2>
            {payslip.employerName && <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>{payslip.employerName}</p>}
          </div>
          <button
            onClick={close}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(92dvh - 190px)' }}>

          {/* Líquido — destacado */}
          <div className="rounded-2xl p-4" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--primary)' }}>Líquido a recibir</p>
            <p className="text-2xl font-extrabold tabular-nums" style={{ fontFamily: 'Fredoka, sans-serif', color: 'var(--ink)' }}>
              {formatCLP(payslip.liquido)}
            </p>
          </div>

          {/* Metadata */}
          {(payslip.position || payslip.contractType || payslip.daysWorked) && (
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

          {confirmDelete && (
            <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,111,97,0.08)', border: '1px solid rgba(255,111,97,0.25)' }}>
              <p className="text-sm text-center font-medium" style={{ color: 'var(--ink-2)' }}>
                ¿Eliminar la liquidación de {monthName}? El PDF y el ingreso asociado no se tocan.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
                  style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface)' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold rounded-2xl"
                  style={{ background: 'var(--coral)', color: 'white' }}
                >
                  {deleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  {deleting ? 'Eliminando…' : 'Eliminar'}
                </button>
              </div>
            </div>
          )}
        </div>

        {!confirmDelete && (
          <div className="border-t px-5 py-3 flex items-center gap-2 flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-11 h-11 flex items-center justify-center rounded-2xl border shrink-0 transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--coral)', background: 'var(--surface-2)' }}
              aria-label="Eliminar"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={close}
              className="flex-1 py-3 text-sm font-semibold rounded-2xl border transition-colors"
              style={{ color: 'var(--ink-2)', borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              Cerrar
            </button>
            <button
              onClick={handleDownload}
              disabled={!payslip.pdfPath || downloading}
              className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-2xl transition-all disabled:opacity-50 active:scale-[.98]"
              style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 16px var(--shadow)' }}
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloading ? 'Abriendo…' : 'Descargar PDF'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
