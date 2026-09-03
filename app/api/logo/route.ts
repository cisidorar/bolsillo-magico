import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { imageSize } from '@/lib/image-size'

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

  // sep 2026 (Cas: "mejora la calidad del icono del banco de chile"):
  //
  //  1. Se cayó logo.clearbit.com. HubSpot lo apagó el 8 dic 2025 tras
  //     comprar Clearbit, así que era la PRIMERA fuente de la lista y fallaba
  //     siempre — 4 segundos de timeout regalados en cada logo.
  //  2. El bucle devolvía la primera respuesta de más de 200 bytes SIN mirar
  //     su resolución. Los servicios de favicon entregan lo que el sitio
  //     tenga (a menudo 32×32), y el componente lo estira a 40px: borroso.
  //
  // Ahora se piden todas las fuentes en paralelo y gana la de mayor
  // resolución real (leída del header, ver lib/image-size.ts). Se piden
  // tamaños grandes: si el sitio no los tiene, el servicio devuelve lo que
  // haya y esa candidata simplemente pierde.
  const sources = [
    `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.${domain}&size=256`,
    `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.${domain}&size=128`,
    `https://www.google.com/s2/favicons?domain=www.${domain}&sz=256`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  ]

  // Piso de nitidez. `minPx` lo manda el componente según el tamaño real al
  // que va a dibujar (×2 por pantalla retina); si el mejor candidato no
  // llega, se responde 404 y ServiceLogo cae al monograma de marca — se ve
  // mejor una inicial nítida que un favicon de 16px estirado a 80.
  //
  // Caso que motivó esto (Cas, sep 2026): Banco de Chile solo publica un
  // favicon de 16×16 — ni Google, ni DuckDuckGo, ni el propio sitio del banco
  // tienen algo más grande, así que no hay nada que "mejorar" trayendo otra
  // fuente. Sin minPx el comportamiento es el de antes (devuelve lo que haya).
  const minPx = Math.max(0, Number(searchParams.get('minPx')) || 0)

  async function fetchCandidate(url: string) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(4000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Gstos/1.0)' },
      })
      if (!res.ok) return null
      const buffer = await res.arrayBuffer()
      // Un ícono genérico de 16px pesa menos que esto
      if (buffer.byteLength < 200) return null
      const dims = imageSize(buffer)
      return {
        buffer,
        contentType: res.headers.get('content-type') ?? 'image/png',
        // Formato no reconocido → se asume aceptable pero pierde contra
        // cualquiera medible: no se descarta, solo no se prefiere.
        px: dims?.min ?? 0,
      }
    } catch {
      return null
    }
  }

  const settled = await Promise.all(sources.map(fetchCandidate))
  const candidates = settled.filter((c): c is NonNullable<typeof c> => c !== null)
  if (candidates.length === 0) return new NextResponse(null, { status: 404 })

  const best = candidates.reduce((a, b) => (b.px > a.px ? b : a))

  // px === 0 es "formato no reconocido", no "diminuto": se deja pasar en vez
  // de castigar a un formato que este parser no sabe medir.
  if (minPx > 0 && best.px > 0 && best.px < minPx) {
    return new NextResponse(null, {
      status: 404,
      headers: { 'X-Logo-Reason': `mejor disponible ${best.px}px, se pidió ${minPx}px` },
    })
  }

  return new NextResponse(best.buffer, {
    headers: {
      'Content-Type': best.contentType,
      'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
      // Para poder diagnosticar un logo feo sin adivinar: se ve en la pestaña
      // Network del navegador.
      'X-Logo-Px': best.px === Infinity ? 'vector' : String(best.px),
    },
  })
}
