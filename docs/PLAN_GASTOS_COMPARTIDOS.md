# Plan Gastos compartidos — viajes según sueldo (v2)

**Objetivo:** que dos personas que usan la app puedan **planificar, ahorrar, pagar y cuadrar** un viaje juntas, dividiendo en proporción a lo que gana cada una, sin mostrarse el sueldo. Si Cas gana el 62% del total de los dos, le toca el 62% del viaje. La app sabe en todo momento cuánto van a gastar, cuánto llevan, cuánto le falta juntar a cada uno y quién le debe a quién.

**Fecha:** oct 2026 · **v2:** reemplaza la v1, que modelaba solo "registrar gastos y saldar". En la vida real un viaje empieza meses antes con un presupuesto, se paga en buena parte por adelantado (pasajes, alojamiento) y recién al final se cuadra. Esta versión sigue ese ciclo y define cómo encaja cada etapa con lo que la app ya tiene.

**Estado revisado:** `expenses` (66 lecturas en 30 archivos), `expenses.excluded_from_analysis` (migración 20260725, "Marcar como único"), `savings_goals` (E3, `/presupuesto`), `budgets` / `category_budgets`, `incomes`, `payslips`, cálculo de estados de cuenta (`currentStatementRange` / `lastClosedStatementRange` / `lastDueStatementRange` en 9 archivos), `FlujoCaja30d`, `AffordabilitySheet`, `MoreSheet` / `SideNav`, RLS (todo aislado por `user_id`).

---

## La idea en una frase

Un viaje es **un sobre compartido con fecha**: tiene un presupuesto acordado, cada uno aporta su porcentaje, los pagos reales van llenando el sobre y al final se cuadra la diferencia. En tus finanzas personales el viaje aparece solo como **tu parte**, planificada con una meta de ahorro y separada de tu límite mensual, para que no te desordene el mes.

---

## Ciclo de vida del viaje

El estado se deriva de las fechas y del saldo; no hay que moverlo a mano.

| Etapa | Cuándo | Qué haces | Qué muestra la app |
|---|---|---|---|
| **1. Planificar** | Al crear el viaje | Nombre, fechas, invitar, acordar el reparto, armar el presupuesto por categoría | "Presupuesto $1.200.000 · tu parte $744.000" |
| **2. Ahorrar y reservar** | Hasta el día de salida | Registrar pagos adelantados (pasajes, alojamiento), ahorrar tu parte | "Faltan 34 días · ya pagado $480.000 · te falta juntar $210.000 ($105.000 al mes)" |
| **3. En viaje** | Entre las fechas | Registro rápido de cada gasto: monto, quién pagó | "Llevan $780.000 de $1.200.000" + barra por categoría + saldo actual |
| **4. Cuadrar y cerrar** | Después de la fecha de vuelta | Saldar la diferencia, cerrar | "Pedro te debe $186.400" → Saldar → resumen planeado vs real |

---

## Decisiones

### D1. Privacidad del sueldo → se comparte el %, nunca el monto

La proporción la calcula una función `SECURITY DEFINER` (`shared_income_ratio(group_id)`) que lee los `incomes` de ambos y devuelve **solo los porcentajes**. La RLS de `incomes` no cambia. Ambos tienen que dar su consentimiento explícito al unirse, porque el % igual revela algo. Siempre se puede elegir 50/50 o un % fijo acordado a mano.

### D2. El % se acuerda una vez por viaje (cambia respecto de la v1)

En la v1 el % se congelaba gasto por gasto. En un viaje eso no tiene sentido: el presupuesto, "tu parte" y la meta de ahorro necesitan un número estable desde el día 1.

- Al crear el viaje, la app **propone** el % (promedio de los últimos 3 meses de `incomes`; si falta, el último `payslips.liquido`) y **ambos lo confirman**. Queda guardado en el grupo: "62% / 38% · acordado el 18 oct".
- Ese % se usa en todo el viaje: presupuesto, gastos y meta de ahorro.
- Si alguien cambia de sueldo, el % no se mueve solo. Cualquiera puede proponer recalcularlo, el otro lo acepta y se recalculan todos los gastos del viaje (antes de cerrarlo, el viaje es un solo acuerdo).
- Cada gasto puede salirse de la regla: 50/50, 100% de uno ("el regalo para mi mamá") o montos exactos.

### D3. En tus gastos personales queda solo tu parte

Cada gasto del viaje crea en cada uno una fila de `expenses` con `amount` = **su parte** y `shared_expense_id` apuntando al gasto del viaje. Las 66 lecturas de `expenses` no cambian: presupuesto, análisis e insights muestran lo que de verdad te costó.

- **Categoría personal:** cada uno elige al crear el viaje en qué categoría propia cae su parte (por defecto "Vacaciones", que se crea si no existe). El desglose fino (alojamiento, comida…) vive en el viaje, no en tus categorías.
- **Fecha:** la del pago. Un pasaje pagado en noviembre para un viaje de febrero es gasto de noviembre, igual que en la vida real.
- **Método de pago:**
  - Si pagaste tú: tu tarjeta o cuenta (ver D4).
  - Si pagó la otra persona: sin método, con la etiqueta "Pagó Pedro". Se comporta como débito (cuenta en el mes de compra) y no entra en ningún estado de cuenta tuyo.
- **Saldar no crea gastos ni ingresos.** La plata ya se contó una vez, cuando ocurrió el gasto. La transferencia solo cierra la deuda.

### D4. Cuadratura de tarjeta → el estado de cuenta muestra el cargo completo

Este es el punto delicado. Si pagaste el alojamiento de $480.000 con tu Visa, tu fila personal dice $297.600, pero el banco te va a cobrar $480.000. Si la app solo sumara `expenses`, mostraría un estado de cuenta menor al real y fallarían el cupo usado, el pago de tarjeta en el flujo de caja, Ciclo de sueldo y "¿Me lo puedo comprar?".

- `shared_expenses` guarda el `payment_method_id` de quien pagó.
- Un helper `sharedCardExtra(userId, cardId, range)` en `lib/shared-split.ts` suma, en el período, `amount − tu parte` de los gastos que pagaste con esa tarjeta.
- Todos los cálculos de estado de cuenta suman ese extra: `/cuenta/[cardId]`, "Tarjeta · Cupo usado" en `/inicio`, el evento F8 de `/recurrentes`, `CicloSueldo`, `AffordabilitySheet` y `/metodos`. Son los 9 archivos que hoy usan los `*StatementRange`, y se centraliza para que ninguno quede afuera.
- En la vista de la tarjeta, una línea explica la diferencia: "incluye $182.400 de Pedro (viaje Chiloé)".

### D5. El viaje no desordena tu mes

Un viaje es un gasto planificado y ahorrado aparte, así que no debería aparecer como "te pasaste del límite" ni como "gastaste 300% más en restaurantes".

- **Total gastado del mes, Historial y tasa de ahorro:** incluyen tu parte, porque es plata real. Llevan un chip "incluye $X del viaje Chiloé".
- **Límite mensual y presupuestos por categoría (`/presupuesto`):** **no** la cuentan. El viaje tiene su propio presupuesto. La barra del mes muestra aparte "Viaje Chiloé $X (fuera del límite)".
- **Análisis IA:** las filas nacen con `excluded_from_analysis = true`, la misma marca que ya usa "Marcar como único".
- **"vs anterior" en `/analisis` e `/inicio`:** sigue comparando todo, pero el chip del viaje explica el salto. Un toggle "sin viaje" queda para la fase 3.

### D6. Meta de ahorro ligada al viaje (privada de cada uno)

Al armar el presupuesto, la app ofrece crear una `savings_goal` "Viaje Chiloé", ligada al grupo (`shared_group_id`):

- **Objetivo:** tu parte del presupuesto. Si el presupuesto cambia, el objetivo se actualiza.
- **Fecha:** la de salida.
- **Progreso:** lo que ya pagaste como tu parte (automático, desde tus filas ligadas) más lo que tienes guardado (`current_amount`, manual como hoy).
- **Muestra:** "te falta juntar $210.000 · $105.000 al mes hasta febrero".
- **Privacidad:** cada uno tiene su propia meta. Pedro no ve cuánto llevas ahorrado.
- **Al cerrar el viaje,** la meta se archiva.

### D7. Quién ve qué

- **Del viaje:** nombre, fechas, presupuesto, gastos, % acordado, saldo y actividad ("Pedro agregó Cena $90.000"). Ambos lo ven.
- **Sigue privado:** tus gastos personales, ingresos, inversiones, propiedad y tu meta de ahorro.
- **Tu fila personal:** es tuya. Puedes cambiarle la categoría sin afectar al otro. Monto y fecha se editan solo desde el viaje, para que nunca se descuadre.

### D8. Alertas (UX5)

Ninguna situación del viaje es urgente del día, así que **nunca usa coral**.

- **Gold (chip):** una categoría del viaje llegó al 80% del presupuesto; quedan menos de 14 días y te falta juntar; pasaron 7 días desde la vuelta y el saldo no está en cero ("Saldar con Pedro $186.400").
- **Mint:** viaje cerrado dentro del presupuesto.

---

## Cómo toca cada parte de la app

| Lugar | Qué cambia | Fase |
|---|---|---|
| `SideNav` / `MoreSheet` | Nueva entrada **Compartidos** (`/compartidos`), después de Recurrentes. Nombre genérico para que después quepa "Casa" | 1 |
| `/compartidos` | Lista de viajes con su estado y saldo. Detalle por etapa (ver Pantallas) | 1–2 |
| `expenses` / Historial | Tu parte con chip "Compartido · tu parte $297.600 de $480.000"; "Pagó Pedro" como método | 1 |
| Estados de cuenta (9 archivos) | `sharedCardExtra` en cada cálculo (D4) | 1 |
| Análisis IA | `excluded_from_analysis = true` automático (D5) | 1 |
| `/presupuesto` | El viaje sale del límite mensual y de los presupuestos por categoría, con su línea aparte; la meta de ahorro ligada aparece en Metas (D6) | 2 |
| `/inicio` | Card "Próximo viaje" que cambia por etapa: días que faltan y cuánto te falta juntar → en viaje, gastado vs presupuesto → después, saldo por saldar (gold) | 2 |
| `ExpenseSheet` (FAB "Nuevo gasto") | Entre las fechas del viaje, un chip "¿Del viaje Chiloé?" convierte el gasto en compartido sin salir del flujo de siempre | 3 |
| `FlujoCaja30d` | Pagos programados del viaje ("saldo del alojamiento, 1 feb") aparecen por **tu parte** | 3 |
| `/analisis` | Toggle "sin viaje" para comparar meses limpios | 3 |
| Correo | Resumen al cerrar el viaje (misma infraestructura que `notify-monthly-summary`) | 3 |
| `/ingresos`, `/inversiones`, `/propiedad` | Sin cambios; los ingresos solo alimentan el % | — |

---

## Modelo de datos

### Migración `2026XXXX_shared_groups.sql` (fase 1)

```sql
create table public.shared_groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                          -- "Vacaciones Chiloé"
  kind          text not null default 'event' check (kind in ('event', 'household')),
  start_date    date,                                   -- etapas (ciclo de vida); null en 'household'
  end_date      date,
  split_mode    text not null default 'income' check (split_mode in ('income', 'equal', 'fixed')),
  ratio_a       numeric(5,4),                           -- % acordado del miembro A (D2), 0..1
  ratio_agreed_at timestamptz,                          -- null = propuesta sin confirmar por ambos
  member_a      uuid not null references auth.users(id),
  member_b      uuid references auth.users(id),         -- null hasta que acepta la invitación
  closed_at     timestamptz,                            -- etapa 4 terminada → solo lectura
  created_by    uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now()
);

create table public.shared_group_members (
  group_id       uuid not null references public.shared_groups(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete cascade,
  invited_email  text not null,
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  income_consent boolean not null default false,        -- D1
  personal_category_id uuid references public.categories(id),  -- D3: dónde cae tu parte
  joined_at      timestamptz,
  primary key (group_id, invited_email)
);

create table public.shared_expenses (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.shared_groups(id) on delete cascade,
  kind           text not null default 'expense' check (kind in ('expense', 'refund')),
  refund_of      uuid references public.shared_expenses(id) on delete cascade,  -- solo si kind = 'refund'
  trip_category  text not null check (trip_category in
                   ('alojamiento', 'transporte', 'comida', 'actividades', 'compras', 'otros')),
  description    text not null,
  date           date not null,
  amount         integer not null check (amount > 0),   -- CLP, cargo completo
  paid_by        uuid not null references auth.users(id),
  payment_method_id uuid references public.payment_methods(id),  -- D4, de quien pagó
  split_kind     text not null check (split_kind in ('group', 'equal', 'only_a', 'only_b', 'exact')),
  share_a        integer not null,                      -- share_a + share_b = amount
  share_b        integer not null,
  created_by     uuid not null references auth.users(id),
  updated_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (share_a >= 0 and share_b >= 0 and share_a + share_b = amount)
);

create table public.shared_settlements (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.shared_groups(id) on delete cascade,
  from_user  uuid not null references auth.users(id),
  to_user    uuid not null references auth.users(id),
  amount     integer not null check (amount > 0),
  date       date not null,
  created_at timestamptz not null default now()
);

alter table public.expenses add column shared_expense_id uuid
  references public.shared_expenses(id) on delete cascade;
create unique index expenses_shared_once_per_user_idx
  on public.expenses(user_id, shared_expense_id);       -- no parcial (lección de 20261005)
```

`split_kind = 'group'` significa "usa el % acordado del viaje". Si se recalcula el % (D2), solo se recalculan esos gastos.

### Migración fase 2

```sql
create table public.shared_budget_lines (
  group_id      uuid not null references public.shared_groups(id) on delete cascade,
  trip_category text not null,
  amount        integer not null check (amount >= 0),
  primary key (group_id, trip_category)
);

alter table public.savings_goals add column shared_group_id uuid
  references public.shared_groups(id) on delete set null;   -- D6
```

### Migración fase 3

```sql
create table public.shared_plan_items (                 -- pagos programados ("saldo del alojamiento")
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.shared_groups(id) on delete cascade,
  description    text not null,
  trip_category  text not null,
  est_amount     integer not null check (est_amount > 0),
  due_date       date,
  planned_payer  uuid references auth.users(id),
  shared_expense_id uuid references public.shared_expenses(id) on delete set null  -- al pagarlo
);
```

### RLS

Las tablas `shared_*` usan la misma política por pertenencia (miembro aceptado del grupo). `expenses` y `savings_goals` no cambian de política: cada uno sigue viendo solo sus filas. La fila personal de la otra persona la crea una función `SECURITY DEFINER` (`shared_expense_upsert`) que valida la pertenencia, porque un usuario no puede escribir en el `expenses` de otro.

### Lógica pura en `lib/shared-split.ts` (con tests)

- `proposeRatio(incomesA, incomesB)`: promedio de 3 meses con fallback a la liquidación. Casos: falta un mes, falta un usuario, mes con bono.
- `splitAmount(amount, splitKind, ratioA)`: devuelve `[shareA, shareB]` en CLP enteros que suman exacto. El peso de redondeo va a quien pagó.
- `groupBalance(expenses, settlements)`: cuánto puso cada uno, cuánto le correspondía y el saldo neto. Los reembolsos restan.
- `tripProgress(budgetLines, expenses, ratioA)`: por categoría, presupuestado, gastado y %; más tu parte del presupuesto.
- `tripStage(group, today, balance)`: devuelve `planning`, `traveling`, `settling` o `closed`.
- `sharedCardExtra(...)`: D4.

---

## Pantallas

**`/compartidos`:** lista de viajes ordenada por fecha. Cada fila muestra el nombre, las fechas, un chip de etapa y el saldo. Un botón "Nuevo viaje".

**Nuevo viaje (asistente de 3 pasos):**

1. Nombre, fechas y correo de la otra persona.
2. Reparto: la app propone "62% / 38% según ingresos" (o 50/50 o fijo). Queda "pendiente de Pedro" hasta que acepta.
3. Presupuesto por categoría, opcional y editable después. Ofrece crear la meta de ahorro.

**Detalle del viaje:** el encabezado cambia según la etapa.

- **Planificar / reservar:** cuenta regresiva, presupuesto total y tu parte, barra "ya pagado vs presupuesto" y, solo para ti, la meta de ahorro.
- **En viaje:** "llevan $X de $Y", barras por categoría con gold al 80% y botón grande "+ Gasto".
- **Cuadrar:** saldo grande (mint si te deben, gold si debes) y botón "Saldar".
- **Cerrado:** resumen planeado vs real por categoría y lo que puso cada uno.

Debajo del encabezado van siempre la lista de gastos (agrupada por día, mismo patrón que Historial) y la actividad reciente.

**Agregar gasto:** monto, descripción, categoría del viaje, fecha (hoy por defecto), quién pagó, con qué pagaste (solo si fuiste tú) y reparto (por defecto el del viaje). Abajo se ve en vivo "te toca $X · a Pedro $Y".

---

## Fases de implementación

**Fase 1 — Base compartida.** Sin esto nada funciona.

- Grupos, invitación y consentimiento.
- % acordado por ambos (D1, D2).
- Gastos reales con tu parte en `expenses` (D3).
- Cuadratura de tarjetas (D4).
- `excluded_from_analysis` automático.
- Saldo y Saldar.
- `/compartidos` con lista y detalle simple.

Esfuerzo similar al P1 de Propiedad. Lo más riesgoso es D4, porque toca 9 archivos; se cubre con tests de `sharedCardExtra` y revisando a mano un estado de cuenta real.

**Fase 2 — Planificar.**

- Presupuesto por categoría y barras de avance.
- Tu parte del presupuesto.
- Meta de ahorro ligada (D6).
- El viaje fuera del límite mensual (D5).
- Card en `/inicio` por etapa.
- Chips gold (D8).

**Fase 3 — Integrado al día a día.**

- Chip "¿Del viaje?" en `ExpenseSheet`.
- Pagos programados en `FlujoCaja30d`.
- Toggle "sin viaje" en `/analisis`.
- Cierre con resumen y correo.

**Fase 4 — Vivir juntos.** Ver abajo.

---

## Fase futura — vivir juntos

Es la misma base con otro ritmo: un grupo `kind = 'household'` ("Casa"), sin fechas, que no se cierra.

- **Se reutiliza tal cual:** grupo, invitación, RLS, `shared_income_ratio`, tu parte en `expenses`, saldo y Saldar.
- **El % pasa a ser mensual:** tabla `shared_month_ratios (group_id, month, year, ratio_a)`. Se propone el 1 de cada mes, y si a alguien le suben el sueldo, el cambio entra el mes siguiente sin tocar meses cerrados.
- **Recurrentes de la casa:** `recurring_expenses.shared_group_id`. `auto-register.ts` ya genera las fechas (`monthlyDueDates`, `intervalDueDate`) y al vencer crea el gasto compartido y la parte de cada uno.
- **El presupuesto es mensual y no se cierra:** reutiliza `shared_budget_lines` con mes. A diferencia del viaje (D5), tu parte de la casa **sí** cuenta en tu límite mensual, porque es gasto del día a día.
- **Reglas por categoría:** "Supermercado → según sueldo", "Mascota → 100% Cas".
- **Cierre mensual:** "en octubre Cas puso $52.000 de más" → Saldar o arrastrar al mes siguiente.
- **Decisiones abiertas para cuando llegue:** si el arriendo va según sueldo o 50/50, y si usan cuenta común real (un método de pago del grupo) o cada uno paga con lo suyo.

---

## Casos borde

- **La otra persona no tiene ingresos registrados:** no se adivina; se pide 50/50 o un % fijo.
- **Pedro todavía no acepta:** puedes armar el presupuesto y registrar gastos, pero quedan "pendientes de reparto" y no se crean filas en el `expenses` de él hasta que acepte el viaje y el %.
- **Reembolso (te devuelven una reserva):** `kind = 'refund'`. Resta del saldo. Como `expenses.amount` tiene `check (amount > 0)`, no se crean filas negativas: el reembolso queda ligado al gasto original y **reduce el monto de tu fila personal**. Si el reembolso es total, la fila se borra.
- **Se edita o borra un gasto:** la server action actualiza las dos filas personales y deja una línea en la actividad ("Pedro cambió Cena: $90.000 → $75.000").
- **Viaje cancelado:** se cierra sin gastos o con reembolsos; la meta de ahorro se archiva y lo ahorrado sigue siendo tuyo.
- **Gastos en el extranjero:** se registran en CLP, como el resto de la app. Si pagaste con tarjeta en USD, el monto en CLP del estado de cuenta.
- **Más de dos personas:** fuera de alcance. `member_a`/`member_b` es para parejas; un grupo de amigos requeriría una tabla de partes por miembro.

---

## Fuera de alcance

- Ver los gastos personales, ingresos, metas o inversiones de la otra persona.
- Transferir plata desde la app: Saldar solo registra que la transferencia ocurrió.
- Grupos de más de dos personas.
- Monedas distintas de CLP dentro del viaje.

---

## Actualización oct 2026 — invitar por @usuario (estilo Discord)

La invitación ya no pide un correo: cada persona tiene un `@usuario` único (`profiles.username`, migración 20261019) y se busca por él.

- **Búsqueda exacta, nunca una lista.** `shared_find_user` devuelve solo usuario, nombre y foto; jamás el id ni el correo. Hay que saber el usuario completo para encontrar a alguien.
- **Control de quién te encuentra.** `profiles.discoverable` (Ajustes → Perfil): si está apagado, nadie puede invitarte.
- **Sin correos entre personas.** `shared_group_members` guarda `user_id` (ya no `invited_email`), así que quien invita nunca puede leer el correo de la otra persona.
- **Todos tienen usuario.** La migración asignó uno a las cuentas existentes (a partir del nombre) y las cuentas nuevas lo reciben al abrir Compartidos (`ensure_my_username`). Se puede cambiar en Ajustes → Perfil; el único chequeo es que no esté tomado.
- **Dónde se ve:** chip "Tu usuario @x" con botón copiar en `/compartidos`; el buscador del asistente "Nuevo viaje" muestra una tarjeta con foto y nombre antes de invitar.
- **Pendiente de decisión:** limitar la cantidad de búsquedas por minuto si algún día hace falta (hoy un usuario autenticado podría probar nombres a mano).
