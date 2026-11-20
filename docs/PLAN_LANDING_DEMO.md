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
