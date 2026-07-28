# Roadmap · Perfil de largo plazo — comprar barato en tendencia, sin agobio

**Estado: P1-P5 implementados (jul 2026).** `npx tsc --noEmit` y `npm test` (234/234) verdes tras cada bloque. Detalle de qué se implementó tal cual y qué se recortó a propósito, en cada sección.

Diagnóstico (jul 2026, revisión de Acciones + Semanal con el perfil explícito de Cas: *"comprar al menor precio dentro de una tendencia para ganancias de largo plazo, informarme con lo de la Fed, sin mucho conocimiento, sin agobiar"*).

El motor ya sabe hacer casi todo lo que ese perfil necesita: `analyze()` calcula la zona de retroceso (`pullbackRef`), los tramos escalonados dicen "40% si baja a ~$X", el watch avisa "se acerca a un piso", y el cron manda correo cuando un precio objetivo se alcanza. **El problema no es capacidad — es que las piezas no están conectadas para ESTE perfil:** la respuesta "¿es buen precio hoy?" está repartida en 4 lugares, la zona de compra no vigila sola (hay que tipear el target a mano), y la macro son 4 números sin traducción.

**Decisión sobre el Semanal (Cas, jul 2026):** Acciones está bien como está — y la pestaña Semanal duplica demasiado (las cards por ticker repiten el Radar y su detalle, con más jerga: Fibonacci, POC). Lo único que el Semanal aporta que Acciones no tiene son tres cosas: tu semana vs el mercado, el contexto macro y el calendario de lo que viene. Eso cabe en una card, no necesita una pestaña → **P3 la elimina y funde su valor único dentro de Acciones + el correo semanal**. (Los antiguos P3/P5/P6 de la primera versión de este roadmap quedan absorbidos ahí.)

Regla transversal: **no agregar indicadores nuevos**. Todo lo de abajo reordena, conecta o traduce lo que ya se calcula. (Quedan explícitamente fuera: cripto S4, informe opinado N3, más osciladores.)

---

## P1 — "¿Es buen precio hoy?": semáforo de precio por ticker (impacto alto, esfuerzo bajo) ✅

**Problema.** La pregunta central del perfil — *comprar al menor precio dentro de la tendencia* — hoy se respondía leyendo 4 cosas a la vez: el rating ("Compra"), el `entryPlan` en prosa, los tramos (`buy[]`), y las señales de estirado/máximos. Para alguien sin conocimiento técnico, "Compra · estirada · espera un respiro" es una contradicción aparente, no una respuesta.

**Implementado.** `analyze()` ahora devuelve `priceZone: 'conveniente' | 'justo' | 'caro' | null` — deriva de los mismos flags que ya armaban `entryPlan`/`buy` (`onSupport`, `stretched`, `inMax`), sin cálculo nuevo. `null` en tendencia bajista (no hay "precio conveniente" de algo que cae). `PriceZoneChip` (en `RiskRail.tsx`, mismo patrón tap→toast que `ConvictionChip`) se muestra junto al score de convicción en las filas de Radar y en la cabecera del detalle. Tests en `technical.test.ts`: euforia → siempre "Caro", bajista → siempre `null`, uptrend sano → siempre uno de los tres.

## P2 — La zona de compra te avisa a ti, no tú a ella (impacto alto, esfuerzo bajo) ✅

**Problema.** El plan decía "40% si baja a ~$80", y el sistema de precio objetivo + correo YA existía (`target_price` + `target_notified` + cron). Pero nada los conectaba: para enterarse del retroceso había que copiar el precio a mano al editor de objetivo — o entrar todos los días a mirar.

**Implementado.** `analyze()` expone `buyZone: number | null` (el mismo `pullbackRef` que ya usaba `entryPlan`/`buy`, ahora estructurado en vez de solo texto). Botón **"Avísame en la zona de compra"** en el plan de compra del detalle (`TechnicalDetail.tsx`) → `setBuyZoneAlert()` en `Radar.tsx` guarda `target_price = buyZone` (dirección `below`) en la watchlist — agrega el ticker a la watchlist en el mismo paso si todavía no se seguía. El editor de precio objetivo ahora pre-llena con `a.buyZone` (editable) en vez de un campo vacío. El aviso por correo reusa el mecanismo existente de `target_price`/`target_notified` (cron `sync-prices`) sin cambios — su mensaje genérico ("Llegó a tu precio de entrada: bajó a $X") ya cubre el caso; no se tocó el copy del cron para no arriesgar la lógica de notificación en producción.

## P3 — Adiós pestaña Semanal: una card "Tu semana" en Acciones + el correo como informe (impacto alto, esfuerzo medio) ✅

**Problema.** `?view=semanal` duplicaba el Radar ticker por ticker (mismo rating, mismas señales, mismo veredicto, un día después) y agregaba la jerga que el perfil no pidió (Fibonacci, POC, backtest siempre visibles). Lo ÚNICO que aportaba y que Acciones no tenía: tu semana vs el mercado, el contexto macro (S1) y el calendario de lo que viene.

**Implementado.**
- Vista `?view=semanal` eliminada de `page.tsx`, `InversionesToggle` y `components/WeeklyReport.tsx` (borrado — sin más consumidores).
- Nuevo `lib/market-week.ts` (con test): `FOMC_DECISION_DATES_2026` (8 fechas oficiales, fuente federalreserve.gov — actualizar cada año), `nextFomcMeeting()`, `fedRateSentence()` (traduce DFF a una frase acotada a los 30 días de historia cacheada — no dice "hace N meses" porque el dato no alcanza para afirmarlo), `inflationSentence()` (CPI interanual, compara contra 3 meses atrás para decidir dirección).
- Nuevo `components/WeekSnapshotCard.tsx`: card colapsada por defecto (`<details>` nativo, cero JS) con el resumen vs. SPY siempre visible en el `<summary>`, y Fed + inflación + curva invertida (solo si aplica) + calendario (FOMC ≤7 días, earnings de tickers en cartera ≤5 días hábiles) detrás del tap.
- `page.tsx` ahora calcula macro y "lo que viene" siempre (cache 24h, barato) en vez de solo al abrir la pestaña — y ya no depende de `lib/weekly-report.ts` (ese sigue vivo, con un solo consumidor: el cron `weekly-report` que arma el correo, ahora el informe completo por ticker).
- Link del correo semanal actualizado (`supabase/functions/notify-weekly-report`): apunta a `/inversiones` en vez de la vista eliminada.

## P4 — Del aporte mensual a la decisión (impacto medio, esfuerzo medio) ✅ (recortado a propósito)

**Problema.** La meta mensual de inversión (`monthly_invest_goal`, jul 2026) vive en `/inicio` y `/analisis`, pero `/inversiones` la ignoraba por completo.

**Implementado.** `page.tsx` trae `profiles.monthly_invest_goal` y calcula `investedThisMonthClp` con el MISMO criterio que `/inicio` (depósitos a la billetera USD del mes, `usd_purchases.kind='deposit'`, en CLP — el aporte real desde el mundo CLP). El panel "¿Qué comprar hoy?" de Radar muestra una barra de progreso meta/invertido, y si no hay nada Conveniente/accionable hoy lo dice sin culpa: *"Este mes no hay precio conveniente en tu radar — la meta puede esperar en la billetera"*.

**Recortado a propósito:** la propuesta original sugería que `suggestedUsdFor` descontara el saldo de meta restante como tope adicional. No se implementó — habría exigido convertir el saldo de meta (CLP) a un tope en USD sin una tasa de cambio confiable en vivo (la app solo tiene tasas implícitas históricas por depósito), y meter una conversión aproximada dentro de la función que decide CUÁNTO comprar es más riesgo que valor: una sugerencia de monto mal calculada por un tipo de cambio inventado es peor que no tener el tope. Queda documentado para retomar si en algún momento se agrega una tasa CLP/USD confiable.

## P5 — Micro-educación en contexto (impacto bajo, esfuerzo bajo) ✅

**Problema.** `InfoTap` ya existía y se usaba en `/inicio`, pero Radar/TechnicalDetail no lo usaban ni una vez.

**Implementado.** Convicción (`ConvictionChip`) y precio conveniente (`PriceZoneChip`, P1) ya explican al tap con el mismo patrón que `InfoTap` (tap→toast) — no se duplicó el mecanismo. Se agregó `InfoTap` explícito en los dos términos que quedaban sin explicación: la escalera de precios ("Dónde está el precio" — explica costo/salida/trailing/techo en una frase) y "Tendencia larga" (explica SMA200/promedio de 200 días) en `TechnicalDetail.tsx`.

---

## Orden sugerido

| Ítem | Por qué en este orden |
|---|---|
| **P1 + P2** | El corazón del perfil: saber si el precio es bueno y que la zona de compra avise sola. Ambos de esfuerzo bajo, ambos solo conectan piezas existentes. |
| **P3** | La decisión ya tomada sobre el Semanal: borra una vista entera, funde su valor único en una card de 3 líneas + el correo. Anti-agobio neto (se elimina más de lo que se agrega). |
| **P4** | Cierra el círculo sueldo → meta → compra. Depende de P1 para el mensaje "no hay precio conveniente". |
| **P5** | Pulido educativo; en cualquier momento, incluso entremedio. |

Validación de cada bloque: `npx tsc --noEmit` + `npm test`; toda regla nueva (semáforo P1, traducción macro P3) entra con test propio en `lib/`, como las existentes. Ninguna de estas señales es asesoría financiera: siguen siendo reglas automáticas sobre datos públicos.
