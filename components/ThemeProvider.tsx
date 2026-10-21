'use client'

import { useEffect } from 'react'

/**
 * Mantiene la clase `dark` de <html> igual al tema guardado del usuario.
 *
 * El layout raíz persiste entre pantallas: si se renderizó sin sesión (login),
 * el <html> quedó sin tema y una navegación suave a /inicio no lo corregía,
 * así que el modo oscuro "se perdía" al volver a entrar. Cuando el servidor
 * conoce el tema (`serverTheme` no es null) se aplica acá también.
 * Con `null` (sin sesión) no se toca nada: así el oscuro no se filtra al login.
 */
export default function ThemeProvider({ serverTheme }: { serverTheme: 'dark' | 'light' | null }) {
  useEffect(() => {
    if (serverTheme === null) return
    document.documentElement.classList.toggle('dark', serverTheme === 'dark')
    try { localStorage.setItem('theme', serverTheme) } catch { /* sin storage */ }
  }, [serverTheme])

  return null
}
