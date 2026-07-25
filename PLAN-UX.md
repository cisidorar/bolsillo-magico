# Plan UX/UI — claridad sin abrumar

_Creado: jul 2026. Objetivo: que cada pantalla responda UNA pregunta de un vistazo, y todo lo demás sea profundización opcional. Aplica al resto de la app los principios que ya funcionaron en Inversiones (U1–U6, I1–I6) y en la reestructura de /analisis (R1–R4): decisión arriba, un solo lenguaje, nada repetido, detalle colapsado._

## Principios (ya validados en esta app)

1. **Una pregunta por pantalla.** /inicio = "¿cómo voy hoy y qué viene?" · /analisis = "¿cómo me fue?" · /recurrentes = "¿qué se paga y cuándo?" · /inversiones = "¿qué hago hoy?". Todo bloque que no responda la pregunta de su pantalla se colapsa, se mueve o se elimina.
2. **Cada dato vive en UN solo lugar.** Si aparece en dos, uno es link al otro (lección de R1: los KPIs duplicados del flujo se eliminaron, no se redistribuyeron).
3. **Lo accionable arriba, lo informativo abajo, lo educativo al tap** (lección de U1/U3).
4. **Máximo 3 números grandes por pantalla.** El resto en texto secundario o colapsado.
5. **Los estados vacíos guían** ("registra tu ingreso →"), nunca ocupan el espacio de una card completa sin dar el paso siguiente.

---

## Auditoría — dónde se abruma hoy

### /inicio (el más cargado tras las fases 1–5)
Stack actual desktop: hero (2 números grandes) + 4 KPI cards + col. categorías + col. últimos gastos + col. 3 (Ciclo de sueldo + tarjetas + atrasados + próximos pagos + resumen rápido). **Problemas:**
- **Ciclo de sueldo y hero compiten**: ambos dicen "cuánto te queda", con definiciones distintas (vs presupuesto vs vs sueldo real). Confusión de "dos verdades" — el mismo bug conceptual que ya se corrigió una vez con el KPI "Ahorro".
- 4 KPI cards donde "Por día" y "Proyección" ya están (o caben) en el hero; "VS mes anterior" y "Disponible" repiten información del hero.
- "Resumen rápido" (categorías dentro/excedidas, gastos del mes, categoría top) duplica la columna de categorías que está al lado.
- El estado de cuenta aparece DOS veces (card "Tarjeta CMR · Cupo usado" en col. 3 y sección "Estado de cuenta" en mobile).

### /recurrentes
4 KPI cards + alerta de atrasados + toggle + lista + flujo 30d + calendario. "Carga mensual", "Promedio mensual" y "Gasto anual estimado" son 3 versiones del mismo concepto (cuánto pesan los fijos) — nadie necesita las 3 a la vez.

### /analisis
Ya reestructurado (R1–R4). Queda: el informe de cierre (nuevo, Fase 4) + oportunidades IA + health score compiten como 3 bloques narrativos seguidos en meses cerrados.

### Transversal
- **Sin jerarquía de alerta consistente**: coral/gold/mint se usan bien en inversiones, pero en gastos conviven bordes rojos, banners, badges y textos sin regla única de severidad.
- **El lenguaje visual no se explica** fuera de inversiones (lección I4): "% usado", "pro-rata vs anterior", "por facturación" nunca tienen explicación al tap.
- **Nombres de conceptos**: "Disponible", "Te quedan", "Queda para ahorro", "Saldo" — 4 términos parecidos con definiciones distintas en distintas páginas.

---

## Fases

### UX1 — /inicio: una sola verdad arriba (impacto máximo) ✅ _Implementado jul 2026_

Ejecutado (versión ajustada al esfuerzo/riesgo real, ver nota abajo):
- **Hero absorbe las 4 KPI cards**: se eliminó el grid 2×2 separado; "Por día", "Proyección" y "Vs. mes anterior" (con el monto absoluto, no solo %) ahora son una fila secundaria dentro del propio hero, en desktop y mobile. La 4ª card ("Disponible") se eliminó sin pérdida — era el mismo número que "Te quedan" del hero.
- **"Resumen rápido" eliminado**: "N dentro / M excedidas" pasó a ser el subtítulo de "Por categoría" (desktop y mobile); "Gastos del mes" y "Categoría top" ya eran visibles en esa misma lista, no se reemplazaron.
- **Deduplicación de tarjeta de crédito**: cuando hay una sola tarjeta de crédito, su card "Tarjeta · Cupo usado" (aparte, en col. 3 desktop y sección propia mobile) se oculta porque Ciclo de sueldo ya muestra el mismo monto y vencimiento. Con 2+ tarjetas se mantiene la lista completa (Ciclo de sueldo solo cubre la principal).

**Nota de alcance:** la fusión completa de "Próximos pagos" dentro de Ciclo de sueldo (mencionada en la propuesta original) se dejó fuera de esta pasada — es un cambio estructural mayor en el archivo más grande y sensible de la app, mejor abordado en una sesión dedicada con más margen de testing manual. El resultado ya baja `/inicio` de 9 a 6 bloques visuales sin esa fusión.


La pregunta de /inicio es "¿cómo voy este período y qué viene?". Propuesta de stack:

1. **Hero unificado** (absorbe las 4 KPI cards, patrón R1): gastado + disponible + barra, y como línea secundaria dentro del hero: "por día $X · proyección $Y (chip de alerta si pisa el límite) · Z% vs mes anterior". Se eliminan las 4 KPI cards.
2. **Ciclo de sueldo pasa a ser LA card de "qué viene"** y absorbe la card de tarjeta: el estado de cuenta CMR ya vive dentro del ciclo (monto + vence el 5), no necesita card propia. Un solo bloque "próximos movimientos de plata": sueldo → tarjeta → aporte → fijos próximos 7 días (fusiona "Próximos pagos" como filas del mismo bloque).
3. **Atrasados se queda** como único banner de alerta (es lo único accionable urgente).
4. **"Resumen rápido" se elimina**: "N dentro / M excedidas" pasa a ser el subtítulo de la sección "Por categoría" (una línea, no una card).
5. Resultado: hero → ciclo de sueldo (qué viene) → categorías → últimos gastos. De ~9 bloques a 4.

### UX2 — Glosario al tap (transversal, esfuerzo bajo)

Patrón I4 aplicado a gastos: cada término con definición no obvia se vuelve tocable y muestra un toast/popover de una frase. Prioridad: "Disponible" (presupuesto − gastado), "Proyección" (variable prorrateado + fijos reales), "vs anterior" (mismo día del mes pasado), "Por facturación" (mes del estado de cuenta), "Queda para ahorro" (sueldo − tarjeta − aporte − débito). Un componente único (`InfoTap`), reuso en toda la app. Además: **unificar nomenclatura** — elegir un término por concepto y usarlo igual en /inicio, /analisis y /presupuesto.

### UX3 — /recurrentes: un KPI, no cuatro ✅ _Implementado jul 2026_

1. **Hecho.** Las 4 KPI cards se fusionaron en una sola "Carga mensual": el número grande + una línea secundaria "N gastos activos · ≈$X promedio real (3m) · $Y al año". "Próximo cargo" se eliminó del todo — ya vive (más preciso, porque también cruza tarjetas y sueldo) en Flujo de caja 30 días, justo debajo.
2. **Ya estaba resuelto** desde la Fase 3: `FlujoCaja30d` se renderiza antes que `CalendarioPagos` en la misma columna.
3. **Hecho.** `RecurringManager` agrupa por tipo (Mensuales / En cuotas / Anuales) colapsable con subtotal por grupo — solo cuando hay más de un tipo presente (con un solo tipo, el header sería ruido repitiendo la lista completa). El orden y la lógica de cada fila no cambiaron, solo se envolvieron en grupos.

### UX4 — /analisis: un solo bloque narrativo por mes ✅ _Implementado jul 2026_

En meses cerrados hay 3 textos seguidos (informe de cierre + oportunidades + resumen de señales del score). Regla: **el informe de cierre es el techo narrativo** del mes cerrado; las oportunidades IA se muestran colapsadas bajo él ("3 oportunidades →" expandible); el health score muestra solo el donut + señales fuera de verde (ya es así). En mes en curso (sin informe), las oportunidades quedan como hoy.

**Hecho.** El bloque "Oportunidades de mejora" ahora tiene dos variantes según `isClosedMonth && monthReview`: cuando hay informe de cierre visible arriba, se renderiza como `<details>/<summary>` (mismo patrón nativo que "Más detalle del mes" — sin JS extra) colapsado por defecto, con el mismo header (título + badge de conteo + badge IA) más un `ChevronRight` que rota al abrir. Cuando no hay informe (mes en curso o mes cerrado sin insights aún), se mantiene la card expandida tal cual estaba. El contenido interno (grid de sugerencias) no cambió, solo el envoltorio.

### UX5 — Jerarquía de alerta única (transversal) ✅ _Implementado jul 2026_

Una regla para toda la app, documentada en CLAUDE.md:
- **Coral + banner arriba**: requiere acción hoy (pago atrasado, sobre límite duro, flujo proyectado negativo).
- **Gold + badge/chip inline**: atención pronto (cierra en ≤3 días, 80% del límite, depósito ocioso 30d).
- **Mint**: confirmación/positivo. **Nunca** banner para info positiva.
- Máximo UN banner coral visible por pantalla (el más urgente); el resto degrada a chips.

**Hecho.** Regla documentada en CLAUDE.md (sección "Alert Severity Hierarchy"). Tres violaciones detectadas en auditoría, corregidas:
1. **`/recurrentes`**: `RecurringOverdueAlert` (atrasados) y el banner de riesgo de `FlujoCaja30d` (flujo negativo) podían mostrarse ambos a la vez. `FlujoCaja30d` ahora recibe `muteRiskBanner={overdueCount > 0}` — cuando ya hay atrasados, el riesgo de flujo se degrada a un chip gold junto al título en vez de su propio banner coral.
2. **`PatrimonioCards`**: "Tus acciones no están sumadas" era un banner gold completo (caja + borde + párrafo); se comprimió a una fila de chip + texto corto + link, sin caja.
3. **`Radar`**: "Plata parada" usaba mint en formato banner (caja + borde grueso) para una oportunidad accionable, no una confirmación. Se recoloreó a gold (es "atención pronto", no "positivo confirmado") y se aligeró el estilo a fila simple sin borde grueso.

`/inicio` (hero) y `/presupuesto` se revisaron y ya cumplían la regla (un solo banner por pantalla, sin mint como alerta).

### UX6 — Estados de carga y vacíos (pulido)

- Skeletons que espejen el layout final ya existen por ruta — verificar que las cards nuevas (CicloSueldo, FlujoCaja30d) estén en los `loading.tsx`.
- Estados vacíos con un solo CTA claro (patrón ya usado en hero vacío) — auditar FlujoCaja30d y CicloSueldo en cuentas sin datos para que no muestren 3 nudges a la vez (si faltan payday + ingreso + día de pago, mostrar SOLO el primero del embudo: payday).

---

## Orden sugerido

**UX1** (inicio — donde más se nota) → **UX2** (glosario, barato y transversal) → **UX3** (recurrentes) → **UX4** (análisis) → **UX5–UX6** (consistencia y pulido).

Regla transversal: cada fase se valida en 375px y 1280px+, `npx tsc --noEmit` + `npm test`, y sin crear ningún dato nuevo — este plan solo reorganiza, no agrega información.
