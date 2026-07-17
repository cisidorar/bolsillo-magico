# Roadmap UX/UI · Inversiones → Acciones

Diagnóstico (jul 2026): el motor ya decide — score de convicción, planes con montos, trailing stops — pero la página sigue organizada como un **reporte de portafolio** (primero cuánto tienes, después qué hacer). Para una app cuyo valor es decir explícitamente qué comprar y cuándo salir, la jerarquía está invertida. Además hay dos patrones de detalle para el mismo concepto, riesgo ilegible a nivel de fila, y métricas de rendimiento viviendo en la pestaña equivocada.

Ordenado por impacto. U1–U3 son independientes entre sí; U4 es el refactor grande y conviene hacerlo después de validar U1–U3 en uso real.

---

## U1 — "Hoy manda": la decisión arriba de todo ✅ (implementado jul 2026)

**Problema.** "¿Qué comprar hoy?" — la síntesis de todo el motor — renderiza al final de la página, dentro del panel de favoritos, DESPUÉS del hero, los KPIs y la tabla completa. En mobile hay que scrollear todo el portafolio para llegar a la única card que dice qué hacer. Y las acciones del día están regadas: chip "Vender" en filas, "Cerca de alarma" compite con "Mejor retorno" por un slot de KPI, targets alcanzados solo en favoritos, la compra del día al fondo.

**Propuesta.**
- Nueva sección **"Hoy"** como PRIMER bloque de la página: una sola card con la cola de acciones del día, cada una con verbo y monto — "Compra hasta US$450 de NVDA (78/100)", "Vender: INTC", "Toma de ganancias: MU", "Precio objetivo: AAPL". Sin card si no hay nada que decir todavía (cuenta nueva sin historia).
- **Hecho:** `components/TodayQueue.tsx` (Server Component) lee `daily_decisions` (veredicto de compra del día) + `daily_signals` filtrado a `kind in (sell, caution, target)` — la MISMA fuente que llena el correo diario. Sin recálculo client-side, sin desalineación posible con el cierre analizado. `page.tsx` consulta ambas tablas server-side con la fecha de hoy en zona Chile y renderiza `TodayQueue` antes de `StockPositionManager`.
- El KPI "Cerca de alarma/Mejor retorno" del hero se simplificó de vuelta a "Mejor retorno" simple — ese contenido ahora vive en "Hoy", repetirlo era doble información.

## U2 — Riesgo visible por fila: el risk rail ✅ (implementado jul 2026)

**Problema.** La distancia a la salida — el dato que decide si duermes tranquila — está en texto de 9px bajo el precio ("alarma US$92 · a 1.2%"). El retorno (dato pasivo) tiene jerarquía visual dominante; el riesgo (dato accionable) casi no se ve.

**Propuesta.**
- **Risk rail** por posición: mini barra horizontal `stop ←—●—→ techo` con el precio actual como punto; verde cuando hay aire, ámbar a <4% del stop, rojo bajo el stop. Legible de un vistazo en desktop y mobile, sin leer números.
- En favoritos, reemplazar la mezcla de chips (rating label, action flags) por el **score de convicción como chip numérico** (78) coloreado por tier — el mismo número del panel "Hoy" y del correo. Un solo lenguaje: número = convicción, rail = riesgo.
- **Hecho:** `components/RiskRail.tsx` — `RiskRail` (con o sin techo conocido, cae a gauge simple de distancia si no hay resistencia) y `ConvictionChip` (número + color por tier). Integrado en las filas desktop/mobile de `StockPositionManager` (reemplaza el texto de 9px "alarma US$92 · a 1.2%") y en las filas de `WatchlistPanel` (el chip de texto "Compra"/"Venta"/"Neutral" se reemplaza por el número de convicción; se agrega el rail compacto cuando el ticker está en cartera).

## U3 — Detalle decision-first ✅ (implementado jul 2026)

**Problema.** `TechnicalDetail` apilaba ~12 bloques (veredicto, posición, plan compra, noticias, gráfico, tendencia, RSI, rango, niveles, señales, radar, backtest, disclaimer) en un solo scroll. En mobile eran varias pantallas; la acción concreta competía con el contexto educativo. El score de convicción — que ordena el ranking — ni siquiera aparecía en el detalle.

**Hecho.**
- Cabecera fija del detalle: **`ConvictionChip` (score 0-100) + acción con monto** ("Compra US$450 ahora" / "Vende US$X ahora" / "No comprar hoy") calculada con `computeConviction` (mismo criterio que el ranking de favoritos) + el porqué en 2 líneas (`verdict` + primera `reason`). Eso es lo primero que se ve al abrir; todo lo demás es profundización.
- Resto reorganizado en 4 secciones tipo tab (una a la vez, "Plan" abierta por defecto): **"Plan"** (posición + salida por tramos, compra por tramos), **"Gráfico y niveles"** (gráfico 12m, tendencia, rendimiento, RSI, rango 52 sem., soportes/resistencias), **"Señales y radar"** (señales activas + radar de "cerca de pasar"), **"Historial"** (noticias y backtest on-demand, que ya vivían así). El guard intradía y la cabecera son siempre visibles, contextuales a cualquier sección.
- Un solo disclaimer al pie (ya existía) — se recortó el micro-descargo duplicado del bloque de noticias que repetía "no es recomendación".

## U4 — Un solo mundo: fusionar posiciones y favoritos ✅ (implementado jul 2026)

**Problema.** El mismo ticker podía ser posición y favorito: dos listas, dos patrones de detalle distintos (modal transaccional vs detalle técnico expandido), dos fetch paths, y el usuario debía saber en cuál lista buscar qué. La tabla de posiciones no mostraba convicción; los favoritos no mostraban tu posición sin abrir el detalle.

**Hecho.**
- `components/Radar.tsx` reemplaza `StockPositionManager.tsx` + `WatchlistPanel.tsx`: una sola lista con filtro **Tengo / Sigo / Todo**. Cada fila: logo, ticker, `ConvictionChip`, `RiskRail` compacto (si hay posición), retorno $ y % (si hay posición). Orden por defecto: accionables primero (target alcanzado, venta, cerca de objetivo), luego por score de convicción — mismo criterio reparado en el fix de convicción de fila (commit `18cee34`).
- `components/TechnicalDetail.tsx` (extraído de `WatchlistPanel`, el de U3) es ahora el único detalle, para cualquier ticker tenga o no posición. El bloque "Tu posición · plan de salida" ahora incluye también el timeline de **Movimientos** (compras/ventas históricas) que antes solo vivía en el modal transaccional, y botones "Comprar más" / "Vender" que abren el modal.
- `components/TransactionModal.tsx` (extraído de `StockPositionManager`) queda SOLO para transacciones: nueva posición, comprar más, vender, editar, eliminar — se invoca desde el detalle, ya no es la puerta de entrada a la información. Toda la lógica de dinero (tope de billetera, costo promedio ponderado, venta parcial, reset de `trail_stop_usd`, inserts en `stock_purchases`/`stock_sales`/`usd_purchases`) se preservó funcionalmente idéntica.
- Un solo fetch de análisis técnico por ticker (`analyses` en `Radar`) — se eliminó el doble estado `posAnalyses`/`analyses` que existía entre los dos componentes viejos.
- `app/(dashboard)/inversiones/page.tsx` ahora renderiza `TodayQueue` → `Radar` → `PerformanceSection`, sin cambios en las otras pestañas (Ahorro, Depósitos, Billetera).

## U5 — El rendimiento en su casa ✅ (implementado jul 2026)

**Problema.** "¿Le ganaste al mercado?" (benchmark SPY) y "Rendimiento de tus ventas" (win rate, G/P) vivían en la pestaña **Billetera** — pero son métricas de decisiones de acciones, no de la billetera. Nadie las iba a buscar ahí. Mientras tanto el hero de Acciones tenía 4 sub-KPIs (Invertido, G. abierta, Realizada, Retorno) que obligaban a sumar mentalmente abierta + realizada.

**Hecho.**
- Nuevo `components/PerformanceSection.tsx` con ambas cards, extraídas tal cual de `UsdWalletManager`. Se renderiza en Acciones (`page.tsx`), justo después de `StockPositionManager` — el lugar natural del feedback loop, después de ver el detalle.
- Hero simplificado: las columnas "G. abierta" y "Realizada" se unieron en **"Retorno total"** ($ = abierta + realizada), más "Retorno %" y una nueva columna **"vs SPY"** — el número más honesto del portafolio, antes enterrado en otra pestaña.
- Billetera (`UsdWalletManager`) volvió a ser solo billetera: saldo, cartola, tasa promedio. Se le quitaron `salesStats` y el prop `spyBenchmark` (ya no los usa).

## U6 — Una sola señal de frescura (impacto bajo, esfuerzo bajo)

**Problema.** Cuatro indicadores de frescura/salud en distintas esquinas: dot de mercado abierto arriba, "cierre · hace Xs" en la tabla, "Análisis automático: hoy 18:03" en favoritos, "asOf" + guard intradía dentro de cada detalle.

**Propuesta.** Un solo pill de estado en el top bar: "● En vivo · análisis del cierre jue 16" (o "⚠ análisis atrasado — revisa el cron"). Los guards intradía por ticker se mantienen (son contextuales); el resto se consolida.

---

## Orden sugerido

1. **U1** — reordena la página alrededor de la decisión; es el cambio que más se siente y no rompe nada.
2. **U2** — risk rail + chip de convicción; poco código, mucha legibilidad.
3. **U5** — mover 2 cards de pestaña; trivial y corrige una rareza de arquitectura.
4. **U3** — reestructurar el detalle; medio día de trabajo cuidadoso.
5. **U6** — limpieza chica, cabe en cualquier momento.
6. **U4** — el refactor grande; hacerlo al final, con U1–U3 ya validadas en uso, porque define la estructura definitiva de la página.

Reglas transversales: mantener `.card` para toda tarjeta, colores de categoría/estado desde las variables CSS existentes, mobile-first a 375px, y el descargo honesto — la UI puede ser más decidida sin prometer certeza.
