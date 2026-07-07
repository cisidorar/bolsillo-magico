# Watchlist con señales técnicas

_Última actualización: julio 2026 — Fase 1 + avisos in-app implementados._

## Qué es

Seguimiento de acciones y ETFs favoritos (con o sin posición) en **Inversiones → Acciones**, con un panel de análisis técnico por ticker: RSI, medias móviles, cruces, rango de 52 semanas y soportes/resistencias.

**Decisión de producto (julio 2026):** los avisos son **solo in-app** — se muestran al entrar a revisar la app, como badges de señales en cada fila de la watchlist. **No hay emails ni push por ahora**; la infraestructura para fase de emails queda diseñada pero deliberadamente sin construir.

**Principio rector:** las señales son informativas y educativas, nunca recomendación de compra/venta. La matemática es determinista (código, no IA). Cada señal explica qué significa Y su limitación (ej: "un soporte roto se convierte en caída"). El disclaimer es visible siempre.

## Arquitectura

```
watchlist (tabla)                    ← tickers favoritos por usuario
    │
inversiones/page.tsx                 ← fetch server-side, pasa initialItems
    │
WatchlistPanel.tsx ('use client')    ← CRUD + quotes + panel expandible
    │         │
    │         └── GET /api/stock-price?symbols=…   (quotes en vivo, ya existía)
    │
    └── GET /api/technical?symbol=SYM
            │
            ├── Finnhub /stock/candle resolution=D (~14 meses, LOOKBACK_D=430)
            ├── cache: price_cache con clave sintética `{SYM}_D1Y`, TTL 12 h
            │   (mismo patrón que stock-history usa con `{SYM}_HIST_{months}`)
            └── lib/technical.ts → analyze(candles) → TechnicalAnalysis
```

### Archivos

| Archivo | Rol |
|---|---|
| `supabase/migrations/20260706_watchlist.sql` | Tabla `watchlist` con RLS. Incluye `target_price numeric` **ya migrado pero sin UI** — reservado para alertas de precio objetivo |
| `lib/technical.ts` | Indicadores puros: `smaLast`, `rsiWilder`, `pivotLevels`, `analyze()`. Sin dependencias, testeable |
| `app/api/technical/route.ts` | Auth + validación ticker + fetch velas + cache + `analyze()` server-side |
| `components/WatchlistPanel.tsx` | UI completa: popup de búsqueda, filas con quote + badge de señales, panel `TechnicalDetail` |
| `app/api/stock-search/route.ts` | Búsqueda por nombre o ticker: Finnhub `/search` primero, fallback Yahoo `v1/finance/search`; filtra a acciones/ETFs con símbolo US limpio |

### Señales y umbrales (en `analyze()`)

### Lectura técnica agregada (rating) — estado vs gatillos (jul 2026)

`TechnicalRating` separa dos sumas:

- **`trendScore` (estado):** SMA200 ±1/±2 según pendiente, mínimos anuales −1, sobre-extensión (≥15% sobre SMA200) −1. Contexto persistente.
- **`triggerScore` (gatillos/eventos):** divergencia ±2, cruce dorado/muerte ±2, MACD ±1, volumen ±1, RSI extremo ±1, soporte/resistencia cercano ±1.

`score = trendScore + triggerScore`. **Compra/venta exigen al menos un gatillo alineado** — estar en tendencia alcista ya no produce "Compra" permanente (fatiga de alertas para revisión semanal). Umbrales: compra_fuerte `score ≥5 && trigger ≥2` · compra `score ≥2 && trigger ≥1` · venta/venta_fuerte simétricos · resto neutral. `pros`/`cons` cuentan los mismos componentes puntuados (incluida la tendencia), así el banner nunca dice "Compra · 0 a favor".

**`caution` (toma de ganancias):** `aboveSma200 && triggerScore ≤ −3` — presión bajista acumulada con tendencia aún alcista. Solo se muestra a quien tiene posición; llega antes que "Venta" (que requiere perder la SMA200).

Cada `TechnicalSignal` lleva `trigger: boolean` (evento vs estado). Banner al tope del popup con contador a favor/en contra y la leyenda fija "regla automática — no es asesoría financiera".

| Señal | Umbral | Tono | Gatillo |
|---|---|---|---|
| **Divergencia alcista/bajista precio-RSI** | 2 pivotes en ~90 días: precio LL + RSI HL (alcista) o precio HH + RSI LH (bajista), 2º pivote en últimos 20 días, delta RSI >2 | mint / coral | sí |
| RSI sobreventa / sobrecompra | ≤30 / ≥70 (Wilder 14) | mint / gold | sí |
| Cruce dorado / de la muerte | SMA50 vs SMA200, día a día en últimos 10 días | mint / coral | sí |
| Cruce MACD (12,26,9) | histograma cambia de signo en últimos 10 días | mint / coral | sí |
| Volumen inusual | vol ≥1.8× promedio 20d con \|cambio\| ≥2%, **escaneado en los últimos 5 días hábiles** (cadencia semanal) | mint / coral | sí |
| Cerca de soporte / resistencia | ≤3% del nivel; título incluye toques y semanas vigente | mint / gold | sí |
| Zona máximo / mínimo 52 semanas | ≤2% del máx / ≤5% del mín (desde highs/lows diarios reales, no cierres) | gold / coral | no |
| Sobre-extendida | precio ≥15% sobre la SMA200 (espejo del "cuchillo cayendo"; resta −1 en trendScore) | gold | no |

**Enfoque de largo plazo (decisión jul 2026, Cas invierte ~1 vez/semana):** el popup lidera con un **veredicto en 1-2 frases** (tendencia + divergencia/nivel, generado por código en `analyze()`), gráfico de 12 meses con SMA200 y niveles dibujados, tendencia de fondo con **persistencia** ("N semanas sobre su media de 200"), **niveles con historia** (`LevelInfo`: toques, primer toque, semanas vigente) y rendimiento 1m/6m/1a. El RSI y el rango 52s quedan al final como momentum secundario. Nada de variación intradía como protagonista.

Pivotes: mínimos/máximos locales con ventana ±5 días sobre los últimos 252 días (lows para soportes, highs para resistencias), clusterizados si están a <1.5% **del promedio del grupo** (evita encadenado) conservando índices/fechas; se muestran los 2 más cercanos a cada lado del precio. `LevelInfo` incluye `weeksSinceLast` (frescura del último toque) y `distPct` (distancia con signo al precio actual) — ambos visibles siempre en la UI, no solo cuando el nivel está a ≤3%. **Las señales de nivel exigen ≥2 toques** (un nivel de 1 toque se muestra en la lista pero no anuncia "probando piso"). **`touches` cuenta acercamientos reales**: días con el precio a ±1% del nivel, agrupando visitas contiguas (gap ≤5 días) como un solo toque — contar solo pivotes del cluster subestimaba (todo salía "1 toque").

### Radar "al ojo" — avisos anticipados (jul 2026, Cas compra más que vende)

`analyze()` devuelve `watch: TechnicalSignal[]`: cosas **cerca de pasar** que no puntúan en el rating — la antesala de las señales. Umbrales:

| Aviso | Condición | Tono |
|---|---|---|
| `watch_support` | piso con ≥2 toques a 3-8% por debajo (≤3% ya es señal); el detail menciona escalonar compras por partes | mint |
| `watch_breakout` | techo con ≥2 toques a 3-6% por encima, con tendencia larga alcista | mint |
| `watch_rsi_low` / `watch_rsi_high` | RSI 30-40 (enfriándose) / 62-70 (calentándose) | mint / gold |
| `watch_macd_up` / `watch_macd_down` | histograma MACD acercándose a cero con racha de 3+ días, sin cruce aún | mint / gold |
| `watch_golden` | SMA50 bajo SMA200 pero subiendo y a <1.5% de cruzar | mint |
| cerca del objetivo (UI) | precio a ≤3% del `target_price` sin alcanzarlo (`nearTarget`, client-side) | primary |

UI: sección "Para revisar pronto" en el popup, chip "revisar pronto" en la fila (solo si no hay chip más fuerte), chip "N revisar pronto" en el header plegado y en el resumen sobre la lista. El popup del objetivo muestra "a X% de distancia" mientras no se alcance. Gráfico: etiquetas de niveles con anti-colisión (mínimo 12px entre etiquetas).

**Orden de la watchlist (jul 2026):** por probabilidad de compra pronto — objetivo de entrada alcanzado (+100) > compra fuerte (+90) > compra (+80) > cerca del objetivo (+40) > avisos mint del radar (+10 c/u) + triggerScore positivo; empates conservan orden de agregado. El tag "Nueva" por señal (diff vs última visita) se probó y se quitó a pedido de Cas — el radar cumple mejor ese rol. Popup: columna izquierda = contexto (4 tarjetas de stats con ícono + niveles), derecha = señales + radar.

### Contexto de posición y diff semanal (UI, jul 2026)

- `WatchlistPanel` recibe `positions: Record<ticker, {shares, avgCost}>` (agregado ponderado en `inversiones/page.tsx`). Si el ticker está en cartera, el popup muestra bloque "Tu posición": retorno vs costo promedio y soporte más cercano como referencia de stop.
- **Diff semanal:** `localStorage.watchlistSeenSignals` guarda los `kind` vistos por ticker (se marca al abrir el detalle). Señales no vistas llevan tag "Nueva" en el popup y en la fila; sobre la lista aparece "N de M favoritos con señales nuevas". Primer uso sin baseline = nada se marca nuevo.
- Flags de fila: `buy` (mint) / `sell` (coral, solo en cartera) / `caution` "Toma de ganancias" (gold, solo en cartera). Severidad del chip plegado: sell > caution > buy.

### Avisos in-app (cómo funcionan hoy)

Al montar `WatchlistPanel` se precargan los análisis de todos los favoritos **secuencialmente con pausa de 400 ms** (AV free también limita por minuto). Cada fila muestra un chip "N señales" coloreado por la señal más severa (coral > gold > mint). Tocar la fila abre el detalle en popup.

### Presupuesto de cuota (recalibrado jul 2026 para ~30 favoritos)

**Equilibrio elegido: datos al último cierre hábil, nunca "en vivo", nunca más viejos que eso.**

- **Velas**: se sincroniza un ticker solo cuando le falta el **último cierre hábil completo** (`lastExpectedClose()`: ayer, saltando fin de semana). Efecto: la primera visita después de un cierre dispara ≤30 syncs (secuenciales, 400 ms entre sí); el resto del día y todo el fin de semana → **0 requests externos**. Antes (`STALE_D=4`) se ahorraba igual pero se trabajaba con velas de hasta 4 días.
- **Throttle de reintentos**: si el sync no consiguió el cierre esperado (feriado US, proveedor caído), marker `{SYM}_SYNCTRY` en `price_cache` → reintento máx. cada 6 h por ticker, no en cada visita. `?force=1` lo salta.
- **Quotes** (precio en vivo del header/filas): 1-2 requests batched por visita (chunks de 25 símbolos — con 30+ favoritos los sobrantes se perdían en silencio). Cache server-side con TTL propio.
- **Guard intradía**: con ±3% de desvío vs el cierre analizado, el detalle avisa que las señales quedaron viejas y oculta el radar — sin pedir recálculo (se recalcula solo con el próximo cierre).
- Headroom si algún día falta: Twelve Data (free 800 req/día) como fuente extra, o segunda key de AV.

## Validaciones pendientes

- [x] ~~Velas diarias~~ — cadena de 4 fuentes: **Finnhub → Yahoo → Stooq → Alpha Vantage**. Diagnóstico real en la red de Cas (jul 2026): Finnhub 403 (plan free), Yahoo 429 (bloqueo por IP), Stooq respuesta no-CSV. Stooq ahora usa headers de navegador + reintento sin rango de fechas + muestra los primeros 60 chars de lo que respondió. Alpha Vantage (`TIME_SERIES_DAILY`, outputsize=full) se activa con `ALPHAVANTAGE_API_KEY` en `.env.local` — key gratis, 25 req/día, suficiente con cache 12 h. El 502 lista la respuesta de cada proveedor y el cliente la muestra en la card de error.
- [ ] Aplicar migración `20260706_watchlist.sql` en Supabase.

## Roadmap

### Fase 2 — Centro de avisos in-app
1. ~~**Precio objetivo**~~ — hecho (jul 2026). Editor en el popup (barra bajo el header). Dirección según cartera: sin posición = objetivo de ENTRADA (`price ≤ target`), con posición = objetivo de SALIDA (`price ≥ target`). Chip "En tu precio" en la fila y "Llegó a tu precio" en el popup; cuenta en el badge plegado "N para revisar".
2. ~~**Resumen de señales arriba de la watchlist**~~ — hecho (jul 2026) como diff semanal: "N de M favoritos con señales nuevas".
3. **Badge en el toggle de Inversiones** (puntito en la tab Acciones) cuando hay señales coral, para verlo desde cualquier vista.
4. **Señales también en posiciones propias**: reusar `TechnicalDetail` dentro de StockPositionManager (el componente ya es independiente).

### Fase 3 — Emails (cuando Cas lo pida — HOY NO)
Edge function diaria post-cierre (patrón `notify-*` + pg_cron ya montado) que evalúe watchlist y mande email con señales nuevas vs día anterior (dedupe vía `notification_log`, patrón existente). Toggle en Ajustes → Notificaciones.

### Fase 4 — DeepSeek narrador → DESCARTADA (jul 2026)
**Decisión: sin IA.** El usuario no es profesional, pero el conjunto de señales es finito (~14 casos conocidos), así que las explicaciones en lenguaje cotidiano se generan por código: `TechnicalSignal.title`/`detail` van en simple ("Está tocando un piso que ya la frenó 3 veces") y el término técnico queda en `TechnicalSignal.tech` como etiqueta secundaria chica en la UI ("Soporte en $180") — se entiende sin saber nada y se aprende el término de paso. Plantillas deterministas cubren el 100% de los casos sin costo, latencia, rate-limit ni riesgo de que la IA alucine una recomendación; coherente con el principio rector. La IA solo aportaría en preguntas libres ("¿por qué cayó hoy?"), que requieren noticias, no análisis técnico — si algún día se quiere, va como botón "explícame más" aparte, nunca reemplazando el copy determinista.

## Convenciones a respetar al extender

- La matemática vive en `lib/technical.ts` — nunca en componentes ni en prompts de IA.
- Nuevos datos cacheables de mercado → `price_cache` con clave sintética `{SYM}_{SUFIJO}` y TTL en la route.
- Toda señal nueva lleva: umbral estándar documentado en la tabla de arriba, tono del sistema (mint/gold/coral/neutral), `title` corto + `detail` que explique la limitación del indicador.
- El disclaimer no se negocia.
