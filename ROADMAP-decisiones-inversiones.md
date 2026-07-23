# Roadmap de calidad de decisión · Inversiones → Acciones

Diagnóstico (jul 2026, post-roadmaps funcional/UX/interacción): la app ya organiza bien la información y deja actuar en un gesto. Lo que queda es mejorar la CALIDAD de la decisión que recomienda — el número, el monto y el momento. Auditando el motor real (lib/conviction.ts, lib/technical.ts, cron sync-prices) y el portafolio real de uso (TSM, QQQ, SOXL, MU, INTC… fuerte en semiconductores), estos son los huecos ordenados por impacto en plata real.

**Estado: ✅ D1, D3, D4, D5, D6 implementados (jul 2026).** D2 quedó explícitamente fuera a pedido de Cas ("ignora D2") — no implementado, sigue documentado abajo por si se retoma más adelante.

---

## D1 — El track record existe pero NUNCA alimenta el score (impacto alto, esfuerzo medio) ✅

**Problema.** `computeConviction()` fue diseñado con 4 componentes, y el track record (¿qué tan seguido acertó ESTA señal en ESTE ticker?) pesa el 20%. Pero en TODOS los call sites reales — ranking de Radar, cabecera del detalle, cron `daily_decisions` — se pasa `backtestStats: null`, porque el backtest es caro (recorre ~1 año de ruedas re-corriendo `analyze()` día a día) y solo se calcula on-demand cuando el usuario toca "¿Le funcionó esta señal antes?". Resultado: el score con el que decides compara tickers usando solo 3 de sus 4 patas — dos tickers con la misma lectura técnica puntúan igual aunque en uno la señal haya acertado 80% de las veces y en el otro 30%.

**Propuesta.**
- El cron nocturno ya corre `analyze()` por ticker; agregar ahí `backtestSignals()` (una vez por ticker por día, no por usuario) y persistir los `LabelStat` en una tabla `signal_stats` (ticker, label, count, hit_rate_20, avg_return_20/60, computed_at) con upsert diario.
- Radar, TechnicalDetail y `computeDailyDecisions` leen esa tabla (un fetch liviano) y pasan los stats reales a `computeConviction` — el 20% del score por fin existe en producción.
- El botón on-demand del detalle pasa a mostrar el desglose (eventos individuales), no a ser la única vía de cálculo.
- Cuidado con el presupuesto de 60 s del cron: el backtest por ticker es CPU puro sobre candles ya en memoria — medir, y si aprieta, hacerlo cada N días o solo para tickers con señal activa.

**Implementación.** Migración `signal_stats` (ticker, label, count, hit_rate_20, avg_return_20/60). El cron (`sync-prices`) corre `backtestSignals()` una vez por ticker por día (solo con ≥260 ruedas de historia, donde el backtest realmente opina) y hace upsert; `computeDailyDecisions` reutiliza esos stats en memoria, sin segunda lectura. `/api/technical` ahora devuelve `backtestStats` junto al análisis (lectura liviana de `signal_stats`); `lib/analysis-cache.ts` cachea ambos en la misma entrada y expone `getCachedBacktestStats(ticker)` — Radar y TechnicalDetail lo usan en vez de pasar `null`.

## D2 — Concentración invisible: el score mira cada ticker solo (impacto alto, esfuerzo medio) — no implementado (a pedido de Cas)

**Problema.** El portafolio real está cargado a un solo tema (TSM + MU + INTC + SOXL + QQQ = semiconductores/tech correlacionados, y SOXL es 3× apalancado sobre el MISMO índice que ya está en cartera). El score de convicción y la regla del 1% tratan cada compra como independiente: "compra hasta US$X de MU" puede estar apilando el 5º ladrillo de la misma apuesta, y la regla del 1% de riesgo por posición subestima el riesgo real cuando 5 posiciones caen juntas. Hoy NADA en la app te muestra ni descuenta esto.

**Propuesta.**
- Correlación de retornos diarios (~6 meses) entre el candidato y cada posición existente, calculada desde `price_history` (ya está todo en la DB, sin APIs nuevas).
- En el panel "¿Qué comprar hoy?" y el detalle: si la correlación media con la cartera supera un umbral (ej. 0.7), decirlo en una razón más del score: "Se mueve casi igual que lo que ya tienes (TSM, MU) — diversifica poco".
- En la sugerencia de monto: descontar el tope cuando la exposición correlacionada ya es alta (ej. si >50% del portafolio se mueve junto, sugerir la mitad del 1% habitual), con la razón visible.
- Un dato agregado en el hero o en Rendimiento: "% del portafolio que se mueve junto" — un número, no un tratado de teoría de carteras.

## D3 — Comprar 2 días antes de earnings sin saberlo (impacto alto, esfuerzo bajo) ✅

**Problema.** El análisis es 100% técnico y ciego a eventos. La app puede decir "Compra US$450 de INTC ahora" el día antes de resultados trimestrales — la situación donde el gráfico menos predice y el gap de apertura puede saltarse la alarma de salida completa. El usuario no tiene forma de saberlo sin ir a buscar afuera.

**Propuesta.**
- Finnhub (ya integrado para noticias, misma API key) expone calendario de earnings. Fetch on-demand con caché de 24 h por ticker (mismo patrón que `/api/stock-news`).
- Si hay earnings en ≤5 días hábiles: chip visible en el detalle y en la fila ("resultados en 3 días"), y una razón en el score/panel: "Reporta resultados el jueves — el gráfico pesa menos hasta entonces".
- En la sugerencia de compra accionable: no bloquearla (la decisión es del usuario), pero decir el riesgo en la misma tarjeta. Con earnings a ≤2 días, el monto sugerido se reduce a la mitad, con la razón explícita.

**Implementación.** `app/api/stock-earnings` (Finnhub `/calendar/earnings`, cache 24h en `price_cache` igual que noticias) + `lib/earnings.ts` (`businessDaysUntil`, testeado) + `lib/earnings-cache.ts` (cache de módulo client-side). Se pide on-demand: en `TechnicalDetail` al abrir el ticker, y en Radar solo para el candidato que el panel "¿Qué comprar hoy?" está sugiriendo (no los 20 tickers de la lista). ≤5 días hábiles → aviso visible; ≤2 días hábiles → el monto sugerido de HOY se reduce a la mitad (el resto del plan de compra no se toca).

## D4 — El motor opina igual en mercado alcista y bajista (impacto medio, esfuerzo bajo) ✅

**Problema.** Los gatillos de entrada (retroceso a soporte, ruptura con volumen) tienen probabilidades muy distintas según el régimen del mercado general — comprar rupturas con SPY bajo su SMA200 falla mucho más seguido. SPY ya se analiza todas las noches en el cron y ya alimenta la fuerza relativa (15%), pero el RÉGIMEN (SPY sobre/bajo SMA200, subiendo/bajando) no modula nada: mismo score, mismo gatillo, mismo monto en cualquier clima.

**Propuesta.**
- Leer el régimen del análisis de SPY que YA existe (`trend.aboveSma200`, `sma200Rising`) — costo cero de datos.
- En régimen bajista: `isActionableBuyNow` exige `compra_fuerte` (no basta `compra`), y el panel lo dice: "Mercado en tendencia bajista: el listón para comprar está más alto".
- Una línea de contexto permanente en el panel "¿Qué comprar hoy?": "Mercado (SPY): alcista/bajista/mixto" — para que la decisión individual siempre se lea dentro del clima general.
- Test en `technical.test.ts`/`conviction.test.ts` del nuevo comportamiento por régimen.

**Implementación.** `lib/conviction.ts`: `computeMarketRegime(spyTrend)` (alcista/bajista/mixto) + `isActionableBuyNow(analysis, conviction, regime?)` con tercer parámetro opcional (compatible hacia atrás) que exige `compra_fuerte` en bajista. Aplicado en el flag de fila de Radar, el ranking "¿Qué comprar hoy?" (con chip de régimen visible en el panel) y `computeDailyDecisions` del cron. Tests nuevos en `conviction.test.ts`.

## D5 — Nadie recuerda qué decía la app cuando compraste (impacto medio, esfuerzo bajo) ✅

**Problema.** Cada compra guarda ticker, acciones y monto — pero no la LECTURA con la que se decidió (score, tier, razones, riesgo/recompensa del momento). Sin eso no hay aprendizaje posible: no puedes revisar "¿me fue mejor cuando compré con 80 que con 60?" ni saber si sigues el plan o compras por impulso. Las métricas de ventas cerradas (Fase 2.1) miden el resultado, pero no lo conectan con la calidad de la señal de entrada.

**Propuesta.**
- Migración: columnas `conviction_score`, `conviction_tier`, `had_entry_trigger` (y opcional `reasons` jsonb) en `stock_purchases`. El cliente las llena al registrar la compra con el análisis ya cargado — costo marginal cero.
- En Rendimiento: cruzar ventas cerradas con el score de entrada de sus compras — "tus compras con score ≥70 rindieron X% promedio; con score <55, Y%". Con pocas operaciones el texto lo dice honestamente ("aún poca historia para concluir").
- En el timeline de Movimientos del detalle: mostrar el score con el que se hizo cada compra ("Compra · 5 acc. · score 78").

**Implementación.** Migración: `conviction_score`, `conviction_tier`, `had_entry_trigger` en `stock_purchases` (nullable — compras viejas quedan sin dato). `TransactionModal` calcula la lectura del momento (mismo `computeConviction`/`isActionableBuyNow` que el resto de la app, con el análisis ya cargado) al registrar una compra nueva o "comprar más". El timeline de Movimientos de `TechnicalDetail` muestra el score junto a cada compra que lo tenga. `PerformanceSection` agrega "Score de entrada vs. resultado": cruza ventas cerradas con el score promedio de las compras de ese ticker (aproximado, la contabilidad es a costo promedio ponderado, no por lote) y compara el % de retorno entre compras con score ≥70 vs. <55.

## D6 — SOXL se analiza como si fuera una acción normal (impacto medio, esfuerzo bajo) ✅

**Problema.** SOXL es un ETF 3× apalancado con decay estructural: mantenerlo semanas en mercado lateral pierde plata aunque el índice termine plano, y su volatilidad hace que la alarma de salida por ATR quede absurdamente lejos. El motor lo trata como cualquier ticker: mismos umbrales, misma regla del 1% (que con 3× de apalancamiento implícito es en realidad ~3% de riesgo económico).

**Propuesta.**
- Lista corta de ETFs apalancados conocidos (SOXL, TQQQ, UPRO, SQQQ, etc.) o detección por nombre ("3X", "Ultra", "Daily … Bull/Bear") — sin API nueva.
- Para estos tickers: advertencia fija en el detalle ("apalancado 3×: pensado para días/semanas, no para mantener meses — pierde valor en lateral"), sizing sugerido dividido por el factor de apalancamiento, y una razón en el score cuando lleva >N semanas en cartera.

**Implementación.** `lib/leveraged-etfs.ts`: `detectLeverage(ticker, name?)` — lista corta de tickers conocidos (SOXL, TQQQ, UPRO, etc.) + respaldo por nombre ("...Bull 3X Shares"). Banner de advertencia en `TechnicalDetail` cuando se detecta. El monto sugerido se divide por el factor de apalancamiento en los tres lugares que lo calculan: `TechnicalDetail` (tramo de compra), `Radar` (`suggestedUsdFor` y el botón del panel "¿Qué comprar hoy?") y `TransactionModal` (hint "Sugerido máx" del formulario). No se implementó la razón por "semanas en cartera" (requeriría trackear duración de tenencia por separado; el aviso fijo ya cubre el caso principal).

---

## Orden sugerido

1. **D1** — el 20% del score que nunca llegó a producción; mejora directa del número con el que se decide todo lo demás.
2. **D2** — el riesgo real más grande del portafolio actual (concentración semiconductores + apalancado) que hoy es invisible.
3. **D3** — barato (API ya integrada) y evita la peor compra posible: la víspera de earnings sin saberlo.
4. **D4** — casi gratis (SPY ya analizado) y endurece el gatillo justo cuando más falla.
5. **D5** — habilita el ciclo de aprendizaje; mientras antes empiece a guardarse, más historia habrá.
6. **D6** — puntual pero importante mientras SOXL esté en cartera.

Reglas transversales: ninguna de estas mejoras auto-ejecuta nada — ajustan el score, el monto sugerido y las advertencias, y el usuario siempre confirma en el modal. Todo cambio de reglas en `lib/technical.ts`/`lib/conviction.ts` mantiene o actualiza conscientemente sus tests. El descargo honesto de siempre: señales que fallan seguido, decisión siempre del usuario.
