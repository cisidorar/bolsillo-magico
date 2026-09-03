# Plan Propiedad — monitoreo del departamento en arriendo

**Objetivo:** que el departamento tenga su propia sección donde se responda una sola pregunta — **¿está todo al día?** No es un módulo de rentabilidad: entre el arriendo ($335.000) y el dividendo no hay ganancia, y medir un margen que no existe no sirve de nada. Lo que sí sirve es no perder plata por descuido: un reajuste de renta que no se aplicó, una multa por atraso que no se cobró, un giro de aseo que acumula interés, una boleta que venció.

**Fecha:** sep 2026 · **Estado revisado:** `expenses`, `incomes`, `recurring_expenses`, `payslips` + `lib/payslip-parser.ts` (pipeline PDF probado), `lib/recurring-due.ts` (generación idempotente), `lib/cl-indicators.ts` (**serie de IPC ya disponible**), `SideNav` / `BottomNav` / `MoreSheet`.

**Caso real:** depto 921, Santa Victoria 562, Santiago · ROL 105980225 · contrato notariado del 30/05/2026, vigente desde el 01/06/2026.

---

## Diagnóstico — por qué esto no cabe en lo que ya existe

1. **La app solo sabe de plata que ya se movió.** `expenses` es "pagué X el día D". No existe el concepto de *obligación*: "debo X, vence el 30/09, aún no pago, y desde el vencimiento corre interés". Sin ese primitivo, "que vaya registrando la deuda si no pago" es imposible de representar.

2. **Los recurrentes no son bimestrales.** `lib/recurring-due.ts` genera fechas mensuales o anuales. El aseo son 4 cuotas al año (30/04, 30/06, 30/09, 30/11) — ni mensual ni anual.

3. **El contrato tiene plata dormida adentro.** Reajuste por IPC cada 6 meses, multa de $5.000 por día de atraso, garantía en 3 cuotas, plazos de aviso. Hoy todo eso vive en un PDF que nadie relee. El primer reajuste vence en **diciembre de 2026** y nada lo va a recordar.

4. **Monto ≠ monto.** El aseo llega con tres números: base, interés penal y reajuste IPC. La app entera asume `amount` integer y listo.

---

## P0 — Decisiones

### D1. ¿Se mezcla con las finanzas personales? → **NO. Mundo aparte.** ✅ decidido

La propiedad **no toca** `expenses`, `incomes`, análisis, presupuesto, patrimonio ni flujo de caja. Ni una columna nueva en tablas existentes, ni un filtro nuevo en vistas que ya funcionan.

El razonamiento: el arriendo entra y el dividendo sale, y se anulan. Meter ambos al flujo personal agrega dos números grandes que se cancelan, ensucia el análisis mensual y no responde ninguna pregunta que no se responda mejor dentro del propio módulo.

**Consecuencias, explícitas:**
- El dividendo **no** aparece en "Gastos del mes" ni en Flujo de caja 30 días.
- El arriendo **no** aparece en Ingresos.
- El departamento **no** entra al Patrimonio (ver *Fuera de alcance*).
- Cero riesgo de regresión: ninguna vista existente cambia de comportamiento.

Esto simplifica muchísimo el plan — desaparece toda la fase de "puente" y el módulo se puede construir y borrar sin tocar nada más.

### D2. ¿Qué es "pagué el dividendo"?

Se cobra automático a la cuenta corriente. Hay dos verdades distintas:
- *se emitió el cargo* (día D, monto conocido) → se puede generar solo;
- *el cargo pasó* (había saldo) → la app no lo sabe.

Se genera la obligación y nace marcada como pagada (`auto_debit = true`), con un chip discreto "sin confirmar" hasta que la revises. Nunca al revés: dar por impago algo que sí se pagó genera alertas falsas y se deja de mirar el módulo.

### D3. Los recargos del aseo: estimar sin inventar

Tus dos giros vencidos:

| Giro | Vence | Base | Penal | IPC | Total |
|---|---|---|---|---|---|
| 2600580210 | 30/04/2026 | $13.950 | $391 | $350 | $14.691 |
| 2600580211 | 30/06/2026 | $13.950 | $194 | $34 | $14.178 |

$391 sobre $13.950 en ~4 meses no es 1,5% mensual limpio; hay reglas de mes parcial y reajuste que no vale la pena replicar de memoria. **La app no fabrica el número exacto**: muestra un estimado rotulado como tal, y la cifra real entra cuando la consultas en TGR. Coherente con lo que ya está escrito en el repo — la app no ajusta números reales.

*(El reajuste de la renta es distinto: ahí el contrato define la fórmula exacta y la serie de IPC ya está en la app, así que ese sí se calcula en firme. Ver P2.)*

---

## P1 — El ledger de obligaciones + derechos de aseo

### P1.1 Migración `20260904_properties.sql`

```sql
create table public.properties (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  alias       text not null,              -- "Depto Santa Victoria"
  address     text,
  comuna      text,
  rol_sii     text,                       -- 105980225 (llave de aseo/contribuciones)

  mortgage_amount            integer,     -- dividendo CLP
  mortgage_due_day           integer check (mortgage_due_day between 1 and 31),
  mortgage_account_label     text,        -- "Cta cte Banco de Chile" (rótulo, no número)

  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
```

```sql
create table public.property_charges (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  property_id   uuid not null references public.properties(id) on delete cascade,

  kind          text not null,   -- rent | mortgage | electricity | water | gas | aseo
                                 -- | contribuciones | gastos_comunes | repair | deposit | other
  direction     text not null check (direction in ('in','out')),

  period_month  integer check (period_month between 1 and 12),
  period_year   integer,
  due_date      date not null,

  amount        integer not null,             -- base
  penalty       integer not null default 0,   -- interés penal / multa por atraso
  inflation_adj integer not null default 0,   -- reajuste IPC
  -- total = amount + penalty + inflation_adj → calculado, NO almacenado

  paid_date     date,
  paid_amount   integer,
  auto_debit    boolean not null default false,
  confirmed     boolean not null default false,
  responsible   text not null default 'owner',  -- owner | tenant (GGCC y consumos son del arrendatario)

  external_ref  text,            -- nro de giro / nro de boleta → llave de idempotencia
  document_path text,            -- PDF en bucket 'property-docs'
  notes         text,
  created_at    timestamptz not null default now(),

  unique (user_id, property_id, kind, external_ref)
);
```

**Nada de columna `status`.** Se deriva — misma lección que `currentStatementRange` vs `lastClosedStatementRange` en CLAUDE.md: un estado guardado miente al día siguiente.

`responsible` importa: los consumos y los gastos comunes los paga el arrendatario por contrato. No son costo tuyo, pero su mora **sí** es causal de término y sí te interesa saberla. Se listan, no se suman.

### P1.2 `lib/property-charges.ts` (puro, con tests)

```ts
export type ChargeStatus = 'pending' | 'due_soon' | 'overdue' | 'paid' | 'partial'

/** Estado derivado. due_soon = vence en ≤3 días (umbral gold de UX5). */
export function chargeStatus(c: ChargeLike, todayStr: string): ChargeStatus

/** amount + penalty + inflation_adj */
export function chargeTotal(c: ChargeLike): number

/** Estimación de recargos por mora municipal. SIEMPRE rotulada como estimado. */
export function estimateArrears(base: number, dueDate: string, todayStr: string): {
  penalty: number; inflationAdj: number; isEstimate: true
}

/** Los 4 vencimientos de aseo del año: 30/04, 30/06, 30/09, 30/11. */
export function aseoDueDates(year: number): string[]

/** El chequeo: qué está mal hoy, ordenado por urgencia. */
export function propertyHealth(charges: ChargeLike[], todayStr: string): {
  ok: boolean
  overdue: ChargeLike[]
  dueSoon: ChargeLike[]
  unconfirmed: ChargeLike[]
  debtTotal: number
}
```

Tests obligatorios: los 4 giros reales del ROL 105980225 como caso de referencia, igual que el test "Cas reconciliation" de `wallet-cash.test.ts`.

### P1.3 Generador de aseo

Server action `generateAseoCharges(propertyId, year)`: crea las 4 filas del año con vencimientos de `aseoDueDates()`. Idempotencia por `unique(user_id, property_id, kind, external_ref)` — el patrón de `20260717_auto_register_idempotent.sql`. Correr dos veces no duplica.

Detalle observado en tus giros: la municipalidad emite **de a dos** (2600580210+211 juntos, 2601679116+117 juntos), o sea llegan 2 veces al año cubriendo 2 vencimientos cada vez. El formulario debe aceptar ese par de una sola vez.

### P1.4 Ruta `/propiedad` — entrada propia en el menú

**1. `components/SideNav.tsx`** — nueva entrada en `navItems`, al final del bloque de secciones y antes de Ajustes:

```ts
import { Building2 } from 'lucide-react'

const navItems = [
  { href: '/inicio',       icon: Home,       label: 'Inicio'      },
  { href: '/historial',    icon: BookOpen,   label: 'Historial'   },
  { href: '/analisis',     icon: BarChart2,  label: 'Análisis'    },
  { href: '/ingresos',     icon: Wallet,     label: 'Ingresos'    },
  { href: '/inversiones',  icon: TrendingUp, label: 'Inversiones' },
  { href: '/recurrentes',  icon: RefreshCw,  label: 'Recurrentes' },
  { href: '/propiedad',    icon: Building2,  label: 'Propiedad'   },  // ←
  { href: '/ajustes',      icon: Settings,   label: 'Ajustes'     },
]
```

Va al final justo porque es un mundo aparte: el bloque de arriba son tus finanzas, Propiedad es otra cosa. Queda en 8 ítems; el `<nav>` es `flex-1` dentro de un `aside` `h-screen`, así que entra sin scroll en un viewport de 900px — vale medirlo igual, y si aprieta lo que sobra es el `mb-8` del logo.

**2. `components/BottomNav.tsx`** — las 5 ranuras móviles están tomadas (Inicio, Historial, FAB, Análisis, Más). Propiedad entra por "Más"; solo hay que enseñarle al resaltado que esa ruta pertenece a esa pestaña:

```ts
{ prefix: '/propiedad', tab: '/ajustes' },   // ← resalta "Más"
```

Sin esto la barra no marca nada al estar en `/propiedad` — el mismo detalle ya resuelto para `/categorias` y `/metodos`.

**3. `components/MoreSheet.tsx`** — fila propia. **No** en `financeRows` (no son tus finanzas); grupo nuevo o al inicio de `otherRows`:

```ts
{ href: '/propiedad', icon: Building2, color: '#D97706', bg: '#FFF7ED',
  title: 'Propiedad', subtitle: 'Arriendo, dividendo y cuentas' }
```

Ámbar porque los cinco colores en uso ya están ocupados.

**4. `app/(dashboard)/propiedad/`** — `page.tsx` + `loading.tsx`.

Toggle de 4 pestañas, patrón de `/inversiones`:

- **Estado** — la pantalla principal. No un P&L: un semáforo.
- **Cobros** — el ledger agrupado por vencimiento.
- **Servicios** — luz, agua, consumos (P3).
- **Contrato** — cláusulas vivas y el PDF (P2).

**El hero dice "Todo al día" o "3 cosas pendientes", no un monto.** Es la decisión de diseño que se sigue de D1: si no hay margen que mostrar, mostrar un margen es ruido. Debajo, la deuda viva acumulada (hoy $28.869 de aseo) y el próximo vencimiento.

Jerarquía de alertas según UX5, sin reglas nuevas:
- **coral + banner**: algo vencido impago. Máximo uno; si hay 3, es un banner que dice "3 cobros vencidos".
- **gold + chip**: vence en ≤3 días · el arriendo no llegó y ya pasó el día 5 · toca reajuste de renta · la deuda de aseo creció.
- **mint**: todo al día.

---

## P2 — El contrato: donde está la plata que se pierde por olvido

El contrato notariado (30/05/2026, vigente desde el 01/06/2026) tiene cuatro cláusulas que valen dinero y que hoy nadie va a recordar.

### P2.1 Migración `20260904b_lease_contracts.sql`

```sql
create table public.lease_contracts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  property_id   uuid not null references public.properties(id) on delete cascade,

  tenant_name   text not null,
  tenant_email  text,
  tenant_phone  text,

  start_date    date not null,          -- 2026-06-01
  end_date      date,                   -- null = indefinido
  notice_days   integer default 60,     -- aviso mínimo para terminar

  rent_amount   integer not null,       -- 335000
  rent_due_day  integer not null,       -- 5 (primeros 5 días, mes anticipado)

  late_fee_per_day    integer,          -- 5000 por día de atraso
  termination_days    integer,          -- 30 → derecho a término inmediato
  collection_fee_pct  numeric,          -- 10% honorario de cobranza prejudicial

  adjustment_kind     text,             -- 'ipc' | 'uf' | 'none'
  adjustment_months   integer,          -- 6
  last_adjustment_date date,            -- 2026-06-01 (base)

  deposit_amount       integer,         -- 335000
  deposit_installments jsonb,           -- [{n,amount,due_date,paid}]

  broker_name  text, broker_email text, broker_phone text,

  -- quién paga qué, según contrato
  pays_utilities        text default 'tenant',
  pays_gastos_comunes   text default 'tenant',
  pays_contribuciones   text default 'owner',
  pays_mortgage         text default 'owner',

  document_path text,                   -- el PDF notariado en Storage
  created_at    timestamptz not null default now()
);
```

### P2.2 `lib/lease.ts` — la parte con más palanca

```ts
/** Próxima fecha de reajuste: last_adjustment_date + adjustment_months. */
export function nextAdjustmentDate(c: LeaseLike): string

/**
 * Renta reajustada según IPC acumulado de los `adjustment_months` meses
 * inmediatamente anteriores. Si el acumulado es negativo, devuelve la renta
 * vigente sin cambio (así lo dice el contrato, explícitamente).
 */
export function computeAdjustedRent(
  c: LeaseLike, ipcSeries: IpcObservation[], asOf: string
): { newRent: number; pct: number; from: string; to: string; applied: boolean } | null

/** Multa por atraso: días × late_fee_per_day. Exacta, no estimada. */
export function lateFee(c: LeaseLike, dueDate: string, paidDate: string | null, todayStr: string):
  { daysLate: number; amount: number; canTerminate: boolean }

/** Fecha límite para avisar si se quiere terminar en `targetDate`. */
export function noticeDeadline(c: LeaseLike, targetDate: string): string
```

`computeAdjustedRent` **reutiliza `cumulativeInflationFactor(series, fromDate, toDate)` de `lib/cl-indicators.ts`**, que ya existe y ya está cacheada contra mindicador.cl. Es el mayor ahorro del plan: la pieza difícil ya está construida y probada.

**Detalle de calendario que hay que respetar:** el IPC de noviembre lo publica el INE alrededor del 8 de diciembre. Un reajuste que corresponde al 1 de diciembre no puede calcularse ese día — falta el último dato. El aviso debe dispararse cuando la serie está completa, no en la fecha nominal. Si se calcula el día 1 con 5 meses en vez de 6, el número queda bajo y se cobra de menos.

### P2.3 Las cuatro alertas del contrato

| Cuándo | Qué | Severidad |
|---|---|---|
| IPC de nov publicado (~8 dic 2026) | "Toca reajustar: la renta sube a $X (IPC 6m: +Y%)" + botón *Aplicar* | gold |
| Día 6 del mes sin pago registrado | "El arriendo no ha llegado. Multa acumulada: $5.000" | gold |
| Cada día que sigue impago | La multa sube $5.000 y se ve subir | gold |
| Día 35 (30 de mora) | "Mora de 30 días — el contrato permite término inmediato" | **coral** |

La multa se calcula exacta porque el contrato la fija en pesos por día. **Cobrarla o no es decisión tuya** — la app muestra el número, no lo carga ni lo reclama.

### P2.4 Generación mensual

Extender el patrón de `lib/recurring-due.ts` a un `propertyDueDates()` con catch-up de 3 meses (mismo `CATCHUP_MONTHS`), corriendo dentro del `AutoRegister` que ya existe en el layout:

- `rent` → `direction='in'`, vence el día 5, nace impago;
- `mortgage` → `direction='out'`, nace pagado + `confirmed=false` (D2).

El catch-up importa por la misma razón que en el bug de Spotify: si no abres la app entre el día 5 y fin de mes, ese arriendo se perdía para siempre.

### P2.5 "¿Me pagaron?" en un toque

Botón grande en Estado, dos estados. Al marcar pagado: fecha (default hoy), monto (default la renta vigente, editable para pagos parciales) y, si hubo atraso, la multa calculada con opción de registrarla o perdonarla.

Con 6+ meses de datos: puntualidad promedio del arrendatario. Uno que paga siempre el día 12 no es urgente, pero es un dato que quieres antes de renovar.

---

## P3 — Boletas de luz y agua desde el PDF

Reutiliza el pipeline de liquidaciones tal cual: `unpdf.extractText()` → parser por regex → **borrador editable** → confirmas → guarda. Ese borrador es lo que hace que un parser que falla degrade a carga manual y nunca a un dato inventado.

Santa Victoria 562 está en Santiago centro → **Enel Distribución** (luz) y **Aguas Andinas** (agua).

```ts
export interface ParsedUtilityBill {
  provider: 'enel' | 'aguas_andinas' | 'unknown'
  kind: 'electricity' | 'water'
  clientNumber: string | null
  total: number | null
  dueDate: string | null          // YYYY-MM-DD
  periodFrom: string | null
  periodTo: string | null
  consumption: number | null      // kWh o m³
  previousBalance: number | null   // saldo anterior impago
}
export function parseUtilityBill(text: string): ParsedUtilityBill
```

Detección de proveedor por marcador en el texto, luego regex por labels ("Total a pagar", "Vence el", "Consumo del período", "N° de cliente"). Fallback: `provider: 'unknown'`, campos en null, formulario manual, sin error.

**Ojo con el rol de estas boletas.** Por contrato las paga el arrendatario, a su nombre. No son gasto tuyo. Se registran con `responsible='tenant'` por dos razones concretas: la mora en los consumos es causal de término, y **un salto de consumo de agua sin explicación en un departamento donde no vives es una filtración** — y eso sí termina siendo plata tuya. Chip gold cuando el consumo supera en >40% el promedio de los 3 períodos anteriores.

**Bucket `property-docs`**: privado, mismas políticas RLS que `payslips` (`(storage.foldername(name))[1] = auth.uid()::text`), ruta `{user_id}/{property_id}/{kind}-{year}-{month}.pdf`. Guardar siempre el original: si el parser mejora, se reprocesa.

---

## P4 — Que la app avise sola

Edge function `notify-property`, calcada de `notify-deposit-maturity`:

- 3 días antes de un vencimiento de aseo o contribuciones;
- el día que un cobro pasa a vencido;
- el día 6 si el arriendo no está marcado como cobrado, y luego con la multa acumulada;
- cuando toca reajuste y la serie de IPC ya está completa;
- consumo de agua o luz anómalo.

Todo dentro del módulo. No toca el correo semanal ni el informe mensual existentes.

---

## Fuera de alcance (por decisión D1)

Anotado para que quede claro que se descartó a propósito, no por olvido:

- **`property_id` en `expenses`** — no se agrega. El dividendo no aparece en Gastos del mes.
- **Arriendo en `incomes`** — no se toca. `incomes` sigue siendo el casillero del sueldo que llena `payslips`.
- **Flujo de caja 30 días** — no se le agregan eventos de propiedad.
- **Patrimonio** — el departamento como activo y el saldo del crédito como deuda quedan fuera. Es la única pieza donde "mundo aparte" tiene un costo real: hoy el patrimonio neto ignora tu activo más grande. Se puede reconsiderar después, aislado, sin rehacer nada de esto.

---

## Orden y esfuerzo

| Fase | Qué desbloquea | Esfuerzo | Riesgo |
|---|---|---|---|
| **P1** | Los 4 giros cargados, la deuda visible, la sección en el menú | 2 migraciones, `lib/property-charges.ts` + tests, ruta + 3 componentes, 3 archivos de navegación | bajo |
| **P2** | Contrato vivo: reajuste, multa, garantía, pulso mensual | 1 migración, `lib/lease.ts` + tests, extender AutoRegister | bajo — el IPC ya está resuelto |
| **P3** | Luz y agua sin tipear + detección de filtraciones | 1 lib + tests, bucket, uploader (copia del de liquidaciones) | **medio** — parsers de PDF de terceros se rompen solos |
| **P4** | Avisos automáticos | edge function | bajo |

Con D1 resuelta, **el riesgo de regresión es esencialmente cero**: ninguna vista existente cambia. El módulo se puede construir entero y borrar sin dejar rastro.

**P1 + P2 es el corazón.** P1 resuelve el aseo de hoy; P2 evita que se te pase el reajuste de diciembre.

---

## Guardarraíles

- **Ningún estado almacenado que dependa de la fecha.** `chargeStatus` se deriva siempre.
- **Los recargos municipales se rotulan como estimados.** El número verdadero lo pone TGR. El reajuste de renta y la multa por día sí son exactos: el contrato los define.
- **Todo parser de PDF pasa por un borrador que confirmas.** Nunca escritura directa a la BD.
- **Idempotencia por `external_ref`** (nro de giro, nro de boleta). Evita el duplicado que ya se sufrió con los recurrentes.
- **Un solo banner coral por pantalla** (UX5).
- **CLP entero siempre**, `formatCLP()`, sin abreviaturas.
- **Nada de números de cuenta bancaria en la BD ni en la UI.** El contrato los tiene; la app guarda un rótulo ("Cta cte Banco de Chile"), no el número. No hace falta para nada y es un dato que no conviene tener duplicado.
- **Consultar TGR automáticamente queda fuera de alcance.** Scraping de un sitio de gobierno es frágil y se rompe sin aviso. El flujo es: la app te recuerda revisar, tú pegas la cifra.
- **La app informa, no ejerce.** Calcula la multa y muestra el plazo de mora; cobrar, condonar o terminar el contrato son decisiones tuyas. Para cualquier acción legal, el contrato y un abogado mandan sobre lo que diga la app.

---

## Anexo A — Derechos de aseo

**ROL 105980225 · Santa Victoria 562, depto 921**

| Giro | Vencimiento | Base | Penal | IPC | Total | Estado |
|---|---|---|---|---|---|---|
| 2600580210 | 30/04/2026 | $13.950 | $391 | $350 | $14.691 | vencido |
| 2600580211 | 30/06/2026 | $13.950 | $194 | $34 | $14.178 | vencido |
| 2601679116 | 30/09/2026 | $14.330 | — | — | $14.330 | por vencer |
| 2601679117 | 30/11/2026 | $14.330 | — | — | $14.330 | futuro |

Deuda viva al 03/09/2026: **$28.869**. Alza de tarifa base 2026: $13.950 → $14.330 (+2,7%).

Se pagan en 4 cuotas anuales con vencimientos en abril, junio, septiembre y noviembre, gestionadas por la Tesorería General de la República.

**Fuentes:** [TGR — Pago de Derechos de Aseo](https://tgr.gob.cl/pago-de-derechos-de-aseo/) · [El Mostrador — cuándo vencen las cuotas](https://www.elmostrador.cl/datos-utiles/2026/04/05/derechos-de-aseo-como-pagar-el-servicio-de-retiro-de-basura-y-cuando-vencen-las-cuotas/)

---

## Anexo B — Contrato de arrendamiento

Firmado el 30/05/2026, notaría Fabián Díaz (San Miguel), CVE 120-AP144997AU. Arrendatario: Bruno Adrián Soto Aguilera.

| Cláusula | Valor | Qué genera en la app |
|---|---|---|
| Vigencia | desde 01/06/2026, **indefinido** | base del calendario |
| Renta | **$335.000**, mes anticipado, primeros 5 días | cobro mensual día 5 |
| Reajuste | **IPC acumulado, cada 6 meses**; si es negativo se mantiene | **1er reajuste: dic 2026** |
| Mora | **$5.000 por día de atraso** | multa exacta, calculada |
| Mora >30 días | término inmediato del contrato | banner coral |
| Cobranza judicial | 10% del monto adeudado | dato informativo |
| Garantía | $335.000 en 3 cuotas: $112.000 + $112.000 + $111.000 | jun–ago 2026 — **verificar que se completó** |
| Aviso de término | **60 días**, carta certificada o correo | `noticeDeadline()` |
| Paga el arrendatario | luz, agua, gas, internet, **gastos comunes**, reparaciones locativas | `responsible='tenant'` |
| Paga la arrendadora | **dividendo, contribuciones**, seguros, reparaciones de instalaciones | obligaciones tuyas |
| Corredora | Glorian Cepeda — recibe los comprobantes | contacto del contrato |

**Lo primero que hay que revisar, antes de escribir código:** que las 3 cuotas de la garantía ($112.000 + $112.000 + $111.000) se hayan pagado completas entre junio y agosto. Si falta alguna, es plata pendiente desde hace meses que nadie está contando.
