import { useCallback, useRef, type MouseEvent } from 'react'

// ── Cerrar modal solo con click "puro" en el backdrop ────────────────────────
// Bug real (reportado por Cas, ago 2026): al seleccionar texto en un input
// arrastrando el mouse (ej. seleccionar todo el N° de acciones para borrarlo
// de una), si el arrastre termina fuera del panel del modal, el navegador
// dispara el evento click en el ancestro común de mousedown/mouseup — que es
// el propio backdrop — y el modal se cerraba solo, perdiendo lo que el
// usuario estaba escribiendo. El chequeo `e.target === e.currentTarget` en
// un solo onClick no alcanza: el "target" de un click que terminó en drag no
// es de fiar. Hay que confirmar que el MOUSEDOWN también empezó en el
// backdrop, no solo dónde terminó el mouseup.
//
// Uso: reemplaza `onClick={e => { if (e.target === e.currentTarget) close() }}`
// por `{...useBackdropClose(close)}` en el div del backdrop (fixed inset-0).
export function useBackdropClose(onClose: () => void) {
  const downOnBackdrop = useRef(false)
  return {
    onMouseDown: (e: MouseEvent) => { downOnBackdrop.current = e.target === e.currentTarget },
    onClick: (e: MouseEvent) => {
      if (downOnBackdrop.current && e.target === e.currentTarget) onClose()
    },
  }
}

// ── Backdrop + semántica de diálogo ──────────────────────────────────────────
// Igual que useBackdropClose, más lo que un sheet modal necesita: role="dialog",
// nombre accesible, Escape para cerrar y foco que entra al abrir y vuelve al
// elemento anterior al cerrar. El listener de Escape solo existe mientras el
// overlay está montado (va en un callback ref), así que llamar el hook siempre
// —como exige el orden de hooks— no cierra sheets que no están abiertos.
// Pila de sheets abiertos: cuando uno se abre sobre otro (detalle → comprar),
// Escape cierra solo el de arriba. Los dos listeners viven en `document`, y
// stopPropagation no frena a un hermano del mismo nodo.
const openDialogs: object[] = []

export function useBackdropDialog(onClose: () => void, label: string) {
  const backdrop = useBackdropClose(onClose)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const cleanup = useRef<(() => void) | null>(null)

  const ref = useCallback((el: HTMLDivElement | null) => {
    if (cleanup.current) { cleanup.current(); cleanup.current = null }
    if (!el) return
    const previous = document.activeElement as HTMLElement | null
    const token = {}
    openDialogs.push(token)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openDialogs[openDialogs.length - 1] === token) {
        e.stopPropagation(); closeRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    el.style.outline = 'none'
    // Si un hijo ya tomó el foco (autoFocus de un input), no se lo quitamos.
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true })
    cleanup.current = () => {
      document.removeEventListener('keydown', onKey)
      const i = openDialogs.indexOf(token)
      if (i >= 0) openDialogs.splice(i, 1)
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true })
    }
  }, [])

  return {
    ...backdrop,
    ref,
    role: 'dialog' as const,
    'aria-modal': true as const,
    'aria-label': label,
    tabIndex: -1,
  }
}
