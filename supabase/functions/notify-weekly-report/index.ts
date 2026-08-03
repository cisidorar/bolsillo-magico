/**
 * notify-weekly-report — Edge Function
 *
 * Corre semanalmente (pg_cron, lunes), después de /api/cron/weekly-report
 * (Vercel) — ese cron ya calculó el informe completo (señales de la semana,
 * niveles, calendario de resultados, benchmark vs SPY, contexto macro) para
 * CADA usuario y lo dejó en weekly_reports.payload. Esta función SOLO lee esa
 * fila, arma el correo y lo manda — no recalcula nada técnico (mismo patrón
 * que notify-watchlist-digest / daily_signals).
 *
 * Si un usuario no tiene fila para la semana (sin watchlist ni posiciones con
 * historia suficiente), no recibe correo.
 *
 * Requiere: RESEND_API_KEY, SITE_URL, DB_SERVICE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SITE_URL       = Deno.env.get('SITE_URL') ?? 'https://bolsillomagico.com'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('DB_SERVICE_KEY')!

function fmtUSD(n: number): string {
  return 'US$' + n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtUSD0(n: number): string {
  return 'US$' + n.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtPct1(n: number): string {
  return (n >= 0 ? '+' : '') + n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
}

function mondayOfCL(): string {
  const utc = new Date()
  const cl  = new Date(utc.toLocaleString('en-US', { timeZone: 'America/Santiago' }))
  const day = cl.getDay()
  const diff = day === 0 ? -6 : 1 - day
  cl.setDate(cl.getDate() + diff)
  const y = cl.getFullYear(), m = String(cl.getMonth() + 1).padStart(2, '0'), d = String(cl.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ── Tipos del payload (calculado por app/api/cron/weekly-report en Next) ────

interface Observation { date: string; value: number }
interface MacroSeriesData { series: string; label: string; unit: string; observations: Observation[]; asOf: string }

interface TechnicalSignal { kind: string; tone: 'mint' | 'coral' | 'gold' | 'neutral'; title: string; detail: string; trigger: boolean }

type ConvictionTier = 'compra_fuerte' | 'compra' | 'neutral' | 'evitar' | 'venta'
type PriceZone      = 'conveniente' | 'justo' | 'caro'

interface WeeklyTickerData {
  ticker:           string
  owned:            boolean
  price:            number
  ratingLabel:      'compra_fuerte' | 'compra' | 'neutral' | 'venta' | 'venta_fuerte'
  ratingAction:     string
  verdict:          string
  weekSignals:      TechnicalSignal[]
  nextEarningsDate: string | null
  // ago 2026 (bug reportado por Cas: "veo cosas diferentes en el correo y en
  // la página" — NVDA aparecía "Neutral" acá y "70/100 · Conveniente, mejor
  // compra del día" en la app): ratingLabel viene de analysis.rating, un
  // gatillo técnico puro y distinto de computeConviction() (técnico + riesgo/
  // recompensa + track record + fuerza vs. SPY), que es lo que muestra la
  // app. Estos dos campos son el MISMO número/etiqueta que ve en /inversiones,
  // calculados una vez por ticker en lib/weekly-report.ts.
  convictionScore:  number
  convictionTier:   ConvictionTier
  priceZone:        PriceZone | null
}

// jul/ago 2026: cuando una venta generó mucha más ganancia de la que SPY
// habría dado con los mismos flujos, la sombra de SPY se va a negativo y se
// pisa a 0 — sin el flag `degenerate`, esto se ve como "le ganaste al mercado
// por el 100% de tu cartera", limpio pero engañoso (bug real, reproducido con
// datos de Cas: lib/benchmark.ts + components/PerformanceSection.tsx ya lo
// arreglaron en la app; este correo usaba una copia del tipo sin el campo
// nuevo y seguía mostrando el número sin la advertencia).
interface SpyBenchmarkResult { diffUsd: number; diffPct: number | null; asOfDate: string; degenerate: boolean }

interface DecisionPayload {
  ticker: string | null; tier: string | null; score: number
  suggested_usd: number | null; verdict: string; reasons: string[]
}

interface SignalPayload { ticker: string; kind: string; message: string; price: number }

interface WeeklyReportPayload {
  items:           WeeklyTickerData[]
  skippedTickers:  string[]
  spyBenchmark:    SpyBenchmarkResult | null
  macro:           Partial<Record<string, MacroSeriesData | null>>
  todayDecision:   DecisionPayload | null
  todaySignals:    SignalPayload[]
  generatedAt:     string
}

interface TickerInfo { name: string | null; domain: string | null }

const RATING_COLOR: Record<WeeklyTickerData['ratingLabel'], { fg: string; bg: string }> = {
  compra_fuerte: { fg: '#1FBE8D', bg: '#EAFBF5' },
  compra:        { fg: '#1FBE8D', bg: '#EAFBF5' },
  neutral:       { fg: '#8B9AB0', bg: '#F5F7FA' },
  venta:         { fg: '#FF6F61', bg: '#FFF1EF' },
  venta_fuerte:  { fg: '#FF6F61', bg: '#FFF1EF' },
}

// Mismos colores/etiquetas que ConvictionChip/PriceZoneChip en la app
// (components/RiskRail.tsx) y que ya usa notify-watchlist-digest — "70" y
// "Conveniente" tienen que significar lo mismo en cualquier canal.
const TIER_COLOR: Record<ConvictionTier, { fg: string; bg: string }> = {
  compra_fuerte: { fg: '#1FBE8D', bg: '#EAFBF5' },
  compra:        { fg: '#1FBE8D', bg: '#EAFBF5' },
  neutral:       { fg: '#8B9AB0', bg: '#F5F7FA' },
  evitar:        { fg: '#D98A1F', bg: '#FFF6E8' },
  venta:         { fg: '#FF6F61', bg: '#FFF1EF' },
}
const ZONE_LABEL: Record<PriceZone, string> = { conveniente: 'Conveniente', justo: 'Justo', caro: 'Caro' }
const ZONE_COLOR: Record<PriceZone, string> = { conveniente: '#1FBE8D', justo: '#8B9AB0', caro: '#D98A1F' }

function convictionBadgeHtml(item: WeeklyTickerData): string {
  const parts: string[] = []
  const c = TIER_COLOR[item.convictionTier]
  parts.push(`<span style="display:inline-block;padding:1px 6px;border-radius:999px;background:${c.bg};color:${c.fg};font-weight:800">${Math.round(item.convictionScore)}</span>`)
  if (item.priceZone) {
    parts.push(`<span style="display:inline-block;padding:1px 6px;border-radius:999px;background:#F5F7FA;color:${ZONE_COLOR[item.priceZone]};font-weight:800">${ZONE_LABEL[item.priceZone]}</span>`)
  }
  return `<span style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:9px;margin-left:5px">${parts.join('&nbsp;')}</span>`
}

// "Relevante" (ago 2026, a pedido de Cas: "no es necesario saber info de
// todas las que sigo") = tiene posición real, O el rating técnico dice algo
// accionable, O la convicción de la app dice algo accionable aunque el
// rating técnico diga neutral (mismo caso NVDA de arriba), O reporta
// resultados dentro de 7 días. Todo lo demás (no tengo, rating neutral,
// convicción neutral/evitar, sin catalizador cerca) es ruido de fondo que no
// vale la pena leer cada semana — se cuenta pero no se muestra.
function isRelevant(item: WeeklyTickerData): boolean {
  if (item.owned) return true
  if (item.ratingLabel !== 'neutral') return true
  if (item.convictionTier === 'compra' || item.convictionTier === 'compra_fuerte' || item.convictionTier === 'venta') return true
  if (item.nextEarningsDate) {
    const days = Math.round((new Date(item.nextEarningsDate + 'T12:00:00').getTime() - Date.now()) / 86_400_000)
    if (days >= 0 && days <= 7) return true
  }
  return false
}

// ── Contexto macro: mismas fórmulas que lib/yield-curve.ts y lib/yoy-change.ts
// del monorepo Next — se reimplementan acá porque la Edge Function (Deno) no
// puede importar código de app/lib directamente. Si esas fórmulas cambian,
// actualizar también acá. ──────────────────────────────────────────────────

function latestObs(series: MacroSeriesData | null | undefined): Observation | null {
  if (!series || series.observations.length === 0) return null
  return series.observations[series.observations.length - 1]
}

function yoyPct(series: MacroSeriesData | null | undefined): number | null {
  const latest = latestObs(series)
  if (!latest || !series) return null
  const sorted = [...series.observations].sort((a, b) => a.date.localeCompare(b.date))
  const d = new Date(latest.date + 'T12:00:00')
  d.setFullYear(d.getFullYear() - 1)
  const target = d.toISOString().slice(0, 10)
  let yearAgo: Observation | null = null
  for (const o of sorted) {
    if (o.date > target) break
    yearAgo = o
  }
  if (!yearAgo || yearAgo.value === 0) return null
  return ((latest.value - yearAgo.value) / yearAgo.value) * 100
}

function macroContextHtml(macro: WeeklyReportPayload['macro']): string {
  const dff  = latestObs(macro.DFF)
  const dgs10 = latestObs(macro.DGS10)
  const dgs2  = latestObs(macro.DGS2)
  const oil   = latestObs(macro.DCOILWTICO)
  const cpi   = yoyPct(macro.CPIAUCSL)
  const spread = (dgs10 && dgs2) ? dgs10.value - dgs2.value : null

  if (!dff && spread === null && !oil && cpi === null) return ''

  const cell = (label: string, value: string, color = '#0E2A52') => `
    <td width="25%" align="center" style="padding:14px 4px">
      <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:800;color:${color}">${value}</p>
      <p style="margin:2px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:9px;font-weight:700;letter-spacing:0.3px;color:#8B9AB0">${label}</p>
    </td>`

  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:20px">
    <tr><td style="padding-bottom:8px">
      <span style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:800;color:#0E2A52">🌐 Contexto de mercado</span>
    </td></tr>
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#F5F7FA" style="background:#F5F7FA;border-radius:14px">
        <tr>
          ${dff ? cell('TASA FED', `${dff.value.toFixed(2)}%`) : ''}
          ${spread !== null ? cell('CURVA 10Y-2Y', `${spread >= 0 ? '+' : ''}${spread.toFixed(2)}pp`, spread < 0 ? '#FF6F61' : '#0E2A52') : ''}
          ${oil ? cell('PETRÓLEO WTI', fmtUSD0(oil.value)) : ''}
          ${cpi !== null ? cell('INFLACIÓN EEUU', fmtPct1(cpi)) : ''}
        </tr>
      </table>
    </td></tr>
  </table>`
}

// ── Ícono del ticker (mismo patrón que notify-watchlist-digest) ─────────────

function tickerIcon(ticker: string, domain: string | null, size: number): string {
  if (domain) {
    return `<table cellpadding="0" cellspacing="0" role="presentation" style="width:${size}px;height:${size}px">
      <tr><td align="center" valign="middle" bgcolor="#0E2A52" style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.28)}px;background:#0E2A52;overflow:hidden">
        <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=128" width="${Math.round(size * 0.62)}" height="${Math.round(size * 0.62)}" alt="${ticker}"
          style="width:${Math.round(size * 0.62)}px;height:${Math.round(size * 0.62)}px;display:block;border-radius:4px">
      </td></tr>
    </table>`
  }
  const fontSize = ticker.length > 4 ? 9 : ticker.length > 3 ? 10 : 11
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="width:${size}px;height:${size}px">
    <tr><td align="center" valign="middle" bgcolor="#0E2A52" style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.28)}px;background:#0E2A52;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:${fontSize}px;font-weight:800;color:#ffffff;letter-spacing:0.2px">
      ${ticker.slice(0, 5)}
    </td></tr>
  </table>`
}

function brandWordmark(siteUrl: string) {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto">
    <tr>
      <td style="vertical-align:middle;padding-right:8px">
        <img src="${siteUrl}/bolsillo-magico-icono-invertido.png" width="32" height="32" alt="Bolsillo Mágico" style="width:32px;height:32px;border-radius:8px;display:block">
      </td>
      <td style="vertical-align:middle">
        <span style="font-family:Fredoka,system-ui,sans-serif;font-size:18px;font-weight:600;letter-spacing:0.3px;line-height:1">
          <span style="color:rgba(255,255,255,0.95)">Bolsillo </span><span style="color:#F8C945">Mágico</span>
        </span>
      </td>
    </tr>
  </table>`
}

function decisionBlockHtml(decision: DecisionPayload | null, infoMap: Map<string, TickerInfo>): string {
  if (!decision) return ''
  const isBuy = decision.ticker !== null && (decision.tier === 'compra' || decision.tier === 'compra_fuerte')
  if (!isBuy) {
    return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:20px">
      <tr><td bgcolor="#F5F7FA" style="background:#F5F7FA;border-radius:16px;padding:16px 18px">
        <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:800;color:#3D4C63">La decisión de hoy: nada de tu lista</p>
        <p style="margin:6px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;color:#8B9AB0;line-height:1.5">${decision.verdict}</p>
      </td></tr>
    </table>`
  }
  const info = infoMap.get(decision.ticker!) ?? { name: null, domain: null }
  const reasonsHtml = decision.reasons.slice(0, 2).map(r => `
    <p style="margin:4px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;color:#3D4C63;line-height:1.5">· ${r}</p>
  `).join('')
  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:20px">
    <tr><td bgcolor="#EAFBF5" style="background:#EAFBF5;border:1.5px solid #1FBE8D;border-radius:16px;padding:18px 20px">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="width:36px;vertical-align:top">${tickerIcon(decision.ticker!, info.domain, 36)}</td>
          <td style="padding-left:12px;vertical-align:top">
            <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:15px;font-weight:800;color:#0E2A52">La compra de hoy: ${decision.ticker} <span style="color:#1FBE8D">(${decision.score}/100)</span></p>
            ${decision.suggested_usd !== null ? `<p style="margin:4px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:700;color:#1FBE8D">Compra hasta ${fmtUSD0(decision.suggested_usd)} ahora</p>` : ''}
            ${reasonsHtml}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>`
}

function tickerRowHtml(item: WeeklyTickerData, info: TickerInfo): string {
  const color = RATING_COLOR[item.ratingLabel]
  const topSignal = item.weekSignals[0] ?? null
  return `
  <tr><td style="padding-bottom:10px">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1.5px solid #E4EAF3;border-radius:14px">
      <tr><td style="padding:12px 16px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="width:36px;vertical-align:top">${tickerIcon(item.ticker, info.domain, 36)}</td>
            <td style="padding-left:10px;vertical-align:top">
              <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:800;color:#0E2A52">
                ${item.ticker}${item.owned ? ' <span style="font-size:9px;font-weight:800;color:#2B7CF6">· EN CARTERA</span>' : ''}
              </p>
              <p style="margin:2px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:500;color:#8B9AB0;line-height:1.4">${item.verdict}</p>
              ${topSignal ? `<p style="margin:4px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:700;color:${color.fg}">● ${topSignal.title}</p>` : ''}
            </td>
            <td style="text-align:right;vertical-align:top;white-space:nowrap">
              <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:800;color:#0E2A52;font-variant-numeric:tabular-nums">${fmtUSD(item.price)}</p>
              <p style="margin:3px 0 0;display:inline-block;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:10px;font-weight:800;color:${color.fg};background:${color.bg};border-radius:8px;padding:2px 7px">${item.ratingAction}</p>
              <p style="margin:3px 0 0">${convictionBadgeHtml(item)}</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>`
}

function weeklyReportEmailHtml({
  displayName, payload, infoMap, siteUrl, weekLabel,
}: {
  displayName: string
  payload:     WeeklyReportPayload
  infoMap:     Map<string, TickerInfo>
  siteUrl:     string
  weekLabel:   string
}): string {
  const benchmarkHtml = payload.spyBenchmark ? (
    payload.spyBenchmark.degenerate ? `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:4px">
      <tr><td bgcolor="#F5F7FA" style="background:#F5F7FA;border-radius:14px;padding:14px 16px">
        <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.3px;color:#8B9AB0">TU SEMANA VS. EL MERCADO</p>
        <p style="margin:4px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:13px;font-weight:700;color:#3D4C63">Comparación no confiable por ahora</p>
        <p style="margin:2px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:500;color:#8B9AB0;line-height:1.5">Una venta reciente generó mucha más ganancia de la que un SPY equivalente habría dado — el punto de comparación quedó distorsionado. Se recupera solo con tus próximos movimientos.</p>
      </td></tr>
    </table>` : `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:4px">
      <tr><td bgcolor="#F5F7FA" style="background:#F5F7FA;border-radius:14px;padding:14px 16px">
        <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.3px;color:#8B9AB0">TU SEMANA VS. EL MERCADO</p>
        <p style="margin:4px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:18px;font-weight:800;color:${payload.spyBenchmark.diffUsd >= 0 ? '#1FBE8D' : '#FF6F61'}">
          ${payload.spyBenchmark.diffUsd >= 0 ? '+' : ''}${fmtUSD(payload.spyBenchmark.diffUsd)}
          ${payload.spyBenchmark.diffPct !== null ? `<span style="font-size:12px;font-weight:700">(${payload.spyBenchmark.diffPct >= 0 ? '+' : ''}${payload.spyBenchmark.diffPct.toFixed(1)}%)</span>` : ''}
        </p>
        <p style="margin:2px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:500;color:#8B9AB0">vs. haber puesto la misma plata en SPY, mismas fechas</p>
      </td></tr>
    </table>`
  ) : ''

  // Ago 2026, a pedido de Cas ("no es necesario saber info de todas las que
  // sigo"): antes se mostraban TODOS los tickers seguidos, la mayoría en
  // "Neutral — esperar" sin nada nuevo que decir — el correo se sentía largo
  // sin ser útil. Ahora solo entran los relevantes (ver isRelevant); el resto
  // se cuenta, no se calla.
  const relevantItems = payload.items.filter(isRelevant)
  const quietCount    = payload.items.length - relevantItems.length
  const rowsHtml = relevantItems.map(item => tickerRowHtml(item, infoMap.get(item.ticker) ?? { name: null, domain: null })).join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Tu informe semanal · Bolsillo Mágico</title>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>:root { color-scheme: light; supported-color-schemes: light; }</style>
</head>
<body style="margin:0;padding:0;background:#E8EFF8;font-family:'Plus Jakarta Sans','Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#E8EFF8" style="background:#E8EFF8;padding:40px 16px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#ffffff" style="background:#ffffff;border-radius:24px;overflow:hidden;max-width:100%;box-shadow:0 8px 30px rgba(14,42,82,0.10)">

      <tr><td bgcolor="#2B7CF6" style="background:#2B7CF6;padding:32px 32px 28px;text-align:center">
        <div>${brandWordmark(siteUrl)}</div>
        <p style="margin:10px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:800;letter-spacing:0.6px;color:rgba(255,255,255,0.7)">SEMANA DEL ${weekLabel}</p>
        <p style="margin:20px 0 0;font-family:Fredoka,system-ui,sans-serif;font-size:24px;font-weight:600;color:#ffffff;letter-spacing:0.2px">Tu informe semanal</p>
        <p style="margin:8px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:500;color:rgba(255,255,255,0.85);line-height:1.6">
          Hola ${displayName} — señales, niveles y calendario de tu watchlist, en un solo correo.
        </p>
      </td></tr>

      <tr><td style="padding:24px 32px 28px">
        ${benchmarkHtml}
        ${macroContextHtml(payload.macro)}
        ${decisionBlockHtml(payload.todayDecision, infoMap)}

        ${rowsHtml ? `
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:20px">
          <tr><td style="padding-bottom:10px">
            <span style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:800;color:#0E2A52">📊 Lo relevante de tu watchlist esta semana</span>
          </td></tr>
          ${rowsHtml}
        </table>` : ''}

        ${quietCount > 0 ? `
        <p style="margin:12px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:500;color:#8B9AB0">
          ${quietCount} más sin novedad esta semana (sin posición, rating neutral y sin catalizador cerca) — no se muestran acá.
        </p>` : ''}

        ${payload.skippedTickers.length > 0 ? `
        <p style="margin:6px 0 0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:500;color:#8B9AB0">
          Sin historia suficiente todavía: ${payload.skippedTickers.join(', ')}
        </p>` : ''}

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#F5F7FA" style="background:#F5F7FA;border-radius:14px;margin-top:20px">
          <tr><td style="padding:14px 18px">
            <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;color:#8B9AB0;line-height:1.6">
              Análisis técnico automático, no es asesoría de inversión. Los niveles y escenarios son cálculos, no predicciones.
            </p>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:20px">
          <tr><td>
            <!-- P3 (roadmap largo plazo, jul 2026): la vista Semanal de la app
                 se eliminó — este correo pasa a ser el informe completo por
                 ticker. El link ahora manda a Acciones, donde vive la card
                 compacta "Tu semana" (vs. SPY + Fed + calendario). -->
            <a href="${siteUrl}/inversiones" bgcolor="#2B7CF6"
              style="display:block;text-align:center;background:#2B7CF6;color:#ffffff;text-decoration:none;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;font-weight:700;padding:15px 32px;border-radius:12px;letter-spacing:0.1px">
              Ver tus acciones en la app →
            </a>
          </td></tr>
        </table>
      </td></tr>

      <tr><td bgcolor="#0E2A52" style="background:#0E2A52;padding:28px 32px">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr><td style="text-align:center;padding-bottom:16px">${brandWordmark(siteUrl)}</td></tr>
          <tr><td style="text-align:center;padding-bottom:16px">
            <p style="margin:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:12px;font-weight:500;color:#9FB5D4">Recibes este correo cada lunes.</p>
          </td></tr>
          <tr><td style="text-align:center;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px">
            <a href="${siteUrl}/ajustes" style="color:#9FB5D4;text-decoration:none;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:11px;font-weight:600">Cancelar envíos</a>
          </td></tr>
        </table>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const weekStart = mondayOfCL()

  const { data: rows, error } = await supabase
    .from('weekly_reports')
    .select('user_id, payload')
    .eq('week_start', weekStart)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ sent: 0, users: 0 }), { headers: { 'Content-Type': 'application/json' } })
  }

  const userIds = rows.map(r => r.user_id as string)

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, notify_weekly_report')
    .in('id', userIds)
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p as { display_name: string | null; notify_weekly_report: boolean }]))

  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const emailMap = new Map((authUsers?.users ?? []).map(u => [u.id, u.email]))

  // Nombre/dominio por ticker (logos), cacheados por la app en price_cache.
  const allTickers = [...new Set(rows.flatMap(r => ((r.payload as WeeklyReportPayload).items ?? []).map(i => i.ticker)))]
  const { data: priceCacheRows } = allTickers.length > 0
    ? await supabase.from('price_cache').select('ticker, name, domain').in('ticker', allTickers)
    : { data: [] as { ticker: string; name: string | null; domain: string | null }[] }
  const infoMap = new Map<string, TickerInfo>(
    (priceCacheRows ?? []).map(r => [r.ticker as string, { name: r.name as string | null, domain: r.domain as string | null }]),
  )

  const weekStartDate = new Date(weekStart + 'T12:00:00')
  const weekLabel = weekStartDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })

  let sent = 0, skipped = 0
  for (const row of rows) {
    const userId  = row.user_id as string
    const payload = row.payload as WeeklyReportPayload
    const profile = profileMap.get(userId)
    if (!profile || profile.notify_weekly_report === false) { skipped++; continue }

    const email = emailMap.get(userId)
    if (!email) { skipped++; continue }
    if (payload.items.length === 0) { skipped++; continue }

    const refKey = `${weekStart}:weekly_report:${userId}`
    const { error: logErr } = await supabase
      .from('notification_log')
      .insert({ user_id: userId, type: 'weekly_report', ref_key: refKey })
      .select().single()
    if (logErr) { skipped++; continue }   // ya se envió esta semana

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Bolsillo Mágico <noreply@bolsillomagico.com>',
        to: email,
        subject: `Tu informe semanal de mercado · Bolsillo Mágico`,
        html: weeklyReportEmailHtml({
          displayName: profile.display_name ?? 'Usuario',
          payload, infoMap, siteUrl: SITE_URL, weekLabel,
        }),
      }),
    })

    if (res.ok) sent++
    else {
      // Ver notify-budget: si el envío falla hay que borrar el log recién
      // insertado, si no ref_key queda "quemado" y bloquea reintentos.
      console.error(`Resend error for ${email}:`, await res.text())
      await supabase.from('notification_log').delete().eq('ref_key', refKey)
    }
  }

  return new Response(JSON.stringify({ sent, users: rows.length, skipped }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
