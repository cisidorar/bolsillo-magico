# Plan — Informe semanal de mercado (estilo análisis en video)

**Pregunta que responde:** ¿puede la app generar un análisis semanal como el del video (macro + calendario + técnico por activo + cripto + watchlist)?

**Respuesta corta:** sí, y más cerca de lo que parece. El motor técnico por ticker ya hace ~70% del trabajo — en varios puntos con MÁS rigor que el video (backtest de señales, conviction score, position sizing, stop chandelier). Lo que falta no es capacidad de análisis: es (a) la **narrativa semanal** que hoy no existe como formato, (b) la **capa macro**, que hoy es cero, y (c) 3-4 indicadores puntuales.

**Fecha:** jul 2026 · **Estado revisado:** `lib/technical.ts` (1075 líneas), `lib/conviction.ts`, `lib/signal-backtest.ts`, `lib/benchmark.ts`, `lib/earnings.ts`, `app/api/cron/sync-prices` (`computeDailyDecisions` → `daily_decisions`), `supabase/functions/notify-watchlist-digest`, `app/api/stock-news`, `components/Radar.tsx`.

---

## Inventario: qué del video YA existe

| Lo que hace el video | Estado en la app | Dónde |
|---|---|---|
| Tendencia de fondo, medias móviles | ✅ SMA20/50/200, semanas en estado, pendiente | `technical.ts → trend` |
| RSI, sobrecompra/sobreventa | ✅ RSI Wilder 14 | `rsiWilder` |
| **Divergencias** (lo que más usa en el video) | ✅ ya detectadas | `analysis.divergence` |
| Cruces de momentum | ✅ MACD cross | `macd()` |
| Soportes/resistencias ("resistencia de manual") | ✅ **con historia**: toques, semanas activo, frescura | `LevelInfo` |
| Volumen inusual | ✅ `volumeSignal` | `technical.ts` |
| Contexto anual ("35% desde máximos") | ✅ high52/low52/distHighPct + retornos 1m/6m/1a | `technical.ts` |
| Veredicto + niveles de entrada | ✅ `verdict`, `entryPlan`, `buy[]`/`sell[]` por tramos, `alarm` | `TechnicalAnalysis` |
| "¿Compro o no?" | ✅ conviction score 0-100 + tier + decisión diaria única | `conviction.ts`, `daily_decisions` |
| Régimen de mercado (alcista/bajista) | ✅ vía SPY | `computeMarketRegime` |
| Noticias por empresa (caso Klarna/Apple) | ✅ Finnhub + resumen IA on-demand | `api/stock-news` |
| Fechas de balances | ✅ próxima fecha + días hábiles | `earnings.ts` |
| Agregar ticker a watchlist por noticia | ✅ watchlist + target_price | Radar |
| Rendimiento vs índice | ✅ benchmark vs SPY | `benchmark.ts` |
| **Confiabilidad histórica de cada señal** | ✅ backtest — el video NO tiene esto | `signal-backtest.ts` |

## Lo que falta

1. **Formato semanal.** Hoy todo es "hoy": `daily_decisions` es diaria, el digest es diario, Radar es estado actual. No existe "qué pasó esta semana y qué viene".
2. **Capa macro = 0.** Tasas Fed, CPI/IPP, petróleo, rendimiento del bono a 10 años, dólar. El video dedica 12 de 22 minutos a esto.
3. **Calendario forward.** Sabe cuándo reporta una empresa, pero no "el miércoles hay reunión de la Fed, el jueves PIB".
4. **Cripto.** La watchlist es de acciones. No hay BTC, ni dominancia.
5. **Indicadores puntuales:** Fibonacci (targets de corrección), POC / perfil de volumen (el video lo usa muchísimo para BTC), líneas de tendencia diagonales.
6. **Targets explícitos con %.** El motor da niveles y alarmas, no "debería ir a 728, un 1,3% abajo".

---

## Tensión de diseño que hay que resolver primero

El código tiene una decisión explícita y documentada (jul 2026, `lib/technical.ts` línea 19):

> *"el conjunto de señales es finito, así que NO se usa IA para redactar; plantillas deterministas cubren el 100% de los casos sin costo, latencia ni alucinaciones"*

Y `api/stock-news`: *"la IA no calcula ni opina del análisis técnico — solo traduce/resume texto externo"*.

El video, en cambio, es **opinado y predictivo**: "yo creo que BNB llega a $2.000", "debería ir a la zona de 723". Eso es una persona jugándose una opinión, no una regla determinista.

**Tres niveles posibles — hay que elegir uno antes de construir:**

- **N1 · Informe factual (respeta el diseño actual).** Todo determinista: qué cambió esta semana, qué señales se activaron, qué viene en el calendario. Sin predicciones. La IA solo redacta la costura entre bloques ya calculados.
- **N2 · Informe con escenarios** *(recomendado)*. Agrega niveles condicionales calculados por regla, en formato "si pasa X → siguiente zona Y (−Z%)", que es lo mismo que hace el video pero sin fingir certeza. Fibonacci y POC entran acá porque son cálculos, no opiniones.
- **N3 · Informe opinado.** La IA emite juicio direccional propio. Rompe el principio rector, introduce alucinaciones en dinero real, y el backtest deja de poder validar lo que se dijo. **No recomendado.**

El resto del plan asume **N2**.

---

## Fase S1 — Capa macro (lo que hoy es cero) ✅ implementada (v0, jul 2026)

~~Nueva tabla `macro_snapshots`~~ — en la práctica se reutilizó `price_cache` con clave sintética `MACRO_<seriesId>` (mismo patrón que earnings/news), cache 24h, sin cron dedicado: se calcula en vivo al abrir `/inversiones?view=semanal`, igual que el resto del informe (S5 v0).

- **FRED API** (gratis, key inmediata) para tasa efectiva + treasury 10Y/2Y → `lib/yield-curve.ts` deriva "curva invertida sí/no".
- **Series FRED usadas:** `DFF` (tasa efectiva), `DGS10`/`DGS2` (bonos, curva), `CPIAUCSL` (inflación EEUU, variación interanual vía `lib/yoy-change.ts`), `DCOILWTICO` (petróleo WTI, variación semanal).
- **Dólar CLP:** no se duplicó — sigue en `usd_clp` de `net_worth_snapshots`, fuera de este bloque.
- Todo en `lib/macro-fetch.ts` (fetch+cache) + `lib/yield-curve.ts` / `lib/yoy-change.ts` (fórmulas puras, con test). Si falta `FRED_API_KEY` (ver `.env.local.example`), `fetchMacroSeries` devuelve `null` y la sección "Contexto de mercado" simplemente no aparece — nunca rompe el resto del informe.

Entrega: bloque "Contexto de mercado" en `WeeklyReport.tsx` con tasa Fed, curva 10Y-2Y, petróleo (+ variación semanal) e inflación YoY. Determinista, sin IA.

**Pendiente real:** todo esto depende de que Cas configure `FRED_API_KEY` — sin key, el bloque no se muestra (comportamiento esperado, no un bug).

## Fase S2 — Calendario de la semana que viene

- **Ya disponible:** fechas de balances de tu watchlist (Finnhub, vía `api/stock-earnings`).
- **A agregar:** calendario económico (Finnhub tiene `/calendar/economic`; FRED da fechas de publicación). Filtrar a lo que mueve el mercado: decisión Fed, CPI, PIB, empleo.
- Entrega: "Esta semana: mié 29 — reunión Fed · jue 30 — PIB + empleo · Apple reporta el 30 (tienes posición)". El cruce con TU portafolio es lo que la app puede hacer y el video no.

## Fase S3 — Indicadores que faltan (todos con test, en `lib/`)

- **`fibonacci.ts`** — retrocesos 0.382/0.5/0.618 sobre el último swing. Da los "targets" con % de distancia. ~40 líneas, puramente matemático.
- **`volume-profile.ts`** — POC (precio de mayor volumen negociado) por bins sobre N velas. Es el indicador que el video usa para casi toda su tesis de BTC. ~60 líneas.
- Ambos se enchufan a `TechnicalAnalysis` como campos nuevos y aparecen como niveles adicionales en los planes `buy[]`/`sell[]` existentes.
- Líneas de tendencia diagonales: **omitir**. Son subjetivas por definición (dependen de qué pivotes elijas) y no se pueden testear — chocan con el diseño de la app.

## Fase S4 — Cripto en la watchlist

- BTC/ETH vía CoinGecko (gratis, sin key) o los proveedores actuales con sufijo `-USD`.
- `type: 'stock' | 'crypto'` en watchlist; el motor técnico funciona igual (son velas OHLCV).
- Dominancia BTC: un endpoint de CoinGecko. Útil como contexto, no como señal.
- Ojo: cripto opera 24/7 — revisar los supuestos de "días hábiles" y de cierre semanal.

## Fase S5 — El informe semanal (la costura)

**v0 (vista en vivo) ✅** — `/inversiones?view=semanal`, calculado on-demand al abrir la página (jul 2026).

**Persistencia (cron + email) ✅ implementada (jul 2026)** — `app/api/cron/weekly-report` (Vercel, lunes 12:00 UTC) calcula el informe para TODOS los usuarios reusando `lib/weekly-report.ts` (extraído del v0 para no duplicar lógica) y lo guarda en `weekly_reports` (una fila por usuario por semana, `payload` jsonb autocontenido). La Edge Function `notify-weekly-report` (pg_cron, lunes 12:30 UTC) solo lee esa tabla y manda el correo — no recalcula nada, mismo patrón que `sync-prices` → `daily_decisions` → `notify-watchlist-digest`. Opt-out vía `profiles.notify_weekly_report`.

Estructura del correo/página, en el orden del video:

1. **Tu semana** — variación del portafolio vs SPY *(ya existía)*.
2. **Contexto de mercado** — macro S1 ✅.
3. **Qué viene** — calendario S2: solo balances de resultados (Finnhub) por ahora; falta el calendario económico general (Fed/CPI/PIB/empleo) — sigue pendiente.
4. **Tus activos** — por ticker: señal de la semana, niveles (Fibonacci/POC, S3 ✅), fiabilidad histórica del backtest. En el correo se muestra compacto (sin niveles detallados, con link a la app).
5. **Decisión** — reusa `daily_decisions` (última disponible, no exige "hoy" exacto — el cron semanal tolera mejor un dato de unos días que dejar el bloque vacío).

No se sumó redacción de IA (el plan original consideraba "2-3 párrafos de unión") — con la estructura de tarjetas/números ya es legible sin texto generado, y evita el costo/riesgo de validación de otro endpoint tipo `analyze-month`. Se puede agregar después si hace falta.

**Pendiente real:** correr la migración `20260727_weekly_reports.sql`, configurar `RESEND_API_KEY`/`SITE_URL`/`DB_SERVICE_KEY` en la Edge Function (ya usados por las otras notificaciones) y agregar el `cron.schedule` de `supabase/setup_cron.sql` en el SQL Editor de Supabase (manual, una vez).

---

## Orden y esfuerzo

| Fase | Gana | Esfuerzo | Depende |
|---|---|---|---|
| **S5 (v0)** ✅ | Informe semanal con lo que YA existe — 80% del valor | 1 sesión | — |
| **S3** ✅ | Targets con % y POC (lo más "video" del video) | 1 sesión | — |
| **S2** (parcial) | Balances de watchlist ✅ · calendario económico general (Fed/CPI/PIB/empleo) pendiente | 1 sesión | key Finnhub (ya la tienes) |
| **S1** ✅ | Capa macro completa | 1-2 sesiones | key FRED (gratis, aún no configurada) |
| **S5 (persistencia)** ✅ | Cron semanal + email, historia navegable | 1 sesión | `weekly_reports`, RESEND_API_KEY (ya la tienes) |
| **S4** | Cripto | 1-2 sesiones | decisión de producto |

**Recomendación:** partir por **S5 v0** — armar el informe semanal solo con lo que ya está calculado. Vas a ver el formato funcionando en una sesión, y recién ahí decidir qué bloque falta más (probablemente S3, que es el que más se parece al video). S1 es el más caro y el menos accionable: saber la probabilidad de suba de tasas no cambia tu aporte mensual.

## Guardarraíles
- Todo cálculo nuevo va en `lib/` con test vitest (convención del proyecto).
- Ningún dato se muestra sin `asOf` — usar `lib/format-freshness.ts`.
- La IA redacta, no calcula. Mismo patrón de validación que `analyze-month`.
- Se mantiene el disclaimer existente: no es asesoría financiera.
