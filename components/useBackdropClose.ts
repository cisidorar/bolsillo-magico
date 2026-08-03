import { useRef, type MouseEvent } from 'react'

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
