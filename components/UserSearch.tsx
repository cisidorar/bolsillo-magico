'use client'

import { useEffect, useState } from 'react'
import { AtSign, Check, Loader2, UserX } from 'lucide-react'
import { findSharedUser, type FoundUser } from '@/app/actions/shared'
import { normalizeUsername, usernameError } from '@/lib/username'
import { InputRow, inputClass } from './SheetParts'

/**
 * Búsqueda exacta por @usuario (como Discord). Avisa al padre con la persona
 * encontrada (o null). No deja elegir a uno mismo ni a quien ya está en `exclude`.
 */
export default function UserSearch({
  onPick, exclude = [], invalid,
}: {
  onPick:   (u: FoundUser | null) => void
  exclude?: string[]
  invalid?: boolean
}) {
  const [handle, setHandle] = useState('')
  const [found, setFound] = useState<FoundUser | null>(null)
  const [lookup, setLookup] = useState<'idle' | 'searching' | 'found' | 'none'>('idle')

  useEffect(() => {
    const u = normalizeUsername(handle)
    setFound(null); onPick(null)
    if (!u || usernameError(u)) { setLookup('idle'); return }
    setLookup('searching')
    let cancelled = false
    const t = setTimeout(async () => {
      const res = await findSharedUser(u)
      if (cancelled) return
      setFound(res)
      setLookup(res ? 'found' : 'none')
      onPick(res && !res.isSelf && !exclude.includes(res.username) ? res : null)
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle])

  const already = found ? exclude.includes(found.username) : false

  return (
    <div>
      <InputRow icon={<AtSign className="w-4 h-4" />} invalid={invalid}>
        <input value={handle} onChange={e => setHandle(e.target.value)} placeholder="usuario"
          className={inputClass} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={21} />
        {lookup === 'searching' && <Loader2 className="w-4 h-4 text-gray-300 animate-spin flex-shrink-0" />}
      </InputRow>

      {lookup === 'found' && found && (
        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5">
          {found.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={found.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
              style={{ background: 'var(--primary)' }}>
              {found.displayName.replace('@', '')[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm font-semibold text-gray-900 truncate">{found.displayName}</p>
            <p className="text-xs text-gray-400 truncate">@{found.username}</p>
          </div>
          {found.isSelf
            ? <span className="text-xs font-semibold text-gray-400">Ese eres tú</span>
            : already
              ? <span className="text-xs font-semibold text-gray-400">Ya está</span>
              : <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--mint)' }} />}
        </div>
      )}
      {lookup === 'none' && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
          <UserX className="w-3.5 h-3.5" /> No encontramos a nadie con @{normalizeUsername(handle)}.
        </p>
      )}
    </div>
  )
}
