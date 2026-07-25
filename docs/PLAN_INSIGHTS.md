# Plan Insights v2 — oportunidades más profundas en /analisis

**Objetivo:** que las "Oportunidades de mejora" dejen de ser observaciones de una sola dimensión ("gastaste X, 139% sobre presupuesto") y pasen a ser hallazgos con historia, evidencia visible y seguimiento — lo que diría un asesor que conoce tus últimos 6 meses, no uno que mira una foto.

**Fecha:** jul 2026 · **Estado revisado:** `app/api/analyze-month/route.ts`, `app/api/month-review/route.ts`, `app/(dashboard)/analisis/page.tsx` (mapeo AI→Oportunidad, líneas ~806-859), `monthly_insights` (migración 20260626), `docs/PLAN_ASESOR_FINANCIERO.md` (Fase A5 ya implementada: goal_context).

---

## Diagnóstico — por qué los insights de hoy se sienten planos

1. **El modelo ve el mes en foto, no en película.** El payload manda el detalle del mes actual (top 20 gastos) pero del historial solo TOTALES mensuales globales (`monthTotals`). No hay serie por categoría, ni por comercio, ni distribución dentro del mes. El modelo literalmente no puede decir "Tecnología lleva 3 meses subiendo" o "Uber creció 40% vs tu promedio" porque no recibe ese dato.
2. **Solo 20 gastos.** `topExpenses.slice(0, 20)` — en un mes de 44 gastos, más de la mitad es invisible; los "gastos pequeños frecuentes" (patrón 4 del prompt) casi nunca tienen evidencia suficiente.
3. **Sin memoria.** Cada mes parte de cero: no sabe qué recomendó el mes pasado, si el usuario lo hizo caso, ni si "Pareja sobre presupuesto" es la 4ª vez consecutiva (dato que cambia el mensaje de "revisa el presupuesto" a "tu presupuesto de Pareja es irreal, súbelo").
4. **Sin evidencia renderizada.** `expense_ids` se guarda en la BD pero la card no lo usa — el usuario tiene que creerle al texto. No hay sparkline, ni lista de gastos vinculados, ni deep-link filtrado.
5. **Máximo 3, todos con la misma plantilla.** Título + párrafo + impacto. No hay jerarquía entre "dato curioso" y "esto te cuesta $135.040 al mes".
6. **Nada de estructura temporal intra-mes.** Con la convención sueldo-fin-de-mes + corte CMR el 24, hay patrones potentes invisibles: efecto post-sueldo, gasto concentrado pre/post cierre de facturación, fines de semana.

---

## Fase I1 — Payload con historia (solo backend, sin migración ni UI nueva)

La mejora de mayor palanca: darle al modelo la película. Todo sale de queries que ya existen o se amplían en el mismo `Promise.all`.

### I1.1 Serie de 6 meses POR CATEGORÍA
`historyExpenses` ya trae 6 meses — solo falta pedir `category_id` y bucketear por `(mes, categoría)`:
```
categories[i].history_6m: [82000, 95000, 71000, 110000, 128000, 210040]
```
Habilita: tendencias por categoría, detección de deriva sostenida vs spike puntual, estacionalidad simple.

### I1.2 Agregado por comercio (merchant)
Normalizar `description` (lowercase, sin números/fechas) y agrupar mes actual + 3 previos:
```
merchants: [{ name: "uber", count_now: 14, total_now: 86000, avg_3m: 61000, delta_pct: +41 }]
```
Habilita: "Uber subió 41% vs tu promedio", "Primera vez que aparece X y ya es tu 5° gasto del mes", suscripciones que subieron de precio (mismo comercio, monto recurrente que cambió — señal directa de `subscription_price_increase`).

### I1.3 Distribución intra-mes
Tres vectores baratos de computar sobre los gastos del mes:
- por semana del mes (`[w1, w2, w3, w4+]`),
- por día de semana (lun-dom),
- días 25-31 vs resto (ventana post-sueldo, dado que el sueldo llega a fin de mes).
Habilita: "El 45% de tu gasto discrecional ocurre en los 6 días post-sueldo".

### I1.4 Cobertura completa de gastos
Subir top_expenses a 40 y agregar un bucket agregado del resto: `small_expenses_summary: { count, total, by_category }`. El modelo deja de estar ciego a la cola larga sin explotar los tokens.

### I1.5 Calendario de cuotas próximas
`computeCommittedDebt` ya existe pero se manda como un solo número. Mandarlo desglosado por mes próximo (`[{month: 'ago', total: 233000}, ...]`) habilita `cuota_stacking`: "En septiembre se te juntan 3 cuotas + el seguro anual: $410.000 comprometidos antes de gastar $1".

**Costo:** payload ~2-3x más tokens (sigue siendo barato con 4.1-mini); mismo hash/cooldown. Riesgo bajo — el modelo simplemente tiene más de dónde sacar.

---

## Fase I2 — Tipos nuevos + evidencia estructurada + UI expandible

### I2.1 Nuevos tipos en el schema
`merchant_trend`, `subscription_price_increase`, `payday_effect`, `cuota_stacking`, `seasonal_pattern`, `budget_unrealistic` (categoría que lleva N meses seguidos sobre el mismo presupuesto — el problema es el presupuesto, no el gasto; acción: `adjust_budget` con monto sugerido = promedio 3m).

### I2.2 Campo `evidence` estructurado
Ampliar el schema de salida (y la tabla — columna `evidence jsonb`):
```json
"evidence": {
  "kind": "series|expenses|comparison",
  "series": [82000, 95000, ...],          // para sparkline 6m
  "labels": ["feb","mar","abr","may","jun","jul"],
  "comparison": { "actual": 210040, "referencia": 75000, "ref_label": "presupuesto" }
}
```
Validado en el whitelisting existente (A08) igual que el resto.

### I2.3 Cards expandibles con evidencia
En la card de Oportunidad (dentro de `.card` como manda CLAUDE.md):
- **Sparkline SVG a mano** (patrón existente: charts hand-coded) cuando `evidence.kind = 'series'`.
- **Chips de gastos vinculados** cuando hay `expense_ids` (ya se guardan, hoy no se usan): descripción + monto, cada uno linkeando al gasto.
- **CTA con deep-link real:** hoy `view_category` manda a `/historial` pelado. Con el filtro multi-categoría existente (`?cats=uuid`) y `pm`, el botón puede aterrizar EXACTAMENTE en la evidencia: `/historial?cats=<id>&month=7&year=2026`. Requiere que el modelo devuelva `category_id` (validado contra las categorías reales del usuario, mismo patrón que expense_ids).
- Colapsado por defecto (UX4: no más ruido vertical); severidad sigue el mapa UX5 (high=coral, medium=gold, low=azul).

### I2.4 De 3 a 5 oportunidades, con jerarquía
`maxItems: 5`, pero la UI muestra 3 y un "Ver 2 más" colapsado. El prompt pide ordenarlas por impacto CLP descendente.

---

## Fase I3 — Memoria y seguimiento (migración chica)

### I3.1 El modelo recuerda lo que dijo
Antes de generar, leer los insights del MES ANTERIOR (`monthly_insights` where month-1, incluyendo `status`) y mandarlos como `previous_insights: [{type, title, category, impact, user_action}]`. Prompt nuevo:
- Si un problema persiste → escalar el mensaje ("3° mes consecutivo — el presupuesto de Pareja es irreal") en vez de repetirlo idéntico.
- Si mejoró → reconocerlo (tipo nuevo `improvement_confirmed`, severidad mint/confirmación, máximo 1): "Bajaste Tecnología de $62.740 a $31.000 — la sugerencia de junio funcionó".

### I3.2 Feedback del usuario como señal
La tabla ya tiene `status` ('active'/'dismissed'). Sumar acción "No me sirve" en la card (update a `dismissed` + `dismissed_reason text`). Los tipos descartados 2+ veces se mandan en el payload como `muted_types` y el prompt los evita. Es lo que hace que el motor se sienta *tuyo* y no genérico.

### I3.3 Racha visible
Chip arriba de la sección: "Pareja lleva 4 meses sobre presupuesto · Tecnología mejoró 2 meses seguidos". Determinista (sin IA), calculado de `category_budgets` + historial — va en `lib/` con test según convención.

---

## Fase I4 — Proyección determinista + what-if (sin IA, con tests)

Motor aparte de la IA — números exactos, reproducibles, testeados:

### I4.1 Proyección de cierre de mes por categoría
`lib/projection.ts`: run-rate del gasto discrecional (gasto÷días×días_restantes) + recurrentes PENDIENTES del mes (de `recurring_expenses`, los que aún no se registran) + cuotas conocidas. Card "Así cierras julio si sigues igual": por categoría, verde/gold/coral vs presupuesto. Mucho más útil a mitad de mes que el post-mortem.

### I4.2 Simulador "¿y si...?"
Sliders sobre las 2-3 categorías más excedidas: "si Pareja baja a $120.000 → tasa de ahorro 24%→31%, fondo de emergencia llega a 3 meses en nov en vez de feb". Todas las fórmulas en `lib/` con test. Es la pieza que convierte el insight en decisión.

---

## Orden recomendado y esfuerzo

| Fase | Qué gana el usuario | Esfuerzo | Depende de |
|---|---|---|---|
| **I1** | Insights con historia real (tendencias, comercios, timing) | 1 sesión — solo `analyze-month/route.ts` | — |
| **I2** | Evidencia visible, deep-links exactos, hasta 5 hallazgos | 1-2 sesiones — schema + migración `evidence` + UI | I1 |
| **I3** | Memoria, seguimiento, rachas, "no me repitas esto" | 1 sesión — migración chica + prompt | I1 |
| **I4** | Proyección y simulador what-if deterministas | 1-2 sesiones — lib nueva + tests + UI | — (independiente) |

**Recomendación:** I1 primero (máxima palanca, cero riesgo de UI), validar un mes real mirando qué genera, y con eso decidir si I2 o I3 sigue. I4 puede ir en paralelo cuando quieras porque no toca la IA.

## Guardarraíles que se mantienen
- Hash + cooldown 10 min + validación whitelist (A08) intactos en cada fase.
- Sanitización de descriptions antes de mandar a la IA (LLM01) — aplica también a merchants (I1.2).
- Severidades mapean a UX5: coral solo para "requiere acción", gold para "pronto", mint solo confirmación (I3.1).
- Toda fórmula determinista nueva (I3.3, I4) va en `lib/` con test vitest.
