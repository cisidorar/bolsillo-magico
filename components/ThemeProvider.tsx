'use client'

import { useEffect } from 'react'

/**
 * Syncs localStorage with whatever theme SSR or the flash-prevention script
 * applied. Runs after hydration so it never conflicts with server-rendered class.
 */
export default function ThemeProvider() {
  useEffect(() => {
    // Write current DOM state to localStorage so ThemeToggle & future reloads stay in sync
    const isDark = document.documentElement.classList.contains('dark')
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [])

  return null
}
