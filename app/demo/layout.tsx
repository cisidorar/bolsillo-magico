import type { Metadata } from 'next'

// Pública e indexable, como la landing (el layout raíz es noindex).
export const metadata: Metadata = {
  title: { absolute: 'Demo — Bolsillo Mágico' },
  description: 'Prueba Bolsillo Mágico sin cuenta: el ciclo de tu tarjeta, lo que queda de tu sueldo, tus cobros fijos y tus inversiones, con datos de ejemplo.',
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://bolsillomagico.com/demo' },
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
