import { NextResponse } from 'next/server'
import { createClient, getServerSession } from '@/lib/supabase/server'

// ── Noticias por ticker: Finnhub trae titulares, DeepSeek los RESUME ─────────
// Principio rector intacto: la IA no calcula ni opina del análisis técnico —
// solo traduce/resume texto externo (titulares) a español simple. On-demand
// (botón "¿Qué está pasando?"), nunca automático para toda la watchlist.
// Cache 12 h por ticker en price_cache con clave sintética {SYM}_NEWS
// (el resumen viaja en la columna jsonb history7d).

export const maxDuration = 30

const TICKER_RE  = /^[A-Z0-9.\-]{1,12}$/
const NEWS_TTL_H = 12
const NEWS_DAYS  = 7

export interface NewsHeadline {
  title:  string
  source: string
  url:    string
  date:   string   // YYYY-MM-DD
}
export interface NewsResponse {
  symbol:    string
  summary:   string | null      // null = hubo titulares pero no se pudo resumir, o no hubo titulares
  headlines: NewsHeadline[]     // hasta 3, con link
  asOf:      string             // ISO del momento de generación
}

// Mismo saneo que analyze-month: control chars fuera, largo acotado
function sanitize(str: string | null | undefined, maxLen = 140): string {
  if (!str) return ''
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, ' ').trim().slice(0, maxLen)
}

const SYSTEM_PROMPT = `Eres un resumidor de titulares financieros para una persona SIN experiencia en inversiones, dentro de una app personal chilena.
Recibirás titulares recientes (en inglés) sobre una empresa.

Reglas estrictas:
- Escribe 2 a 4 frases en español simple explicando qué está pasando con la empresa según los titulares.
- Usa SOLO la información de los titulares. No inventes cifras, causas ni contexto que no esté ahí.
- NO des recomendación de compra o venta, ni opinión sobre si es buen momento para invertir.
- Si los titulares son ruido (menciones de listas, artículos genéricos) y no explican nada concreto, di honestamente que no hay noticias relevantes.
- Tono directo y cotidiano, sin jerga financiera.

Responde SIEMPRE con JSON válido: {"summary": "texto"}`

export async function GET(request: Request) {
  const user = await getServerSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get('symbol') ?? '').trim().toUpperCase()
  const force  = searchParams.get('force') === '1'
  if (!TICKER_RE.test(symbol)) return NextResponse.json({ error: 'Símbolo inválido' }, { status: 400 })

  try {
    const supabase = await createClient()
    const cacheKey = `${symbol}_NEWS`

    // 1. Cache 12 h
    if (!force) {
      const { data: cached } = await supabase
        .from('price_cache')
        .select('history7d, fetched_at')
        .eq('ticker', cacheKey)
        .maybeSingle()
      if (cached?.history7d && Date.now() - new Date(cached.fetched_at).getTime() < NEWS_TTL_H * 3_600_000) {
        return NextResponse.json(cached.history7d as unknown as NewsResponse)
      }
    }

    // 2. Titulares desde Finnhub (gratis en el plan free)
    const fhKey = process.env.FINNHUB_API_KEY
    if (!fhKey) return NextResponse.json({ error: 'Servicio de noticias no configurado' }, { status: 503 })

    const to   = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - NEWS_DAYS * 86_400_000).toISOString().slice(0, 10)
    const fhRes = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${fhKey}`,
      { cache: 'no-store' },
    )
    if (!fhRes.ok) return NextResponse.json({ error: 'No se pudieron obtener noticias' }, { status: 502 })

    const raw = await fhRes.json() as { datetime?: number; headline?: string; source?: string; url?: string }[]
    const seen = new Set<string>()
    const items = (Array.isArray(raw) ? raw : [])
      .filter(n => n.headline && n.url && typeof n.datetime === 'number')
      .sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0))
      .filter(n => {
        const key = sanitize(n.headline, 80).toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 10)
      .map(n => ({
        title:  sanitize(n.headline, 140),
        source: sanitize(n.source, 30),
        url:    String(n.url).startsWith('http') ? String(n.url).slice(0, 500) : '',
        date:   new Date((n.datetime as number) * 1000).toISOString().slice(0, 10),
      }))
      .filter(n => n.title && n.url)

    const asOf = new Date().toISOString()

    // Sin titulares: cachear igual para no re-consultar en cada click
    if (items.length === 0) {
      const empty: NewsResponse = { symbol, summary: null, headlines: [], asOf }
      await supabase.from('price_cache').upsert({
        ticker: cacheKey, price: 0, history7d: empty as unknown as object, fetched_at: asOf,
      })
      return NextResponse.json(empty)
    }

    // 3. Resumen con IA (DeepSeek u otro compatible OpenAI) — solo resume, no calcula
    let summary: string | null = null
    const apiKey  = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY
    const apiUrl  = process.env.AI_API_URL ?? 'https://api.openai.com/v1'
    const aiModel = process.env.AI_MODEL   ?? 'gpt-4.1-mini'
    if (apiKey) {
      try {
        const aiRes = await fetch(`${apiUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: aiModel,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user',   content: JSON.stringify({ empresa: symbol, titulares: items.map(i => ({ t: i.title, fuente: i.source, fecha: i.date })) }) },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 300,
          }),
        })
        if (aiRes.ok) {
          const aiJson  = await aiRes.json()
          const content = aiJson.choices?.[0]?.message?.content
          if (content) {
            const parsed = JSON.parse(content) as { summary?: unknown }
            if (typeof parsed.summary === 'string' && parsed.summary.trim().length > 0) {
              summary = parsed.summary.trim().slice(0, 700)
            }
          }
        } else {
          console.error('[stock-news] AI error:', aiRes.status)
        }
      } catch (err) {
        console.error('[stock-news] AI parse error:', err)
      }
    }

    // 4. Respuesta + cache (con o sin resumen: los titulares solos ya sirven)
    const result: NewsResponse = { symbol, summary, headlines: items.slice(0, 3), asOf }
    await supabase.from('price_cache').upsert({
      ticker: cacheKey, price: 0, history7d: result as unknown as object, fetched_at: asOf,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[stock-news] unhandled:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
