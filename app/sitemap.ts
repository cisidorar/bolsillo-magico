import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://bolsillomagico.com',      changeFrequency: 'monthly', priority: 1 },
    { url: 'https://bolsillomagico.com/demo', changeFrequency: 'monthly', priority: 0.8 },
  ]
}
