'use client'

import { useEffect } from 'react'

/** Aplica/quita la clase 'dark' en <html> según localStorage. */
export default function ThemeProvider() {
  useEffect(() => {
    const stored = localStorage.getItem('theme')
    if (stored === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  return null
}
