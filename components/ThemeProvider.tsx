'use client'

import { useEffect } from 'react'

/**
 * Syncs localStorage to match whatever class SSR applied.
 * Does NOT override the server-rendered class — that prevents dark mode
 * from bleeding into unauthenticated pages like login.
 */
export default function ThemeProvider() {
  useEffect(() => {
    // Write SSR state to localStorage so ThemeToggle stays in sync
    const isDark = document.documentElement.classList.contains('dark')
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [])

  return null
}
