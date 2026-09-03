'use client'

import { useState, useEffect } from 'react'
import { nameToEmoji } from '@/lib/services'

interface Props {
  domain?: string | null
  name: string
  size?: number
  className?: string
  fallbackColor?: string   // color de marca para el fallback
  /** sep 2026 (Cas: "mejora la calidad del icono del banco de chile"): exige
   *  un mínimo de resolución. Si el mejor ícono disponible no llega, el proxy
   *  responde 404 y se dibuja el monograma en vez de estirar un favicon de
   *  16px. Caso real: Banco de Chile solo publica 16×16 — no hay fuente mejor
   *  que traer, así que la única forma de que se vea bien es no usarlo. */
  minPx?: number
}

function nameColor(name: string): string {
  const palette = ['#0093BC', '#0D9488', '#DC2626', '#D97706', '#6366F1', '#DB2777', '#2563EB', '#059669']
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return palette[Math.abs(hash) % palette.length]
}

function logoUrl(domain: string, minPx?: number): string {
  const q = new URLSearchParams({ domain })
  if (minPx) q.set('minPx', String(minPx))
  return `/api/logo?${q}`
}

export default function ServiceLogo({ domain, name, size = 36, className, fallbackColor, minPx }: Props) {
  const [confirmedUrl, setConfirmedUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!domain) { setConfirmedUrl(null); return }
    const url = logoUrl(domain, minPx)
    const img = new window.Image()
    img.onload = () => setConfirmedUrl(url)
    img.onerror = () => setConfirmedUrl(null)
    img.src = url
    return () => { img.onload = null; img.onerror = null }
  }, [domain, minPx])

  const baseClass = `rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center ${className ?? ''}`

  if (confirmedUrl) {
    return (
      <div
        className={`${baseClass} service-logo-bg p-1`}
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={confirmedUrl}
          alt={name}
          className="object-contain w-full h-full"
        />
      </div>
    )
  }

  const color = fallbackColor ?? nameColor(name)
  const emoji = nameToEmoji(name)

  // Fallback con emoji si hay mapeo, si no inicial
  return (
    <div
      className={baseClass}
      style={{ width: size, height: size, backgroundColor: color }}
    >
      {emoji ? (
        <span style={{ fontSize: Math.round(size * 0.52), lineHeight: 1 }}>{emoji}</span>
      ) : (
        <span style={{ color: 'white', fontWeight: 700, fontSize: Math.round(size * 0.38), lineHeight: 1 }}>
          {name.trim()[0]?.toUpperCase() ?? '?'}
        </span>
      )}
    </div>
  )
}
