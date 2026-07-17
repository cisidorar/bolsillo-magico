# Roadmap · Inversiones en acciones

Objetivo: mejorar la calidad de las decisiones de compra/venta y el resultado de largo plazo. Ordenado por impacto esperado — no por facilidad. La evidencia es consistente en que **cuánto arriesgas por posición y cómo cortas pérdidas pesa más en el resultado final que cualquier indicador adicional**; por eso la gestión de riesgo va primero y los indicadores nuevos van al final.

Nada de esto garantiza ganar más: son reglas automáticas sobre datos públicos, no asesoría financiera.

---

## Fase 1 — Gestión de riesgo por posición ✅ (implementada jul 2026)

La capa de mayor impacto: dimensionar bien las posiciones y proteger ganancias.

**1.1 ATR(14) en el motor** ✅
`lib/technical.ts` ahora calcula el rango real promedio (`atr14`, `atrPct`). Es la medida de cuánto se mueve cada acción en un día normal — la base para stops que respetan la volatilidad propia del ticker en vez de un % fijo igual para todas.

**1.2 Salida chandelier** ✅
La alarma de salida (`alarm`) ahora es lo más alto entre el nivel estructural (piso probado / SMA50) y el chandelier (máximo de ~22 ruedas − 3×ATR). Tras un estirón fuerte, el chandelier protege la ganancia mucho antes de que el precio caiga hasta un piso viejo. Solo afecta salidas; las entradas siguen usando pisos con historia.

**1.3 Trailing stop persistido que solo sube** ✅
Migración `20260720_trail_stop.sql`: columna `trail_stop_usd` en `stock_positions`. El cron diario guarda `max(guardado, alarm del día)` — nunca baja mientras la posición viva (ratchet). Se resetea al comprar más. La UI usa la alarma efectiva `max(alarm del día, trail)` y avisa cuando el trail quedó por sobre el nivel del día.

**1.4 Position sizing por regla del 1%** ✅
`positionSizeUsd()`: monto máximo = (1% del portafolio) / distancia al stop. Visible como sugerencia al crear posición y al comprar más (contando lo que ya tienes). No bloquea — informa. Stop cercano permite posición grande; stop lejano la achica solo.

---

## Fase 2 — Feedback loop: saber qué funciona (2.1 y 2.2 ✅ jul 2026)

Sin medición no hay afinamiento posible. Hoy `daily_signals` y `stock_sales` guardan todo lo necesario, pero nadie lo evalúa.

**2.1 Métricas de calidad sobre ventas cerradas** ✅
Card "Rendimiento de tus ventas" en Inversiones → Billetera: win rate, relación ganancia/pérdida promedio, realizado total, mejor/peor operación. Con menos de 10 ventas muestra un aviso de que la muestra es chica para sacar conclusiones.

**2.2 Benchmark: ¿le ganas a SPY?** ✅
Card "¿Le ganaste al mercado?" en la misma vista. Simula una posición sombra en SPY con el mismo flujo de caja real (cada compra de acciones "compra" SPY ese día por el mismo monto, cada venta "vende" SPY ese día) y compara el valor de hoy — ambos con el último cierre conocido, sin depender de precio en vivo. `lib/benchmark.ts` (función pura, testeada) + cómputo server-side en `page.tsx` (lee `price_history` directo). El cron ahora sincroniza `SPY` siempre, la sigas o no.

**2.3 Evaluación de señales a posteriori** ✅
Sección "¿Le funcionó esta señal antes?" en el detalle de cada ticker (Favoritos), on-demand igual que Noticias. `lib/signal-backtest.ts` recorre el último año día por día, corriendo `analyze()` solo con datos hasta ese día (sin mirar el futuro) para detectar cuándo el rating CAMBIÓ a compra/compra_fuerte/venta/venta_fuerte — no cuenta el mismo estado repetido cada día. Por cada tipo de señal muestra cuántas veces ocurrió, cuánto acertó a 1 mes y el retorno promedio a 1 y 3 meses. Con menos de ~5 repeticiones el propio número invita a no sacar conclusiones. Endpoint `/api/signal-backtest`, no dispara sync (usa lo que ya haya en `price_history`).

---

## Fase 3 — Contexto que el motor hoy ignora (~1 sesión)

**3.1 Régimen de mercado (SPY como semáforo)**
Analizar SPY en el mismo cron y persistir su estado (sobre/bajo SMA200, pendiente). Con mercado bajista: degradar `compra_fuerte`→`compra`→`neutral` y decirlo en el veredicto ("el mercado completo está en tendencia bajista — las compras individuales tienen el viento en contra"). Barato y con soporte empírico fuerte: la mayoría de las acciones sigue al índice.

**3.2 Aviso de earnings próximos**
Finnhub (ya integrado como proveedor) expone calendario de resultados. Si hay earnings a ≤7 días: aviso en la ficha y en el plan de compra ("resultados el X — comprar antes es moneda al aire; espera el número"). Evita la peor versión de mala suerte: comprar con señal técnica perfecta dos días antes de un guidance malo.

**3.3 Fuerza relativa vs SPY**
Retorno 6m del ticker − retorno 6m de SPY. Negativa = la acción va peor que el mercado; una "compra" ahí es de menor calidad. Mostrar como chip y restar 1 punto al score cuando sea claramente negativa (<−10pp).

---

## Fase 4 — Riesgo de portafolio (~media sesión)

**4.1 Concentración por posición**
Aviso cuando una posición supera ~25-30% del valor total del portafolio. El sizing del 1% previene esto hacia adelante; el aviso cubre lo que ya está concentrado.

**4.2 Concentración por sector**
Finnhub entrega industria por ticker. Cinco posiciones que son todas semiconductores no son cinco apuestas: son una. Aviso cuando un sector pasa de ~50%.

---

## Fase 5 — Recomendación explícita: de avisos a decisiones (iteración jul 2026)

Hoy cada ticker se analiza aislado y el resultado se comunica como lectura ("Compra", "señales", "avisos") con lenguaje de tercero ("muchos suelen comprar ahí"). Esta fase convierte eso en decisiones directas y comparadas. El orden es dependencia real: 5.1 alimenta a todas las demás.

**5.1 Score de convicción 0-100 por ticker** ✅
`lib/conviction.ts` → `computeConviction()`: junta el score técnico del rating (40%), riesgo/recompensa — distancia a la alarma de salida vs. distancia al próximo techo (25%), track record de esa señal en ese ticker vía el backtest de 2.3 (20%, con castigo explícito si hay pocas repeticiones), y fuerza relativa 6m vs SPY (15%). Componentes sin datos se excluyen y su peso se reparte entre el resto — nunca se rellena con un 50 inventado. Devuelve `score`, `tier` (compra_fuerte/compra/neutral/evitar/venta) y `reasons[]` en lenguaje directo. Testeado (7 casos).

**5.2 Panel "¿Qué comprar hoy?" — el veredicto comparado** ✅
Card fija arriba de Favoritos (Inversiones → Acciones). Ordena todos los favoritos con análisis cargado por convicción y lo dice sin rodeos: "La mejor compra hoy es NVDA (78) — mejor que MU (62)", con las 3 razones principales listadas. Si el mejor candidato no llega a nivel de compra: "Hoy no compres nada de tu lista" — con la misma fuerza que un "sí". Muestra también el resto del ranking (siguientes 3).

**5.3 Órdenes concretas con monto (no solo porcentajes)** ✅
El panel muestra "Compra hasta US$450 de NVDA ahora" para el mejor candidato, usando `positionSizeUsd` (regla del 1%) topado al efectivo real de la billetera. En el detalle de cada ticker (Favoritos) y en el plan de salida de posiciones (Acciones), cada tramo "ahora" pasó de "40%" a "Vende US$820 (40% de la posición)" / "Compra US$450 (30%)".

**5.4 Digest que abre con la decisión** ✅
Nueva tabla `daily_decisions` (una fila por usuario por día). El cron `sync-prices` corre `computeDailyDecisions()` después de calcular las señales — mismo ranking de convicción del panel 5.2, reutilizando los `analyze()` ya calculados por ticker (cero trabajo extra) — y guarda el veredicto: mejor ticker + monto sugerido (regla del 1%, topado al efectivo real vía `usd_purchases`), o `ticker=null` si nadie califica. La Edge Function `notify-watchlist-digest` lee esa fila y abre el correo con una tarjeta verde "La compra de hoy: NVDA (78/100) — Compra hasta US$450 ahora" o, si no hay caso, una banda con "Hoy no compres nada de tu lista" — antes de la lista de señales, no como parte de ella.

**5.5 Lenguaje imperativo en el resto del copy** ✅
`lib/technical.ts`: `entryPlan` y `sellPlan` reescritos de tercera persona ("muchos prefieren esperar ese retroceso") a imperativo directo ("No compres", "Compra", "Vende", "Espera"). Señales clave (near_support, near_resistance, overextended, watch_rsi_high) también. Test nuevo que congela el tono: `entryPlan` bajista debe empezar con "No compres" y `sellPlan` con "Vende". El descargo honesto al pie se mantiene intacto — sigue diciendo que estas señales fallan seguido y que la decisión es del usuario.

## Explícitamente descartado (por ahora)

- **Más indicadores** (Bollinger, estocástico, Fibonacci…): el motor ya cubre tendencia, momentum, volumen, niveles y divergencias. Indicadores extra correlacionan entre sí y agregan ruido, no señal.
- **IA para redactar señales**: el conjunto de señales es finito; las plantillas deterministas no alucinan y no cuestan.
- **Datos intradía / day trading**: el diseño completo es para decisión ~semanal. Cambiar la cadencia cambiaría el producto.

## Orden sugerido

Fase 2 antes que Fase 3: medir lo que ya haces vale más que agregar contexto nuevo. Dentro de la 2, empezar por 2.1 (esfuerzo mínimo, datos listos). La Fase 4 puede colarse en cualquier momento — es chica.
