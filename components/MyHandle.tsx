'use client'

import { useState } from 'react'
import { AtSign, Copy, Check } from 'lucide-react'
import Link from 'next/link'

/** "Tu usuario @cas" con botón para copiarlo: es lo que la otra persona busca para invitarte. */
export default function MyHandle({ username }: { username: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText('@' + username)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* sin permiso de portapapeles: el usuario igual está a la vista */ }
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
      style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
      <AtSign className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--primary)' }} />
      <span>Tu usuario <b className="font-bold" style={{ color: 'var(--ink)' }}>@{username}</b></span>
      <button onClick={copy} aria-label="Copiar mi usuario" className="flex items-center" style={{ color: 'var(--ink-3)' }}>
        {copied ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--mint)' }} /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <Link href="/ajustes/perfil" className="font-semibold" style={{ color: 'var(--primary)' }}>Cambiar</Link>
    </div>
  )
}
