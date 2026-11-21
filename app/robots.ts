import { MetadataRoute } from 'next'

// Nov 2026: la landing y la demo vuelven a ser públicas (el registro sigue
// cerrado). Solo esas se rastrean; todo lo demás es la app privada.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/$', '/demo', '/seguridad'], disallow: '/' }],
    sitemap: 'https://www.bolsillomagico.com/sitemap.xml',
  }
}
