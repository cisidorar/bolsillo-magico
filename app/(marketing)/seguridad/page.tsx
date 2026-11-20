import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

const title = 'Cómo cuidamos tus datos — Bolsillo Mágico'
const description =
  'Qué guardamos, dónde, quién puede verlo y qué no hacemos. Sin claves bancarias, sin rastreadores de terceros y con tus gastos exportables en CSV.'

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: 'https://bolsillomagico.com/seguridad' },
}

// Solo lo que se puede verificar en el código y la configuración de la app.
// Si algo de acá cambia (un proveedor, una función de IA, el borrado de
// cuenta), esta página se corrige antes de publicar el cambio.
const sections: { title: string; items: { head: string; body: string }[] }[] = [
  {
    title: 'Lo que no hacemos',
    items: [
      { head: 'No nos conectamos a tu banco', body: 'Nunca te pedimos la clave de tu banco ni de tus tarjetas. Registras tú tus gastos, o importas un CSV.' },
      { head: 'No hay rastreadores de terceros', body: 'La app no carga analítica ni publicidad de terceros, y tu navegador solo puede conectarse a nuestro propio servidor y a la base de datos.' },
      { head: 'No vendemos tus datos', body: 'No hay publicidad ni modelo de negocio que dependa de tus movimientos.' },
      { head: 'No movemos plata ni damos asesoría', body: 'Bolsillo Mágico no es un banco ni custodia dinero: es una herramienta de seguimiento. Lo que muestra no es una recomendación financiera.' },
    ],
  },
  {
    title: 'Cómo se guardan',
    items: [
      { head: 'Una base de datos administrada', body: 'Tus datos viven en una base de datos Postgres administrada por Supabase. Viajan por HTTPS y el proveedor los cifra en reposo.' },
      { head: 'Cada persona ve solo lo suyo', body: 'La propia base de datos aplica reglas por usuario: aunque hubiera un error en la aplicación, una consulta solo puede leer las filas de tu cuenta.' },
      { head: 'Sesión verificada', body: 'Cada visita a una página privada vuelve a validar tu sesión con el servidor de autenticación, no solo con lo que guarda tu navegador.' },
    ],
  },
  {
    title: 'La inteligencia artificial, con transparencia',
    items: [
      { head: 'Dos funciones usan un proveedor externo', body: 'Sugerir la categoría de un gasto envía a ese proveedor la descripción que escribiste, los nombres de tus categorías y algunos ejemplos de descripciones. La revisión del mes envía totales (gasto, ingreso, ahorro), sin descripciones. Nunca enviamos tu correo ni claves.' },
      { head: 'Si no quieres usarlas', body: 'Son un módulo aparte: pídenos que lo apaguemos y tu cuenta deja de usarlas.' },
    ],
  },
  {
    title: 'Tus datos son tuyos',
    items: [
      { head: 'Te los llevas cuando quieras', body: 'Puedes exportar todos tus gastos en CSV en cualquier momento.' },
    ],
  },
]

export default function SeguridadPage() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <header className="mx-auto max-w-3xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/?landing=1" className="min-h-[44px] inline-flex items-center gap-2" aria-label="Bolsillo Mágico, inicio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bolsillo-magico-icono.svg" alt="" width={32} height={32} className="rounded-xl" />
          <span className="text-lg" style={{ fontFamily: 'var(--font-fredoka), sans-serif' }}>
            <span style={{ fontWeight: 500 }}>Bolsillo </span><span style={{ fontWeight: 600, color: 'var(--primary-text)' }}>Mágico</span>
          </span>
        </Link>
        <Link href="/demo" className="cta-primary inline-flex items-center min-h-[44px] px-4 rounded-xl text-sm font-bold">Probar la demo</Link>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 pt-8 pb-20 lg:pt-14">
        <h1 className="text-3xl lg:text-5xl font-semibold leading-tight text-balance" style={{ color: 'var(--ink)' }}>
          Cómo cuidamos tus datos.
        </h1>
        <p className="mt-4 text-lg leading-relaxed max-w-[56ch]" style={{ color: 'var(--ink-2)' }}>
          Lo que sigue es lo que hoy hace la aplicación, escrito sin adornos. Si algo cambia, esta página cambia antes.
        </p>

        <div className="mt-10 space-y-5">
          {sections.map(sec => (
            <section key={sec.title} className="card p-6 lg:p-8">
              <h2 className="text-xl lg:text-2xl font-semibold" style={{ color: 'var(--ink)' }}>{sec.title}</h2>
              <ul className="mt-5 space-y-5">
                {sec.items.map(it => (
                  <li key={it.head}>
                    <p className="text-base font-semibold" style={{ color: 'var(--ink)' }}>{it.head}</p>
                    <p className="mt-1 text-base leading-relaxed max-w-[62ch]" style={{ color: 'var(--ink-2)' }}>{it.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section className="rounded-3xl p-6 lg:p-8" style={{ background: 'var(--surface-2)' }}>
            <h2 className="text-xl lg:text-2xl font-semibold" style={{ color: 'var(--ink)' }}>Lo que todavía no tenemos</h2>
            <p className="mt-3 text-base leading-relaxed max-w-[62ch]" style={{ color: 'var(--ink-2)' }}>
              Bolsillo Mágico es nuevo. No tiene una auditoría de seguridad externa ni certificaciones, y no es una entidad regulada por la CMF. Preferimos decírtelo antes de que lo preguntes.
            </p>
          </section>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <Link href="/demo" className="cta-primary inline-flex items-center justify-center gap-2 min-h-[52px] px-6 rounded-2xl text-base font-bold">
            Probar la demo <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
          <Link href="/?landing=1#lista" className="inline-flex items-center justify-center min-h-[52px] px-6 rounded-2xl text-base font-bold"
            style={{ color: 'var(--primary-text)' }}>
            Pedir acceso
          </Link>
        </div>
      </main>
    </div>
  )
}
