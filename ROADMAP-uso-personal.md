# Roadmap · Modo uso personal — cerrar la puerta y sacar el marketing

**Estado: A2-A5 implementados en código (jul 2026).** `npx tsc --noEmit` y `npm test` (234/234) verdes. **A1 sigue pendiente de un paso manual tuyo** — el toggle de Supabase Dashboard es el único cierre real del registro; sin él, el resto de A1 es solo cosmético (ver detalle abajo).

Decisión (jul 2026, Cas): la app deployada es **solo para uso personal**. Eso cambia el propósito de todo lo público: la landing era un pitch de venta, el login tenía registro abierto "gratis, sin tarjeta", `/demo` era una herramienta de demostración, y robots/sitemap invitaban a Google a indexar. Nada de eso sirve ya — y el registro abierto es además un riesgo real: cualquiera que encuentre la URL puede crearse una cuenta en TU Supabase (consume recursos, corre crons, recibe correos).

Ordenado por prioridad: primero seguridad, después borrar, al final pulir. Regla transversal: **RLS no se toca** — que sea personal no relaja la seguridad de datos; sigue siendo la red de fondo si algo más falla.

---

## A1 — Cerrar el registro de verdad (crítico, esfuerzo bajo) ⚠️ falta tu paso manual

**Problema.** El login tenía modo signup, y aunque se quite del form, `supabase.auth.signUp()` es llamable por cualquiera con la anon key (que viaja en el bundle del cliente — es pública por diseño). Quitar el botón no cierra nada.

**Implementado en código.** El login ya NO tiene modo signup: sin estado `Mode`, sin campo nombre, sin el switch "¿No tienes cuenta? Regístrate" — el form es solo email + contraseña.

**Pendiente — el cierre real, y te toca a ti:** entrar a **Supabase Dashboard → Authentication → Sign In / Up → desactivar "Allow new users to sign up"**. Sin ese toggle, cualquiera que encuentre la URL de tu app puede seguir creándose una cuenta llamando la API directamente (no pasa por el form que acabo de cerrar). Es un clic, 1 minuto, y es la única pieza de A1 que no puedo hacer por ti.

No se implementó la segunda cerradura opcional (check de email permitido en middleware) — el toggle de Supabase ya es el cierre correcto y suficiente; se puede agregar después si en algún momento quieres una capa extra.

## A2 — `/` sin landing: directo al login (alto, esfuerzo bajo) ✅

**Problema.** `app/(marketing)/page.tsx` eran 648 líneas de pitch (features, mockups, CTA "Crear cuenta") que ya no le hablaban a nadie. Además el layout de marketing cargaba metadata SEO con keywords para posicionar en Google — lo contrario de lo que quieres ahora.

**Implementado.** `app/(marketing)/` borrado completo (page, layout, opengraph-image). Middleware: `/` redirige siempre — a `/inicio` con sesión, a `/login` sin ella. `robots.ts` ahora bloquea todo el rastreo (`disallow: '/'`, sin sitemap); `app/sitemap.ts` borrado. `robots: { index: false, follow: false }` agregado al metadata del layout raíz — doble cierre (robots.txt + meta tag) para que la app desaparezca de buscadores incluso si algún crawler ignora el primero.

## A3 — Borrar `/demo` (alto, esfuerzo bajo) ✅

**Problema.** `/demo` era una mini-app pública sin auth pensada para que desconocidos probaran el producto.

**Implementado.** `app/demo/` borrado, junto con su excepción pública en el middleware.

## A4 — Login personal (medio, esfuerzo bajo) ✅

**Problema.** El login le hablaba a un público: "Bienvenido de nuevo", 3 features de venta en el panel izquierdo. Para una sola persona era fricción y copy muerto.

**Implementado.** Copy personal ("Hola de nuevo 👋" en vez de "Bienvenido de nuevo"), panel izquierdo con logo + tagline sin bullets de features de venta. Rate-limiting (5 intentos / 60s) intacto.

**Revertido a pedido de Cas:** se había agregado pre-cargar el email desde `localStorage` tras el primer login, pero Cas prefirió no guardarlo — el campo queda vacío siempre, para que el correo no quede visible por defecto en la pantalla (dispositivo compartido, capturas, etc.).

**No implementado:** alargar la duración de sesión en Supabase — es un ajuste de configuración del proyecto (Auth → Sessions), no de código; queda para que lo definas tú si quieres entrar con menos frecuencia.

## A5 — Limpieza post-cierre (bajo, esfuerzo bajo) ✅

**Problema.** Piezas que solo existían para usuarios nuevos.

**Implementado.** El `fetch('/api/seed')` tras login se quitó del flujo (tu cuenta ya está seedeada) — la ruta en sí se dejó intacta (es idempotente y ya exige auth, no hay urgencia en borrarla). Se revisó `update-password.tsx`: no tenía copy de registro, sin cambios necesarios. `FEATURES` y el resto de constantes de venta del login: eliminadas junto con el modo signup en A1/A4.

**De regalo (no estaba en el plan original):** al revisar el middleware para A2, noté que la lista de rutas protegidas no incluía `/cuenta`, `/ingresos` ni `/inversiones` — cada página igual se protegía sola vía `getServerSession()` (defensa en profundidad), pero completé la lista para que el middleware redirija ANTES de cargar la página, consistente con el resto.

---

## Qué NO hacer

- **No relajar RLS ni auth** "porque es solo mía" — la URL es pública en internet; las capas quedan.
- **No hardcodear tu user_id** en queries ni saltarte `getServerSession()` — el costo de mantener el multi-user interno es cero y te protege de errores.
- **No borrar la infraestructura de correo/crons** — son el corazón del uso personal (digest diario, informe semanal, avisos de zona de compra).

## Orden sugerido

| Ítem | Por qué |
|---|---|
| **A1** | El único con riesgo real hoy. El toggle de Supabase toma 1 minuto y cierra la puerta aunque el resto tarde. |
| **A2 + A3** | Borrar ~1.000 líneas de superficie pública que ya no le habla a nadie. |
| **A4** | Pulido diario: el login es la única pantalla pública que queda. |
| **A5** | Cuando se cruce en el camino. |

Validación: `npx tsc --noEmit` + `npm test` + revisar manualmente que `/` redirige, `/demo` da 404, y que un signup por API devuelve error con el toggle de Supabase apagado.
