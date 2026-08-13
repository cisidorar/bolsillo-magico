# Roadmap — Instrumentos chilenos y el 0% del Artículo 107 LIR

**Estado:** propuesta · ago 2026
**Gatillo:** la reforma tributaria aprobada devuelve la ganancia de capital bursátil chilena a *ingreso no constitutivo de renta* (0%) desde el **1 de enero de 2027**.

---

## 0. El hecho, y el matiz que cambia todo

### Qué cambia

| | Hasta 31-dic-2026 | Desde 1-ene-2027 |
|---|---|---|
| Ganancia de capital en instrumentos Art. 107 LIR | Impuesto único **10%** (Ley 21.420, sep 2022) | **0%** — no constituye renta |

Alcanza a **acciones chilenas, fondos de inversión, fondos mutuos y ETF** con presencia bursátil.

### Los tres matices que el roadmap tiene que respetar

**1. Esto NO toca tu portafolio actual.** NVDA, INTC, SOXL, WMT, SPY, MU, AMD, KO — todo lo que tienes hoy es instrumento extranjero. La ganancia de capital en acciones de EE.UU. sigue tributando igual (global complementario), sin cambio. O sea: esta reforma no mejora tu cartera actual, **abre una clase de activo nueva** que hoy la app no soporta en absoluto.

**2. "Presencia bursátil" no es cualquier acción chilena.** Es un criterio de liquidez definido por la Ley 18.045 y normativa CMF — mide que el instrumento se transe con frecuencia y volumen suficientes. Un instrumento puede *perder* presencia bursátil. Además el beneficio exige que la compra **y** la venta ocurran en bolsa autorizada por la CMF (o compra en colocación de primera emisión). Comprar fuera de bolsa mata el beneficio.

**3. Hay un acantilado de fecha.** Vender el 30-dic-2026 cuesta 10%; vender el 2-ene-2027 cuesta 0%. Para cualquier posición chilena comprada antes de fin de año, la app debería ser insistente sobre esto.

> **No es asesoría tributaria.** Todo lo que la app muestre acá es informativo y estimado. La regla real depende de tu situación, de si el instrumento califica el día de la venta, y de cómo lo ejecutó tu corredora. Antes de mover plata por un motivo tributario, confírmalo con un contador.

---

## 1. Dónde duele hoy: la app asume USD en todo el mundo inversión

Esto no es un feature aislado, es una restricción de arquitectura. Ver `CLAUDE.md` → *Currency convention*: "todo el flujo de la app es CLP, excepto el mundo inversión en USD".

Lo que está cableado a USD:

```
stock_positions.avg_cost_usd      numeric(12,2)   ← el nombre de la columna
stock_sales.cost_basis_usd / proceeds_usd / realized_pnl_usd
stock_purchases.*
usd_purchases (billetera USD)     ← financia las compras
stock_positions.trail_stop_usd
lib/price-providers.ts            ← stooq hardcodea sufijo `.us`
```

Un instrumento chileno cotiza **en CLP** y no se financia con la billetera USD. Meterlo con calzador en `avg_cost_usd` sería el peor resultado posible: números mezclados sin que nadie note el error.

**Riesgo técnico #1 — datos de precio.** De los cuatro proveedores actuales:

| Proveedor | Bolsa de Santiago |
|---|---|
| Tiingo | prácticamente solo EE.UU. |
| Alpha Vantage | cobertura chilena pobre |
| Stooq | hardcodeado `.us` — no sirve |
| **Yahoo** | **sí**, vía sufijo `.SN` (`SQM-B.SN`, `CHILE.SN`, `FALABELLA.SN`) |

O sea el fallback queda con un solo proveedor real. Hay que validar cobertura e historia ticker por ticker antes de prometer análisis técnico sobre instrumentos chilenos. Sin ~200 ruedas de historia, `lib/technical.ts` no puede calcular SMA200 y el motor de convicción queda mudo.

---

## Fase 1 — Multi-moneda en el mundo inversión

*Sin esto no hay nada más. Es la fase más grande y la menos vistosa.*

**Migración** `supabase/migrations/2026XXXX_instrumentos_cl.sql`:

```sql
-- Moneda y mercado por instrumento. Default 'USD'/'US' para que todo
-- lo existente siga significando exactamente lo mismo sin backfill.
ALTER TABLE public.stock_positions
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD'
    CHECK (currency IN ('USD','CLP')),
  ADD COLUMN IF NOT EXISTS market   text NOT NULL DEFAULT 'US'
    CHECK (market IN ('US','CL'));

-- Régimen tributario del instrumento — el corazón de todo esto.
--   art_107 : califica al 0% desde 2027 (requiere presencia bursátil
--             al momento de la venta + compra/venta en bolsa CMF)
--   cl_general : instrumento chileno SIN presencia bursátil
--   foreign : extranjero, tributa por global complementario
ALTER TABLE public.stock_positions
  ADD COLUMN IF NOT EXISTS tax_regime text NOT NULL DEFAULT 'foreign'
    CHECK (tax_regime IN ('art_107','cl_general','foreign'));

-- Mismo trío en watchlist, stock_purchases y stock_sales.
```

**Decisión de diseño clave:** *no* renombrar `avg_cost_usd`. Es una columna con datos reales y decenas de call sites. En vez de eso, la semántica pasa a ser "costo promedio en la moneda de `currency`", documentada en `CLAUDE.md`, y se agrega un helper único:

```ts
// lib/money.ts
export function fmtMoney(amount: number, currency: 'USD' | 'CLP'): string
export function toClp(amount: number, currency: 'USD'|'CLP', usdClp: number): number
```

Toda vista que hoy llama `fmtUSD()` sobre una posición pasa a `fmtMoney(x, pos.currency)`. Es tedioso pero mecánico, y el compilador ayuda si el parámetro es obligatorio.

**Proveedor de precios** (`lib/price-providers.ts`): resolver por `market`. Para `CL`, ir directo a Yahoo con sufijo `.SN` y saltarse Tiingo/Stooq en vez de gastar dos llamadas que van a fallar siempre.

**Financiamiento:** una compra chilena se paga en CLP y **no** toca `usd_purchases`. El flujo de "comprar con billetera USD" debe quedar deshabilitado cuando `currency = 'CLP'`.

**Validación:** el patrimonio total (`lib/net-worth.ts`) ya convierte USD→CLP con `usd_clp`. Una posición CLP entra directo sin conversión. Test obligatorio: patrimonio con posiciones mixtas.

---

## Fase 2 — Instrumentos chilenos de verdad en la app

- Alta de posición/favorito con selector de mercado (🇺🇸 EE.UU. / 🇨🇱 Chile).
- Catálogo semilla de los instrumentos con presencia bursátil más líquidos (IPSA: SQM-B, CHILE, FALABELLA, COPEC, CENCOSUD, ENELCHILE, LTM…) para no depender de que escribas el ticker exacto.
- `lib/technical.ts` **no se toca**: recibe OHLCV, no le importa la moneda. Pero sí hay que mostrar un estado explícito "sin historia suficiente para análisis" cuando Yahoo devuelva menos de ~200 ruedas, en vez de un análisis silenciosamente pobre.
- Los logos (`ServiceLogo` / dominio) funcionan igual con dominios chilenos.

**Feriados:** la Bolsa de Santiago tiene calendario propio (18-19 sep, etc.). El cron hoy usa `NYSE_HOLIDAYS`. Hay que agregar `SANTIAGO_HOLIDAYS` y decidir por mercado si corresponde sincronizar.

---

## Fase 3 — La capa tributaria *(acá está el valor real)*

Nada de lo anterior es un diferenciador. Esto sí.

### 3.1 Rendimiento después de impuestos

Hoy la app muestra rendimiento bruto. Con dos regímenes conviviendo, el bruto deja de ser comparable:

```
INTC   +12,0% bruto  →  +12,0% neto   (art. 107 desde 2027: 0%)
NVDA   +14,0% bruto  →  +8,8%  neto   (global complementario, tramo estimado)
```

La acción que "va ganando" cambia según cuál mires. Agregar `lib/tax-cl.ts` con la estimación, un campo de tramo de global complementario en `profiles` (opcional, default conservador), y mostrar neto junto al bruto en `PerformanceSection` y en el detalle de cada posición.

### 3.2 El acantilado del 1 de enero *(la alerta más accionable)*

Para cualquier posición `art_107` con ganancia no realizada, entre hoy y el 31-dic-2026:

> **Gold, chip inline** — "Vender ahora cuesta ~US$X en impuesto. Desde el 1 de enero, $0. Faltan N días."

Encaja exacto en la jerarquía UX5 ya definida (`CLAUDE.md` → *Alert Severity Hierarchy*): es atención-pronto y accionable, no urgencia de hoy → **gold chip, nunca banner coral**. Y si el motor técnico dice "vende" sobre una posición chilena en diciembre 2026, el detalle debe mostrar las dos verdades juntas en vez de una sola: la señal técnica y el costo tributario de obedecerla hoy.

### 3.3 Resumen tributario anual

`stock_sales` ya guarda `realized_pnl_usd`, `sale_date` y desglose por año — la mitad del trabajo está hecha. Falta separar ganancias por régimen y mostrar el impuesto estimado del año. Informativo, con el disclaimer arriba bien visible.

---

## Fase 4 — Que el motor de decisión sepa de impuestos

El paso que amarra todo con lo que la app ya hace.

`lib/conviction.ts` rankea candidatos para "¿Qué comprar hoy?". Hoy compara retorno esperado **bruto**. Con el 0% chileno vigente, un instrumento chileno con menor retorno esperado bruto puede ganarle a uno estadounidense **después de impuestos** — y el ranking actual nunca lo mostraría.

Agregar un ajuste tributario al retorno esperado, con dos condiciones no negociables:

1. **Que sea visible, no un número que se mueve solo.** Si el impuesto cambió el orden del ranking, el veredicto tiene que decirlo con todas sus letras: *"Gana SQM-B por el tratamiento tributario, no porque el análisis técnico sea mejor."* La app ya tuvo el problema de "dos verdades sin conectar" en el digest (ver `notify-watchlist-digest`, jul 2026); no repetirlo.
2. **Que el impuesto nunca sea la razón principal para comprar algo.** Un 0% sobre una mala inversión sigue siendo una mala inversión. El ajuste tributario debe ser un desempate entre candidatos que ya pasaron el filtro de convicción, jamás un atajo para saltárselo.

---

## Orden sugerido y esfuerzo

| Fase | Qué habilita | Esfuerzo | Cuándo |
|---|---|---|---|
| 1 · Multi-moneda | Todo lo demás | **Alto** — toca ~20 archivos | Ahora, si vas a hacerlo |
| 2 · Instrumentos CL | Registrar y seguir acciones chilenas | Medio | Sigue a la 1 |
| 3.2 · Alerta 1-ene | La decisión con fecha límite | **Bajo** | Antes de dic 2026 |
| 3.1 · Neto vs bruto | Comparar peras con peras | Medio | Cuando tengas posiciones CL |
| 3.3 · Resumen anual | Declaración de renta | Bajo | Antes de abril 2027 |
| 4 · Convicción con impuestos | El diferenciador | Medio | Último, y con cuidado |

---

## Antes de escribir una línea de código

Tres preguntas que definen si esto vale la pena:

1. **¿Vas a comprar instrumentos chilenos de verdad?** Si la respuesta es "quizás algún día", las fases 1-2 son mucho trabajo por un beneficio hipotético. La app hoy modela bien lo que efectivamente tienes.
2. **¿Tu corredora te da acceso a bolsa chilena?** El beneficio exige compra y venta *en bolsa*. Si operas EE.UU. por una plataforma que no transa en Santiago, no hay nada que registrar.
3. **¿Prefieres registrar el instrumento chileno como posición completa (con análisis técnico) o solo como línea de patrimonio?** La segunda opción es *dramáticamente* más barata: se salta las fases 1 y 2 casi enteras y aún te deja la alerta del 1 de enero. Si lo que quieres es exposición y no trading, puede ser suficiente.

**Camino mínimo viable:** si la respuesta a (3) es "solo patrimonio", se puede hacer la Fase 3.2 (alerta del acantilado) sobre una tabla `cl_holdings` simple e independiente, sin tocar `stock_positions` ni el motor técnico. Días en vez de semanas, y el 80% del valor de fecha límite.

---

## Fuentes

- [Chile aprueba medidas tributarias que buscan impulsar la inversión — Garrigues](https://www.garrigues.com/es_ES/noticia/chile-aprueba-medidas-tributarias-buscan-impulsar-inversion-crecimiento-economico)
- [0% de impuestos por las ganancias: reforma tributaria y nuevo 107 LIR aprobados — Fintualist](https://fintualist.com/chile/educacion-financiera/0-de-impuestos-por-las-ganancias-reforma-tributaria-y-nuevo-107-lir-aprobados/)
- [Artículo 107 LIR: la ganancia bursátil vuelve a ser no renta — NSS Legal & Tax](https://www.nss.cl/blog/que-es-el-articulo-107-de-la-lir-y-por-que-importa)
- [Ganancia de capital en instrumentos con presencia bursátil — Carey](https://www.carey.cl/reforma-tributaria/ganancia-de-capital-en-instrumentos-con-presencia-bursatil)
- [Artículo 107 LIR: cómo pagar menos impuestos al invertir en Chile — Betterplan](https://betterplan.cl/blog/articulo-107-lir-como-pagar-menos-impuestos-al-invertir-en-chile-y-hacerlo-bien/)
- [Las bancas privadas miran con atención el cambio al impuesto de ganancia de capital — Funds Society](https://www.fundssociety.com/es/noticias/private-banking/las-bancas-privadas-miran-con-atencion-el-cambio-al-impuesto-de-ganancia-de-capital-en-activos-locales/)
- [Circular N° 39 (2022), Ley 21.420 — SII](https://www.sii.cl/normativa_legislacion/circulares/2022/circu39.pdf)
