import type { Metadata } from 'next'

// Una sola promesa en los tres puntos de contacto (Google, vista previa del
// link y H1 de la landing). Google corta el título cerca de los 60 caracteres
// y la descripción cerca de los 155: ambos caben enteros.
const title = 'Bolsillo Mágico — Cuándo pagas cada compra con tarjeta'
const description =
  'Ve cuándo pagas cada compra con tarjeta, cuánto viene en tu próximo estado de cuenta y cuánto te queda del sueldo. Hecha para Chile.'

// El layout raíz marca todo como noindex (la app es privada); la landing y la
// demo son la excepción pública y lo sobrescriben acá.
export const metadata: Metadata = {
  title: { absolute: title },
  description,
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

// Para que Google muestre «Bolsillo Mágico» como nombre del sitio y no el
// dominio. Sin precios, valoraciones ni reseñas: no existen.
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Bolsillo Mágico',
  alternateName: 'Bolsillo Magico',
  url: 'https://bolsillomagico.com',
  inLanguage: 'es-CL',
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  )
}
