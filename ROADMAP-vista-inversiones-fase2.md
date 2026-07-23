# Roadmap de vista · Fase 2 — arreglar la columna derecha y ver el rendimiento de lo que tengo

Diagnóstico (jul 2026, post-V1-V6, con screenshot de Cas): el split de dos columnas (V2) quedó bien de estructura pero MAL de contenido — a la columna derecha de 380px se le metió el hero tal cual estaba diseñado para el ancho completo de la página. Resultado visible en producción:

- El valor del portafolio sale cortado ("$2.32…"), porque el hero sigue con `lg:flex-row` y proporción 40/60 pensada para ~1200px.
- Los sub-KPIs de abajo del hero (`grid-cols-4`) quedan con los labels "INVERTIDO RETORNO RETORNO…" encimados e ilegibles.
- Las cards Billetera / Posiciones / Mejor retorno (`grid-cols-3` con tipografía `lg:text-4xl`) salen truncadas: "BILLETERA" cortado, "$." solo, "MEJOR RETOR…".
- Además Cas no tiene forma clara de ver **cómo va el rendimiento de lo que ya tiene**: hay que ir al tab "Tengo" y leer fila por fila, los KPIs de retorno total quedaron ilegibles por lo anterior, y PerformanceSection (al fondo de la página) solo habla de ventas ya cerradas.

Ordenado por prioridad.

**Estado: W1-W4 implementados (jul 2026).** `npx tsc --noEmit` y `npx vitest run` (136/136) verdes.

---

## W1 — Rediseñar la columna derecha para 380px reales (crítico, esfuerzo medio) ✅

**Problema.** El bloque hero+KPIs se movió a la columna sin adaptarlo: conserva `flex: 40/60`, `lg:flex-row`, `grid-cols-4` y fuentes `lg:text-5xl`/`lg:text-4xl` — todo pensado para el ancho completo. En 380px nada cabe.

**Propuesta.**
- Dentro de la columna, TODO apilado en vertical (nada de `lg:flex-row` ni proporciones 40/60 — eso era el layout de página).
- Hero compacto: una sola card a lo ancho de la columna con valor del portafolio (tipografía que quepa: `text-3xl`, no 5xl), retorno de hoy y retorno total $ y % — las tres cifras que se miran a diario, sin truncar.
- Sub-KPIs secundarios (Invertido · vs SPY) como una fila de 2 dentro de la misma card, `text-sm`.
- Billetera / Posiciones / Mejor retorno dejan de ser 3 cards gigantes: pasan a UNA fila compacta de 3 mini-stats (o 3 filas de lista) con tipografía `text-sm`/`text-base`, sin `text-4xl`.
- Verificar a 380px de columna en desktop Y a 375px de viewport en mobile (donde la columna es full width y el colapsable de V4 sigue aplicando).

**Implementado:** un solo diseño compacto (sin escalar `lg:`) para hero+KPIs+cards secundarias — mismo layout en mobile y en la columna de 380px. Valor a `text-3xl`, KPIs en grid 2×2 (antes 1×4), Billetera/Posiciones/Mejor retorno pasaron de 3 cards `text-4xl` a una sola card con 3 filas compactas. El toggle "Más/Menos" ahora aplica en ambos breakpoints (antes solo mobile).

## W2 — "Cómo va lo que tengo": tarjeta de rendimiento de posiciones (alto, esfuerzo medio) ✅

**Problema.** No existe un lugar que responda de un vistazo "¿cómo van mis acciones?". El retorno por posición está repartido en las filas del tab Tengo (hay que leer una por una) y los totales en KPIs hoy ilegibles.

**Propuesta.**
- Nueva card "Mi rendimiento" en la columna derecha, debajo de la decisión: mini-tabla con CADA posición — ticker, valor actual, % hoy, retorno $ y % (verde/rojo) — ordenada por valor, clickeable (abre el detalle).
- Fila de totales arriba: ganancia no realizada + ganancia realizada (ventas) = retorno total, con %.
- Es la respuesta directa al pedido de Cas: ver el rendimiento de lo que ya tiene sin cambiar de tab ni abrir detalles, siempre visible en desktop (columna sticky).
- En mobile la card va después de la decisión, colapsable si queda larga (mismo patrón del hero V4).

**Implementado:** card "Mi rendimiento" en la columna derecha, debajo del panel de decisión. Fila de totales (No realizado / Realizado / Total con %) arriba; lista de posiciones ordenada por valor actual, cada fila con ticker, valor, retorno $/% y % de hoy, clickeable (abre el detalle).

## W3 — Evolución del portafolio en el tiempo (medio, esfuerzo medio) ✅

**Problema.** "Cómo va" también es una pregunta temporal — hoy no hay ningún gráfico de la cartera; solo números del instante.

**Propuesta.**
- Server-side con `price_history` (misma tabla que ya usa el benchmark SPY): valor de la cartera por día (shares actuales × cierre de cada ticker), últimos 3-6 meses.
- Gráfico SVG hand-coded (convención de la app — sin librerías), dentro de la card W2 o del hero, con el costo invertido como línea de referencia.
- Aproximación honesta: usa las posiciones ACTUALES hacia atrás (no reconstruye la historia de compras/ventas) — anotarlo en el copy chico, igual que el caveat de PerformanceSection.

**Implementado:** `lib/portfolio-history.ts` (con tests) reconstruye el valor día a día con carry-forward de cierres, reusando la MISMA consulta de `price_history` que ya pedía el benchmark vs SPY (sin fetch aparte). `components/PortfolioChart.tsx` — SVG a mano con línea de costo invertido punteada y el caveat de la aproximación en el copy chico. Se muestra dentro de la card "Mi rendimiento" cuando hay ≥2 puntos.

## W4 — Bajar el ruido visual de la lista (bajo, esfuerzo bajo) ✅

**Problema.** En el screenshot, 10 de 13 filas del tab "Sigo" llevan el chip "revisar pronto" — cuando casi todo es "revisar pronto", el chip no informa nada. Y el tab Sigo muestra precio + % del día pero ningún dato de por qué seguirla.

**Propuesta.**
- Chip "revisar pronto" solo cuando hay señales concretas (≥2 condiciones en `a.watch`, o precio objetivo cerca) — no por cualquier condición suelta.
- En filas sin posición, usar ese espacio para algo útil: distancia al precio objetivo si existe, o nada.

**Implementado:** el chip "revisar pronto" ahora exige 2+ señales simultáneas en `a.watch` (antes cualquiera de las condiciones sueltas lo prendía, y hay varias bastante comunes por separado — RSI en rango ancho, distancia a soporte/resistencia, etc.), o precio objetivo cerca (`nearTarget`), que sigue siendo siempre relevante.

---

## Orden sugerido

1. **W1** — es un bug visual en producción, todo lo demás se ve a través de él.
2. **W2** — el pedido explícito de Cas: rendimiento de lo que ya tiene, de un vistazo.
3. **W3** — completa W2 con la dimensión temporal.
4. **W4** — pulido.

Reglas transversales: mobile 375px y desktop 1280px+ en cada cambio, `.card` para tarjetas, gráficos SVG a mano, y validar con `npx tsc --noEmit` + `npx vitest run` por bloque.
