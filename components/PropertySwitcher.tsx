'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, ChevronDown, Plus } from 'lucide-react'

export interface SwitcherProperty {
  id: string
  alias: string
  address: string | null
  comuna: string | null
}

/**
 * Selector de propiedad, a la izquierda del toggle de vista.
 *
 * Con una sola propiedad no se renderiza: un desplegable de un elemento es
 * ruido. Aparece recién cuando hay algo que elegir — o cuando hay más de una
 * y el usuario necesita saber cuál está mirando.
 *
 * La propiedad activa vive en la URL (?prop=<id>), no en estado local: así el
 * back del navegador funciona y el toggle Estado/Cobros puede conservarla.
 */
export default function PropertySwitcher({
  properties, activeId, view,
}: {
  properties: SwitcherProperty[]
  activeId: string
  view: 'estado' | 'cobros'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Cierra al clickear fuera o al apretar Escape. Sin esto el menú queda
  // pegado y tapa el contenido al navegar.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (properties.length === 0) return null

  const active = properties.find(p => p.id === activeId) ?? properties[0]

  function go(id: string) {
    const params = new URLSearchParams()
    params.set('prop', id)
    if (view === 'cobros') params.set('view', 'cobros')
    router.push(`/propiedad?${params.toString()}`)
    setOpen(false)
  }

  // Agregar vive en la URL (?nueva=1) y no en un callback: el switcher lo
  // renderiza el server component y el formulario vive dentro del manager,
  // que es cliente. La URL es el único canal que los une sin subir estado.
  function goNew() {
    router.push('/propiedad?nueva=1')
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
        style={{
          background: 'var(--surface-2)',
          color: 'var(--ink-2)',
          border: '1.5px solid var(--border)',
        }}
      >
        <Building2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
        <span className="max-w-[9rem] truncate">{active?.alias ?? 'Propiedad'}</span>
        <ChevronDown
          className="w-3.5 h-3.5 flex-shrink-0 transition-transform"
          style={{ color: 'var(--ink-3)', transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-64 rounded-2xl overflow-hidden z-50"
          style={{
            background: 'var(--surface)',
            border: '1.5px solid var(--border)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          }}
        >
          {properties.map(p => {
            const isActive = p.id === active?.id
            return (
              <button
                key={p.id}
                onClick={() => go(p.id)}
                className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left transition-colors"
                style={{ background: isActive ? 'var(--surface-2)' : 'transparent' }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>
                    {p.address || p.alias}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--ink-3)' }}>
                    {[p.alias, p.comuna].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {isActive && (
                  <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} strokeWidth={2.5} />
                )}
              </button>
            )
          })}

          <button
            onClick={goNew}
            className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left transition-colors"
            style={{ borderTop: '1.5px solid var(--border)' }}
          >
            <Plus className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} strokeWidth={2.5} />
            <span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>
              Agregar propiedad
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
