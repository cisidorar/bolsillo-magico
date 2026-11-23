// Investigación offline del motor de señales (nov 2026).
//
//   npx -y tsx scripts/signal-research.ts [--cache <dir>] [--out <archivo.md>]
//
// Baja ~10 años de velas diarias de Yahoo (sin API key), corre analyze() semana
// a semana SIN mirar el futuro y mide el retorno excedente vs SPY a 20 y 60
// ruedas de cada condición del motor. Escribe un informe en markdown.
// No toca la base de datos ni la app. Metodología: lib/signal-research.ts.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { DailyCandles } from '../lib/technical'
import { buildSamples, conditionStat, quintiles, type ResearchSample, type ConditionStat } from '../lib/signal-research'

// Watchlist actual de Cas + un universo amplio de grandes empresas de varios
// sectores, incluidas varias a las que les fue MAL en la década (INTC, PFE, BA,
// F, T, MMM, KHC, EL). Sigue habiendo sesgo de supervivencia: todas siguen
// cotizando hoy (las que quebraron o salieron de bolsa no están) — se declara
// en el informe, no se esconde.
const WATCHLIST = ['AAPL', 'AMD', 'AVUV', 'BABA', 'GOOGL', 'IBIT', 'INTC', 'JNJ', 'KO', 'MCD', 'MELI', 'META', 'MSFT', 'MU', 'NFLX', 'NVDA', 'PFE', 'QQQ', 'SNDK', 'SOXL', 'TSM', 'V', 'VOO', 'WMT', 'XLE']
const BROAD = ['AMZN', 'TSLA', 'XOM', 'CVX', 'JPM', 'BAC', 'WFC', 'C', 'GS', 'BA', 'GE', 'F', 'GM', 'T', 'VZ', 'IBM', 'ORCL', 'CSCO', 'PYPL', 'DIS', 'NKE', 'SBUX', 'HD', 'TGT', 'CVS', 'MMM', 'CAT', 'UNH', 'PG', 'PEP', 'MRK', 'ABBV', 'ADBE', 'CRM', 'QCOM', 'TXN', 'KHC', 'EL', 'MO', 'LUV']

const args = process.argv.slice(2)
const argVal = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const CACHE = argVal('--cache', join(process.env.TMPDIR ?? '/tmp', 'gstos-signal-research'))
const OUT   = argVal('--out', 'docs/INVESTIGACION_SENALES.md')
// --universe broad = sin la watchlist (que se eligió sabiendo cuáles subieron:
// sesgo de selección). Sirve para chequear que un efecto no venga solo de ahí.
const UNIVERSE = argVal('--universe', 'all')

async function fetchYahoo(ticker: string): Promise<DailyCandles | null> {
  const file = join(CACHE, `${ticker}.json`)
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=10y&interval=1d&includePrePost=false`
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!r.ok) { console.error(`  ${ticker}: Yahoo ${r.status}`); return null }
  const j = await r.json()
  const res = j?.chart?.result?.[0]
  const ts: number[] = res?.timestamp ?? []
  const q = res?.indicators?.quote?.[0] ?? {}
  const adj: (number | null)[] = res?.indicators?.adjclose?.[0]?.adjclose ?? []
  const c: DailyCandles = { closes: [], dates: [], highs: [], lows: [], volumes: [] }
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i], a = adj[i] ?? close
    if (close == null || a == null || !(close > 0)) continue
    // Ajuste por dividendos: retorno total, igual que price_history (adjClose de Tiingo)
    const f = a / close
    c.dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10))
    c.closes.push(a)
    c.highs.push((q.high?.[i] ?? close) * f)
    c.lows.push((q.low?.[i] ?? close) * f)
    c.volumes.push(q.volume?.[i] ?? 0)
  }
  if (c.closes.length < 300) { console.error(`  ${ticker}: solo ${c.closes.length} ruedas`); return null }
  writeFileSync(file, JSON.stringify(c))
  return c
}

const fmt = (v: number | null, d = 2) => v === null ? '—' : (v > 0 ? '+' : '') + v.toFixed(d)

function table(stats: ConditionStat[]): string {
  const rows = stats.map(s => {
    const strong = s.t !== null && Math.abs(s.t) >= 2 && s.stable
    return `| ${s.name} | ${s.n} | ${s.dates} | ${fmt(s.mean)} | ${fmt(s.lift)} | ${fmt(s.t)} | ${fmt(s.firstHalf)} | ${fmt(s.secondHalf)} | ${strong ? '**sí**' : s.stable ? 'estable, débil' : 'no'} |`
  })
  return ['| Condición | N | Semanas | Exc. vs SPY % | Lift vs universo | t | Lift 1ª mitad | Lift 2ª mitad | ¿Evidencia? |',
    '|---|---|---|---|---|---|---|---|---|', ...rows].join('\n')
}

async function main() {
  mkdirSync(CACHE, { recursive: true })
  const tickers = UNIVERSE === 'broad' ? BROAD : [...new Set([...WATCHLIST, ...BROAD])]
  console.log(`Bajando ${tickers.length + 1} series (cache en ${CACHE})…`)
  const spy = await fetchYahoo('SPY')
  if (!spy) throw new Error('Sin SPY no hay benchmark')
  const universe: { ticker: string; candles: DailyCandles }[] = []
  for (const t of tickers) {
    const c = await fetchYahoo(t)
    if (c) universe.push({ ticker: t, candles: c })
    await new Promise(r => setTimeout(r, 150))
  }
  console.log(`Analizando ${universe.length} tickers semana a semana…`)
  const t0 = Date.now()
  const samples: ResearchSample[] = buildSamples(universe, spy)
  console.log(`  ${samples.length} muestras en ${((Date.now() - t0) / 1000).toFixed(0)}s`)

  const flagNames = Object.keys(samples[0]?.flags ?? {})
  const section = (h: 'ex20' | 'ex60') => table(
    flagNames.map(f => conditionStat(f, samples, s => s.flags[f], h))
      .sort((a, b) => (b.lift ?? -99) - (a.lift ?? -99)),
  )
  const quint = (key: string, h: 'ex20' | 'ex60') => {
    const { rows, spread } = quintiles(samples, key, h)
    const dates = [...new Set(samples.map(s => s.date))].sort()
    const mid = dates[Math.floor(dates.length / 2)]
    const s1 = quintiles(samples.filter(s => s.date < mid), key, h).spread
    const s2 = quintiles(samples.filter(s => s.date >= mid), key, h).spread
    return `| ${key} (${h === 'ex20' ? '20r' : '60r'}) | ${rows.map(r => fmt(r.mean)).join(' | ')} | **${fmt(spread)}** | ${fmt(s1)} | ${fmt(s2)} |`
  }
  const dates = samples.map(s => s.date).sort()
  const convBuckets = [[0, 40], [40, 55], [55, 70], [70, 101]].map(([lo, hi]) =>
    conditionStat(`convicción ${lo}–${hi === 101 ? 100 : hi - 1}`, samples, s => (s.values.conviction ?? -1) >= lo && (s.values.conviction ?? -1) < hi))

  const md = `# Investigación de señales — ¿qué predice el motor?

_Generado por \`scripts/signal-research.ts\` el ${new Date().toISOString().slice(0, 10)}. Metodología en \`lib/signal-research.ts\`; plan en \`docs/PLAN_MOTOR_PREDICCION.md\`._

- Universo: ${universe.length} tickers (${UNIVERSE === 'broad' ? 'solo grandes empresas de varios sectores, SIN la watchlist' : 'watchlist + grandes empresas de varios sectores'}), ${dates[0]} → ${dates[dates.length - 1]}.
- ${samples.length} muestras ticker-semana. Cada una corre \`analyze()\` solo con velas hasta ese día (ventana de 430, igual que producción).
- Medida: retorno **excedente vs SPY** (dividendos incluidos). "Lift" = excedente de la condición − excedente promedio del universo ese mismo período.
- t: con agrupación por fecha y N efectivo corregido por solapamiento. |t| ≥ 2 **y** mismo signo en ambas mitades = evidencia. Con ~${flagNames.length} condiciones probadas, 1-2 "evidencias" pueden ser suerte.
- Sesgo de supervivencia: todos los tickers existen hoy. Infla el retorno del universo, pero afecta poco el *lift* (comparación dentro del mismo universo).
- La convicción se calcula **sin** track record (el 20% de backtest por ticker), igual que cuando falta historia.

## Condiciones del motor — 20 ruedas (~1 mes)

${section('ex20')}

## Condiciones del motor — 60 ruedas (~3 meses)

${section('ex60')}

## Score de convicción por tramo (20 ruedas)

${table(convBuckets)}

## Factores continuos — quintiles transversales

Cada semana se ordenan las acciones por la variable y se reparten en 5 grupos (Q1 = más bajo). Q5−Q1 > 0 = valores altos rinden más.

| Variable | Q1 | Q2 | Q3 | Q4 | Q5 | Q5−Q1 | Q5−Q1 1ª mitad | Q5−Q1 2ª mitad |
|---|---|---|---|---|---|---|---|---|
${['mom12_1', 'distHigh', 'distSma200', 'conviction', 'rsi', 'atrPct'].flatMap(k => [quint(k, 'ex20'), quint(k, 'ex60')]).join('\n')}

- \`mom12_1\`: retorno de 12 meses excluyendo el último. \`distHigh\`: % bajo el máximo de 52 semanas (0 = en máximos). \`distSma200\`: % sobre la media de 200. \`atrPct\`: volatilidad diaria.
`
  writeFileSync(OUT, md)
  writeFileSync(join(CACHE, 'samples.json'), JSON.stringify(samples))
  console.log(`Informe: ${OUT}`)
}

main().catch(err => { console.error(err); process.exit(1) })
