# Plan — Viaje en pareja con alguien que no usa la app (reparto según sueldo)

**Fecha:** nov 2026 · **Estado:** propuesta, sin implementar.

## El caso

Cas viajó de vacaciones con su pareja. Ella no tiene cuenta en Bolsillo Mágico y no la queremos obligar a registrarse, o a lo más con lo mínimo. Las dos pagaron cosas de su bolsillo (pasajes, alojamiento, comidas). Quieren repartir el total **en proporción a lo que gana cada una** y saber quién le debe a quién.

La complicación: el sueldo líquido de ella cambia cada mes. La idea es usar el **promedio de sus últimos 6 sueldos líquidos** y compararlo con el promedio de Cas.

## Qué existe hoy y qué falta

| Pieza | Hoy | Sirve para este caso |
|---|---|---|
| Viajes compartidos (`shared_groups`) | Reparto parejo o según sueldo, N personas, saldos y "Saldar". **Ocultos** (`SHOW_TRIPS = false`). | La lógica de reparto y saldos sí. Pero **todos los miembros deben tener cuenta**: `shared_group_members.user_id`, `paid_by`, `shared_expense_shares.user_id` y `shared_settlements` apuntan a `auth.users`. |
| Según sueldo (`shared__income_for`) | Promedio de los **últimos 3 meses** de `incomes` de cada miembro, con consentimiento de cada uno. | Hay que pasar a **6 meses** y aceptar un ingreso que **escribe Cas** para la invitada. |
| Por cobrar (`expense_receivables`) | Amigos sin cuenta que te deben una parte de un gasto que pagaste tú. | Solo cubre "pagué yo y me deben". No cubre que **ella también pagó**, ni el reparto según sueldo, ni agrupar el viaje. |
| Gasto nuevo → "¿Es de un viaje?" | Existe en `ExpenseSheet` para gastos **nuevos**. | Falta pasar al viaje gastos **ya registrados** (lo que Cas ya pagó con su tarjeta antes de crear el viaje). |

**Conclusión:** la base correcta son los viajes compartidos, agregando un **participante sin cuenta**. Hoy hay 1 viaje y 0 gastos compartidos en la base, así que cambiar el modelo ahora sale barato: no hay datos que migrar.

## Cómo funcionaría (para Cas)

1. **Crear el viaje** "Vacaciones con …", con fechas (pueden ser pasadas) y reparto **Según sueldo**.
2. **Agregar a su pareja sin cuenta:** solo un nombre. Sin correo, sin @usuario.
3. **Su sueldo:** una calculadora con 6 casillas (sus últimos 6 líquidos, que ella le dicta). La app muestra el promedio y **guarda solo el promedio**, no los 6 montos. Cas marca "Ella está de acuerdo con usar este promedio".
4. **El sueldo de Cas:** promedio de sus propios ingresos de los últimos 6 meses cerrados, calculado solo. Se muestra cuál fue la base ("promedio jun–nov").
5. **El reparto queda acordado:** "Tú 63,5 % · ella 36,5 % · acordado el 20 nov". No cambia solo si cambian los sueldos. Se puede recalcular a mano o ajustar el % directo.
6. **Cargar los gastos:**
   - Lo que pagó Cas: elige su tarjeta o cuenta. Si ya estaba registrado en su Historial, lo **pasa al viaje** en vez de cargarlo dos veces.
   - Lo que pagó ella: "Pagó [nombre]", sin método de pago.
   - Cualquier gasto puede salirse de la regla: 50/50, solo de una, o montos exactos.
7. **Cuadrar:** "Le debes $39.528 a [nombre]" o "Te debe $X". Se marca como saldado cuando se hace la transferencia.

### Ejemplo con números ficticios

| | Cas | Pareja |
|---|---|---|
| Promedio líquido 6 meses | $1.800.000 | $1.033.333 (de 950k, 1.100k, 870k, 1.300k, 1.000k, 980k) |
| Proporción | 63,5 % | 36,5 % |

| Gasto | Monto | Pagó | Parte Cas | Parte pareja |
|---|---|---|---|---|
| Pasajes | $600.000 | Cas | $381.176 | $218.824 |
| Alojamiento | $420.000 | Pareja | $266.823 | $153.177 |
| Comidas | $180.000 | Cas | $114.353 | $65.647 |
| Tours | $90.000 | Pareja | $57.176 | $32.824 |
| **Total** | **$1.290.000** | Cas $780.000 · ella $510.000 | **$819.528** | **$470.472** |

Cas pagó $780.000 y le tocaba $819.528, así que **Cas le debe $39.528**.

## Cómo queda en las finanzas de Cas

Igual que los viajes actuales (decisiones D3–D5 de `PLAN_GASTOS_COMPARTIDOS.md`):

- En su Historial queda **solo su parte** de cada gasto, con chip "Compartido".
- Si pagó con tarjeta, el estado de cuenta suma su parte más `card_extra` (la parte de ella), así sigue cuadrando con el banco.
- Lo que pagó ella aparece como "Pagó [nombre]", con la parte de Cas, sin tarjeta.
- Fuera del límite mensual y del análisis IA (`excluded_from_analysis`).
- Saldar no crea gastos ni ingresos: solo cierra la deuda.

La invitada no tiene filas en ninguna parte (no tiene cuenta).

## Cómo lo ve ella sin registrarse (fase 2)

Un **enlace de solo lectura** que Cas le manda por WhatsApp:

- Muestra el viaje, la lista de gastos, quién pagó, el % acordado y el saldo ("Cas te debe $39.528").
- **No muestra** el sueldo de nadie, solo los porcentajes.
- El enlace usa un token aleatorio largo, se puede revocar y vence al cerrar el viaje (o a los 90 días).
- Opcional más adelante: que ella pueda **agregar lo que pagó** desde el enlace, quedando "pendiente de revisar" para Cas.

## Si después ella se crea cuenta (fase 3)

Cas la invita por @usuario y elige "Es [nombre] del viaje". La invitada se convierte en miembro: sus gastos pagados, partes y saldos pasan a su cuenta, y desde ahí su ingreso sale de su propio registro (con su consentimiento).

## Cambios técnicos

### Modelo de datos (migración nueva)

La clave es dejar de identificar a los participantes por `auth.users.id`:

- `shared_group_members`: nuevo `id uuid` como clave; `user_id` pasa a ser **opcional** (único por grupo cuando existe); nuevas columnas `guest_name text`, `guest_income integer` (promedio mensual), `guest_income_months smallint`, `guest_income_set_at timestamptz`. Regla: o tiene `user_id`, o tiene `guest_name`.
- `shared_expenses.paid_by`, `shared_expense_shares`, `shared_settlements.from/to` apuntan a `shared_group_members.id` en vez de al usuario.
- Solo los miembros con cuenta pueden ver y editar el viaje (RLS sin cambios de fondo). La invitada no se loguea: solo el enlace de fase 2.
- `shared_group_share_links` (fase 2): `token_hash`, `group_id`, `expires_at`, `revoked_at`. Lectura con una función `SECURITY DEFINER` que recibe el token y devuelve solo lo necesario.

Como hay 0 gastos compartidos en la base, la migración puede recrear las tablas sin backfill.

### Reparto según sueldo

- `shared__income_for` pasa de 3 a **6 meses cerrados** (promedio de los meses con ingreso > 0). Afecta también a los viajes entre dos usuarios, para que el criterio sea uno solo.
- Para la invitada, el peso sale de `guest_income`. Su "consentimiento" es la casilla que marca Cas.
- Se mantiene el reparto exacto por mayor resto (`splitByWeights`): SQL y TypeScript dan el mismo peso a peso.
- Opción "Ajustar el % a mano" (ej. redondear a 65/35) para cuando prefieran un número simple.

### Asociar gastos al viaje

Cuatro entradas, todas terminan en lo mismo: un `shared_expense` y, en el Historial de Cas, su fila con `shared_expense_id` apuntando a él.

| Situación | Cómo se asocia | Hoy |
|---|---|---|
| Gasto nuevo durante el viaje | Botón + de siempre: entre las fechas del viaje el gasto parte asignado al viaje ("¿Es de un viaje?") | Existe |
| Gasto que pagó ella | Desde el viaje, "+ Agregar" → "¿Quién pagó?" → su nombre | Existe para usuarios; falta la invitada |
| Gastos ya registrados en el Historial | **Sugerencia al crear o editar el viaje:** "Encontré 14 gastos entre el 3 y el 10 de nov. ¿Cuáles son del viaje?" con casillas y categoría del viaje adivinada por la descripción | Nuevo |
| Uno que se escapó después | Historial → seleccionar uno o varios (barra flotante) → **"Pasar a un viaje"**; también desde el detalle del gasto | Nuevo |

**Qué hace "Pasar a un viaje"** (función SQL atómica): crea el `shared_expense` con el monto completo, pagado por Cas con el mismo método y fecha; la fila del Historial queda con `amount` = su parte, `card_extra` = la parte de ella, `shared_expense_id` y `excluded_from_analysis = true`. El estado de cuenta no cambia (`amount + card_extra` = lo que cobró el banco). Si el gasto tenía un "Por cobrar", hay que elegir uno de los dos.

**Vínculo de ida y vuelta:**
- En el Historial el gasto muestra el chip "Viaje [nombre] · tu parte $X de $Y"; al tocarlo abre el viaje.
- Monto, fecha y quién pagó se editan solo desde el viaje, para que nunca se descuadre. La categoría personal se puede cambiar libremente.
- **"Sacar del viaje"** deshace la asociación: la fila vuelve a tener el monto completo y `card_extra = 0`, y el gasto sale del reparto.
- Borrar el gasto del viaje borra también la fila del Historial (FK en cascada, como hoy).

### Interfaz

- Reactivar Viajes (hoy `SHOW_TRIPS = false`), idealmente como **módulo por cuenta** ("Viajes compartidos") encendible desde `/admin`, igual que Inversiones o Propiedad.
- En Personas del viaje: "Agregar a alguien sin cuenta" junto a "Invitar por @usuario".
- Calculadora de sueldo: 6 casillas con el mes, promedio en vivo, botón "Usar este promedio".
- En cada gasto, "¿Quién pagó?" incluye a la invitada.
- "Cuadremos cuentas" funciona igual, con el nombre de la invitada.

## Fases

| Fase | Qué entrega | Esfuerzo |
|---|---|---|
| **1 · Lo que necesitan ahora** | Invitada sin cuenta, calculadora de 6 sueldos, promedio de 6 meses para Cas, % acordado y ajustable, gastos pagados por cualquiera, pasar gastos existentes al viaje, saldar. Reactivar viajes para la cuenta de Cas. | Migración + refactor de funciones `shared_*` y `lib/shared-split.ts` + UI. El mayor trabajo. |
| **2 · Que ella lo vea** | Enlace de solo lectura revocable, sin sueldos. | Mediano. |
| **3 · Si ella se registra** | Convertir invitada en miembro y traspasar su historial. | Mediano. |

## Casos borde

- **Un mes sin sueldo** (vacaciones, cambio de trabajo): no entra al promedio; se promedian los meses con sueldo. Si quedan menos de 3, se avisa.
- **Bonos o aguinaldos** inflan un mes: se sugiere ingresar el líquido sin bonos, o descartar el mes más alto y el más bajo (decisión abierta).
- **Gastos en el extranjero:** se registran en CLP, con el monto que cobró la tarjeta o el equivalente del efectivo.
- **Un gasto que es de una sola** (un regalo, algo personal): "Solo de Cas" o "Solo de ella"; no entra al reparto.
- **Cambiar el % después de cargar gastos:** recalcula todos los gastos "según acuerdo", como hoy. Los de reparto propio no se tocan.
- **Ella pagó algo que Cas ya tenía registrado** (duplicado): pasar al viaje evita contarlo dos veces; si quedó duplicado, se borra uno.

## Decisiones abiertas

1. **¿Ella se registra o no?** Recomendado: invitada sin cuenta en fase 1, y el enlace en fase 2. Registrarse queda como opción, nunca como requisito.
2. **¿6 meses para todos?** Recomendado: sí, también para viajes entre usuarios, para un criterio único. Alternativa: que cada viaje elija 3 o 6.
3. **¿Guardar los 6 sueldos de ella o solo el promedio?** Recomendado: solo el promedio, por privacidad.
4. **¿Bonos?** Ingresar líquido sin bonos (más simple) o descartar extremos (más automático).
5. **¿Viajes como módulo por cuenta?** Recomendado: sí, apagado por defecto en cuentas nuevas.
