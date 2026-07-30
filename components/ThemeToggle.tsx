'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { saveThemeAction } from '@/app/actions/theme'
import { useToast } from '@/components/ToastProvider'

export default function ThemeToggle() {
  const [dark, setDark] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))

    const observer = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains('dark'))
    })
    observer.observe(document.documentElement, { attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  async function persist(next: 'light' | 'dark') {
    const { ok } = await saveThemeAction(next)
    if (!ok) {
      // Antes esto fallaba en silencio: se veía "guardado" en este
      // dispositivo pero profiles.theme nunca se actualizaba, así que otro
      // dispositivo (ej. el celular) seguía mostrando la preferencia vieja
      // sin ningún aviso. Ahora se avisa y se puede reintentar al toque.
      showToast('No se pudo sincronizar el modo oscuro con tu cuenta', {
        action: { label: 'Reintentar', onClick: () => persist(next) },
      })
    }
  }

  function toggle() {
    const html = document.documentElement
    const next: 'light' | 'dark' = html.classList.contains('dark') ? 'light' : 'dark'

    if (next === 'dark') {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }

    localStorage.setItem('theme', next)
    setDark(next === 'dark')

    // Persist to Supabase so preference syncs across devices
    persist(next)
  }

  return (
    <div className="flex items-center gap-4 px-4 py-4">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: dark ? '#1e293b' : '#F5F3FF' }}>
        {dark
          ? <Moon className="w-5 h-5" style={{ color: '#818cf8' }} />
          : <Sun  className="w-5 h-5" style={{ color: '#F59E0B' }} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">Modo oscuro</p>
        <p className="text-xs text-gray-400 mt-0.5">{dark ? 'Activado' : 'Desactivado'}</p>
      </div>
      <button
        onClick={toggle}
        role="switch"
        aria-checked={dark}
        className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200"
        style={{ backgroundColor: dark ? 'var(--primary)' : '#d1d5db' }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
          style={{ transform: dark ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  )
}
