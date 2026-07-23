# Roadmap del popup de detalle · Inversiones → Acciones

Diagnóstico (jul 2026, con screenshot de TSM de Cas): el popup abre directo en la pestaña "Plan" y descarga de una vez DOS tarjetas densas (Tu posición · plan de salida, y Plan de compra) llenas de frases largas — "100% solo si pierde $419 dos cierres seguidos", "No vendas: déjala correr, las ganadoras se venden…", la nota amarilla del trailing, el timeline de Movimientos, y al final el plan de compra con dos tramos y otra explicación. El feedback de Cas: **mucho texto, abrumador, no se entiende**. El contenido es correcto (viene de U3/D-series); el problema es de DOSIFICACIÓN — todo llega junto y en prosa, cuando la mitad podría ser un dibujo y la otra mitad podría esperar un tap. Ordenado por prioridad.

**Estado: X1-X5 implementados (jul 2026), + Y1 (lista global de operaciones, a pedido de Cas).** `npx tsc --noEmit` y `npx vitest run` (136/136) verdes.

---

## X1 — Abrir con un resumen visual, no con el plan completo (impacto alto, esfuerzo medio) ✅

**Problema.** "Plan" es la pestaña por defecto y muestra todo su contenido de inmediato. Para una posición, eso significa ~15 líneas de texto antes de la primera pausa. La cabecera de decisión (score + "Compra $X ahora" + porqué) ya responde la pregunta del día — lo que sigue debería ser profundización opcional, no la bienvenida.

**Propuesta.**
- Nueva pestaña "Resumen" por defecto (para posiciones): (a) tu posición en UNA línea — valor actual, retorno $ y %, % hoy; (b) la escalera de precios visual de X2; (c) nada más. La pestaña "Plan" conserva los tramos completos para quien quiera el detalle.
- Para tickers sin posición, el resumen es la escalera + la zona de compra en una línea.
- La cabecera de decisión no cambia (ya es lo mejor del popup).

**Implementado:** pestaña "Resumen" primera y abierta por defecto — posición en una línea (valor + retorno $/%) + la escalera (X2) + un toggle "¿Por qué?" que revela `sellPlan`/`entryPlan` solo si se pide. Para tickers sin posición, atajo directo a "Ver el plan de compra completo →".

## X2 — Escalera de precios: un dibujo en vez de cuatro frases (impacto alto, esfuerzo medio) ✅

**Problema.** Los números clave están regados en prosa: la salida ($419) aparece en la frase del tramo Y en "Línea de salida: $419" del plan de compra; el trailing ($422,10) en una nota amarilla aparte; el objetivo ($449) enterrado en "Si llega a $449 con el impulso ya caliente…"; el costo ($427,46) en otra línea. Cuatro lugares para armar mentalmente UNA recta numérica.

**Propuesta.**
- Escalera de precios SVG (hand-coded, convención de la app): una línea vertical u horizontal con marcadores — salida efectiva (max(alarm, trailing), coral), precio actual (destacado), tu costo (si hay posición), próximo objetivo/techo (mint). Cada marcador con su precio y una etiqueta de 2-3 palabras ("vende todo aquí", "tu costo", "evalúa asegurar").
- De un vistazo se ve dónde está el precio respecto de todo lo que importa — es la misma información de las cuatro frases, sin leer ninguna.
- Las frases largas (sellPlan / entryPlan) quedan detrás de un "¿por qué?" expandible bajo la escalera.

**Implementado:** `PriceLadder` (SVG a mano) con anti-colisión de etiquetas (mismo patrón que `PriceChart`) — marca precio actual, tu costo, salida efectiva (trailing o alarm) y próximo techo/piso, ordenados en una recta.

## X3 — Tramos como filas estructuradas, no oraciones (impacto medio, esfuerzo bajo) ✅

**Problema.** Cada tramo es una oración corrida: "100% solo si pierde $419 dos cierres seguidos", "Compra $2.804,21 si baja a ~$419 (70%)". El ojo no puede escanear: monto, condición y porcentaje van mezclados en la frase.

**Propuesta.**
- Formato fila: condición corta a la izquierda ("si pierde $419 × 2 cierres"), acción+monto a la derecha ("vende todo" / "compra $2.804"), el % como sub-etiqueta chica. Alineación consistente entre plan de salida y plan de compra.
- Deduplicar: el chip "2 a favor · 1 en contra" del header no debe repetirse en el texto del veredicto (hoy aparece dos veces); el monto de "Compra $1.201,80 ahora" de la cabecera no necesita repetirse idéntico como primer tramo — el tramo "ahora" se marca como "el de arriba".

**Implementado:** filas condición|acción+monto en ambos planes (compra y salida); el tramo "ahora" del plan de compra muestra "↑ el de arriba" en vez de repetir el monto; se quitó `conviction.reasons[0]` del veredicto (repetía el mismo dato del chip "N a favor · M en contra").

## X4 — Movimientos se van a Historial (impacto medio, esfuerzo bajo) ✅

**Problema.** El timeline de compras/ventas ocupa un tercio de la tarjeta de posición y no es información de decisión diaria — es consulta ocasional. Ya existe una pestaña "Historial" (noticias + evaluación de señales) que es exactamente su lugar.

**Propuesta.**
- Mover Movimientos a la pestaña Historial, arriba de las noticias. La tarjeta de posición queda con lo operativo: cuántas acciones, costo, retorno, y el plan de salida.

**Implementado:** Movimientos ahora abre en Historial, arriba de Noticias y de la evaluación de señales.

## X5 — Disclaimer compacto (impacto bajo, esfuerzo bajo) ✅

**Problema.** El párrafo legal de dos líneas ("Lectura informativa al cierre… estas señales fallan seguido… la decisión es siempre tuya") cierra todas las vistas con más texto — correcto de fondo, pesado de forma.

**Propuesta.**
- Una sola línea corta ("Lectura informativa al cierre del X — no es recomendación") + ícono Info que muestra el texto completo en toast (patrón I4 ya existente).

**Implementado:** disclaimer de una línea + ícono `Info`, texto completo vía `showToast`.

---

## Y1 — Historial de operaciones (a pedido de Cas) ✅

**Pedido.** "Me gustaría agregar una parte para ver en una lista el historial si he comprado o vendido, ordenados" — hasta ahora Movimientos solo existía POR TICKER, adentro de cada detalle; no había un solo lugar con todas las compras/ventas de toda la cartera.

**Implementado:** nueva card "Historial de operaciones" en Radar (columna izquierda, debajo de la lista de tickers), colapsada por defecto (es consulta ocasional, no debía sumar al primer scroll). Combina `purchases` + `sales` de TODOS los tickers, ordenadas por fecha descendente (más reciente primero), paginada de a 10 ("Ver N más"), cada fila clickeable abre el detalle de ese ticker.

---

## Orden sugerido

1. **X2** — la escalera es la pieza que convierte texto en comprensión; X1 la necesita.
2. **X1** — con la escalera lista, el resumen por defecto se arma con lo que ya existe.
3. **X3** — barato, ordena las dos tarjetas de tramos.
4. **X4** — barato, descarga la tarjeta de posición.
5. **X5** — pulido final.
6. **Y1** — pedido nuevo de Cas, independiente del resto.

Reglas transversales: mobile 375px + desktop 1280px+, SVG a mano, sin tocar `lib/technical.ts` (los textos del motor no cambian — cambia CÓMO se muestran), validar con `npx tsc --noEmit` + `npx vitest run` por bloque.
