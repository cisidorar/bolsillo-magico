# Plan de acción — mejoras adaptadas a Cas

_Creado: jul 2026. Perfil real: ingreso **$2.300.000** (sueldo fin de mes) · aporte inversión **~$1.000.000** (transferido a inicio de mes) · tope de gasto **<$900.000** con límites por categoría · CMR crédito (cierre ~24, pago hasta el 5 del mes siguiente) · Banco de Chile débito (pago inmediato) · residual **~$400.000/mes** que hoy queda en cuenta corriente sin registrar._

**Principio del plan:** cada fase conecta módulos que hoy viven separados (gasto ↔ tarjeta ↔ sueldo ↔ inversión ↔ patrimonio). Orden por dolor real, no por esfuerzo.

---

## Fase 1 — Ciclo de sueldo (el dolor de cada fin de mes)

> Responde: "de mi sueldo que llega, ¿cuánto ya está comprometido y cuánto me queda libre?"

1. **Migración `payment_due_day`** en `payment_methods` (día de pago del estado de cuenta; para CMR: 5). Hoy solo existe `billing_day` (cierre).
2. **Card "Ciclo de sueldo"** en `/inicio`:
   - Sueldo (payday) → − estado de cuenta CMR **real** del período cerrado (reutiliza `billingPeriod`/StatementView) → − aporte (`monthly_invest_goal`) → − débito estimado del mes (promedio 3m de gastos con métodos débito/efectivo) → **= queda para ahorro**.
3. **Alerta de vencimiento**: "quedan N días para pagar CMR ($454.733)" cuando `hoy > billing_day` y `hoy ≤ payment_due_day`. Badge en inicio; opcional email vía infra `notify-billing`.

_Esfuerzo: bajo-medio. Sin dependencias. Es la mejora #1 porque modela tu plata como funciona de verdad._

## Fase 2 — Cerrar el hoyo de los ~$400k

> Hoy $2.3M − $1M − <$900k deja ~$400k/mes que caen en "líquido" y desaparecen del patrimonio.

4. **Cuenta corriente como activo**: cuenta en `savings_accounts` con tasa 0% ("Cta. corriente Banco de Chile"). El patrimonio neto deja de subestimar y el flujo (surplus) por fin cuadra con el stock (Δ patrimonio) sin preguntarte nada.
5. **Regla de destino del sobrante** (card en pestaña Patrimonio): mientras fondo de emergencia < 3 meses → sugerir que el residual vaya a ahorro líquido; con 3+ meses cubiertos → sugerir subir `monthly_invest_goal` (ej. $1.2M–$1.4M). Conecta F2 (emergencia) con A2 (meta de aporte), que hoy no se hablan.
6. **Actualizar docs**: PLAN_ASESOR_FINANCIERO y FEATURES con el ingreso real ($2.3M) y este ciclo.

_Esfuerzo: bajo. Depende solo de que registres el saldo inicial de la cuenta._

## Fase 3 — F8: Calendario de flujo de caja (30 días) ✅ _Implementado jul 2026_

7. Vista "próximos 30 días" cruzando lo que ya existe: `payday` + `payment_due_day` (Fase 1) + `billing_day` de recurrentes + cierres de tarjeta. Timeline: cuándo entra el sueldo, cuándo vence CMR, cuándo salen los fijos, saldo proyectado entre medio. Vive en `/recurrentes?view=calendar` (y en desktop siempre visible), junto a `CalendarioPagos`.
   - `lib/cash-flow.ts` (`buildCashFlowTimeline`, `withinWindow`) + `lib/utils.ts` (`nextPaydayDate`) — con tests.
   - `components/FlujoCaja30d.tsx`: lista cronológica con saldo neto acumulado (no es el saldo bancario real, es el flujo proyectado de eventos conocidos) y alerta si el flujo proyectado cae en negativo en algún punto de los 30 días.
   - Nudges cuando falta configurar algo: payday en Ajustes, ingreso en /ingresos, día de pago de una tarjeta en /metodos.

_Esfuerzo: medio. Depende de Fase 1 (payment_due_day). Era el pendiente #1 de las auditorías previas._

## Fase 4 — Ritual de cierre de mes

8. **B4 — Informe de cierre (IA)**: al cerrar el mes, resumen tipo asesor (gastaste X · invertiste Y · patrimonio Δ Z · una recomendación), cacheado en `monthly_insights`, primera card del mes cerrado. Reutiliza infra de `analyze-month`.
9. **Email mensual enriquecido**: agregar a `notify-monthly-summary` la tasa de ahorro, cumplimiento del aporte y Δ patrimonio. Reconecta `month_sweeps` por el canal correcto (1 email/mes, no banner).

_Esfuerzo: medio. Independiente; ideal después de Fase 2 para que los números ya cuadren._

## Fase 5 — Conexiones de inversión

10. **P6 — Plata ociosa**: alerta cuando hay USD idle en billetera **y** `daily_decisions` tiene señal de compra activa; y depósito a plazo vencido hace N días sin reinvertir. Ambos datos existen, falta el cruce.
11. **UI de `target_price`** en watchlist (columna migrada hace meses, sin UI): fijar precio objetivo → badge al alcanzarlo.

_Esfuerzo: bajo. Independientes._

## Fase 6 — Refinamientos (cuando lo anterior esté en uso)

12. `credit_limit` en `payment_methods` → % de utilización de CMR (complementa "Ya comprometido").
13. Proyección por categoría en `/analisis` ("Comida cierra 20% sobre su límite si sigues así").
14. **B1 — "Año en construcción"** en vista anual: aporte acumulado vs $12M, grid 12 meses ✓/✗, patrimonio del año.
15. B3 — costo de vida base (fijo/esencial/discrecional) → dimensiona bien el fondo de emergencia.
16. Rentabilidad real UF/IPC en depósitos e inversiones.
17. P3 segunda mitad — `budget_period` global en `/analisis` y `/presupuesto` (sesión dedicada, archivo grande).

---

## Orden y regla transversal

**1 → 2** primero (una sesión cada una, impacto inmediato en tu ciclo real) → **3 → 4** → **5 → 6** según uso.

Toda fórmula nueva va en `lib/` con test vitest; validar con `npx tsc --noEmit` + `npm test` antes de commit. Migraciones nuevas en `supabase/migrations/` + verificar con `verify_setup.sql`.
