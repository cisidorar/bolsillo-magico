'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Anima el cambio de una cifra (no su primera aparición): al registrar o borrar un
 * gasto el número sube con un pequeño desenfoque, así se nota que se actualizó.
 * Al cargar la página no se mueve nada.
 */
export default function FlipNumber({ value, children }: { value: number | string; children: ReactNode }) {
  const prev = useRef(value)
  const [n, setN] = useState(0)
  useEffect(() => {
    if (prev.current !== value) { prev.current = value; setN(x => x + 1) }
  }, [value])
  return <span key={n} className={n > 0 ? 'sd-flip inline-block' : undefined}>{children}</span>
}
