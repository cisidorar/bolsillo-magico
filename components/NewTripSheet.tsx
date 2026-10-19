'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plane, AtSign, Check, Loader2, UserX } from 'lucide-react'
import { createSharedGroup, ensureTripCategory, findSharedUser, type FoundUser } from '@/app/actions/shared'
import { normalizeUsername, usernameError } from '@/lib/username'
import type { SplitMode } from '@/lib/shared-split'
import { SheetShell, FieldLabel, InputRow, inputClass, Chip, PrimaryButton } from './SheetParts'

const MODES: { key: SplitMode; title: string; hint: string }[] = [
  { key: 'income', title: 'Según sueldo', hint: 'Cada uno paga en proporción a lo que gana. Nadie ve el sueldo del otro, solo el porcentaje.' },
  { key: 'equal',  title: '50 / 50',      hint: 'Mitad y mitad, sin mirar ingresos.' },
  { key: 'fixed',  title: '% fijo',       hint: 'Un porcentaje que acuerdan a mano.' },
]

export default function NewTripSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter()

  const [name,  setName]  = useState('')
  const [start, setStart] = useState('')
  const [end,   setEnd]   = useState('')
  const [handle, setHandle] = useState('')
  const [found, setFound] = useState<FoundUser | null>(null)
  const [lookup, setLookup] = useState<'idle' | 'searching' | 'found' | 'none'>('idle')
  const [mode,  setMode]  = useState<SplitMode>('income')
  const [myPct, setMyPct] = useState('50')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const pct = parseFloat(myPct.replace(',', '.'))
  const pctOk = Number.isFinite(pct) && pct >= 0 && pct <= 100

  // Búsqueda exacta por @usuario, con una pausa para no consultar en cada tecla.
  useEffect(() => {
    const u = normalizeUsername(handle)
    setFound(null)
    if (!u || usernameError(u)) { setLookup('idle'); return }
    setLookup('searching')
    let cancelled = false
    const t = setTimeout(async () => {
      const res = await findSharedUser(u)
      if (cancelled) return
      setFound(res)
      setLookup(res ? 'found' : 'none')
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [handle])

  async function submit() {
    if (!name.trim())  { setError('Ponle un nombre al viaje.'); return }
    if (!found || found.isSelf) { setError('Busca a la otra persona por su @usuario.'); return }
    if (mode === 'fixed' && !pctOk) { setError('El porcentaje tiene que estar entre 0 y 100.'); return }
    setSaving(true); setError('')

    // Tu parte cae en una categoría propia: "Vacaciones" se crea si no existe.
    const cat = await ensureTripCategory()
    const res = await createSharedGroup({
      name: name.trim(), startDate: start || null, endDate: end || null,
      splitMode: mode, fixedRatio: mode === 'fixed' ? pct / 100 : null,
      username: found.username, categoryId: cat.ok ? cat.id : null,
    })
    setSaving(false)
    if (!res.ok) { setError(res.error); return }
    router.push(`/compartidos?g=${res.id}`)
    router.refresh()
    onClose()
  }

  return (
    <SheetShell title="Nuevo viaje" subtitle="Lo comparten dos personas que usan la app." label="Nuevo viaje" onClose={onClose}>
      <InputRow icon={<Plane className="w-4 h-4" />} invalid={!!error && !name.trim()}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre — Ej: Vacaciones Chiloé"
          className={inputClass} maxLength={60} autoFocus />
      </InputRow>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Salida</FieldLabel>
          <InputRow>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} className={inputClass} />
          </InputRow>
        </div>
        <div>
          <FieldLabel>Vuelta</FieldLabel>
          <InputRow>
            <input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)} className={inputClass} />
          </InputRow>
        </div>
      </div>

      <div>
        <FieldLabel hint="Búscala por su @usuario. Lo encuentra en Ajustes → Perfil y en su pantalla de Compartidos.">
          Con quién
        </FieldLabel>
        <InputRow icon={<AtSign className="w-4 h-4" />} invalid={!!error && !found}>
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
              : <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--mint)' }} />}
          </div>
        )}
        {lookup === 'none' && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
            <UserX className="w-3.5 h-3.5" /> No encontramos a nadie con @{normalizeUsername(handle)}.
          </p>
        )}
      </div>

      <div>
        <FieldLabel hint={MODES.find(m => m.key === mode)!.hint}>Cómo se reparte</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {MODES.map(m => (
            <Chip key={m.key} active={mode === m.key} onClick={() => setMode(m.key)}>{m.title}</Chip>
          ))}
        </div>
        {mode === 'fixed' && (
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-gray-500">Tu parte</span>
            <div className="w-24">
              <InputRow>
                <input type="number" inputMode="decimal" min={0} max={100} value={myPct}
                  onChange={e => setMyPct(e.target.value)} className={inputClass + ' text-right tabular-nums'} />
              </InputRow>
            </div>
            <span className="text-xs text-gray-500">%</span>
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-2">
          El reparto queda acordado cuando la otra persona acepta la invitación.
        </p>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <PrimaryButton onClick={submit} disabled={saving}>
        {saving ? 'Creando…' : <><Check className="w-4 h-4" /> Crear e invitar</>}
      </PrimaryButton>
    </SheetShell>
  )
}
