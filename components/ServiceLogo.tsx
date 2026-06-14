'use client'

import { useState, useEffect } from 'react'
import { nameToEmoji } from '@/lib/services'

interface Props {
  domain?: string | null
  name: string
  size?: number
  className?: string
  fallbackColor?: string   // color de marca para el fallback
}

function nameColor(name: string): string {
  const palette = ['#0093BC', '#0D9488', '#DC2626', '#D97706', '#6366F1', '#DB2777', '#2563EB', '#059669']
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return palette[Math.abs(hash) % palette.length]
}

function logoUrl(domain: string): string {
  return `/api/logo?domain=${encodeURIComponent(domain)}`
}

export default function ServiceLogo({ domain, name, size = 36, className, fallbackColor }: Props) {
  const [confirmedUrl, setConfirmedUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!domain) { setConfirmedUrl(null); return }
    const url = logoUrl(domain)
    const img = new window.Image()
    img.onload = () => setConfirmedUrl(url)
    img.onerror = () => setConfirmedUrl(null)
    img.src = url
    return () => { img.onload = null; img.onerror = null }
  }, [domain])

  const baseClass = `rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center ${className ?? ''}`

  if (confirmedUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={confirmedUrl}
        alt={name}
        width={size}
        height={size}
        className={`${baseClass} object-contain bg-white p-1`}
        style={{ width: size, height: size }}
      />
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
