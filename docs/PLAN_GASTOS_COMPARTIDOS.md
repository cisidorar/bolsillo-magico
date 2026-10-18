# Plan Gastos compartidos — dividir según sueldo

**Objetivo:** que dos personas que usan la app puedan dividir un gasto común (vacaciones, un regalo, el súper de una semana) **en proporción a lo que gana cada una**, sin tener que mostrarse el sueldo. Si Cas gana el 60% del total de los dos, paga el 60% del viaje. La app lleva la cuenta de quién pagó qué y dice en todo momento quién le debe a quién.

**Fecha:** oct 2026 · **Estado revisado:** `expenses` (66 lecturas en 30 archivos), `incomes` (monto mensual por usuario + `breakdown`), `payslips` (`liquido`), `profiles`, RLS (todo aislado por `user_id`), `FEATURES.md` #3 "hogar compartido" y #7 "split de gastos", `ROADMAP-economia-personal.md` (lo había descartado: "la app es de uso personal" — este plan reabre esa decisión a pedido de Cas).

---

## Diagnóstico — por qué no cabe en lo que ya existe

1. **Todo es de una persona.** Cada tabla tiene `user_id` y su RLS es `user_id = auth.uid()`. No existe ningún dato que dos usuarios puedan ver a la vez. Hace falta un primitivo nuevo: un **grupo** con miembros, y políticas RLS por pertenencia al grupo.

2. **El sueldo es lo más privado de la app.** Dividir "según sueldo" necesita los ingresos de ambos, pero que la otra persona vea tu sueldo exacto no es aceptable por defecto. La proporción se tiene que poder calcular **sin exponer los montos**.

3. **Un gasto compartido tiene dos verdades.** Lo que salió de tu tarjeta (el cargo completo, que tiene que cuadrar con el estado de cuenta) y lo que de verdad te costó (tu parte). La app hoy solo conoce la primera.

4. **No existe el concepto de deuda entre personas.** "Pagué $1.000.000, me debes $400.000" no se puede representar con `expenses`.

---

## P0 — Decisiones

### D1. Privacidad del sueldo → **se comparte el %, nunca el monto**

La proporción la calcula una función de Postgres `SECURITY DEFINER` (`shared_income_ratio(group_id)`) que lee los `incomes` de los dos miembros y devuelve **solo los porcentajes** (ej. 62% / 38%). Ninguno de los dos puede leer las filas de `incomes` del otro: la RLS de `incomes` no cambia.

- La función valida que `auth.uid()` sea miembro del grupo antes de calcular nada.
- Ambos tienen que haber aceptado "dividir según ingresos" al unirse al grupo (consentimiento explícito: el % igual revela algo).
- Alternativa siempre disponible: 50/50 o un % fijo acordado a mano, sin mirar ingresos.

### D2. ¿Qué queda en tus gastos personales? → **solo tu parte** (recomendado)

| Opción | Cómo funciona | Costo | Riesgo |
|---|---|---|---|
| **A. Cada uno registra su parte** ✅ | El gasto compartido crea en cada usuario una fila de `expenses` con `amount` = **su parte**. Presupuesto, análisis, categorías e insights siguen funcionando sin tocarlos. | Bajo: las 66 lecturas de `expenses` no cambian. | Quien pagó con tarjeta ve en su estado de cuenta un cargo mayor que su fila. Se resuelve con una línea de conciliación en `/cuenta/[cardId]` ("+$400.000 pagados por Pedro en esta tarjeta"). |
| B. Monto completo + columna `my_share` | La fila guarda el cargo completo y una columna con tu parte. | Alto: las 30 vistas que suman `amount` tendrían que usar `coalesce(my_share, amount)`. | Si una vista se olvida, el gasto del mes queda inflado en silencio. |

Con A, el estado de cuenta de la tarjeta queda bien explicado (cargo completo = tu parte + la parte de la otra persona) y el análisis personal muestra lo que de verdad te costó.

### D3. ¿Sueldo de qué mes? → **promedio de los últimos 3 meses registrados, congelado al crear el gasto**

- El sueldo de un solo mes es ruidoso (bonos, aguinaldo). Promedio de 3 meses de `incomes`; si falta, se usa el `liquido` de la última liquidación (`payslips`).
- Coherente con la regla de la app de que "el sueldo de mayo financia junio": cuenta el ingreso del mes anterior al gasto, no el del mismo mes.
- **El % se guarda en cada gasto compartido** (`ratio_a`). Si después cambia el sueldo de alguien, los gastos viejos no se recalculan: lo acordado queda acordado.
- Si a uno de los dos le falta información de ingresos, el gasto no se divide solo: pide elegir 50/50 o un % manual.

### D4. ¿Quién puede ver qué?

- Del grupo: nombre, miembros, gastos compartidos, saldo de la deuda. Ambos lo ven.
- Gastos personales, ingresos, inversiones, propiedad: **nada cambia**, siguen siendo privados.
- La fila personal que se genera en tu `expenses` es tuya; puedes cambiarle la categoría sin afectar a la otra persona.

---

## Los tres planes posibles

### Plan 1 — "Viajes y eventos" (MVP, mundo aparte) ✅ recomendado para empezar

Un módulo nuevo `/compartidos`, igual que `/propiedad`: no toca ninguna vista existente salvo una línea opcional en `/cuenta/[cardId]`.

- Creas un grupo ("Vacaciones Chiloé, feb 2027") e invitas a la otra persona por correo (tiene que tener cuenta en la app).
- Cualquiera de los dos registra gastos del grupo: "pagué $480.000 el alojamiento". La app propone la división según D3 y la puedes cambiar (50/50, %, montos exactos).
- Pantalla del grupo: total gastado, cuánto puso cada uno, cuánto le correspondía a cada uno y **el saldo: "Pedro te debe $186.400"**.
- Botón **Saldar**: registra la transferencia y deja el saldo en cero.
- Por cada gasto se crea tu parte en tus gastos personales (D2-A), en la categoría que elijas ("Vacaciones").

**Esfuerzo:** 3 tablas, 1 función SQL, 1 ruta nueva, 1 server action de invitación. Similar a P1 de Propiedad.

### Plan 2 — "Compartir" desde cualquier gasto (integrado)

Todo lo del Plan 1, más un interruptor **Compartir con…** en el `ExpenseSheet` de siempre. Registras el gasto como de costumbre, lo marcas como compartido y eliges el grupo.

- También para recurrentes: "Netflix, compartido 50/50" o "Arriendo, según sueldo"; `auto-register` genera la parte de cada uno todos los meses.
- Chip en Historial: "Compartido · tu parte $288.000 de $480.000".

**Esfuerzo:** el Plan 1 + cambios en `ExpenseSheet`, `RecurringManager` y `auto-register.ts`. Riesgo medio: toca el flujo de registro más usado de la app.

### Plan 3 — "Hogar compartido" (lo más grande)

Un grupo permanente para la vida en común: presupuesto compartido mensual, cuentas de la casa divididas automáticamente, **saldo mensual** ("este mes Cas puso $52.000 de más") y vista del hogar en `/analisis`.

**Esfuerzo:** alto. Implica decidir qué ve cada uno del análisis del otro, presupuestos con dos dueños y notificaciones a ambos. Solo vale la pena si el Plan 2 se usa todos los meses.

**Camino sugerido:** Plan 1 ahora → Plan 2 si se usa → Plan 3 solo si hace falta.

---

## P1 — Modelo de datos (Plan 1)

### Migración `2026XXXX_shared_groups.sql`

```sql
create table public.shared_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                         -- "Vacaciones Chiloé"
  created_by  uuid not null references auth.users(id) on delete cascade,
  default_split text not null default 'income'
              check (default_split in ('income', 'equal', 'fixed')),
  fixed_ratio numeric(5,4),                          -- solo si default_split = 'fixed' (0..1, parte del creador)
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.shared_group_members (
  group_id    uuid not null references public.shared_groups(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,  -- null mientras la invitación está pendiente
  invited_email text not null,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  income_consent boolean not null default false,     -- D1: aceptó dividir según ingresos
  joined_at   timestamptz,
  primary key (group_id, invited_email)
);

create table public.shared_expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.shared_groups(id) on delete cascade,
  paid_by      uuid not null references auth.users(id),
  amount       integer not null check (amount > 0),  -- CLP, cargo completo
  description  text not null,
  date         date not null,
  split_kind   text not null check (split_kind in ('income', 'equal', 'fixed', 'exact')),
  share_a      integer not null,                     -- CLP que le tocan al miembro A (congelado, D3)
  share_b      integer not null,                     -- share_a + share_b = amount
  member_a     uuid not null references auth.users(id),
  member_b     uuid not null references auth.users(id),
  created_by   uuid not null references auth.users(id),
  created_at   timestamptz not null default now()
);

create table public.shared_settlements (            -- "Saldar": transferencias entre los dos
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.shared_groups(id) on delete cascade,
  from_user  uuid not null references auth.users(id),
  to_user    uuid not null references auth.users(id),
  amount     integer not null check (amount > 0),
  date       date not null,
  created_at timestamptz not null default now()
);

-- Enlace con el gasto personal (D2-A): la parte de cada uno en su propio expenses
alter table public.expenses add column shared_expense_id uuid
  references public.shared_expenses(id) on delete set null;
```

**RLS:** las cuatro tablas nuevas con la misma política por pertenencia:

```sql
using (exists (
  select 1 from public.shared_group_members m
  where m.group_id = <tabla>.group_id and m.user_id = auth.uid() and m.status = 'accepted'
))
```

`expenses` no cambia de política: cada usuario sigue viendo solo sus filas.

### Función de la proporción (D1)

```sql
create function public.shared_income_ratio(p_group uuid)
returns table (user_id uuid, ratio numeric)
language sql security definer set search_path = public as $$
  -- 1. auth.uid() tiene que ser miembro aceptado del grupo
  -- 2. ambos miembros con income_consent = true
  -- 3. promedio de los últimos 3 meses de incomes por miembro (fallback: último payslips.liquido)
  -- 4. devuelve solo ratio = ingreso_i / suma; nunca los montos
$$;
```

### Lógica pura en `lib/shared-split.ts` (con tests)

- `splitAmount(amount, ratioA)` → `[shareA, shareB]` en CLP enteros que suman exacto (el peso que sobra del redondeo va a quien pagó).
- `groupBalance(expenses, settlements)` → cuánto puso cada uno, cuánto le correspondía y el saldo neto ("B le debe X a A").
- `incomeRatio(incomesA, incomesB)` → la misma regla que la función SQL, para testearla. Casos: falta un mes, falta todo un usuario, sueldo con bono.

---

## P2 — Pantallas (Plan 1)

- **`/compartidos`** (en `MoreSheet` / `SideNav`): lista de grupos con el saldo de cada uno.
- **Detalle del grupo:** encabezado con el saldo grande ("Pedro te debe $186.400", en mint si te deben y gold si debes; nunca coral, porque no es una urgencia del día según UX5), la proporción vigente ("62% / 38% según ingresos"), la lista de gastos y el botón Saldar.
- **Agregar gasto compartido:** monto, descripción, fecha, quién pagó, división (propuesta según D3 y editable), categoría para tu parte personal.
- **Invitación:** correo con link; quien invita ve "pendiente" hasta que la otra persona acepta e indica si da su consentimiento para dividir según ingresos.
- **`/cuenta/[cardId]`:** si un cargo de la tarjeta tiene `shared_expense_id`, una línea "incluye $X de [nombre]" para que el total cuadre con el estado de cuenta.

---

## Casos borde

- **La otra persona no tiene ingresos registrados:** no se adivina; se pide 50/50 o % manual.
- **Se edita o borra un gasto compartido:** se actualizan o borran las dos filas personales enlazadas (lo hace una server action, no un trigger, para que quede en el log).
- **Alguien sale del grupo:** el historial queda, el grupo pasa a solo lectura y el saldo pendiente sigue visible.
- **Moneda:** solo CLP, como el resto de la app (CLAUDE.md). Un viaje con gastos en USD se registra en CLP como hoy.
- **Más de dos personas:** fuera de alcance; el modelo `member_a`/`member_b` es para parejas. Si algún día hace falta un grupo de amigos, `shared_expenses` se pasa a una tabla de partes por miembro.

---

## Fuera de alcance

- Ver los gastos personales, ingresos o inversiones de la otra persona.
- Transferir plata desde la app (Saldar solo registra que la transferencia ocurrió).
- Grupos de más de dos personas (ver casos borde).
