# Gstos — Features actuales y mejoras propuestas

## Stack

Next.js 15 App Router · Supabase (auth + Postgres + RLS + Storage) · TypeScript strict · Tailwind CSS · DeepSeek API

---

## Features actuales

### Gastos
- Registro de gastos con monto, descripción, categoría, método de pago y fecha
- Edición y eliminación de gastos existentes
- Selección rápida de fecha: hoy / ayer / anteayer + selector manual
- **Clasificación automática de categoría con IA** — al escribir la descripción, sugiere la categoría:
  1. Regla exacta aprendida (máxima confianza)
  2. Match difuso por primer token / contenido
  3. Similitud por embeddings (si hay key de OpenAI)
  4. Frecuencia en historial de 90 días
  5. DeepSeek fallback: clasifica usando las categorías del usuario + ejemplos reales de cada una
- Badge de confianza en la sugerencia: "regla guardada" / "historial" / "IA"
- Aprendizaje automático: al guardar, la descripción se guarda como regla para el próximo gasto similar (`category_rules`)

### Historial
- Lista de todos los gastos filtrable por mes
- Filtro por texto libre (búsqueda en descripción)
- Filtro por múltiples categorías simultáneas (comma-separated en URL)
- Collapsible por fecha con subtotal del día
- Modo **Por compra** (mes del gasto) y **Por facturación** (mes del estado de cuenta)
- Edición inline de cualquier gasto

### Análisis mensual
- **Salud financiera** (score 0–100) con 4 señales: gastos vs ingresos, tendencia vs mes anterior, categorías excedidas, proyección al cierre
- Gráfico de barras de gastos por categoría
- Comparación mes a mes (% + CLP absoluto) con lógica pro-rata para el mes en curso
- Vista anual: tabla de gastos mensual por categoría con minibarra de intensidad
- Drill-down por categoría con minigráfico de tendencia histórica
- **Oportunidades de mejora con IA**: 3 insights generados por DeepSeek analizando patrones del mes (gasto único atípico, categoría sobre presupuesto, suscripciones sin presupuesto, etc.)
  - Cache de 6 horas invalidado por hash de gastos
  - Rate limit de 10 minutos para evitar llamadas duplicadas
  - Badge "IA" cuando hay insights activos

### Recurrentes
- Gestión de gastos recurrentes: suscripciones, cuotas, anuales
- Tipos soportados: indefinido / N cuotas fijas / anual (mes específico)
- **Auto-registro automático**: en cada carga del dashboard, registra automáticamente los recurrentes con `auto_register = true` si corresponde al período actual
- Botón "Registrar ahora" manual por ítem
- Calendario de pagos visual con próximos vencimientos del mes
- Logo de servicio detectado automáticamente por dominio (Clearbit / Google Favicons)
- Cargo de administración opcional por método de pago (se registra automáticamente en el billing_day)

### Presupuesto
- Presupuesto global mensual con barra de progreso
- Presupuestos por categoría individuales
- Alerta visual cuando se supera el límite
- Comparación gasto real vs presupuesto por categoría

### Inversiones
- Acciones US con cotizaciones en vivo (Finnhub) e historial por ticker
- **Watchlist con señales técnicas** _(julio 2026)_: tickers favoritos sin posición (`watchlist`, migración `20260706_watchlist.sql`), panel expandible por ticker con RSI 14 (Wilder), SMA 20/50/200, cruces dorado/muerte, rango 52 semanas, soportes/resistencias por pivotes (`lib/technical.ts` — matemática determinista, cero IA) vía `/api/technical` (velas diarias Finnhub cacheadas 12h en `price_cache` con clave `{SYM}_D1Y`). Señales explícitamente informativas, con disclaimer. **Avisos solo in-app** (decisión jul 2026): badges de señales precargados al entrar — sin emails ni push por ahora. Doc completo y roadmap en `docs/WATCHLIST_TECNICO.md`
- **Depósitos a plazo**: CRUD completo con progreso al vencimiento, interés devengado lineal, próximos vencimientos y sección de vencidos _(julio 2026)_
- Cuentas de ahorro con TAE, interés compuesto diario y proyecciones 30d/12m
- Toggle compartido de 3 vistas (Acciones / Depósitos / Ahorro)

### Métodos de pago
- Creación de tarjetas de débito, crédito, efectivo y digital
- Día de facturación configurable por tarjeta (1–31)
- Vista de estado de cuenta por tarjeta (`/cuenta/[cardId]`) con movimientos agrupados por período
- Cargo de administración mensual por tarjeta

### Categorías
- Categorías personalizables con nombre, ícono (Lucide o emoji) y color
- Orden personalizable por drag implícito (sort_order)
- Ícono auto-detectado en las listas de gastos según descripción (`getExpenseIcon`)

### Notificaciones (Edge Functions en Supabase)
- **notify-billing**: alerta cuando se acerca el cierre de tarjeta de crédito
- **notify-budget**: alerta cuando se supera o está cerca del presupuesto mensual
- **notify-monthly-summary**: resumen mensual de gastos con HTML estilizado
- Configurables por usuario desde Ajustes (toggles por tipo)
- Programadas con pg_cron en Supabase

### Importación / Exportación
- **Importar CSV**: detección automática de columnas (fecha, monto, descripción, categoría, método), crea categorías faltantes automáticamente (cap 30), maneja múltiples formatos de fecha y monto
- **Exportar CSV**: rango de fechas configurable, columnas sanitizadas contra CSV injection

### Ajustes y perfil
- Nombre de display y foto de avatar (Storage de Supabase)
- Tema claro / oscuro sincronizado con Supabase
- Preferencias de notificaciones por tipo
- **Umbral de alerta de presupuesto configurable** (60/70/80/90%, antes fijo en 80%) — chips inline bajo el toggle; el edge function `notify-budget` respeta el umbral por usuario _(julio 2026)_
- **Día de sueldo** (`profiles.payday`): selector con días típicos chilenos (1/5/15/25/28/30) + campo custom; muestra cuenta regresiva "Sueldo en N días" en el inicio (desktop y mobile) y alimentará el calendario de flujo de caja (F8). Requiere `supabase/migrations/20260705_user_prefs.sql` _(julio 2026)_

### Seguridad (OWASP Top 10 auditado)
- Auth con JWT validado en cada request (no solo cookie)
- RLS en todas las tablas — los datos son del usuario
- Rate limiting en `/api/analyze-month` (10 min cooldown)
- Sanitización de inputs antes de enviar a la IA (anti prompt injection)
- Whitelist de enum fields antes de insertar en BD
- Cap de recursos en import (5 MB, 30 categorías auto)
- Errores internos no se exponen al cliente

---

## Mejoras propuestas

### Alta prioridad

**~~1. Ingresos reales por mes~~** ✅ _Implementado junio 2026_
Vista `/ingresos` con KPIs (ingreso actual, promedio 6m, variación, meses sin registrar), editor con desglose por fuente ("¿de dónde viene?"), badge calza/no calza, historial con sparklines. Lógica de surplus corregida para sueldo pagado a fin de mes (sueldo de mayo financia gastos de junio).

**2. Metas de ahorro**
Hoy el presupuesto solo define un tope de gasto. Agregar metas ("quiero ahorrar $200.000 este mes") con progreso visual daría un objetivo positivo, no solo un límite. Tabla: `savings_goals(user_id, name, target_amount, month, year)`.

**3. Múltiples usuarios / familia**
Hoy todo está aislado por `user_id`. Un modo "hogar compartido" donde dos usuarios ven los mismos gastos requeriría un concepto de `household_id` con RLS ajustada. Útil para parejas o flatmates.

**4. Widget de ingreso rápido desde inicio**
El FAB abre el sheet completo. Un modo ultra-rápido (solo monto + categoría, sin descripción ni fecha) para registrar algo en 2 taps reduciría la fricción en el uso diario mobile.

### Media prioridad

**5. Adjuntar foto de boleta**
Supabase Storage ya está habilitado (para avatares). Permitir subir una imagen a cada gasto y guardar la URL en `expenses.receipt_url`. Útil para gastos de trabajo o garantías.

**6. Tags y notas en gastos**
La columna `tags` ya existe en el schema (text[]) pero no hay UI. Agregar un campo de tags y notas permitiría filtrar historial por proyecto, viaje, etc.

**7. Split de gastos**
Registrar un gasto compartido con otra persona: "pagué $50.000, me deben $25.000". Una tabla `splits` con el estado de deuda y quién debe cuánto.

**8. Exportar a PDF**
El CSV ya existe. Un PDF formateado del estado de cuenta mensual (como el email de notify-monthly-summary pero descargable) sería útil para contabilidad o reembolsos.

**9. Proyección por categoría**
La proyección al cierre existe a nivel total. Mostrar en el análisis qué categorías van a cerrar sobre presupuesto si el ritmo continúa, con días restantes del mes.

**10. Comparar dos meses manualmente**
Hoy siempre compara vs el mes anterior. Un selector "comparar con" permitiría elegir cualquier mes histórico como base de comparación.

### Baja prioridad / futuro

**11. Integración bancaria (Open Banking)**
Importar movimientos automáticamente desde el banco vía scraping o API (Fintoc en Chile soporta esto para algunos bancos). Eliminaría el registro manual.

**12. Clasificación retroactiva con IA**
Un botón "clasificar todos mis gastos sin categoría con IA" que procese en batch los gastos que quedaron en "Sin categoría". Útil después de una importación CSV masiva.

**13. Modo viaje / presupuesto temporal**
Un presupuesto con fecha de inicio y fin (no mensual) para vacaciones o eventos. Separado del presupuesto mensual normal.

**14. Notificaciones push (PWA)**
Las notificaciones hoy son por email. Web Push permitiría alertas instantáneas en mobile sin email. Requiere service worker + push subscription.

**15. Dashboard público / embeddable**
Un link compartible de solo lectura del resumen mensual (sin auth) para mostrar a un contador o socio.

---

## Mejoras de metodología financiera (análisis especialista, jul 2026)

Estas propuestas no son features sueltas: apuntan a las variables que un asesor financiero mira primero. Hoy la app controla muy bien el **gasto**, pero las tres palancas que realmente construyen patrimonio —**tasa de ahorro, patrimonio neto y deuda comprometida a futuro**— están ausentes o desconectadas. Ordenadas por impacto/esfuerzo (la data necesaria en su mayoría **ya existe** en el schema).

### 🔴 Impacto máximo — reutiliza data existente

**~~F1. Tasa de ahorro (savings rate) histórica~~** ✅ _Implementado julio 2026 — sección "Construcción de patrimonio" en /analisis (`components/PatrimonioCards.tsx`)_
La métrica #1 predictora de resultado financiero a largo plazo. Hoy `surplus = ingreso mes anterior − gastos` es un número puntual que no se acumula ni historiza. Guardar el surplus mensual y mostrar la **tasa de ahorro (% del ingreso no gastado) con promedio móvil de 6/12 meses**. Un mes puede estar "en verde" bajo presupuesto y ahorrar 0%. Data: ya está en `incomes` + `expenses`.

**~~F2. Fondo de emergencia en "meses cubiertos"~~** ✅ _Implementado julio 2026 — card junto a tasa de ahorro en /analisis_
Primer hito que recomienda cualquier asesor antes de invertir (regla 3–6 meses de gasto). Conectar `savings_accounts` (saldo líquido) con el gasto promedio mensual que ya se calcula → mostrar **cuántos meses de gasto cubren los ahorros**. Cálculo trivial, muy motivante. Data: ya existe.

**~~F3. Deuda comprometida a futuro~~** ✅ _Implementado julio 2026 — card "Ya comprometido" en /analisis: 6 meses futuros con barras apiladas (cuotas/fijos + tarjeta por facturar vía `billingPeriod`), ratio vs ingreso (semáforo 20/35%), desglose y aviso de mes en que se libera plata. La tasa de ahorro del mes en curso muestra la **proyección al cierre** (la tasa cruda al día 5 era engañosa)_
Las cuotas ya se registran (`total_installments`, `paid_installments`) pero solo mes a mes. Panel "Ya comprometido" que sume **cuotas pendientes + recurrentes por cada mes futuro**, más la ratio **deuda comprometida / ingreso mensual** (semáforo sobre ~35%). Diferencia entre "me queda plata" y "me queda plata que ya debo". Data: ya está en `recurring_expenses`.

### 🟠 Impacto alto — requiere modelo de datos nuevo mínimo

**~~F4. Patrimonio neto en el tiempo~~** ✅ _Implementado julio 2026 — card en /analisis con snapshot mensual automático (`net_worth_snapshots`), gráfico de evolución y desglose acciones/depósitos/ahorro. Requiere aplicar `supabase/migrations/20260705_net_worth_snapshots.sql`_
Ya se registran acciones, depósitos a plazo y cuentas de ahorro por separado, pero falta la vista de **patrimonio neto total y su evolución mensual**. Probablemente el gráfico más adictivo y valioso de la categoría. Requiere un snapshot mensual de activos (`net_worth_snapshots`). 

**~~F5. Rebalancear el health score para premiar el ahorro~~** ✅ _Implementado julio 2026 — nuevo mix: tasa de ahorro (30) · fondo de emergencia (25) · disciplina de presupuesto (25) · deuda comprometida (20). Señales faltantes puntúan neutral (no castigan por no registrar). Las 4 tarjetas de señales y los textos de resumen se reescribieron acorde_
Las 4 señales actuales son 100% defensivas (castigan gastar de más); ninguna premia ahorrar o invertir. Nuevo mix propuesto: **tasa de ahorro (30) · fondo de emergencia en meses (25) · deuda comprometida/ingreso (20) · disciplina de presupuesto (25)**. Convierte el score de "¿me pasé?" a "¿estoy construyendo patrimonio?".

### 🟡 Impacto medio — mejora conceptual del marco

**F6. Presupuesto con marco necesidades/deseos/ahorro (50/30/20)**
El presupuesto hoy es un tope plano por categoría. Agregar un flag `budget_type` en `categories` (necesidad / deseo / ahorro) permite mostrar el **mix real vs el ideal 50/30/20** — mucho más accionable que un monto por categoría.

**F7. Retorno real ajustado por inflación / UF en inversiones**
En Chile es casi obligatorio: un depósito al 12% con IPC 4% rinde 8% real; mostrar solo la tasa nominal engaña. Usando `annual_rate` + serie UF/IPC (vía `price_cache`), mostrar **rentabilidad real** en el módulo de inversiones.

**F8. Calendario de flujo de caja (timing de liquidez)**
Distinto del presupuesto: previene sobregiros por *timing*. Con las fechas de sueldo, recurrentes y cierres de tarjeta ya conocidas, anticipar "el 5 tienes $X, pero el 8 se van $Y en cuotas".

### Orden de ejecución sugerido

1. **F1 + F2** (tasa de ahorro + fondo de emergencia) — máximo impacto, mínimo esfuerzo, data existente.
2. **F3** (deuda comprometida) — resuelve un dolor real chileno con data existente.
3. **F4** (patrimonio neto en el tiempo) — la métrica más motivante.
4. **F5** (rebalancear health score) — una vez que F1–F4 aportan las señales nuevas.

---

## Revisión de lógica entre features (jul 2026)

Auditoría de cómo interactúan F1–F5 entre sí y con el resto de la app. Detalle completo en `revision-logica-gstos.md` (generado en la sesión). Resumen:

### Inconsistencias detectadas

1. **El "período" no es un concepto global.** `profiles.budget_period` (calendario vs facturación) solo lo respeta `/inicio`. `/analisis` (health score, tasa de ahorro, categorías excedidas) siempre usa mes calendario; `/presupuesto` usa el período de facturación de la tarjeta default sin mirar la preferencia. Con modo billing activo, inicio y análisis muestran totales distintos para "este período".
2. **Fallback de presupuesto distinto entre páginas.** `/inicio` usa `thisBudget ?? allBudgets[0]`; `/analisis` solo el mes exacto. Mismo dato, dos verdades.
3. **"Patrimonio neto" no es neto.** `computeAndSnapshotNetWorth` suma activos (stocks + depósitos + ahorro + USD) pero nunca resta `cuotasPendingTotal` + tarjeta por facturar (F3), calculados en la misma página. Un usuario con $10M en activos y $4M en cuotas ve "$10M de patrimonio". ⇒ **P1 original (jul 2026) restaba esto solo en la UI (`PatrimonioCards`), sin persistirlo — el histórico y el gráfico de evolución seguían siendo brutos. Corregido de verdad en la iteración 3 (ver abajo): ahora se persiste `debt_clp`/`net_clp` en cada snapshot.**
4. **Flujo y stock desconectados.** La tasa de ahorro (F1) dice "sobraron $X" pero nada verifica que el sobrante haya aterrizado en un activo — la app no reconcilia surplus acumulado vs Δ patrimonio.
5. **Snapshot de patrimonio se congela mal sin FX.** Si `USDCLP` no está en `price_cache`, las acciones aportan $0 al total pero el snapshot igual se guarda si `total_clp > 0`; el histórico queda subvalorado permanentemente (los meses pasados están congelados por diseño). ⇒ **Resuelto, ver abajo.**
6. **Riesgo de doble conteo de interés en cuentas de ahorro.** El interés se calcula desde `start_date` sobre el balance actual; si el usuario actualiza el balance (incluyendo interés ya ganado) sin resetear `start_date`, el interés se cuenta dos veces.
7. **Depósitos vencidos = plata ociosa invisible.** Quedan como capital+interés en el patrimonio indefinidamente, sin alerta de "N días sin reinvertir". ⇒ **Fondo de emergencia (F2) corregido para contarlos como líquidos, ver abajo.**
8. **Cargo de administración rompe el cuadre por categoría.** Se inserta con `category_id: null`, no aparece en `byCat` pero sí en el total del mes — la suma de categorías nunca cuadra con el total.
9. **Timezone en auto-register.** Usaba `new Date()`/`toISOString()` (UTC) en vez de `getNowChile()`; entre ~20:00–00:00 hora Chile la fecha UTC ya es "mañana", desalineando fechas y dedup. ⇒ **Resuelto, ver abajo.**
10. **Fondo de emergencia subestimaba liquidez.** Solo contaba `savings_accounts`, ignorando depósitos a plazo ya vencidos (líquidos en la práctica). ⇒ **Resuelto, ver abajo.**

### Cambios ejecutados (jul 2026)

- **P1 — Patrimonio neto real (UI, jul 2026)**: `PatrimonioCards` muestra el neto real (bruto − deuda comprometida) junto al bruto. *Nota: esto solo afectaba la UI, no lo que se persistía — ver corrección real en "Iteración 3" más abajo.*
- **Fix timezone auto-register**: `runAutoRegister()` usa `getNowChile()` en vez de `new Date()` UTC.
- **Fix snapshot sin FX**: no se hace upsert del snapshot mensual cuando hay posiciones de acciones sin precio en caché (`stocksPriced === false`), para no congelar un mes subvalorado.
  - **Corrección posterior (jul 2026)**: la condición original marcaba `stocksPriced = false` también cuando el usuario NO tenía acciones pero sí billetera USD sin `USDCLP` en caché — bloqueando para siempre el snapshot de usuarios sin acciones (ej: solo ahorro + billetera USD), ya que nadie abre `/inversiones` (Acciones) para poblar ese precio. La billetera USD ya tenía un fallback razonable (costo en CLP), no es un hueco real. Ahora `stocksPriced` solo se marca false por acciones efectivamente sin precio.
- **Fix fondo de emergencia**: `monthsCovered` (F2) ahora suma depósitos a plazo vencidos (líquidos) a `savings_accounts`.
- **Fix cargo de administración sin categoría**: `auto-register.ts` ahora usa (o crea) una categoría "Comisiones" en vez de `category_id: null`, para que el cargo aparezca en los desgloses por categoría y el total cuadre.
- **P3 (parcial) — Fallback de presupuesto unificado**: `/analisis` usaba solo el presupuesto del mes exacto; ahora aplica el mismo fallback que `/inicio` y `/presupuesto` (mes exacto → presupuesto más reciente registrado). Resuelve el hallazgo #2 (dos verdades para el mismo dato).
  - La otra mitad de P3 (que `/analisis` y `/presupuesto` respeten `budget_period` — calendario vs. facturación — como ya hace `/inicio`) queda **pendiente**: requiere rehacer los rangos de fecha de prácticamente todas las métricas de `/analisis` (health score, tasa de ahorro, categorías excedidas, comparación mes a mes), el archivo más grande y sensible de la app (2000+ líneas). Se deja documentado para abordar en una sesión dedicada con más margen de testing manual.

- **P2 — Sweep de cierre de mes** _(banner desactivado en `/inicio` por pedido del usuario, jul 2026)_: la infraestructura queda montada (tabla `month_sweeps` vía migración `20260718_month_sweeps.sql`, server action `recordMonthSweep` en `app/actions/month-sweep.ts`, componente `components/MonthSweepBanner.tsx`) pero ya no se renderiza en `/inicio` — el fetch y cálculo del sobrante también se quitaron de esa página. Reconectar cuando se decida el approach correcto para avisar del sobrante sin ser intrusivo.
- **P4 — Metas de ahorro que derivan el límite de gasto**: `SavingsGoalHelper` en `/presupuesto` — con el ingreso promedio de 6 meses cerrados (`incomes`), calcula "quiero ahorrar $Z → tu límite sería ingreso−Z" y lo aplica con un tap a `budgets` (reutilizando el mismo upsert que `MonthlyBudgetInput`). Avisa si el resultado queda por debajo del piso comprometido (`committedFloor`).
- **P5 — Patrimonio en `/inicio`**: mini-card de patrimonio (total + Δ del mes) en el dashboard diario, hoy 100% enfocado en gasto.
- **P6 — Alerta de plata ociosa**: depósito vencido hace N días sin reinvertir + saldo USD idle cuando la watchlist tiene señal de compra activa.
- **P7 (F8) — Calendario de flujo de caja**: cruzar `payday`, `billing_day` de recurrentes y cierres de tarjeta para anticipar sobregiros por timing.
- **P8 (F7) — Rentabilidad real (UF/IPC)** en depósitos e inversiones.
- **P9 (F6) — Mix 50/30/20** (`budget_type` en categorías) para diagnóstico estructural del gasto.
- Pendiente menor: acción "capitalizar" interés en cuentas de ahorro (hallazgo #6, para no arriesgar doble conteo si el usuario actualiza el balance manualmente).
- Pendiente: la otra mitad de P3 — que `/analisis` y `/presupuesto` respeten `budget_period` (calendario vs. facturación) — ver nota arriba.

### ⚠️ Requiere aplicar migraciones nuevas antes de usar en producción

- `supabase/migrations/20260718_month_sweeps.sql` (P2). Correr `supabase/verify_setup.sql` para confirmar.

---

## Iteración 2 — revisión de flujos restantes (jul 2026)

Segunda pasada sobre los flujos no auditados en la iteración 1: `/historial`, `/cuenta/[cardId]`, `/recurrentes`, `/ajustes`, calendario de pagos, watchlist y edge functions de notificaciones.

### Bugs de interacción corregidos en esta iteración

- **Recurrentes anuales marcados "atrasados" 11 meses al año**: el filtro de atrasados en `/recurrentes` no miraba `billing_month` (a diferencia de `/inicio`, que sí lo hace — lógica duplicada que divergió). Un seguro anual de marzo aparecía atrasado de abril a diciembre. Corregido: los anuales solo pueden estar atrasados en su mes.
- **"Próximo cargo" mostraba anuales en el mes equivocado**: `nextBillingDate` ignoraba `billing_month`. Ahora los anuales apuntan a su próxima ocurrencia real (su mes, este año o el próximo).
- **"Carga mensual" inflada por anuales**: el KPI sumaba los anuales completos cada mes (un seguro de $600.000 inflaba la carga mensual en $600.000 y el "anual estimado" en $7,2M). Ahora los anuales se prorratean (÷12) en la carga mensual y se suman una sola vez en el anual estimado.
- **Calendario de pagos mostraba anuales los 12 meses**: `CalendarioPagos` no filtraba por `billing_month` — el ítem aparecía (y sumaba al "total programado") en todos los meses. Corregido.
- **`currentStatementRange` usaba hora UTC**: el helper compartido (usado por `/inicio` en modo billing y `/cuenta/[cardId]`) calculaba "hoy" con `new Date()` — cerca de medianoche hora chilena el período abierto podía saltar un mes. Ahora usa `getNowChile()` (mismo fix que auto-register).

### Roadmap priorizado por valor (consolidado, iteración 1 + 2)

Orden por (impacto en decisiones del usuario × frecuencia de uso) / esfuerzo:

**1. 🔴 F8 — Calendario de flujo de caja** _(el pendiente de más valor)_
Todos los insumos ya existen: `payday` (+ último día hábil), `billing_day` de cada recurrente, cierres de tarjeta, y ahora `month_sweeps`. Cruzarlos en una vista "los próximos 30 días": cuándo entra el sueldo, cuándo salen los fijos, cuánto queda disponible entre medio. Previene el sobregiro por timing — el dolor que ninguna otra vista cubre. Encaja natural en `/recurrentes?view=calendar` (extender el calendario existente) o como card en `/inicio`.

**2. 🔴 Resumen mensual por email enriquecido (reconecta P2 sin banner)**
`notify-monthly-summary` hoy es solo gasto. Agregarle: tasa de ahorro del mes cerrado, Δ patrimonio, y el CTA "¿a dónde fue el sobrante?" con deep-link que registre en `month_sweeps`. Es el canal correcto para el sweep (1 email al mes, no un banner diario) y convierte el email en el ritual de cierre de mes. La infraestructura de P2 ya está montada y sin uso.

**3. 🟠 P5 — Patrimonio en `/inicio`**
Mini-card (neto real + Δ mes). El dashboard diario es 100% gasto; lo que se ve a diario, crece. Esfuerzo bajo: `computeAndSnapshotNetWorth` ya existe, solo falta llamarlo en inicio (considerar el costo de queries — cachear o mostrar solo si hay activos).

**4. 🟠 Límite de cupo por tarjeta + % de utilización**
`/inicio` muestra "Cupo usado" pero no existe campo de cupo total en `payment_methods` — el número no tiene contexto. Agregar `credit_limit` (migración simple) habilita: % de utilización, alerta de cupo alto, y mejora la card de estado de cuenta. Complementa la deuda comprometida (F3).

**5. 🟠 P6 — Alerta de plata ociosa**
Depósito vencido hace N días sin reinvertir (dato ya existe) + saldo USD idle en billetera cuando la watchlist tiene señal de compra activa (ambos datos existen, falta el cruce). Es la conexión inversiones↔señales que hoy no existe.

**6. 🟡 Precio objetivo en watchlist (UI faltante)**
`watchlist.target_price` está migrado hace meses pero sin UI (documentado en WATCHLIST_TECNICO.md). Completar el círculo: fijar precio objetivo → badge in-app cuando se alcanza. Esfuerzo bajo, feature a medio terminar.

**7. 🟡 Proyección por categoría** _(backlog #9)_
"Si sigues así, Comida cierra 20% sobre su límite" — la proyección global ya existe, falta por categoría en `/analisis`. Hace accionables los límites por categoría a mitad de mes, no cuando ya se excedieron.

**8. 🟡 P8 (F7) — Rentabilidad real (UF/IPC)** en depósitos e inversiones.

**9. 🟡 P9 (F6) — Mix 50/30/20** (`budget_type` en categorías).

**10. ⚪ P3 (segunda mitad) — `budget_period` global** en `/analisis` y `/presupuesto`. Alto esfuerzo (rehace los rangos de casi todas las métricas del archivo más grande); hacerlo en sesión dedicada.

**11. ⚪ Menores**: acción "capitalizar" interés en cuentas de ahorro; widget de ingreso rápido 2-taps (backlog #4); tags UI (backlog #6, columna ya existe); unificar la lógica de "atrasados" en un helper compartido (hoy vive duplicada en `/inicio` y `/recurrentes` y ya divergió una vez — causa raíz del bug de anuales).

---

## Iteración 3 — el patrimonio neto histórico era bruto (jul 2026)

Tercera pasada de auditoría (`revision-logica-gstos-iteracion3.md`), verificada línea a línea contra el código. Confirmó que **P1 nunca se implementó de verdad**: la resta de deuda vivía solo en `PatrimonioCards` (UI); `computeAndSnapshotNetWorth` seguía persistiendo el bruto en `net_worth_snapshots`, así que el histórico y el gráfico de evolución medían bruto — comprar en cuotas inflaba la curva, pagar deuda no la movía, y como los meses pasados quedan congelados por diseño, cada mes sin el fix era historia neta perdida para siempre.

### Cambios ejecutados

- **Fix real de P1**: `computeAndSnapshotNetWorth` (`lib/net-worth.ts`) ahora calcula la deuda comprometida internamente (`computeCommittedDebt`, misma fórmula que "Ya comprometido": cuotas pendientes + tarjeta por facturar próximos 6 meses) y persiste `debt_clp`/`net_clp` en cada snapshot — migración `20260719_net_worth_debt.sql` (columnas nullable; los snapshots previos a este fix no se recalculan). `/analisis` le pasa su `committedDebtTotal` ya calculado con más detalle (evita duplicar la ventana de cálculo y que ambos números diverjan); si no se pasa (ej. desde el cron), se calcula solo.
- **Snapshot desacoplado de la visita a `/analisis`**: `app/api/cron/sync-prices/route.ts` ahora corre `computeAndSnapshotNetWorth` para todos los usuarios con datos de patrimonio (acciones, ahorro, depósitos o billetera USD) **todos los días**, incluso fines de semana/feriados NYSE (a diferencia del sync de precios de acciones) — el usuario puede ahorrar o pagar cuotas cualquier día. También refresca `USDCLP` en `price_cache` vía Frankfurter antes de snapshotear (antes solo se refrescaba cuando alguien abría `/inversiones`, dejando el snapshot del cron sin FX fresco).
- **KPI "Ahorro" de `/inicio` renombrado**: título dinámico ("Disponible" cuando hay presupuesto, "Gasto vs. anterior" en el fallback) para no chocar con la tasa de ahorro real (ingreso − gasto) de `/analisis` e `/ingresos` — antes ambos podían mostrar números contradictorios el mismo día bajo el mismo nombre "Ahorro".
- **Proyección de fin de mes consciente del calendario de recurrentes**: antes prorrateaba el gasto TOTAL como si se repitiera a diario (`total/díasTranscurridos × díasDelMes`) — un fijo grande (arriendo, seguro) que cae temprano en el mes inflaba brutalmente la proyección de la primera quincena. Ahora solo se prorratea el gasto variable; los fijos (`recurringSpentSoFar` ya registrados + `fixedStillDueThisMonth` los que faltan por registrar este mes, vía `activeRecurring`) se suman una sola vez con su monto real. Afecta en cascada: proyección mostrada, tasa de ahorro proyectada (`projectedRate`), health score (`sAhorro`, `sDisciplina`/`projInflatedByTop`) y la alerta de presupuesto.

- **Fallback CLP de billetera USD ya no sobrevalora**: sin `USDCLP` en caché, antes sumaba `total_paid_clp` de TODOS los aportes históricos sin descontar lo ya invertido en acciones (`wallet_cost_usd`) — esa plata se contaba dos veces (como caja y como acción). Ahora valoriza `totalUsdCash` (ya neto en USD) a la tasa CLP/USD **promedio histórica** de los depósitos (`Σ total_paid_clp / Σ usd_amount` de `kind='deposit'`), no a un monto absoluto de todos los movimientos.
- **`catsDentro`/`catsExcedidas` de `/inicio` ya no premian no definir límites**: antes una categoría SIN límite contaba como "dentro" (podía leerse "8 de 10 dentro" con solo 3 categorías realmente acotadas). Ahora el resumen rápido solo considera categorías CON límite definido, y el denominador dice "de N con límite" en vez del total de categorías.
- **Ventana de gracia para `debt_clp` del mes recién cerrado**: el usuario no registra gastos a diario — a veces carga la semana completa de una vez, fechada al día real de cada gasto. Eso significa que al cerrar un mes, los gastos con tarjeta de la última semana podían no estar cargados todavía, y el snapshot de deuda de ese mes se congelaba subestimándola justo en el peor momento. `reconcileClosedMonthDebt` (`lib/net-worth.ts`) corre en el cron durante los primeros 10 días del mes siguiente y recalcula SOLO `debt_clp`/`net_clp` (nunca los activos, que si se recalcularan usarían la fórmula de interés con la fecha de HOY, inyectando interés futuro en un mes ya cerrado) del mes anterior, con lo que ya se haya cargado tarde.

### Pendiente de la iteración 3 (no ejecutado en esta pasada)

- Reconciliación surplus ↔ Δ patrimonio: se implementó y luego se retiró a pedido del usuario (`components/SurplusReconciliation.tsx`, jul 2026) — no preguntar al usuario dónde fue el sobrante. `month_sweeps`/`recordMonthSweep` quedan montados y sin uso, como estaban antes de esta iteración.
- Insights de IA con señales de patrimonio (tasa de ahorro, fondo de emergencia, Δ patrimonio) en el contexto — hoy `analyze-month` tiene prohibido hablar de inversión.
- `/presupuesto` sigue ignorando `budget_period`/`period_card_id` (usa la tarjeta de crédito default sin mirar la preferencia del usuario).
- Menores restantes: `credit_limit` en `payment_methods` para % de utilización; acción "capitalizar" interés en ahorro (doble conteo si se actualiza el balance sin resetear `start_date`); F8 calendario de flujo de caja.

Detalle completo con roadmap priorizado en `revision-logica-gstos-iteracion3.md`.

---

_Última actualización: julio 2026 — análisis de metodología financiera agregado (F1–F8); revisión de lógica entre features y tres rondas de correcciones: (1) patrimonio neto real (UI), timezone, snapshot FX, fondo de emergencia; (2) fallback de presupuesto unificado, categoría en cargo de administración, P4 (meta de ahorro → límite) y P2 (sweep de cierre de mes); (3) patrimonio neto real historizado de verdad (persistido, no solo en UI) + snapshot automático desde el cron + KPI "Ahorro" desambiguado_
