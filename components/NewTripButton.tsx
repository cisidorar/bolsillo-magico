'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import NewTripSheet from './NewTripSheet'

export default function NewTripButton({ label = 'Nuevo viaje' }: { label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold active:scale-[.98]"
        style={{ background: 'var(--primary)', color: 'var(--primary-ink)', boxShadow: '0 6px 18px var(--shadow)' }}>
        <Plus className="w-4 h-4" strokeWidth={2.5} /> {label}
      </button>
      {open && <NewTripSheet onClose={() => setOpen(false)} />}
    </>
  )
}
