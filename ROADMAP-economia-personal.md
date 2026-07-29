# Roadmap — Economía personal (gastos, presupuesto, compromiso)

Revisión de julio 2026 del lado "economía" de la app (todo menos inversiones,
que ya tiene su propio roadmap en `ROADMAP-largo-plazo-inversiones.md`).

**Perfil que guía las decisiones:** uso personal, Chile (CLP, tarjetas con
ciclo de facturación, vida en cuotas), poco conocimiento financiero, y una
restricción explícita: **no agobiar**. Eso sesga el roadmap hacia features que
*responden una pregunta* en vez de agregar otro dashboard. Cuando una idea
implicaba "más números en pantalla" sin resolver una decisión concreta, quedó
fuera (ver "Descartado" al final).

---

## Lo que ya existe (para no reinventar)

La app está mucho más completa de lo que su tamaño sugiere. Ya cubre:

| Área | Qué hay |
|---|---|
| **Gastos** | Registro rápido, categorías propias, métodos de pago con logo, historial con búsqueda por texto + filtro multi-categoría + paginación, import/export CSV, auto-categorización con reglas aprendidas (`category_rules`) |
| **Presupuesto** | Global y por categoría, período calendario **o** de facturación, límite derivado de una meta de ahorro (`SavingsGoalHelper`), presupuesto juzgado contra el disponible real (ingreso − meta de aporte) |
| **Recurrentes** | Suscripciones, cuotas (`total_installments`/`paid_installments`), cobros anuales, auto-registro idempotente, alerta de atrasados |
| **Tarjetas** | Ciclo de facturación completo (abierto / cerrado / vencido — tres funciones distintas), cupo usado, estado de cuenta, día de vencimiento de pago |
| **Ingresos** | Mensual con desglose por fuente, día de sueldo (incl. último día hábil) |
| **Análisis** | Vista mensual / anual / patrimonio, health score v2 (0–100), insights IA, oportunidades de mejora, proyección a interés compuesto, flujo de caja 30 días, ciclo de sueldo, sweep de cierre de mes |
| **Patrimonio** | Acciones, billetera USD, depósitos a plazo, cuentas de ahorro, deuda comprometida, snapshots mensuales |
| **Avisos** | 6 correos (cierre de tarjeta, presupuesto, resumen mensual, recurrentes, watchlist, informe semanal) |

Las brechas de abajo son las que quedaron después de descartar todo lo anterior.

---

## E1 · Monitor de avisos — saber que las notificaciones están vivas ✅ Implementado

**Prioridad: alta · Esfuerzo: bajo**

**El problema, con evidencia de hoy.** Llegaste al 91% del presupuesto de julio
sin haber recibido nunca el aviso del 80%. La causa fue un bug en las 6 Edge
Functions (ya corregido, commit `8377ae0`): se marcaba el aviso como enviado en
`notification_log` *antes* de confirmar el envío, así que un fallo de Resend
quemaba el `ref_key` y bloqueaba los reintentos del resto del mes.

Lo importante no es el bug — es que **estuvo roto semanas y no había forma de
notarlo**. Un sistema de alertas que falla en silencio es peor que no tener
alertas, porque genera confianza falsa: dejas de mirar el presupuesto porque
"ya me van a avisar".

**Qué hacer.** En `/ajustes` → Notificaciones, junto a cada toggle, la fecha del
último envío real:

> Alertas de presupuesto · último aviso: **14 jul**
> Cierre de tarjeta · último aviso: **26 jul**
> Resumen mensual · último aviso: **1 jul**

Y un chip gold si un aviso lleva más de lo esperado sin dispararse teniendo la
condición cumplida (ej. presupuesto sobre el umbral y sin envío en el mes).

**Dónde va.** `components/NotificationPrefs.tsx`. Los datos ya están en
`notification_log`, que además ya tiene la policy RLS de `select` para el propio
usuario (`migration_notifications.sql:23`) — no hace falta migración ni tocar
las Edge Functions.

---

## E2 · "Qué tengo comprometido" — la línea de tiempo de cuotas ✅ Implementado

**Prioridad: alta · Esfuerzo: medio-bajo**

**El problema.** `computeCommittedDebt()` (`lib/net-worth.ts:68`) ya calcula
cuánta plata futura está comprometida en cuotas pendientes y estados de cuenta
por vencer, y el health score te penaliza por ello. Pero ese número solo existe
*dentro* del score: no hay ninguna pantalla que responda las dos preguntas que
uno realmente se hace en Chile:

1. De mi próximo sueldo, **¿cuánto ya está gastado antes de que llegue?**
2. **¿Cuándo se me libera plata?** (la última cuota del notebook, del dentista…)

La segunda es la más motivante y hoy es invisible: hay que abrir cada recurrente
y restar `paid_installments` de `total_installments` a mano.

**Qué hacer.** Una card en `/recurrentes`, arriba del Flujo de caja 30 días:
barras de los próximos 12 meses con el total comprometido de cada uno (cuotas
pendientes + fijos indefinidos + estado de cuenta proyectado), y un marcador
mint en los meses donde termina una cuota:

> **Noviembre** — se te liberan $85.000/mes (última cuota de *Notebook*)

Debajo, una línea: *"De tu sueldo de agosto, $312.000 ya están comprometidos
(38%)"*.

**Dónde va.** Nueva card en `app/(dashboard)/recurrentes/page.tsx` + un
`lib/committed-timeline.ts` con su `.test.ts` (la lógica de proyectar cuotas mes
a mes tiene bordes: cuotas que arrancan a mitad de mes, `billing_month` anual,
recurrentes desactivados). El grueso del cálculo se puede extraer de
`computeCommittedDebt`, que hoy devuelve un solo escalar en vez de la serie.

---

## E3 · Metas de ahorro con nombre y fecha ✅ Implementado (con ajuste de alcance)

**Prioridad: alta · Esfuerzo: medio**

> Nota post-implementación: el destino "meta" en el sweep de cierre de mes no
> se integró — `MonthSweepBanner.tsx` existe en el repo pero no está montado
> en ninguna página (hallazgo, no bug introducido acá). El resto de E3 (tabla
> `savings_goals`, progreso, cuota mensual necesaria, fecha proyectada) está
> completo en `components/SavingsGoalsManager.tsx` dentro de `/presupuesto`.

**El problema.** Hoy la app tiene una *tasa* de ahorro, un fondo de emergencia
medido en meses de cobertura, y una meta mensual de aporte a inversión. Todo
abstracto. No existe *"quiero juntar $900.000 para cambiar el notebook en
diciembre"*.

Eso deja dos cosas cojas:

- El **sweep de cierre de mes** (`MonthSweepBanner`) te pregunta qué hacer con
  el sobrante y las opciones son genéricas (`saved` / `wallet_usd` /
  `kept_liquid`). Sin una meta con nombre, guardar plata no se siente como
  avanzar hacia algo.
- El `SavingsGoalHelper` deriva el presupuesto de una meta de ahorro, pero esa
  meta se evapora: no queda registrada como objetivo con progreso.

**Qué hacer.** Tabla nueva `savings_goals` (`name`, `target_amount`,
`target_date`, `icon`, `color`, y opcionalmente `savings_account_id` para que el
progreso se lea solo del saldo real en vez de a mano). Por meta:

- % avanzado y cuánto falta
- **cuánto mensual hace falta para llegar a tiempo** — y si eso cabe en tu tasa
  de ahorro actual (gold si no cabe, con la fecha realista alternativa)
- destino elegible en el sweep de cierre de mes

**Dónde va.** Migración nueva + `components/SavingsGoalsManager.tsx`, con
entrada desde `/presupuesto`. La aritmética (cuota mensual necesaria, fecha
alcanzable dada la tasa actual) va en `lib/savings-goals.ts` con tests.

---

## E4 · Simulador "¿me lo puedo comprar?" ✅ Implementado

**Prioridad: alta · Esfuerzo: medio**

**El problema.** Este es el que mejor calza con "poco conocimiento, no
agobiar". Todo lo necesario para responder *"¿puedo comprar esto?"* ya está
calculado y disperso en cuatro pantallas distintas: el presupuesto del mes está
en `/presupuesto`, el flujo de 30 días en `/recurrentes`, el compromiso futuro
dentro del health score en `/analisis`, y la meta de aporte en `/inversiones`.
Hoy tú tienes que abrir las cuatro y hacer la síntesis mentalmente — que es
exactamente el trabajo que no querías hacer.

**Qué hacer.** Un sheet con tres campos: **monto**, **¿en cuántas cuotas?**,
**método de pago**. Salida: un veredicto único con la jerarquía de severidad ya
establecida (UX5) y como máximo tres razones:

> **Sí, pero justo** 🟡
> · Te quedan $84.909 de presupuesto este mes — esto usa el 71%
> · Tu flujo de 30 días queda en $12.000 el 14 de agosto (hoy: $97.000)
> · Suma $25.000/mes de compromiso hasta marzo

Nada de datos nuevos: es pura composición sobre `lib/cash-flow.ts`,
`lib/health-score.ts` y el E2. El valor está en que reemplaza cuatro pantallas
por una respuesta.

**Dónde va.** `components/AffordabilitySheet.tsx`, con `lib/affordability.ts` +
tests para la regla del veredicto (misma disciplina que `lib/technical.ts`:
reglas deterministas, testeadas, sin IA). Entrada desde el FAB, junto a
"agregar gasto".

---

## E5 · Pesos reales — IPC y UF de Chile ✅ Implementado (con ajuste de alcance)

**Prioridad: media-alta · Esfuerzo: medio**

> Nota post-implementación: el segundo punto de uso cambió. La proyección de
> patrimonio de `/analisis` (5/7/10%) resultó ya estar diseñada como retorno
> **real** (`docs/PLAN_ASESOR_FINANCIERO.md`: "retorno supuesto, default 7%
> real") — agregarle un toggle "en pesos de hoy" habría sido redundante y
> confuso. En su lugar se implementó lo que el propio backlog ya pedía como
> F7 (`FEATURES.md`): rentabilidad real vía Fisher en `DepositManager.tsx`
> (cuentas de ahorro, pestaña Ahorro de `/inversiones`), usando IPC trailing
> 12 meses. El toggle "en pesos de hoy" sí se implementó tal cual en la vista
> anual de `/analisis` (mindicador.cl, apagado por defecto).

**El problema.** No hay una sola referencia a inflación chilena en el código.
La única inflación que la app conoce es el CPI de EEUU vía FRED
(`lib/macro-fetch.ts`), y existe solo para el contexto Fed del mundo inversión.
Todo lo demás es nominal. Eso distorsiona en silencio justo los números más
grandes:

- La **proyección de patrimonio** a 1/5/10 años (`lib/wealth-projection.ts`) es
  nominal. A 10 años con ~3,5% de inflación chilena, la cifra sobrestima tu
  poder de compra real en torno a un 35%. Es el número más optimista de la app
  y el que más se equivoca.
- La **vista anual** de `/analisis` compara años en pesos corrientes: "gastaste
  6% más que el año pasado" mezcla haber gastado más con que las cosas cuesten
  más.
- Los **depósitos a plazo** guardan solo tasa nominal (`term_deposits`). Los
  reajustables en Chile son en UF; sin UF no se puede mostrar el rendimiento
  real.

**Qué hacer, sin convertirlo en un dashboard macro.** Fuente:
[mindicador.cl](https://mindicador.cl/) — gratis, sin API key, JSON, con
endpoints `/api/uf` y `/api/ipc` (incluye histórico por año). Mismo patrón
cache-first que `lib/macro-fetch.ts`: se guarda en `price_cache` con clave
sintética, TTL 24h, server-only, y si falla se degrada a "sin dato" sin romper
la página.

Alcance deliberadamente chico — **dos** puntos de uso, no más:

1. Un toggle **"en pesos de hoy"** en la vista anual y en la proyección de
   patrimonio. Apagado por defecto.
2. El valor de la UF donde viven los depósitos a plazo, para poder marcar uno
   como reajustable.

**Dónde va.** `lib/cl-indicators.ts` + tests (reusa `lib/yoy-change.ts`, que ya
resuelve "índice → variación interanual" de forma genérica y testeada — se
escribió pensando en el CPI pero no está atado a FRED).

---

## E6 · Auditoría de recurrentes (determinista, sin IA) ✅ Implementado

**Prioridad: media · Esfuerzo: bajo**

**El problema.** Existe un insight `subscription_price_increase`, pero es
generado por IA en `/api/analyze-month`: aparece solo si el modelo lo destaca
ese mes, entre otros candidatos, y compitiendo por espacio. Para algo tan
mecánico como "Spotify te subió de $6.900 a $7.900" eso es frágil de más — el
dato es determinista y está a un `group by` de distancia: los `expenses` ya
guardan `recurring_expense_id`.

**Qué hacer.** En cada fila de `/recurrentes`, al expandir:

- **costo anualizado** (`amount × 12`, o el prorrateo real si es anual/cuotas)
- **total pagado** desde que existe el ítem
- chip gold **"subió $1.000 en abril"** si el monto cambió respecto de los
  meses anteriores

Sin IA, sin llamada externa, sin tabla nueva.

**Dónde va.** `components/RecurringManager.tsx` + `lib/recurring-audit.ts` con
tests.

---

## Orden sugerido

E1 y E6 son de bajo esfuerzo y se pueden hacer de una. E2 desbloquea a E4 (el
simulador necesita la serie de compromiso mensual), así que conviene ese orden.
E3 y E5 son independientes entre sí y del resto.

```
E1 (avisos vivos)  ──┐
E6 (auditoría)     ──┤
                     ├──> E2 (compromiso) ──> E4 (¿me lo puedo comprar?)
E3 (metas)         ──┤
E5 (pesos reales)  ──┘
```

Si hay que elegir **una sola**: E4. Es la que más reduce carga mental, y es la
única que convierte todo lo que la app ya calcula en una respuesta de una línea.

---

## Descartado a propósito

- **Rollover de presupuesto por categoría** (lo no gastado pasa al mes
  siguiente). Suena ordenado, pero rompe la comparación mes a mes y agrega un
  concepto más que entender. Va en contra de "no agobiar".
- **Gastos compartidos / división de cuentas.** La app es de uso personal desde
  el roadmap anterior.
- **Multi-moneda en gastos.** La convención vigente (todo CLP salvo el mundo
  inversión en USD) es deliberada y está documentada en `CLAUDE.md`.
- **Otro dashboard de indicadores macro chilenos.** Por eso E5 se limita a dos
  puntos de uso concretos en vez de una pantalla nueva.
```

Sources:
- [Mindicador.cl — indicadores económicos de Chile, API REST](https://mindicador.cl/)
- [Endpoint UF](https://mindicador.cl/api/uf)
