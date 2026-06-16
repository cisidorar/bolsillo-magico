import type { NextConfig } from 'next'

const securityHeaders = [
  // Evita clickjacking — nadie puede embeber la app en un iframe
  { key: 'X-Frame-Options', value: 'DENY' },
  // Evita que el browser "adivine" el tipo de contenido
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // No enviar el referrer al salir del sitio
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Deshabilitar features del browser que la app no necesita
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Forzar HTTPS por 1 año (solo en producción, Vercel lo activa igual)
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // CSP: define desde dónde se pueden cargar recursos
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Scripts: solo self + inline (Next.js no requiere unsafe-eval en producción)
      "script-src 'self' 'unsafe-inline'",
      // Estilos: self + inline (Tailwind genera estilos inline)
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Fuentes
      "font-src 'self' https://fonts.gstatic.com",
      // Imágenes: self + logos externos + data URIs
      "img-src 'self' data: blob: https://lh3.googleusercontent.com https://logo.clearbit.com https://www.google.com https://t2.gstatic.com https://icons.duckduckgo.com",
      // Conexiones: self + Supabase
      `connect-src 'self' https://*.supabase.co wss://*.supabase.co`,
      // Frames: ninguno
      "frame-src 'none'",
      "frame-ancestors 'none'",
      // Objetos (flash, etc.)
      "object-src 'none'",
      // Base URI
      "base-uri 'self'",
      // Forms solo a self
      "form-action 'self'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'logo.clearbit.com' },
      { protocol: 'https', hostname: 'www.google.com' },
      { protocol: 'https', hostname: 't2.gstatic.com' },
      { protocol: 'https', hostname: 'icons.duckduckgo.com' },
      { protocol: 'https', hostname: '*.cl' },
      { protocol: 'https', hostname: '*.com' },
      { protocol: 'https', hostname: '*.life' },
    ],
  },
}

export default nextConfig
