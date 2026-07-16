import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/inicio', '/analisis', '/recurrentes', '/historial', '/inversiones', '/presupuesto', '/ingresos', '/categorias', '/metodos', '/cuenta', '/ajustes'],
      },
    ],
    sitemap: 'https://bolsillomagico.com/sitemap.xml',
  }
}
