import type { Metadata } from 'next'

const title = 'Bolsillo Mágico — Tu tarjeta, tu sueldo y tus gastos, como funcionan en Chile'
const description =
  'Sabe cuánto vas a pagar en tu próximo estado de cuenta. Bolsillo Mágico entiende el ciclo de tu tarjeta, tu sueldo de fin de mes, tus cuotas y tus cobros fijos. Prueba la demo y pide acceso: se entra por invitación.'

// El layout raíz marca todo como noindex (la app es privada); la landing y la
// demo son la excepción pública y lo sobrescriben acá.
export const metadata: Metadata = {
  title: { absolute: title },
  description,
  keywords: [
    'estado de cuenta tarjeta de crédito',
    'control de gastos Chile',
    'cuotas y suscripciones',
    'presupuesto mensual',
    'sueldo y gastos',
    'finanzas personales Chile',
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://bolsillomagico.com' },
  openGraph: {
    title,
    description,
    url: 'https://bolsillomagico.com',
    siteName: 'Bolsillo Mágico',
    locale: 'es_CL',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title, description },
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
