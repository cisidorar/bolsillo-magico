# Roadmap — fusionar Depósitos y Ahorro en una sola pestaña

**Estado: A1-A5 implementados (ago 2026).** `npx tsc --noEmit` y `npm test -- --run` (370/370) verdes. Nombre elegido: **"Ahorro y depósitos"**, URL canónica `?view=ahorro` (`?view=depositos` queda como alias).

Pregunta de Cas (ago 2026): *"¿es posible que depósitos y ahorro estén en la misma pestaña?"*

**Respuesta corta: sí, y conceptualmente corresponde.** Hoy `/inversiones` tiene cuatro tabs (Acciones · Billetera · Depósitos · Ahorro) que en realidad son **dos mundos distintos**:

- **Mundo USD / riesgo:** Acciones (posiciones + radar técnico) y Billetera (el fondo en dólares desde el que se compran esas acciones). Rinden en USD, tienen volatilidad, tienen decisión diaria.
- **Mundo CLP / renta fija:** Ahorro (cuenta remunerada, TAE compuesta diaria, líquida) y Depósitos a plazo (interés simple del período, plata inmovilizada hasta el vencimiento). Los dos son "plata segura en pesos que rinde un interés conocido".

Separar los dos últimos en tabs distintas obliga a Cas a mirar en dos lugares para responder una sola pregunta: *"¿cuánta plata segura tengo en pesos y cuánto me está rindiendo?"*. Además en mobile las tabs esconden el label (`hidden sm:inline` en `InversionesToggle`), así que hoy son cuatro íconos sin texto — bajar a tres mejora también eso.

**Lo que NO hay que hacer:** sumar los dos totales a ciegas y mostrar un solo número grande. La diferencia entre ambos instrumentos es real y le importa a Cas: el ahorro se puede sacar hoy, el depósito no hasta su fecha. Esa distinción tiene que sobrevivir a la fusión — de hecho es la oportunidad de la fusión (ver A2).

---

## Diagnóstico técnico — qué hay que tocar

Lo revisado en el código actual:

| Pieza | Estado hoy | Impacto de la fusión |
|---|---|---|
| `components/InversionesToggle.tsx` | 4 tabs, tipo `InversionesView = 'acciones' \| 'depositos' \| 'ahorro' \| 'billetera'` | Baja a 3 tabs; el tipo pierde un miembro |
| `components/DepositManager.tsx` (ahorro) | Renderiza **su propio** `<InversionesToggle active="ahorro" />` + su propio botón "Agregar" en una top bar | Si se renderizan los dos managers juntos salen **dos toggles y dos botones Agregar** — hay que subir el toggle a `page.tsx` |
| `components/TermDepositManager.tsx` | Mismo patrón: `<InversionesToggle active="depositos" />` + "Agregar" propio | Igual que arriba |
| `app/(dashboard)/inversiones/page.tsx` | `isAhorro` / `isDepositos` como ramas excluyentes de un ternario | Pasan a ser una sola rama que renderiza ambos |
| `trailingInflationPct` | Solo se pide `if (isAhorro)` — la rentabilidad real (IPC) hoy existe únicamente en Ahorro | Hay que pedirlo para la vista fusionada; aplica igual de bien a depósitos |
| `components/PatrimonioCards.tsx` | Linkea a `?view=depositos` (línea 201) y `?view=ahorro` (líneas 202, 203, 434, 527) | Los links a `?view=depositos` quedarían apuntando a una vista que ya no existe → hoy caerían silenciosamente en Acciones (peor que un 404) |
| `lib/net-worth.ts` + `net_worth_snapshots` | `deposits_clp` y `savings_clp` son **columnas separadas** | **No se tocan.** El patrimonio los sigue distinguiendo; esto es solo una fusión de UI |
| `app/(dashboard)/inversiones/loading.tsx` | Skeleton genérico | Conviene que refleje la vista fusionada |

Ninguna migración de base de datos es necesaria: las tablas `savings_accounts` y `term_deposits` siguen separadas, con su lógica de cálculo propia. Esto es exclusivamente una reorganización de vista.

---

## A1 — Subir el toggle y el botón "Agregar" a la página (bloqueante, esfuerzo bajo) ✅

**Problema.** Cada manager es hoy dueño de su propia top bar: dibuja el `InversionesToggle` y su botón "Agregar". Mientras cada uno vivía en su tab eso funcionaba; al ponerlos en la misma pantalla se duplican los dos elementos.

**Propuesta.**
- Sacar `<InversionesToggle />` de `DepositManager`, `TermDepositManager` (y por consistencia de `Radar` y `UsdWalletManager`) y renderizarlo **una sola vez** en `page.tsx`, junto al `<h1>Inversiones</h1>`.
- Cada manager conserva su botón "Agregar" pero pasa a vivir **en el header de su propia sección**, no en una top bar de página: "Cuentas de ahorro [+ Agregar]" y "Depósitos a plazo [+ Agregar]". Así queda claro qué se está agregando — hoy el botón dice solo "Agregar" y el contexto se lo daba la tab.
- Los chips informativos de cada top bar (`6,0% TAE promedio` en ahorro, `Próximo vencimiento: …` en depósitos) se mueven al header de su sección.

**Por qué primero.** Es el bloqueo estructural: sin esto la fusión se ve rota. Y es un cambio mecánico, sin decisiones de producto.

**Implementado:** `InversionesToggle` bajó a 3 tabs (`acciones` | `billetera` | `ahorro`, label "Ahorro y depósitos"); se renderiza una sola vez en `page.tsx` para la vista fusionada. `DepositManager` y `TermDepositManager` ya no dibujan su propio toggle — cada uno quedó con un header de sección (`<h2>` + chip + botón "Agregar" propio) y un `id` (`#ahorro` / `#depositos`) para las anclas de A4. Radar y UsdWalletManager (Acciones/Billetera) no se tocaron — siguen igual, fuera del alcance de esta fusión.

---

## A2 — Una card de resumen que respete la liquidez (alto, esfuerzo medio) ✅

**Problema.** Cada manager trae su propio hero grande: Ahorro muestra "Total en ahorro" con Depositado/Interés ganado/Rentabilidad, y Depósitos muestra "Total al vencimiento" con Invertido/Interés total. Apilados quedan dos heroes gigantes compitiendo, y ninguno responde la pregunta combinada.

**Propuesta.** Un solo hero arriba de las dos secciones: **"Total en pesos"**, con el capital sumado (`savings.balance` + `term_deposits.amount`), y debajo el desglose que sí importa:

- **Disponible hoy** — el saldo de ahorro (líquido, se puede sacar ahora).
- **Comprometido** — el capital en depósitos + hasta cuándo (fecha del vencimiento más cercano).
- **Interés ganado** — la suma de ambos (`earnedSoFar` del ahorro + `earnedToDate` de los depósitos), que hoy no existe en ningún lado como número único.
- **Tasa promedio ponderada** por capital, con su equivalente real vs. IPC (extendiendo `realReturnPct`, que hoy solo se usa en Ahorro).

Los dos heroes actuales se degradan a headers de sección compactos — la información no se pierde, deja de competir.

**Cuidado con la comparación de tasas.** El ahorro se expresa en TAE (anual) y el depósito en tasa del período (0,39667% a 35 días). Sumar o promediar esos dos números tal cual es un error de unidades. Para el promedio ponderado hay que **anualizar la tasa del depósito** (`(1 + r)^(365/díasDelPlazo) - 1`) antes de mezclarla. Esto amerita una función con test en `lib/`, no un cálculo suelto en el componente.

**Implementado:** `lib/renta-fija-summary.ts` (`computeRentaFijaSummary`, con test) + `components/RentaFijaSummary.tsx`. Los depósitos YA VENCIDOS sin reinvertir se tratan como líquidos (pasan a "Disponible hoy" con su interés completo) y dejan de pesar en la tasa promedio ponderada — están rindiendo 0% ahora mismo ("plata parada"), meterlos en el promedio habría maquillado la lectura. `lib/savings-accounts.ts` y `lib/term-deposits.ts` (con `annualizeRate`) se extrajeron de los managers para que este resumen no duplicara la fórmula en un tercer lugar.

---

## A3 — Compatibilidad de URLs y links entrantes (medio, esfuerzo bajo) ✅

**Problema.** `PatrimonioCards` linkea a `?view=depositos` desde la card "Depósitos" del patrimonio. Si la vista deja de existir, `sp.view` no matchea ninguna rama y cae en el `else` → **muestra Acciones sin avisar**. Un link roto silencioso es peor que uno que falla fuerte.

**Propuesta.**
- Definir una vista canónica (ver "Decisión pendiente" abajo) y tratar el otro valor como **alias**: `const isRentaFija = sp.view === 'ahorro' || sp.view === 'depositos'`.
- Actualizar los links de `PatrimonioCards` al valor canónico, pero **dejar el alias funcionando** para bookmarks y correos ya enviados.
- Revisar que las Edge Functions de correo (`notify-weekly-report`, `notify-watchlist-digest`, `notify-fomc-reminder`) solo linkean a `/inversiones` pelado — confirmado, no usan `?view=`, así que no hay correos viejos que arreglar.

**Implementado:** `isAhorro = sp.view === 'ahorro' || sp.view === 'depositos'` en `page.tsx`. Los links de `PatrimonioCards` a Depósitos/Ahorro pasaron a `?view=ahorro#depositos` / `?view=ahorro#ahorro`. De paso se corrigió un bug encontrado ahí mismo: la card "Dólares" apuntaba a `?view=ahorro` en vez de `?view=billetera`.

---

## A4 — Anclas para llegar a la sección correcta (bajo, esfuerzo bajo) ✅

**Problema.** Con las dos secciones en una pantalla, el link de la card "Depósitos" del patrimonio te deja arriba de todo y hay que scrollear.

**Propuesta.** `id` en cada sección (`#ahorro`, `#depositos`) y que los links del patrimonio apunten a `/inversiones?view=ahorro#depositos`. Barato, y hace que el link siga significando lo que decía.

**Implementado:** `id="ahorro"` / `id="depositos"` + `scroll-mt-20` en los divs raíz de `DepositManager` y `TermDepositManager`, para que el ancla no quede tapada por el header sticky.

---

## A5 — Skeleton de carga acorde (bajo, esfuerzo bajo) ✅

**Problema.** `loading.tsx` hoy dibuja un skeleton de "Acciones KPIs + Depósitos" que no corresponde a ninguna de las vistas reales.

**Propuesta.** Que refleje la vista fusionada: hero de resumen + dos bloques de sección. Convención de la app: los skeletons espejan el layout real (`animate-pulse`).

**Implementado:** skeleton genérico hero + KPIs + lista, razonable para cualquiera de las 3 vistas (antes mezclaba literalmente "Acciones KPIs" + "Depósitos" sin corresponder a ninguna).

---

## Decisión de nombre — resuelta

Se optó por la recomendación: **"Ahorro y depósitos"**, con `?view=ahorro` como URL canónica y `Landmark` como ícono (el de Ahorro hoy). `?view=depositos` sigue funcionando como alias. En mobile el toggle solo muestra el ícono (`hidden sm:inline` en el label), así que el nombre largo no cuesta nada de espacio.

---

## Orden sugerido

1. **Decisión de nombre** — bloquea A1 y A3 (define la URL canónica).
2. **A1** — el refactor estructural; sin esto no se puede ver el resultado.
3. **A3** — apenas la vista cambia, los links entrantes tienen que seguir funcionando.
4. **A2** — el valor real de la fusión: la pregunta combinada que hoy no se puede responder.
5. **A4** y **A5** — pulido.

Reglas transversales: mobile 375px y desktop 1280px+ en cada cambio; `.card` para tarjetas; montos con `formatCLP()` completo (sin abreviar); la jerarquía de severidad UX5 (coral = banner urgente, gold = chip, mint = solo confirmación positiva) aplica al chip de vencimiento cercano y a "plata parada" de depósitos vencidos; validar cada bloque con `rm -rf .next && npx tsc --noEmit` **y** `npm test -- --run`. La función de anualización de tasas de A2 va en `lib/` **con test**, no inline en el componente.
