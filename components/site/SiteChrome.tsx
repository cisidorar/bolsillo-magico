import Link from 'next/link'

// Encabezado y pie de las páginas públicas (landing, seguridad, inicio de
// sesión). Antes cada una tenía su propia cabecera —o ninguna: el login era una
// tarjeta suelta— y pasar de una a otra se sentía como cambiar de ventana.
// Sin estado ni 'use client': sirve igual desde páginas de servidor y de cliente.
//
// Fuera de la landing los enlaces llevan ?landing=1: con sesión iniciada, "/"
// redirige al dashboard y ese atajo deja ver la landing.

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/bolsillo-magico-icono.svg" alt="" width={32} height={32} className="rounded-xl" />
      <span className="text-lg" style={{ fontFamily: 'var(--font-fredoka), sans-serif', color: 'var(--ink)' }}>
        <span style={{ fontWeight: 500 }}>Bolsillo </span><span style={{ fontWeight: 600, color: 'var(--primary-text)' }}>Mágico</span>
      </span>
    </span>
  )
}

const textLink = 'hidden sm:inline-flex items-center min-h-[44px] px-3 text-sm font-semibold rounded-xl'

export function SiteHeader({ home = false, current }: { home?: boolean; current?: 'login' | 'seguridad' }) {
  const base = home ? '' : '/?landing=1'
  const tone = (on: boolean) => ({ color: on ? 'var(--primary-text)' : 'var(--ink-2)' })
  return (
    <header className="sticky top-0 z-40" style={{ background: 'color-mix(in srgb, var(--bg) 88%, transparent)', backdropFilter: 'blur(14px)' }}>
      <nav className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4" aria-label="Principal">
        <Link href="/?landing=1" aria-label="Bolsillo Mágico, página principal" className="min-h-[44px] inline-flex items-center"><Wordmark /></Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <a href={`${base}#pilares`} className={textLink} style={tone(false)}>Qué hace</a>
          <Link href="/seguridad" className={textLink} style={tone(current === 'seguridad')} aria-current={current === 'seguridad' ? 'page' : undefined}>Seguridad</Link>
          <Link href="/login" className={textLink} style={tone(current === 'login')} aria-current={current === 'login' ? 'page' : undefined}>Iniciar sesión</Link>
          <a href={`${base}#lista`} className={textLink} style={tone(false)}>Pedir acceso</a>
          <Link href="/demo" className="cta-primary inline-flex items-center min-h-[44px] px-4 rounded-xl text-sm font-bold transition-transform active:scale-[.98]">
            Probar la demo
          </Link>
        </div>
      </nav>
    </header>
  )
}

export function SiteFooter({ year, extraBottomPad = false }: { year: number; extraBottomPad?: boolean }) {
  const link = 'min-h-[44px] inline-flex items-center font-semibold'
  return (
    <footer className={`mx-auto w-full max-w-6xl px-4 sm:px-6 py-10 ${extraBottomPad ? 'pb-28 sm:pb-10' : ''} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}>
      <Wordmark />
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-sm">
        <Link href="/demo" className={link} style={{ color: 'var(--ink-2)' }}>Demo</Link>
        <Link href="/seguridad" className={link} style={{ color: 'var(--ink-2)' }}>Seguridad</Link>
        <Link href="/login" className={link} style={{ color: 'var(--ink-2)' }}>Iniciar sesión</Link>
        <span style={{ color: 'var(--ink-3)' }}>Hecho en Chile · {year}</span>
      </div>
    </footer>
  )
}
