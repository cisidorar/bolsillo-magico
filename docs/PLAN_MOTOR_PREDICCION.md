# Plan: que el motor de compra/venta prediga mejor (nov 2026)

_Motor: `lib/technical.ts` (rating) → `lib/conviction.ts` (score 0-100) → `isActionableBuyNow` → `daily_decisions`._

## Principio

El motor no necesita más indicadores: necesita **medir si lo que ya tiene predice algo**. Toda regla nueva o cambio de peso tiene que pasar por la investigación de abajo, y la prueba final es el registro diario (no un backtest).

Lo que dice la literatura (resumen de la investigación de nov 2026):

- Reglas técnicas clásicas (RSI, MACD, cruces): con corrección por probar muchas reglas sobre los mismos datos (*data snooping*) y fuera de muestra, la evidencia de que predicen es débil o nula; los costos de transacción suelen borrar lo que queda.
- Momentum 12-1 (12 meses sin el último): el factor con más respaldo, pero sobre universos amplios (miles de acciones).
- Cercanía al máximo de 52 semanas (George & Hwang 2004): predice retornos en la literatura. **En nuestro universo no se confirma** (ver abajo).
- Deriva post-resultados: casi desaparecida en acciones grandes → earnings como riesgo, no como señal.
- Sobreajuste: Deflated Sharpe y Probability of Backtest Overfitting (Bailey & López de Prado). Ajustar reglas por caso ("caso INTC", "caso SNDK"…) es exactamente lo que esas herramientas castigan.

## Hecho (nov 2026)

1. **Investigación offline** — `lib/signal-research.ts` + `scripts/signal-research.ts`.
   - ~9 años, 65 tickers (watchlist + 40 grandes empresas de varios sectores), muestreo semanal, `analyze()` sin mirar el futuro con la misma ventana de 430 ruedas que producción.
   - Mide **retorno excedente vs SPY** a 20 y 60 ruedas, agrupado por fecha (10 semis con la misma señal el mismo día = 1 apuesta), con N efectivo corregido por solapamiento y estabilidad por mitades del período.
   - Se corre dos veces: con watchlist (`docs/INVESTIGACION_SENALES.md`) y **sin** ella (`docs/INVESTIGACION_SENALES_SIN_WATCHLIST.md`) — la watchlist se eligió sabiendo cuáles subieron, y eso infla factores como volatilidad y momentum.
   - Correr: `npx -y tsx scripts/signal-research.ts [--universe broad] [--out archivo.md]`.

2. **Hallazgos** (ninguno llega a |t| ≥ 2; son tendencias, no pruebas):
   - Las compras "más fuertes" del motor rendían **peor** que el promedio en ambos universos y ambas mitades: `compra_fuerte` (−1,0 / −1,7 pp a 1 mes), divergencia alcista (−1,1 / −1,3), cruce dorado (−1,0 / −0,9). Eran justo los gatillos con peso doble (+2).
   - Tendencia bajista y mínimos anuales rinden peor (lo que el motor ya castiga) — la regla "no compres en tendencia bajista" es la más respaldada.
   - Convicción ≥70 es levemente mejor que el resto en ambos universos.
   - Cerca del máximo anual: levemente **peor** (Q5−Q1 negativo en ambos universos) → se mantiene la cautela actual.
   - Sobre-extensión (≥15% sobre SMA200): sin evidencia consistente para castigarla ni para premiarla → se deja igual.
   - Momentum 12-1: positivo solo con la watchlist; débil sin ella → no entra al score, se registra para seguir midiéndolo.
   - Volatilidad alta rinde más en ambos universos — probablemente sesgo de supervivencia; no se usa.

3. **Cambios al motor**
   - Divergencia alcista y cruce dorado: **+2 → +1** (`lib/technical.ts`, test de regresión en `lib/technical.test.ts`). El lado vendedor sigue en −2. Efecto medido: `compra_fuerte` pasa de −1,0 a −0,1 pp (con watchlist) y de −1,7 a +0,7 pp (sin ella); se vuelve mucho más rara (144 → 38 muestras). **Ojo:** es una mejora medida sobre los mismos datos con que se eligió el cambio — la validación real es el punto 5.
   - Track record por ticker **contra SPY** (`lib/signal-backtest.ts`): "acertó" = le ganó al mercado, no "subió". Antes, en un mercado alcista, cualquier señal "acertaba" ~60%. Nuevo `avgExcess20`; la UI dice "Le ganó al mercado (SPY) X% de las veces".

4. **Medición de lo ya decidido** (consulta puntual, nov 2026): las 52 compras sugeridas en `daily_decisions` con 20 ruedas de historia rindieron en promedio **+1,8 pp sobre SPY**, pero son pocas apuestas independientes (SOXL repetida 15 días seguidos) — es ruido todavía.

5. **Registro diario fuera de muestra** — tabla `signal_snapshots` (migración `20261123_signal_snapshots.sql`). El cron `sync-prices` guarda una fila por ticker por día (rating, convicción, flags de cada componente, momentum 12-1, régimen) y `fill_signal_outcomes()` completa después los retornos del ticker y de SPY a 5/20/60 ruedas. En ~6 meses habrá ~3.000 filas imposibles de sobreajustar.

## Pendiente

- [ ] Aplicar la migración `20261123_signal_snapshots.sql` **antes** de desplegar (si no, el cron solo loguea el error, pero `signal_stats` no se actualiza porque el upsert incluye `avg_excess_20`).
- [ ] ~mayo 2027: con `signal_snapshots` lleno, repetir el análisis sobre los datos reales (mismas funciones de `lib/signal-research.ts`) y decidir: ¿siguen sumando MACD, soporte, RSI? ¿momentum 12-1 merece entrar al score?
- [ ] Earnings como reductor de monto (no como señal): bajar `suggested_usd` si reporta en ≤5 ruedas.
- [ ] Riesgo de cartera: avisar cuando una compra nueva está muy correlacionada con lo que ya se tiene (NVDA + SOXL + AMD = una sola apuesta).
- [ ] El backtest por ticker sigue limitado por la historia en `price_history` (desde may 2025, `readCandles` lee 430 filas): evalúa ~130 días. Crece solo con el tiempo.

## Reglas para cambiar el motor de aquí en adelante

1. Ningún cambio de peso o umbral por un caso puntual. Un caso puntual es una hipótesis: se prueba con `scripts/signal-research.ts` en ambos universos.
2. Se acepta un cambio si el efecto tiene el mismo signo en ambos universos y en ambas mitades. Para **agregar** una señal nueva, exigir además |t| ≥ 2 (se probaron ~30 condiciones: 1-2 "significativas" pueden ser suerte).
3. Antes de dar por buena una regla, mirar su fila en `signal_snapshots`: la evidencia fuera de muestra manda sobre el backtest.
