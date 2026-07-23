# Roadmap de vista y usabilidad · Inversiones → Acciones

Diagnóstico (jul 2026, post-roadmaps UX/interacción/decisión): el contenido ya es correcto y accionable — el problema que queda es de DISPOSICIÓN. La página creció por acumulación (Hoy + hero + KPIs + panel + tabs + leyenda + lista + rendimiento, todo apilado en una columna) y hoy hay que scrollear mucho para llegar a lo que se usa a diario, hay DOS tarjetas de decisión que pueden contradecirse entre sí, y en desktop se desperdicia toda la pantalla ancha. Ordenado por prioridad.

**Estado: V1-V6 implementados (jul 2026).** `npx tsc --noEmit` y `npx vitest run` (128/128) verdes tras cada bloque.

---

## V1 — Dos tarjetas de decisión que pueden contradecirse (impacto alto, esfuerzo medio) ✅

**Problema.** Arriba de la página conviven DOS bloques que responden la misma pregunta con fuentes distintas: "Hoy" (TodayQueue, server-side, lee `daily_decisions` — la decisión calculada ANOCHE por el cron, la misma del correo) y "¿Qué comprar hoy?" (Radar, client-side, recalcula en vivo con las quotes del momento). El 95% de los días dicen lo mismo dos veces (redundancia); el 5% restante —cuando el precio se movió desde el cierre— se CONTRADICEN, que es exactamente la clase de inconsistencia que ya se arregló dos veces dentro del propio panel (AMD, INTC/TSM). Además ninguno de los dos le dice al usuario cuál manda.

**Propuesta.**
- UNA sola tarjeta de decisión: fusionar TodayQueue dentro del panel de Radar. La decisión del cierre (cron/correo) es el punto de partida visible ("Anoche el análisis dijo: compra NVDA"); si el recálculo en vivo difiere, la tarjeta lo dice explícitamente ("con el precio de ahora ya no hay entrada — el retroceso se pasó") en vez de mostrar dos verdades en paralelo.
- Las señales de venta/toma de ganancias/precio objetivo de TodayQueue se conservan como filas de la misma tarjeta (siguen siendo lo accionable del día).
- TodayQueue como componente server puede seguir existiendo para el primer paint (sin JS todavía), pero visualmente integrado — no como card aparte con su propio título.

**Implementado:** `TodayQueue.tsx` ya no se renderiza en `page.tsx` — su `decision`/`signals` se pasan como props a `Radar`, que los fusiona en el panel "¿Qué comprar hoy?". Cuando el recálculo en vivo coincide con lo de anoche, no se repite nada; cuando difiere, una nota explícita lo dice ("Anoche el análisis dijo... Con el precio de ahora..."). Las señales de venta/toma de ganancias/precio objetivo quedaron como filas dentro de la misma tarjeta.

## V2 — Desktop desperdicia la pantalla: todo en una columna (impacto alto, esfuerzo medio) ✅

**Problema.** En 1280px+ la página sigue siendo la MISMA columna vertical del móvil estirada: decisión, hero, KPIs, panel, tabs, lista, rendimiento — uno abajo del otro. Para mirar la lista Y la decisión hay que scrollear ida y vuelta. El único uso del ancho es el hero+KPIs en fila.

**Propuesta.**
- Layout de dos columnas en `lg+` (patrón ya usado en la app: `lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start`, o asimétrico con `gridTemplateColumns`): columna principal (izquierda, ~60%) = tabs + lista + detalle; columna secundaria (derecha, ~40%, `sticky top-*`) = tarjeta de decisión unificada (V1) + hero compacto + rendimiento.
- En mobile no cambia nada: el orden vertical actual se mantiene (la decisión primero).
- El detalle del ticker en desktop puede ocupar la columna derecha en vez de abrir modal (el modal queda para mobile) — decidir en implementación según complejidad; si es caro, mantener el modal y solo hacer el split de columnas.

**Implementado:** grid `lg:grid-cols-[1fr_380px]` — columna izquierda (tabs+lista), columna derecha `lg:sticky` (decisión+hero+KPIs). El detalle se mantuvo como modal en todos los tamaños (el split de columnas ya daba la mejora principal sin el costo de un detalle inline). Mobile no cambió: mismo orden de siempre.

## V3 — La lista no se puede ordenar ni escanear a gusto (impacto medio, esfuerzo bajo) ✅

**Problema.** El orden es fijo (accionables primero, luego por convicción). Para responder preguntas cotidianas — "¿cuál cayó más hoy?", "¿cuál es mi mayor posición?", "¿cuál va peor contra mi costo?" — hay que leer fila por fila. Y las filas mezclan densidades: en desktop sobra espacio horizontal mientras el % del día quedó en una segunda línea chica de 9px.

**Propuesta.**
- Selector de orden sobre la lista (convicción · % hoy · retorno total · valor de posición), recordado en `localStorage` — mismo patrón que `radarLegendDismissed`. El orden por defecto sigue siendo el actual.
- En `lg+`, filas con columnas alineadas (precio · % hoy · retorno $ y % · convicción) en vez de todo apilado a la derecha — más tabla, menos card, sin cambiar el mobile.
- El monto de posición (valor actual en USD) visible en la fila para posiciones — hoy solo se ve el retorno, no cuánto hay adentro.

**Implementado:** selector `<select>` (convicción/% hoy/retorno total/valor) sobre la lista, recordado en `localStorage` (`radarSortMode`). Columna de valor (`shares × precio`) visible en `lg+` para posiciones.

## V4 — El primer scroll del móvil está ocupado por resúmenes (impacto medio, esfuerzo medio) ✅

**Problema.** En 375px, antes de llegar a la PRIMERA fila de la lista hay: header de página, top bar, tarjeta "Hoy", hero (valor + 4 sub-KPIs), 3 cards (Billetera/Posiciones/Mejor retorno), panel "¿Qué comprar hoy?", línea de frescura, tabs y leyenda. Son ~3 pantallas de resumen para una app que se abre a diario a mirar "cómo van mis acciones".

**Propuesta.**
- Hero compacto colapsado por defecto en mobile: valor del portafolio + retorno de hoy + retorno total en UNA fila; los KPIs secundarios (Invertido, vs SPY, Billetera, Mejor retorno) se expanden con un tap (chevron), recordado en `localStorage`.
- Tabs Tengo/Sigo/Todo sticky al scrollear (top-0 con fondo), para cambiar de vista sin volver arriba.
- La línea "Análisis técnico al cierre del X" se integra al pill del top bar (ya muestra hora de quotes y estado del análisis — es el mismo tema, tres textos separados hoy).

**Implementado:** hero colapsado por defecto en mobile (`radarHeroExpanded` en localStorage) — valor + hoy + total en una fila, con botón "Más/Menos"; KPIs secundarios y las 3 cards (Billetera/Posiciones/Mejor retorno) se expanden con el mismo toggle. Desktop no cambia (`lg:grid`/`lg:block` fuerzan visible). Tabs `sticky top-0` en mobile. La línea de "análisis al cierre" se folded al pill del top bar (`· análisis ... (cierre X)`).

## V5 — El detalle esconde su acción principal al fondo (impacto medio, esfuerzo bajo) ✅

**Problema.** El popup del ticker abre con la cabecera de decisión (correcto), pero los botones de ACTUAR ("Registrar compra", "Comprar más/Vender", "Dejar de seguir") están al final del scroll — en un detalle largo (posición con movimientos + plan) hay que scrollear todo para llegar al CTA, justo el gesto que I1 quiso eliminar.

**Propuesta.**
- Barra de acciones sticky al fondo del popup (siempre visible): acción primaria según contexto (Comprar / Comprar más / Vender) + secundaria (Dejar de seguir) — el contenido scrollea por debajo.
- El header del popup (ticker + precio + % hoy) ya es fijo; sumar ahí el ConvictionChip para que el score siga visible mientras se scrollea.
- Cerrar con swipe-down en mobile (gesto estándar de bottom sheet) además del tap afuera y Escape.

**Implementado:** barra de acciones sticky al fondo del popup (fuera del área con scroll) — CTA primaria según contexto (Registrar compra / Comprar más + Vender) + secundaria (Editar, Eliminar, Dejar de seguir). ConvictionChip sumado al header fijo. Swipe-down (touch handlers en handle+header) cierra el popup en mobile. El botón duplicado "Comprar más/Vender" que vivía dentro de `TechnicalDetail` se quitó (quedó solo en la barra sticky).

## V6 — Pulido de consistencia y accesibilidad (impacto bajo, esfuerzo bajo) ✅

**Problema.** Restos de la acumulación de iteraciones: dos botones de entrada distintos ("Seguir" abre búsqueda, "Agregar" abre formulario con ticker a mano — dos flujos para "meter un ticker nuevo"); filas de lista son `div role="button"` con botones anidados adentro (chip, rail) — funciona, pero el foco de teclado y los lectores de pantalla navegan raro; la leyenda descartable ocupa una fila entera para dos definiciones.

**Propuesta.**
- Un solo botón "Agregar" que abre la búsqueda; desde el resultado se elige "Seguir" o "Ya la tengo (registrar compra)" — un flujo, dos salidas. El formulario con ticker manual queda como fallback dentro de la misma búsqueda ("¿no aparece? escríbelo directo").
- Filas de lista: revisar semántica (el contenedor clickeable como `<a>`/`<button>` real donde se pueda, `aria-label` con el resumen de la fila), focus visible.
- La leyenda pasa a un ícono "?" junto a los tabs que muestra el mismo texto en toast (patrón I4 ya existente) — desaparece la fila permanente.

**Implementado:** un solo botón "Agregar" abre la búsqueda; desde cada resultado se elige "Seguir" o "Ya la tengo" (abre el modal de compra directo, sin pasar por watchlist); el fallback de ticker manual (sin resultados) ofrece las mismas dos salidas. Filas de la lista: `aria-label` con el resumen (ticker, precio, retorno, convicción) y foco visible (`focus-visible:ring`). La leyenda descartable se reemplazó por un ícono "?" junto a los tabs que dispara un toast — también se corrigió el texto, que todavía mencionaba la barra roja/verde ya eliminada.

---

## Orden sugerido

1. **V1** — dos fuentes de verdad visibles es el bug de confianza más serio de la vista; todo lo demás hereda claridad de esto.
2. **V2** — desktop es donde se decide con calma; hoy es la experiencia más pobre. V1 define qué va en la columna derecha.
3. **V3** — barato y de uso diario: ordenar la lista es la interacción #1 que falta.
4. **V4** — el primer scroll del uso diario en mobile; depende de V1 (menos bloques que acomodar).
5. **V5** — cierra la promesa de I1 dentro del detalle.
6. **V6** — limpieza final de flujos y accesibilidad.

Reglas transversales: mobile-first a 375px y desktop 1280px+ en cada cambio, `.card` para tarjetas, nada auto-ejecuta transacciones (el modal siempre confirma), y validar con `npx tsc --noEmit` + `npx vitest run` por bloque.
