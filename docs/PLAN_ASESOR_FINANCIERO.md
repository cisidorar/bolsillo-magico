# Plan Asesor Financiero — mejoras a /analisis

**Perfil objetivo (Cas):** joven, ingreso $2.000.000 CLP/mes, invierte ~$1.000.000/mes en acciones USD vía billetera. Ingreso disponible real para gastar: ~$1.000.000. Horizonte largo, tolerancia al riesgo alta, sin deudas grandes.

**Fecha:** jul 2026 · **Estado actual revisado:** `app/(dashboard)/analisis/page.tsx` (health score F5, patrimonio F1–F4, oportunidades AI vía `/api/analyze-month`, vista anual con heatmap), `lib/net-worth.ts`, `lib/conviction.ts`, `daily_decisions`.

---

## Diagnóstico: qué ya hace bien y qué le falta

**Bien:** health score con 4 señales, tasa de ahorro 12m con proyección del mes en curso, fondo de emergencia en meses, deuda comprometida a 6 meses, patrimonio neto real (bruto − deuda), heatmap anual con spikes, 3 insights de IA con cache/validación.

**Brechas centrales para este perfil:**

1. **El aporte a inversión es invisible para el análisis.** El $1M mensual sale por `usd_purchases.total_paid_clp`, no por `expenses`. La tasa de ahorro `(ingreso_prev − gastos)/ingreso_prev` lo cuenta como "te sobró" sin distinguir *invertido* de *quedó en la cuenta corriente*. Un mes donde gastaste $1.4M y no invertiste se ve igual de bien (30% ahorro) que uno donde gastaste $900k e invertiste $1M.
2. **La disciplina se mide contra el ingreso total ($2M), no contra el disponible post-inversión (~$1M).** Si el objetivo es invertir $1M *primero* (pay yourself first), el presupuesto global y las proyecciones deberían validar contra $1M.
3. **No hay noción de meta de aporte mensual** ni tracking de cumplimiento ("¿invertiste el $1M este mes? ¿llevas 5/7 meses cumpliendo?").
4. **El fondo de emergencia compite en silencio con la inversión.** Con perfil 100% acciones, si `monthsCovered < 3` el asesor correcto diría "este mes el $1M va a ahorro líquido, no a acciones" — hoy nada conecta ambas señales.
5. **La IA (`analyze-month`) solo ve gastos.** No recibe ingreso disponible real, aportes a inversión, salud del fondo de emergencia ni historial de cumplimiento; su prompt además prohíbe hablar de inversión, lo que para este perfil deja fuera la mitad de la foto.

---

## Fase A — Corto plazo, vista mensual (1–2 semanas)

### A1. Flujo del mes en 3 destinos (la mejora núcleo)

Nueva card arriba del health score: **Ingreso → Gastado / Invertido / Líquido**.

- `invertidoMes` = Σ `usd_purchases.total_paid_clp` con `kind='deposit'` del mes (+ opcional: depósitos a `savings_accounts` / `term_deposits` creados en el mes).
- Barra apilada: gastado (rojo/azul), invertido (verde), sobrante líquido (gris).
- Redefine "Te sobró" como `ingreso_prev − gastos − invertido` (el sobrante *real* en la cuenta).
- Requiere: query nueva en el `Promise.all` de la página; sin migración.

### A2. Meta de aporte mensual

- Migración: `user_prefs.monthly_invest_goal integer` (para Cas: 1.000.000).
- Chip en la card A1: "Aporte: $1.000.000 / $1.000.000 ✓" o "$0 / $1.000.000 — te quedan 7 días".
- Racha de cumplimiento: "5 meses seguidos cumpliendo tu aporte".

### A3. Presupuesto contra el disponible real

- Donde hoy se compara gasto/proyección vs `globalBudget`, mostrar además vs `ingreso_prev − monthly_invest_goal`.
- Aviso temprano: si `projection > ingreso_prev − meta`, "a este ritmo no alcanzas a invertir el $1M completo" — accionable a mitad de mes, no post-mortem.

### A4. Health score v2 (mismos 100 pts, señales re-pesadas para constructor de patrimonio)

| Señal | Hoy | Propuesta |
|---|---|---|
| Tasa de ahorro | 30 | 20 — pero "ahorro" = invertido + sobrante |
| **Cumplimiento de aporte** | — | **15** (meta cumplida = 15, parcial prorrateado) |
| Fondo de emergencia | 25 | 20 |
| Disciplina de presupuesto | 25 | 25 (contra disponible real, A3) |
| Deuda comprometida | 20 | 20 |

- Regla de asesor: si `monthsCovered < 3` **y** cumpliste el aporte, la señal de fondo muestra sugerencia explícita: "considera desviar el próximo aporte a ahorro líquido hasta cubrir 3 meses (~$X)".
- Mantener tests: los umbrales viven hoy inline en `page.tsx`; extraer a `lib/health-score.ts` con tests (patrón `lib/technical.ts`).

### A5. IA v2 — contexto completo (cambios solo en `analyze-month/route.ts`)

Ampliar `payload` con: `monthly_invest_goal`, `invested_this_month`, `disposable_income` (ingreso − meta), `emergency_months`, `commit_ratio`, `savings_rate_6m`, `health_score`. Nuevos `type` en el schema: `invest_goal_at_risk`, `emergency_fund_priority`, `lifestyle_creep` (gasto variable subiendo N meses seguidos mientras el ingreso no), `cash_drag` (sobrante líquido acumulándose sin invertir ni rendir). Ajustar el system prompt: puede razonar sobre el *balance* gasto/inversión/colchón (sin recomendar instrumentos ni tickers — eso ya lo hace el motor técnico).

---

## Fase B — Mediano plazo, vista mensual+anual (3–6 semanas)

### B1. Vista anual: de "cuánto gasté" a "cuánto construí"

Hoy la vista anual es solo gastos. Agregar sección **Año en construcción**:

- Aporte acumulado del año vs meta anual ($12M): barra de progreso + meses cumplidos (grid 12 celdas ✓/✗/parcial).
- Evolución del patrimonio neto en el año (`net_worth_snapshots` ya existe, solo falta graficarlo aquí — hoy vive en la vista mensual).
- Tasa de ahorro+inversión promedio del año vs año anterior.

### B2. Proyección de patrimonio a 1/5/10 años

Card simple con interés compuesto: aporte mensual actual × retorno supuesto (editable, default 7% real) → "a este ritmo, a los 35 tendrías ~$XXM". Es el motivador más fuerte para un perfil joven; matemática pura, sin IA. Mostrar 3 escenarios (5%/7%/10%).

### B3. Costo de vida base (baseline)

Separar en la vista mensual: **fijo** (recurrentes) + **variable esencial** + **discrecional** (heurística: categorías marcadas por el usuario, default por nombre). KPI: "tu vida cuesta $X/mes" — el número que define cuánto necesita el fondo de emergencia y cuánto es realmente compresible.

### B4. Informe mensual de cierre (IA, narrativo)

Al cerrar cada mes, generar un resumen tipo asesor (3–4 frases, cacheado en `monthly_insights` con `type='month_review'`): qué pasó, qué cambió vs tu patrón, una recomendación para el próximo mes. Mostrarlo como primera card del mes cerrado. Reutiliza toda la infra de `analyze-month` (hash, cooldown, validación).

---

## Fase C — Largo plazo, anual (2–3 meses)

### C1. Metas anuales explícitas

Migración `financial_goals`: tipo (patrimonio objetivo, aporte anual, fondo de emergencia, tope de gasto anual en categoría X), monto, fecha. /analisis anual muestra progreso de cada meta; la IA las recibe en el payload y prioriza insights que las afecten.

### C2. Revisión anual asistida por IA (enero)

Informe generado una vez al año: distribución del ingreso del año (gasto/inversión/líquido), top 3 categorías que más crecieron, lifestyle creep detectado, cumplimiento de metas, y 3 propuestas concretas para el año siguiente (con montos). Entregado en la vista anual + correo (infra `notify-watchlist-digest` como referencia).

### C3. Unificar la foto: gasto + inversión + patrimonio

Hoy /analisis (gastos) e /inversiones (acciones) son mundos separados. Meta final: /analisis mensual abre con una fila única — *Gastaste $X · Invertiste $Y · Patrimonio $Z (Δ mes)* — y el health score v2 como resumen. Todo lo demás cuelga de esos tres números.

### C4. Alertas proactivas (scheduled)

Extender el cron diario: día 20 sin aporte registrado → push/email "te quedan N días para tu aporte"; proyección de gasto pisando la meta → aviso a mitad de mes (A3 pero push). Reutiliza `user_prefs` de notificaciones.

---

## Orden de implementación sugerido

1. **A1 + A2** (flujo 3 destinos + meta de aporte) — el cambio de mayor impacto/esfuerzo.
2. **A3 + A4** (presupuesto vs disponible + score v2, extrayendo `lib/health-score.ts` con tests).
3. **A5** (IA v2) — barato, gran salto en calidad de insights.
4. **B2** (proyección compuesta) — card autónoma, motivación inmediata.
5. **B1 → B4 → C** según uso real.

**Regla transversal:** cada fórmula nueva (flujo 3 destinos, score v2, proyección compuesta) va en `lib/` con test en vitest, siguiendo la convención del repo (`npx tsc --noEmit` + `npm test` antes de commit).
