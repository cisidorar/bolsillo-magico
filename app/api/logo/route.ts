import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Dominios internos que nunca deben ser contactados (SSRF protection)
const BLOCKED_PATTERNS = /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/i

// Proxy server-side para logos — evita restricciones CORS/localhost del browser
export async function GET(request: Request) {
  // Requiere sesión activa — evita que sea usado como proxy anónimo
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse(null, { status: 401 })

  const { searchParams } = new URL(request.url)
  const domain = searchParams.get('domain')
  if (!domain || !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
    return new NextResponse(null, { status: 400 })
  }

  // Bloquear IPs y hostnames internos
  if (BLOCKED_PATTERNS.test(domain)) {
    return new NextResponse(null, { status: 400 })
  }

  const sources = [
    `https://logo.clearbit.com/${domain}`,
    `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.${domain}&size=128`,
    `https://www.google.com/s2/favicons?domain=www.${domain}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  ]

  for (const url of sources) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(4000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Gstos/1.0)' },
      })
      if (!res.ok) continue

      const buffer = await res.arrayBuffer()
      // Descartar si es muy pequeño (icono genérico de 16px suele ser <1KB)
      if (buffer.byteLength < 200) continue

      const contentType = res.headers.get('content-type') ?? 'image/png'
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
        },
      })
    } catch {
      // Siguiente fuente
    }
  }

  return new NextResponse(null, { status: 404 })
}
