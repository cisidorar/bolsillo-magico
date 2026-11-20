# Plan: landing y demo para los primeros usuarios (nov 2026)

Estado: **etapa 1 (primera vista) aplicada en el código el 20 nov 2026, sin publicar ni verificar a ojo**. Desvío del plan: la línea de confianza (P8) va bajo la bajada, no bajo los botones, para que se vea en celular sin scroll. Etapa 2 (demo y resto de la landing) abajo, como referencia. Surge de revisar `app/demo/page.tsx`, `app/(marketing)/page.tsx` y la crítica `.impeccable/critique/2026-11-19T20-52-01Z__app-marketing-page-tsx.md` (23/32).

## Etapa 1 (ahora): la primera vista

Solo lo que una persona ve **antes de decidir si se queda**, en este orden:
1. **Google:** título y descripción del resultado.
2. **Link compartido** (WhatsApp, iMessage, redes): imagen de vista previa + título.
3. **Primera pantalla** al abrir `bolsillomagico.com`, sin scroll, en celular (390×844) y en escritorio (1366×800).

La demo (`/demo`) y el resto de la landing quedan para la etapa 2.

### Diagnóstico (sitio publicado, 20 nov 2026)

**El problema principal: tres promesas distintas.** Quien llega no reconoce lo que le prometieron en el paso anterior.

| Punto de contacto | Dice hoy |
|---|---|
| Google, título (`app/(marketing)/layout.tsx`) | «Tu tarjeta, tu sueldo y tus gastos, como funcionan en Chile» |
| Imagen al compartir (`opengraph-image.tsx`) | «Sabe cuánto vas a pagar en tu próximo estado de cuenta.» |
| H1 de la primera pantalla | «Cada compra con tarjeta, con su fecha de pago.» |

Más hallazgos:
- **Título de Google: 78 caracteres.** Google muestra ~60: se corta en «…como funcionan en Ch…».
- **Descripción: ~220 caracteres.** Google muestra ~155: se pierde «Prueba la demo y pide acceso».
- **`keywords`**: Google la ignora. No hace daño, pero tampoco aporta.
- **No hay datos estructurados** (`WebSite`): Google puede mostrar el dominio en vez de «Bolsillo Mágico» como nombre del sitio.
- **La imagen al compartir es solo texto sobre azul.** No muestra el producto. En WhatsApp se ve chica y el texto compite con el título del mensaje.
- **El botón más visible del menú es «Iniciar sesión»**, que no sirve a quien llega desde Google o desde un link: el visitante nuevo no tiene cuenta.
- **La bajada enumera tres cosas en una frase larga**, y no dice «cuotas» ni que no se conecta al banco.
- **La confianza está al final de la página**: «no pedimos claves bancarias» no aparece en la primera pantalla.
- **La demo del hero depende del día**: si hoy es el día de facturación (como el 20 de nov), arranca mostrando el selector «antes/después de las 14:00», el estado más complejo, justo en el primer segundo.
- **Celular sin verificar visualmente** (el navegador no cambió de ancho). Por el código, en celular el orden es título → bajada → demo → botones: los botones probablemente quedan fuera de la primera pantalla, y la barra fija «Pedir acceso» aparece desde el inicio.

### Principio: una sola promesa, la misma en los tres pasos

Google, la vista previa y el H1 dicen lo mismo con las mismas palabras clave («tarjeta», «estado de cuenta», «Chile»). La demo del hero lo demuestra en 5 segundos.

### Cambios propuestos

| # | Dónde | Cambio |
|---|---|---|
| P1 | Título de Google (≤60 car.) | La promesa elegida + marca. Ej.: «Bolsillo Mágico — Cuándo pagas cada compra con tarjeta» (55) |
| P2 | Descripción (≤155 car.) | Ej.: «Ve cuándo pagas cada compra con tarjeta, cuánto viene en tu próximo estado de cuenta y cuánto te queda del sueldo. Hecha para Chile.» |
| P3 | `openGraph`/`twitter` | Mismo título y descripción que P1–P2 (hoy difieren de la imagen) |
| P4 | Datos estructurados | JSON-LD `WebSite` con `name: "Bolsillo Mágico"`. Sin precios, ratings ni reseñas (no existen) |
| P5 | Imagen al compartir | Titular (= H1) a la izquierda + una tarjeta del producto a la derecha: «Compras el 21 → la pagas en 45 días». Ejemplo sin fecha real, para que no envejezca en el caché de WhatsApp |
| P6 | H1 | Igual a P1 (sin la marca) |
| P7 | Bajada | Una sola idea, con cuotas y Chile. Ej.: «Tu tarjeta, tus cuotas y tu sueldo, como funcionan en Chile.» |
| P8 | Bajo los botones | Confianza + contexto en una línea: «Sin conectar tu banco ni pedir tu clave. Se entra por invitación; la demo no necesita cuenta.» |
| P9 | Menú | Botón destacado = la conversión elegida; «Iniciar sesión» pasa a enlace de texto |
| P10 | Botones del hero | Uno principal claro y uno secundario visible (según decisión abajo) |
| P11 | Demo del hero | Que el primer cuadro nunca arranque en el día de facturación: si hoy es el cierre, partir del día siguiente |
| P12 | Celular | Verificar 390×844: H1 + bajada + inicio de la demo visibles; botón principal alcanzable sin buscarlo |

### Skills en esta etapa

- **Impeccable `clarify`**: P1, P2, P6–P8 (el texto).
- **Impeccable `layout`**: P9, P10, P12 (jerarquía de la primera pantalla).
- **Impeccable `polish`** + una sola ronda de capturas (escritorio + celular).
- **Animate (Emil Kowalski)**: solo si P11 toca el movimiento inicial de la demo del hero.
- La imagen P5 se hace con el mismo `ImageResponse` (sin herramientas externas).

### Fuera del código (lo haces tú)

- **Google Search Console**: verificar el dominio, enviar `sitemap.xml`, pedir indexación de `/` después del cambio, y revisar `site:bolsillomagico.com`.
- **Probar la vista previa** pegando el link en un chat de WhatsApp contigo mismo. Next.js cambia la URL de la imagen al cambiarla, así que no debería quedar la vieja en caché.

### Decisiones (tomadas el 20 nov 2026)

1. **Promesa:** «Cuándo pagas cada compra con tarjeta». El H1 actual se queda; Google, la vista previa y la imagen se alinean a él. Cuotas y sueldo van en la bajada.
2. **Conversión principal:** dejar el correo. «Pedir acceso» es el botón principal (hero y menú); «Probar la demo» queda secundario y visible.
3. **Precio:** no se menciona por ahora.

### Verificación

`npx tsc --noEmit`, `npm test`; leer las etiquetas `<head>` publicadas (largo de título y descripción); abrir la imagen generada; capturas de la primera pantalla en celular y escritorio.

---

# Etapa 2 (aplicada el 20 nov 2026, sin publicar)

Decisión: **los viajes (Compartidos) están ocultos en la app (`SHOW_TRIPS=false`)**, así que no se muestran. Lo activo y que calza con la historia de la tarjeta es **«Te deben»** (`expense_receivables`: pagas por otros con tu tarjeta, tu gasto es tu parte y el estado sigue cobrando el total). Reemplaza a Inversiones.

**Demo (`app/demo/page.tsx`)**
- Pestañas: Tarjeta · Sueldo · Fijos · **Te deben** (Inversiones sale).
- Tarjeta: el registro («Registra una compra») sube justo bajo el cupo, parte con $25.000 cargado y responde «Listo: la pagas el 5 de enero»; la fila nueva entra con `lp-pop`.
- Sueldo: «Ya comprometido» (cuotas) va antes de la línea de tiempo.
- Cierre: tono de producto nuevo + «no se conecta a tu banco ni te pide la clave».
- Encabezado: la etiqueta central se oculta bajo 380px.
- `app/demo/layout.tsx`: descripción actualizada (ya no menciona inversiones).

**Landing (`app/(marketing)/page.tsx`)**
- Pilar nuevo «Anotar un gasto toma segundos» (monto, categoría y con qué pagaste).
- Pilar «Cuando pagas por otros, sabes quién te debe» en lugar de Inversiones.
- Inversiones y propiedad bajan a una línea de módulos opcionales.
- Cierre: «es nuevo… lo que nos cuentes cambia lo que sigue».
- Componente compartido: `components/landing/PorCobrarDemo.tsx`.

**Pendiente**: texto «Cierra en 2 días / día 28 de 30» del pilar Tarjeta (ilustrativo, no calza con la fecha de la demo del hero); desborde de `PayCycleTimeline` a 375px (no verificable: el navegador no baja de ~546px); revisar escritorio de los pilares nuevos; `critique` final.

---

# Etapa 3 — Replanteo con Penso, Gastus y SaveMoney (plan, 20 nov 2026)

Punto de partida: una crítica externa con cuatro debilidades, comparando con Penso (penso.money), Gastus (gastus.cl) y SaveMoney. Lo que se toma de cada uno:

| De | Qué hacen | Qué tomamos |
|---|---|---|
| Penso | Titular con una preocupación cotidiana («deja de preguntarte en qué se te fue la plata»); 3 beneficios con check por sección; FAQ larga con comparativas | Titular desde la preocupación; FAQ (ya hecha); beneficios con check |
| Gastus | «Sin compartir claves» en el titular; cifrado explicado; «Tu plata es tuya» (compromisos); tabla comparativa; FAQ con lo que **no** hacen; beta con cupos | Página de seguridad verificable; «Lo que no hacemos»; honestidad como estilo |
| SaveMoney | Cifras de adopción, reseñas, respaldos | Solo cuando existan de verdad: nada inventado |

Ya aplicado en esta etapa (sin publicar): FAQ con respuesta animada, destello de confirmación en la demo y la demo del hero cambiada de calculadora a **«Lo que viene»** (`ProximosPagosDemo`: próximos pagos de la Visa, cada uno con fecha, monto y lo que lo compone; una compra de ejemplo cae en un pago u otro según si es antes o después del cierre).

## Las cuatro debilidades y qué hacemos

### 1. La promesa es técnica → hablar desde la preocupación

«Cada compra con tarjeta, con su fecha de pago» describe una función. La preocupación que resolvemos es **que llegue el estado de cuenta y no alcance el sueldo**.

Titulares candidatos (H1):
- A. «Que el estado de cuenta no te pille por sorpresa.»
- B. «Sabe hoy si tu sueldo alcanza para lo que viene en la tarjeta.»
- C. «Lo que viene en tu tarjeta, antes de que llegue.»

La bajada explica el mecanismo («ves cuándo pagas cada compra, cuotas incluidas, y cuánto te queda del sueldo»). El título de Google puede conservar «cuándo pagas cada compra con tarjeta»: es lo que alguien busca.

### 2. Se destaca el registro manual → primero lo que ganas, después cómo se carga

- El pilar «Anotar un gasto toma segundos» baja al final y se reescribe como **«Tres formas de cargar tus gastos»**: subir el estado de cuenta, importar un CSV o anotar a mano.
- **Producto nuevo: importar el estado de cuenta de la tarjeta (PDF).** Se reusa el camino de la liquidación de sueldo (`app/actions/payslips.ts`: `unpdf` extrae el texto, un parser propio arma las filas, la persona revisa y confirma). Un parser por emisor, partiendo por las tarjetas de los primeros usuarios. Sin IA de terceros: el PDF se lee en nuestro servidor y no sale de ahí. Eso también es un argumento de confianza frente a Gastus, que manda los datos (anonimizados) a Claude o Gemini.
- Después: la cartola de cuenta corriente (Excel o PDF) para el débito.
- **La landing no lo menciona hasta que funcione.**

### 3. La invitación añade fricción → la demo es el camino principal

- En el hero, el botón principal pasa a ser **«Probar la demo»** (sin cuenta) y «Pedir acceso» queda secundario. La demo ya cierra pidiendo el correo.
- «Entre amigos» sale. El reemplazo honesto es «Abrimos cupos de a poco para cuidar que todo funcione bien».
- Si decides un número real de cupos, puede ir un contador al estilo Gastus («quedan N de M»). Inventado, nunca.
- Alternativa más fuerte: abrir el registro gratis mientras dure la etapa de pruebas. Es una decisión tuya, más abajo.

### 4. Falta evidencia de confianza → hechos comprobables, en una página propia

- **Página pública `/seguridad`**, enlazada desde el hero y el pie, con solo lo que se pueda verificar:
  - Datos en Postgres de Supabase, cifrados en reposo y en tránsito.
  - Aislamiento por usuario con RLS, explicado en simple.
  - Sin claves bancarias.
  - Sin rastreadores publicitarios.
  - Exportar todo en CSV.
  - Cómo borrar la cuenta.
- Cada afirmación se revisa contra la configuración real antes de publicarla: región de Supabase, analítica cargada, existencia del borrado de cuenta.
- **«Lo que no hacemos»**: no vendemos datos, no pedimos claves, no movemos plata, no damos asesoría, no mandamos tus movimientos a una IA externa.
- El cifrado por campo de Gastus no va por ahora: rompe las consultas y los totales, y cuesta mucho para la etapa del producto.
- Testimonios de los primeros usuarios, con permiso, cuando existan.

## Orden propuesto

1. **Fase A, landing, sin producto nuevo:**
   - Titular nuevo.
   - Demo primero en los botones.
   - Pilares reordenados, con el registro al final como «tres formas de cargar».
   - `/seguridad` y «Lo que no hacemos».
   - Cerrar lo pendiente del hero: el texto «cierra en 2 días» del bloque comparativo, la imagen OG con el concepto nuevo, borrar `PayDateDemo.tsx` y verificar en build.
2. **Fase B, producto:** importar el estado de cuenta en PDF, con un plan propio en otro documento. Cuando funcione, la landing suma un pilar y la franja «funciona con estados de cuenta de…».
3. **Fase C, prueba social:** testimonios reales y cupos reales.

## Decisiones tomadas (20 nov 2026)

1. **Titular:** «Que el estado de cuenta no te pille por sorpresa.»
2. **Acceso:** se sigue por invitación; «Probar la demo» es el botón principal y la demo cierra pidiendo el correo.
3. **Estado de cuenta en PDF (Fase B):** Banco de Chile, BancoEstado, CMR Falabella y Santander. Bloqueado hasta tener un PDF de ejemplo de cada uno, con los datos tapados.

## Fase A — aplicada el 20 nov 2026 (sin publicar)

- H1 «Que el estado de cuenta no te pille por sorpresa.»; el título de Google conserva «Cuándo pagas cada compra con tarjeta».
- «Probar la demo» es el botón principal (hero y menú); «Pedir acceso» queda secundario. Se quitó «entre amigos».
- Pilares: tarjeta, sueldo, fijos, te deben y, al final, «Cargar tus gastos toma segundos» (empieza con «todo lo de arriba sale de lo que registras»).
- Nueva página pública `/seguridad` (en robots y sitemap), con «Lo que no hacemos», cómo se guardan los datos, la IA con transparencia y «Lo que todavía no tenemos». Enlazada desde el menú, el pie y la sección de confianza.
- Imagen de vista previa y bloque comparativo alineados al concepto nuevo; `PayDateDemo.tsx` eliminado.
- Verificado con `next build` + `next start` en escritorio (hero, demo auto-probada, pilares, FAQ, `/seguridad`). Falta mirar celular a 375px.

### Afirmaciones de `/seguridad` que dependen de ti
- «No vendemos tus datos» es un compromiso tuyo, no algo verificable en el código.
- «Sin auditoría externa ni certificaciones» supone que no existe ninguna.
- No hay borrado de cuenta hecho por la persona: por eso la página no lo menciona. Conviene construirlo antes de abrir el registro.
- La IA externa (proveedor compatible con OpenAI, por defecto `gpt-4.1-mini`) sí recibe la descripción del gasto y los nombres de categorías; la página lo dice.

---

# Demo rehecha como réplica de la app real (20 nov 2026, sin publicar)

Problema: la demo era un mini-simulador de 4 pestañas que no se parecía a la app. Ahora `/demo` **es la app con datos inventados** (`components/demo/*`):

- **Mismo armazón**: menú lateral (escritorio) y barra inferior con botón «+» (teléfono), saludo, hero azul con presupuesto, «Te quedan», proyección y «Vs. mes anterior».
- **Cuatro pantallas**: Inicio (últimos gastos con logos, por categoría con límites, Ciclo de sueldo, Te deben, Próximos pagos), Historial (Compra/Facturación, búsqueda, filtros, agrupado por fecha), Recurrentes (carga mensual, qué mirar, ya comprometido, próximos 30 días) y Por cobrar (lista + detalle + recordatorio).
- **Componentes reales reutilizados**: `CicloSueldo`, `ExpenseRowIcon`, `ServiceLogo`, `InfoTap`, `PaymentIcon` y las clases `.card-flat`, `.hero-gradient`, etc.: si el diseño cambia, la demo cambia sola. Los que escriben en Supabase (`ExpenseList`, `ReceivablesCard`, `ExpenseSheet`) tienen réplicas en memoria.
- **«Nuevo gasto» funcional**: sugiere categoría al escribir («Uber» → Transporte), muestra «entra al estado que cierra el 20 y lo pagas el 5», y con «Pagué por otros» crea cobros en Por cobrar. Todo se actualiza en vivo. «Reiniciar» vuelve al inicio.
- **Datos**: 100% ficticios (Sofía, Ana, Beto, Caro, Dani; Visa que cierra el 20 y vence el 5), con fechas relativas a hoy.
- `/api/logo` sirve sin sesión solo una lista fija de dominios (`DEMO_DOMAINS`) para que los logos de la demo carguen; con sesión sigue igual.
- No verificado: teléfono a 375px (el navegador no baja de ~546px y el marco está bloqueado por seguridad).
