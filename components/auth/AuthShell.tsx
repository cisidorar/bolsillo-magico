import Link from 'next/link'

// Cáscara común de las pantallas de acceso (login, crear/cambiar contraseña).
// Antes cada una tenía su propio fondo, tarjeta y CSS; ahora son una sola cara.
// Server Component: sin estado, solo estructura y estilos de los campos.
export default function AuthShell({ title, subtitle, children, footer, logoLink = true }: {
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** En la app instalada (PWA) el logo no debe sacar a la persona hacia la landing. */
  logoLink?: boolean
}) {
  return (
    <main className="min-h-svh flex flex-col items-center justify-center px-5 py-10"
          style={{ background: 'var(--bg)', paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}>
      <style>{`
        @keyframes auth-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .auth-spinner { animation-duration: 2s !important; } }
        .auth-spinner { animation: auth-spin .7s linear infinite; }
        .auth-field {
          display:flex; align-items:center; gap:10px;
          background: var(--surface-2); border:1.5px solid transparent;
          border-radius:14px; padding:0 14px; min-height:52px;
        }
        .auth-field:focus-within { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
        .auth-field[data-invalid="true"] { border-color: var(--coral-ink); }
        /* 16px: por debajo de eso iOS Safari hace zoom al enfocar el campo. */
        .auth-field input {
          flex:1; background:transparent; border:none; outline:none;
          font-size:16px; color: var(--ink); font-family:inherit; min-width:0; min-height:48px;
        }
        .auth-field input::placeholder { color: var(--ink-3); }
        /* Edge pinta su propio ojo en los campos de contraseña: se oculta para que no haya dos. */
        .auth-field input::-ms-reveal, .auth-field input::-ms-clear { display:none; }
      `}</style>

      {logoLink ? (
        <Link href="/" className="flex flex-col items-center mb-7 min-h-[44px]" aria-label="Bolsillo Mágico, ir al inicio">
        {/* <img> plano: el SVG no pasa por next/image sin dangerouslyAllowSVG. Decorativo: el nombre ya está en el título. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bolsillo-magico-icono.svg" alt="" width={56} height={56} className="mb-3 rounded-2xl" />
        <span className="text-xl" style={{ fontFamily: 'var(--font-fredoka), sans-serif', color: 'var(--ink)' }}>
          <span style={{ fontWeight: 500 }}>Bolsillo </span><span style={{ fontWeight: 600, color: 'var(--primary)' }}>Mágico</span>
        </span>
      </Link>
      ) : (
        <div className="flex flex-col items-center mb-7">
        {/* <img> plano: el SVG no pasa por next/image sin dangerouslyAllowSVG. Decorativo: el nombre ya está en el título. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bolsillo-magico-icono.svg" alt="" width={56} height={56} className="mb-3 rounded-2xl" />
        <span className="text-xl" style={{ fontFamily: 'var(--font-fredoka), sans-serif', color: 'var(--ink)' }}>
          <span style={{ fontWeight: 500 }}>Bolsillo </span><span style={{ fontWeight: 600, color: 'var(--primary)' }}>Mágico</span>
        </span>
      </div>
      )}

      <div className="card w-full max-w-sm p-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>{title}</h1>
        {subtitle && <p className="text-sm mt-1" style={{ color: 'var(--ink-2)' }}>{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>

      {footer && <div className="text-sm mt-6 text-center max-w-sm" style={{ color: 'var(--ink-2)' }}>{footer}</div>}
    </main>
  )
}
