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

| Señal | Umbral | Tono |
|---|---|---|
| RSI sobreventa / sobrecompra | ≤30 / ≥70 (Wilder 14) | mint / gold |
| Cruce dorado / de la muerte | SMA50 vs SMA200, cruce en últimos 10 días | mint / coral |
| Sobre / bajo SMA200 | precio vs media | neutral / gold |
| Cerca de soporte / resistencia | ≤3% del nivel pivote más cercano | mint / gold |
| Zona máximo / mínimo 52 semanas | ≤2% del máx / ≤5% del mín | gold / coral |

Pivotes: mínimos/máximos locales con ventana ±5 días sobre los últimos 252 cierres, clusterizados si están a <1.5% entre sí; se muestran los 2 más cercanos a cada lado del precio.

### Avisos in-app (cómo funcionan hoy)

Al montar `WatchlistPanel` se precargan los análisis de todos los favoritos **secuencialmente con pausa de 400 ms** (AV free también limita por minuto). Cada fila muestra un chip "N señales" coloreado por la señal más severa (coral > gold > mint). Tocar la fila abre el detalle en popup.

### Presupuesto de cuota (dimensionado para ~15 favoritos, 2 visitas/día)

- Velas: cache **24 h** (los cierres diarios cambian una vez al día) → máx 15 req/día a Alpha Vantage, límite free 25. La segunda visita del día consume 0.
- Fallos: cache negativo 1 h → los reintentos automáticos no queman cuota; "Reintentar" fuerza con `?force=1`.
- Quotes (precio en vivo): Finnhub `/quote`, gratis, se refresca en cada visita — independiente de las velas.
- Headroom si algún día se queda corto: Twelve Data (free 800 req/día) como quinta fuente, o segunda key de AV.

## Validaciones pendientes

- [x] ~~Velas diarias~~ — cadena de 4 fuentes: **Finnhub → Yahoo → Stooq → Alpha Vantage**. Diagnóstico real en la red de Cas (jul 2026): Finnhub 403 (plan free), Yahoo 429 (bloqueo por IP), Stooq respuesta no-CSV. Stooq ahora usa headers de navegador + reintento sin rango de fechas + muestra los primeros 60 chars de lo que respondió. Alpha Vantage (`TIME_SERIES_DAILY`, outputsize=full) se activa con `ALPHAVANTAGE_API_KEY` en `.env.local` — key gratis, 25 req/día, suficiente con cache 12 h. El 502 lista la respuesta de cada proveedor y el cliente la muestra en la card de error.
- [ ] Aplicar migración `20260706_watchlist.sql` en Supabase.

## Roadmap

### Fase 2 — Centro de avisos in-app (siguiente)
Sin emails. Ideas en orden:
1. **Precio objetivo**: UI para `target_price` (ya existe la columna) — chip "llegó a tu precio" cuando `price <= target_price`.
2. **Resumen de señales arriba de la watchlist**: "3 de tus 8 favoritos tienen señales activas" con filtro rápido.
3. **Badge en el toggle de Inversiones** (puntito en la tab Acciones) cuando hay señales coral, para verlo desde cualquier vista.
4. **Señales también en posiciones propias**: reusar `TechnicalDetail` dentro de StockPositionManager (el componente ya es independiente).

### Fase 3 — Emails (cuando Cas lo pida — HOY NO)
Edge function diaria post-cierre (patrón `notify-*` + pg_cron ya montado) que evalúe watchlist y mande email con señales nuevas vs día anterior (dedupe vía `notification_log`, patrón existente). Toggle en Ajustes → Notificaciones.

### Fase 4 — DeepSeek narrador (opcional)
La IA **no calcula**: recibe el `TechnicalAnalysis` ya computado y redacta explicación pedagógica ("qué suelen mirar los analistas con este RSI"). Mismo patrón de sanitización/rate-limit que `analyze-month`.

## Convenciones a respetar al extender

- La matemática vive en `lib/technical.ts` — nunca en componentes ni en prompts de IA.
- Nuevos datos cacheables de mercado → `price_cache` con clave sintética `{SYM}_{SUFIJO}` y TTL en la route.
- Toda señal nueva lleva: umbral estándar documentado en la tabla de arriba, tono del sistema (mint/gold/coral/neutral), `title` corto + `detail` que explique la limitación del indicador.
- El disclaimer no se negocia.
