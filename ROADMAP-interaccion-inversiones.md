# Roadmap de interacción · Inversiones → Acciones

Diagnóstico (jul 2026, post-U4): la información ya está bien organizada — decisión arriba (TodayQueue), una sola lista (Radar), detalle decision-first (TechnicalDetail), modal solo transaccional. El problema que queda es de **interacción**: la app te dice qué hacer pero no te deja HACERLO en el mismo gesto, no confirma lo que hiciste, tarda en cargar sin decir cuánto falta, y usa un lenguaje visual (score, rail) que nunca se explica. Ordenado por impacto.

**Estado: ✅ implementado por completo (jul 2026).** Los seis ítems (I1-I6) están en producción sobre Radar.tsx, TechnicalDetail.tsx, TransactionModal.tsx, RiskRail.tsx y TodayQueue.tsx. Detalle de cada uno abajo.

---

## I1 — Del veredicto a la acción en un toque (impacto alto, esfuerzo medio) ✅

**Problema.** La app dice "Compra hasta US$450 de NVDA" en TRES lugares (TodayQueue, "¿Qué comprar hoy?", cabecera del detalle) y en ninguno se puede actuar directamente:
- Las filas de TodayQueue no son clickeables — ni siquiera abren el detalle del ticker (es Server Component puro).
- El panel "¿Qué comprar hoy?" nombra al top pick y al resto del ranking, pero ningún ticker es un link.
- Al abrir el modal de compra, llega VACÍO: hay que re-tipear a mano el monto que la propia app acaba de sugerir, y calcular las acciones con el precio en vivo.

**Propuesta.**
- TodayQueue: cada fila clickeable — la decisión de compra abre el detalle del ticker (o directamente el modal de compra pre-llenado); las señales de venta/toma de ganancias abren el detalle del ticker con la sección Plan activa. Requiere pasar un callback desde un client wrapper o mover la navegación a query param (`?ticker=NVDA`) que Radar lea al montar.
- "¿Qué comprar hoy?": ticker del top pick y del ranking → click abre su detalle. El bloque "Compra hasta US$X ahora" → botón que abre TransactionModal pre-llenado.
- **Pre-llenado del modal**: nuevo prop opcional `prefill?: { totalUsd?: number }` en TransactionModal. Al abrir desde una sugerencia, `totalPaid` llega con el monto sugerido y `shares` se calcula con el precio en vivo (editable, por si el precio de ejecución difiere). Elimina el paso mecánico entre decidir y registrar.

## I2 — Confirmación y undo: la app nunca dice "listo" (impacto alto, esfuerzo bajo) ✅

**Problema.** Después de registrar una compra, una venta o seguir un ticker, el modal simplemente se cierra. No hay confirmación de qué se guardó ni de sus consecuencias ("la venta devolvió US$X a tu billetera"). Y "Dejar de seguir" borra al instante sin confirmación ni vuelta atrás — un mis-tap en mobile pierde el ticker y su precio objetivo.

**Propuesta.**
- Toast de confirmación tras cada transacción, con el dato que importa: "Compra registrada: 5 acc. de NVDA por US$1.020" / "Venta registrada: +US$230 de ganancia, US$1.250 volvieron a tu billetera" / "Objetivo guardado: te avisamos si AAPL baja a US$310". La app ya tiene patrón de toasts en otras secciones (commit a479026) — reutilizarlo.
- "Dejar de seguir": toast con botón **Deshacer** (5 s) que re-inserta la fila de watchlist con su target intacto, en vez de borrar sin red de seguridad.

**Implementación.** `useToast()` en Radar.tsx y TransactionModal.tsx. `removeTicker()` reescrito: quita la fila del estado local al instante, difiere el DELETE real 5 s, y lo cancela si el usuario toca "Deshacer" (re-inserta el item si no está ya). Toasts de confirmación al final de `savePosition`, `deletePosition`, `sellPosition`, `buyMorePosition` y al guardar un precio objetivo — cada uno con el dato que importa (acciones, monto, ganancia, plata que volvió a la billetera).

## I3 — Carga con progreso: los primeros 10 segundos (impacto medio, esfuerzo bajo) ✅

**Problema.** Al entrar, Radar precarga el análisis de todos los tickers en secuencia con 400 ms de pausa (rate limit del proveedor): con 22 tickers son ~9-15 s en frío. Mientras tanto "¿Qué comprar hoy?" muestra solo un spinner ("Comparando tus 22 tickers…" sin progreso), los chips de convicción van apareciendo de a uno sin orden aparente, y la lista se RE-ORDENA sola a medida que llegan análisis (las filas saltan bajo el dedo).

**Propuesta.**
- Priorizar la cola de precarga: primero posiciones (riesgo real), luego favoritos por orden de la lista. SPY ya se pide aparte.
- Progreso visible: "Comparando… 14/22" en el panel de ranking.
- Congelar el orden de la lista durante la precarga inicial (ordenar solo cuando `allLoaded`, o con un botón "ordenar por convicción" que aparece al terminar) — que las filas no salten mientras el usuario ya está leyendo.
- Chips en estado skeleton (`animate-pulse`) mientras su análisis no llega, en vez de simplemente no estar.

**Implementación.** `rows` se calcula sin re-ordenar hasta que `allLoaded` es true (`allLoaded ? sorted : tabTickers`), eliminando el salto de filas bajo el dedo. Contador `loadedCount`/`N` y barra de progreso en el panel de ranking mientras carga. `ConvictionChip` muestra un `<span className="animate-pulse">` de reemplazo hasta que su análisis llega.

## I4 — El lenguaje visual nunca se explica (impacto medio, esfuerzo bajo) ✅

**Problema.** El chip "78", la barra roja/verde (RiskRail), y "2 a favor · 1 en contra" no tienen explicación en ninguna parte de la UI. El title-tooltip del rail (agregado jul 2026) no existe en mobile, donde no hay hover. Cas misma no lograba leer el rail — un usuario nuevo menos.

**Propuesta.**
- Tap en el ConvictionChip → popover breve: "78/100 · convicción de compra: técnico + riesgo/recompensa + fuerza vs. el mercado. Sobre 70 = compra clara". Un solo componente, reuso en Radar y detalle.
- Tap en el RiskRail → mismo patrón: "Rojo: lo que cae hasta tu salida (−2.1%) · Verde: aire hasta el próximo techo (+9.4%) · el punto es hoy".
- Leyenda de una sola vez sobre la lista ("● número = convicción de compra · barra = riesgo hasta tu salida"), descartable, recordado en localStorage — mismo patrón que `watchlistOpen`.

**Implementación.** `RiskRail` y `ConvictionChip` (RiskRail.tsx) son ahora `<button>` con `showToast()` explicando el número/barra al tocar, en gauge simple, rail de dos puntas y modo compacto — y el modo compacto, que antes no llevaba ninguna etiqueta (la causa concreta del "no entiendo esa barra"), ahora siempre muestra `−X%` junto a la barra. Leyenda descartable sobre la lista de Radar, recordada en `localStorage` (`radarLegendDismissed`).

## I5 — Precios que envejecen en silencio (impacto medio, esfuerzo bajo) ✅

**Problema.** Las quotes se piden UNA vez al montar. Si dejas la pestaña abierta durante el mercado (el caso real de uso: mirar cómo va), los precios quedan viejos sin ningún indicio — el pill dice "Precios en vivo" aunque la última quote sea de hace 40 minutos. No hay botón de refresco.

**Propuesta.**
- Auto-refresh de quotes cada 60-90 s SOLO con mercado abierto y pestaña visible (`document.visibilityState` + `marketOpen`), silencioso.
- Botón de refresco manual en el pill de estado (icono RefreshCw, gira mientras carga) para quien quiere el precio de ESTE segundo antes de ejecutar.
- El pill vuelve a mostrar la hora de la última quote ("en vivo · 14:32") — sin el contador por segundo que se eliminó en U6, solo la hora.

**Implementación.** `useEffect` en Radar.tsx que llama `fetchQuotes(allTickers)` cada 75 s cuando `marketOpen && document.visibilityState === 'visible'`. Pill de estado con hora de última quote (`toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', ... })`) y botón de refresco manual con ícono `RefreshCw` que gira mientras carga.

## I6 — Cerrar el ciclo al agregar (impacto bajo, esfuerzo bajo) ✅

**Problema.** Al seguir un ticker desde el buscador, el popup queda abierto y la fila nueva aparece al fondo de la lista sin señal — no pasa nada visible. Al registrar la compra de un ticker que no seguías, no se ofrece seguirlo (y sin watchlist no entra al correo diario ni a daily_decisions).

**Propuesta.**
- Tras "Seguir" desde el buscador: cerrar el popup y abrir el detalle del ticker recién agregado — el usuario lo agregó porque quiere VERLO.
- Tras registrar compra de un ticker sin watchlist: toast con acción "Seguir NVDA para recibir sus señales diarias" (un tap, ya tenemos addSymbol).
- Tras definir un precio objetivo: mostrar la distancia actual al objetivo en el mismo momento ("a 4.2% de tu precio"), que hoy solo aparece al reabrir.

**Implementación.** `addSymbol()` cierra el buscador y abre el detalle del ticker recién seguido. `TransactionModal`'s `onDone`: si la compra crea una posición nueva (`mode === 'new'`) para un ticker que no estaba en watchlist, ofrece un toast "Seguir {ticker} para recibir sus señales diarias" con acción de un tap. El input de precio objetivo muestra la distancia en vivo ("a X%") junto al campo mientras se escribe.

---

## Orden sugerido

1. **I2** — toasts + undo; poco código (patrón ya existe), elimina la sensación de "¿se guardó?" en operaciones con plata real.
2. **I1** — del veredicto a la acción; es la promesa central de la app ("te digo qué comprar") completada de punta a punta.
3. **I4** — explicar chip y rail; sin esto el lenguaje visual de U2 solo le habla a quien lo programó.
4. **I3** — progreso de carga y lista estable; pulido del primer minuto de cada sesión.
5. **I5** — quotes frescas; importa sobre todo si I1 pre-llena montos con el precio en vivo.
6. **I6** — cierres de ciclo menores.

Reglas transversales: mantener toda transacción con confirmación explícita (nunca auto-ejecutar una compra/venta por un tap en una sugerencia — el modal SIEMPRE se muestra pre-llenado, el usuario confirma), `.card` para tarjetas, mobile-first a 375px, y el descargo honesto de siempre.
