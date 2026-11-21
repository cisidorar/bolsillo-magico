import type { Metadata } from 'next'

// Pública e indexable, como la landing (el layout raíz es noindex).
export const metadata: Metadata = {
  title: { absolute: 'Demo — Bolsillo Mágico' },
  description: 'Prueba Bolsillo Mágico sin cuenta: cuándo pagas cada compra con tarjeta, lo que queda de tu sueldo, tus cobros fijos y lo que te deben, con datos de ejemplo.',
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://www.bolsillomagico.com/demo' },
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
