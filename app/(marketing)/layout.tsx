import type { Metadata } from 'next'

const title = 'Bolsillo Mágico — Control de gastos personales'
const description =
  'App gratuita para controlar tus gastos personales: registra gastos en segundos, analiza en qué se va tu plata, controla suscripciones y cuotas, define presupuestos y sigue tus inversiones en dólares. Todo en un solo lugar.'

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    'control de gastos',
    'app de gastos personales',
    'presupuesto mensual',
    'control de finanzas personales',
    'app para ahorrar',
    'gastos recurrentes',
    'suscripciones y cuotas',
    'finanzas personales Chile',
  ],
  alternates: { canonical: 'https://bolsillomagico.com' },
  openGraph: {
    title,
    description,
    url: 'https://bolsillomagico.com',
    siteName: 'Bolsillo Mágico',
    locale: 'es_CL',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
