import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://www.bolsillomagico.com',      changeFrequency: 'monthly', priority: 1 },
    { url: 'https://www.bolsillomagico.com/demo', changeFrequency: 'monthly', priority: 0.8 },
    { url: 'https://www.bolsillomagico.com/seguridad', changeFrequency: 'monthly', priority: 0.5 },
  ]
}
