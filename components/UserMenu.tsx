'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ChevronUp, ChevronDown, ChevronRight, Sparkles, Bell, Moon, Sun, LogOut } from 'lucide-react'
import { saveThemeAction } from '@/app/actions/theme'

interface Props {
  name:      string
  email:     string
  avatarUrl: string | null
}

/**
 * Menú de usuario al fondo del SideNav (Fase 1 del plan de configuración).
 * Popover hacia arriba con perfil, preferencias, notificaciones, tema y logout.
 */
export default function UserMenu({ name, email, avatarUrl }: Props) {
  const [open, setOpen] = useState(false)
  const [dark, setDark] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Estado del tema (misma fuente de verdad que ThemeToggle)
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains('dark'))
    })
    observer.observe(document.documentElement, { attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  // Cerrar con click fuera o Escape
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggleTheme() {
    const html = document.documentElement
    const next: 'light' | 'dark' = html.classList.contains('dark') ? 'light' : 'dark'
    html.classList.toggle('dark', next === 'dark')
    try { localStorage.setItem('theme', next) } catch { /* modo privado */ }
    setDark(next === 'dark')
    saveThemeAction(next)
  }

  const initial = (name || email || '?').charAt(0).toUpperCase()

  const Avatar = ({ size }: { size: number }) => (
    avatarUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt={name} width={size} height={size}
        className="rounded-full flex-shrink-0 object-cover" style={{ width: size, height: size }} />
    ) : (
      <div className="rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white"
        style={{ width: size, height: size, background: 'var(--primary)', fontSize: size * 0.42 }}>
        {initial}
      </div>
    )
  )

  return (
    <div ref={ref} className="relative">

      {/* ── Popover hacia arriba ─────────────────────────────────────────── */}
      {open && (
        <div
          className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden z-50"
          style={{
            background: 'var(--surface)',
            border: '1.5px solid var(--border)',
            borderRadius: 18,
            boxShadow: '0 8px 18px var(--shadow)',
          }}
        >
          {/* Header: perfil */}
          <Link
            href="/ajustes#perfil"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3.5 py-3.5 transition-colors hover:bg-black/5 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <Avatar size={36} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{name}</p>
              <p className="text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>{email}</p>
            </div>
            <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
          </Link>

          {/* Accesos */}
          <div className="py-1">
            <Link
              href="/ajustes#preferencias"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3.5 py-2.5 text-sm font-semibold transition-colors hover:bg-black/5"
              style={{ color: 'var(--ink-2)' }}
            >
              <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--mint)' }} />
              Preferencias
            </Link>
            <Link
              href="/ajustes#notificaciones"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3.5 py-2.5 text-sm font-semibold transition-colors hover:bg-black/5"
              style={{ color: 'var(--ink-2)' }}
            >
              <Bell className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--primary)' }} />
              Notificaciones
            </Link>

            {/* Tema — toggle inline */}
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-semibold transition-colors hover:bg-black/5"
              style={{ color: 'var(--ink-2)' }}
            >
              {dark
                ? <Moon className="w-4 h-4 flex-shrink-0" style={{ color: '#818cf8' }} />
                : <Sun className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--gold)' }} />}
              <span className="flex-1 text-left">Modo oscuro</span>
              <span
                role="switch"
                aria-checked={dark}
                className="relative flex-shrink-0 w-9 h-5 rounded-full transition-colors duration-200"
                style={{ backgroundColor: dark ? 'var(--primary)' : 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform duration-200"
                  style={{ transform: dark ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </span>
            </button>
          </div>

          {/* Cerrar sesión */}
          <form action="/api/auth/signout" method="post" className="border-t" style={{ borderColor: 'var(--border)' }}>
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-semibold transition-colors hover:bg-black/5"
              style={{ color: 'var(--coral)' }}
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              Cerrar sesión
            </button>
          </form>
        </div>
      )}

      {/* ── Trigger ──────────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-all duration-150"
        style={{ color: 'var(--ink-2)', background: open ? 'var(--surface-2)' : undefined }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)' }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.background = '' }}
      >
        <Avatar size={28} />
        <span className="flex-1 text-left truncate" style={{ color: 'var(--ink)' }}>{name}</span>
        {open
          ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
          : <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />}
      </button>
    </div>
  )
}
