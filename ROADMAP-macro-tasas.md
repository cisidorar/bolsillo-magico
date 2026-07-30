# Roadmap · Análisis de tasas: de "cuál es la tasa" a "hacia dónde va y qué te hace"

**Estado: propuesta (jul 2026).** Nada implementado todavía. Detonante: la decisión del FOMC del 29 de julio de 2026.

---

## Qué pasó el 29 de julio de 2026

- La Fed **mantuvo** la tasa en **3.50%–3.75%**, quinta reunión consecutiva sin cambios.
- La votación fue **9–3**: tres presidentes regionales (Hammack, Kashkari, Logan) disintieron **a favor de subir** — la mayor cantidad de disidencias desde septiembre de 2016. La inflación lleva más de cinco años sobre el objetivo de 2%.
- **El mercado tiene precio para dos alzas de 25 pb: septiembre y diciembre de 2026**, y luego nada hasta 2027. Una subida en septiembre es hoy el escenario más probable según los futuros de tasa.

**Por qué esto rompe el modelo actual de la app.** `fedRateSentence()` lee `DFF` (tasa efectiva realizada, 30 días de historia) y, con estos datos, hoy imprime literalmente:

> *"La Fed mantiene la tasa en 3.6X% — estable en el último mes, **sin presión nueva sobre las acciones**."*

Eso es **falso en este momento**. La tasa no se movió, pero el contexto cambió mucho: tres disidencias hawkish y dos alzas ya incorporadas en el precio de los bonos. La app está estructuralmente ciega a esto porque **solo mira la tasa en el espejo retrovisor**: `DFF` se mueve *después* de la decisión, nunca antes. La variable que hoy manda — la **expectativa** — no se está leyendo.

Este roadmap corrige eso y, sobre esa base, construye el análisis más complejo que pediste: qué le hace cada movimiento posible a **tu** cartera.

---

## Reglas de la casa que se mantienen

Las mismas de `ROADMAP-largo-plazo-inversiones.md`, sin excepción:

1. **Plantillas deterministas sobre datos públicos.** La IA no opina ni redacta números macro. Si no se puede calcular, no se muestra.
2. **Todo indicador nuevo tiene que cambiar una decisión.** No se agregan números para llenar una card.
3. **Jerarquía UX5** — coral = acción hoy, gold = atención pronto, mint = confirmación. Máximo un banner coral por pantalla.
4. **Sin agobio.** El perfil es largo plazo, comprar barato en tendencia. Nada de esto debe empujar a operar alrededor de una reunión de la Fed.
5. **Degradación limpia.** Sin `FRED_API_KEY`, cada pieza desaparece sola sin romper la página (patrón ya establecido en `lib/macro-fetch.ts`).

### Fuera de alcance, a propósito

- **Probabilidades tipo CME FedWatch.** No hay API gratuita y confiable; una probabilidad mal scrapeada es peor que ninguna. El proxy de M1 (abajo) entrega la misma señal con datos que sí son públicos y estables.
- **Comentario macro escrito por IA.** Contradice la regla 1.
- **Rotación sectorial recomendada.** Exigiría datos fundamentales (duración, múltiplos) que la app no tiene ni va a comprar.
- **Cualquier feature que sugiera operar alrededor del FOMC.** Contradice el perfil.

---

## M1 — Leer la expectativa, no solo la tasa (impacto alto · esfuerzo bajo)

**Problema.** Descrito arriba: `DFF` es un dato retrospectivo. Hoy la app dice "sin presión nueva" el mismo día en que el mercado incorporó dos alzas.

**Propuesta.** Nuevo `lib/rate-path.ts` (+ test), puramente aritmético:

- Agregar a `MACRO_SERIES` en `lib/macro-fetch.ts`:
  - `DGS2` ya está.
  - `T10YIE` — inflación implícita a 10 años (lo que el mercado espera de inflación).
  - `DFII10` — tasa **real** a 10 años (TIPS). Es el driver más directo de los múltiplos de las acciones de crecimiento.
- `computeRatePath(dgs2, dff)` → `{ spreadBp, direction: 'alzas' | 'estable' | 'bajas', impliedMoves }`.

  El bono a 2 años es, por construcción, el promedio esperado de la tasa de política de los próximos dos años. **`DGS2 − DFF` es un proxy limpio, gratuito y determinista de hacia dónde va la tasa**: si el 2 años rinde claramente por encima de la tasa actual, el mercado espera alzas; por debajo, recortes. `impliedMoves = round(spreadBp / 25)` traduce eso a "movimientos de 25 pb", que es como se lee la noticia.

  Umbral propuesto: `|spread| < 15 pb` → `'estable'` (ruido de mercado, no señal).

- Reescribir `fedRateSentence()` para que combine nivel + dirección:

  > *"La Fed mantiene la tasa en 3.63%, pero el bono a 2 años ya cotiza 45 pb más arriba — el mercado tiene precio para ~2 alzas. Para acciones de crecimiento eso es viento en contra; no cambia tu plan de largo plazo, pero explica por qué los múltiplos altos están más castigados."*

**Por qué primero.** Es el único ítem que corrige una frase **actualmente equivocada** en producción, y es el insumo del que dependen M2, M3 y M4.

---

## M2 — Cuánto le pega a *cada acción tuya* (impacto alto · esfuerzo medio)

**Problema.** "Suben las tasas" es una noticia genérica. Lo accionable es: *a cuáles de mis posiciones les pega y a cuáles no*. Hoy la app no distingue: NVDA y una utility reciben exactamente la misma frase macro.

**Propuesta.** Nuevo `lib/rate-sensitivity.ts` (+ test). Sensibilidad **empírica**, no fundamental — se calcula con datos que ya están en la base:

```
Para cada ticker con ≥120 ruedas en `daily_prices`:
  x = variación diaria de DGS2 (en pb)     ← FRED, ya cacheado
  y = retorno diario del ticker (%)         ← ya está en la DB
  beta = cov(x, y) / var(x)     sobre ventana móvil de 6 meses
```

Salida: `{ betaPer10bp, r2, n }` — *"por cada +10 pb en el bono a 2 años, este ticker se movió históricamente −1.8%"*.

**Honestidad estadística, no decorativa** (mismo criterio que ya usa el clamp de fiabilidad en `lib/conviction.ts`):

- Solo se muestra si `n ≥ 120` y `r² ≥ 0.10`. Bajo eso: **"sin relación clara con las tasas"**, que es una respuesta legítima y frecuente.
- Copy siempre en pasado y en condicional: *"se movió históricamente"*, nunca *"va a caer"*. Correlación no es causalidad y el texto debe decirlo con un `InfoTap`.

**Dónde se ve.** Un chip discreto en la ficha del ticker (`TechnicalDetail.tsx`), junto a los chips que ya existen (`ConvictionChip`, `PriceZoneChip`) — mismo patrón tap→toast, sin card nueva.

---

## M3 — Escenarios: qué pasa si suben, si mantienen, si bajan (impacto alto · esfuerzo medio · depende de M2)

**Problema.** Esto es literalmente lo que pediste: *"los posibles movimientos"*. Hoy no existe nada parecido en la app.

**Propuesta.** Nuevo `lib/rate-scenarios.ts` (+ test) y una card **colapsada por defecto** en `/inversiones` (mismo patrón `<details>` de `WeekSnapshotCard`, cero JS).

Tres escenarios anclados al calendario real de la Fed (16 sep · 28 oct · 9 dic):

| Escenario | Movimiento | Ancla |
|---|---|---|
| **Sube** | +25 pb | Lo que el mercado ya tiene en precio para septiembre |
| **Mantiene** | 0 pb | Statu quo (quinta reunión seguida) |
| **Baja** | −25 pb | Cola de baja probabilidad — se incluye para no sesgar |

Para cada uno: `impactoUSD = Σ (valorPosición × betaPer10bp × movimientoEn10bp)` usando la beta de M2, y el total de cartera.

**Advertencias que van en el código y en la UI, no en un comentario:**

- Es una **aproximación lineal de primer orden**. Sirve para ordenar magnitudes ("esto me afecta 5× más que aquello"), no para predecir un precio.
- Tickers sin beta confiable (M2) entran como **0 y se listan aparte** — no se les inventa una sensibilidad promedio.
- Los ETFs apalancados ya detectados por `lib/leveraged-etfs.ts` deben multiplicar su impacto por el `factor` (2× o 3×). Sin esto, un `TMF` (3× bonos largos) aparecería subestimado justo en el escenario que más le importa.
- **Severidad:** este bloque es **gold como máximo, nunca coral.** Un escenario hipotético no es una acción para hoy y no debe competir con las alertas reales de la cartera.

---

## M4 — La tasa dentro de la decisión de compra (impacto medio · esfuerzo bajo · depende de M2)

**Problema.** `computeConviction()` pondera cuatro cosas (técnico 40 · riesgo/recompensa 25 · track record 20 · fuerza relativa 15) y ninguna sabe que el mercado espera dos alzas.

**Propuesta — y una decisión explícita de diseño: NO agregar un quinto peso.**

Meter macro dentro del score rompería dos cosas a la vez: la comparabilidad del score con su propia historia (el backtest de `lib/signal-backtest.ts` quedaría midiendo una métrica distinta a la que generó las señales pasadas), y la trazabilidad de por qué un ticker bajó de 72 a 61 sin que cambiara nada suyo.

En cambio, **una razón contextual sin tocar el número**: cuando `direction === 'alzas'` (M1) **y** el ticker está en el cuartil más sensible (M2), `computeConviction()` agrega a `reasons[]`:

> *"Sensible a tasas: el mercado espera ~2 alzas y este ticker se movió históricamente −1.8% por cada +10 pb. No invalida la compra; sí sugiere entrar por tramos en vez de todo de una."*

Esto encaja con la mecánica de tramos escalonados (`buy[]`) que el motor ya calcula — es una razón para usarlos, no un veto.

---

## M5 — Arreglar el calendario FOMC antes de que se apague solo (impacto medio · esfuerzo bajo)

**Bug latente encontrado revisando esto.** `FOMC_DECISION_DATES_2026` en `lib/market-week.ts` contiene **solo fechas de 2026**. La última es el **9 de diciembre de 2026**. A partir de esa fecha, `nextFomcMeeting()` devuelve `null` para siempre y la sección "Lo que viene" pierde silenciosamente la mitad de su contenido — sin error, sin aviso. Faltan ~4 meses.

**Propuesta.**

1. Agregar las fechas de 2027 (segundo día de cada reunión, fuente `federalreserve.gov`; el propio calendario de la Fed las marca como tentativas hasta confirmarse reunión a reunión):
   `2027-01-27 · 2027-03-17 · 2027-04-28 · 2027-06-09 · 2027-07-28 · 2027-09-15 · 2027-10-27 · 2027-12-08`
2. **Test que falla solo**: un caso que verifique que la lista cubre al menos 6 meses hacia adelante desde `hoy`. Así la próxima vez que se venza, lo dice la suite y no el silencio de la UI.
3. Pasar el FOMC próximo a `computeDailyDecisions()` (cron `sync-prices` → tabla `daily_decisions`) para que el correo diario pueda abrir con *"la Fed decide mañana — hoy no es día de ejecutar"*. **La infraestructura ya existe entera**; hoy la fecha del FOMC solo vive en una card colapsada que hay que ir a abrir.

---

## M6 — Las tasas de allá y tu plata de acá (impacto medio · esfuerzo bajo)

**Problema.** Tu vida es en CLP y tu inversión en USD, y la app trata esos dos mundos como si las tasas de EEUU no los conectaran. Sí los conectan, y en tu favor: tasas de EEUU al alza tienden a fortalecer el dólar, o sea que tus acciones valen **más pesos** aunque no suban un centavo en USD. Es una cobertura real que hoy no se dice en ninguna parte.

**Propuesta.**

- Agregar `DTWEXBGS` (índice dólar amplio) a `MACRO_SERIES`.
- Una línea en la card "Tu semana", solo cuando `direction === 'alzas'` y el dólar se apreció en el mes:
  > *"El dólar se fortaleció 2.1% este mes. Tu cartera en USD vale más pesos aunque los precios no se muevan — parte de tu exposición a acciones gringas te cubre de eso."*
- `lib/cl-indicators.ts` ya consulta mindicador.cl, que **también expone la TPM del Banco Central de Chile**. Traerla es casi gratis y cierra el círculo: la tasa de allá mueve tus acciones, la de acá mueve tus depósitos (`lib/wealth-projection.ts` ya calcula rendimiento real con IPC).

---

## Orden sugerido

| # | Ítem | Impacto | Esfuerzo | Depende de |
|---|---|---|---|---|
| 1 | **M1** — expectativa de tasas | Alto | Bajo | — |
| 2 | **M5** — calendario FOMC 2027 + test | Medio | Bajo | — |
| 3 | **M2** — sensibilidad por ticker | Alto | Medio | M1 |
| 4 | **M3** — escenarios de cartera | Alto | Medio | M2 |
| 5 | **M4** — razón contextual en convicción | Medio | Bajo | M2 |
| 6 | **M6** — puente USD/CLP + TPM | Medio | Bajo | M1 |

**M1 + M5 son una sesión corta** y ya dejan la app diciendo la verdad sobre el momento actual en vez de "sin presión nueva". **M2 + M3 son el análisis complejo propiamente tal** y merecen su propia sesión, con tests de la regresión sobre series sintéticas (beta conocida de antemano) antes de mostrar un solo número en pantalla.

---

## Verificación (igual que en cada roadmap anterior)

- `npx tsc --noEmit` y `npm test` verdes tras **cada** bloque, no al final.
- Cada módulo nuevo (`rate-path`, `rate-sensitivity`, `rate-scenarios`) nace con su `.test.ts`, incluyendo los casos de datos insuficientes (`n` bajo, `r²` bajo, series ausentes) — que es donde este tipo de feature falla feo si nadie lo prueba.
- La regresión de M2 se prueba contra series **sintéticas de beta conocida**: si el test no puede recuperar una beta que se inyectó a mano, el número no sale a producción.
