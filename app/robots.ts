import { MetadataRoute } from 'next'

// A2 (roadmap uso personal, jul 2026): la app dejó de ser pública — cerrar el
// rastreo por completo en vez de exponer la lista de rutas del dashboard.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: '/',
      },
    ],
  }
}
