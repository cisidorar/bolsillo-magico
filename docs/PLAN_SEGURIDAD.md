# Plan de seguridad — Bolsillo Mágico

**Fecha:** 21 nov 2026 · **Estado:** revisión hecha, plan propuesto, fases 1 a 3 sin empezar.

Cómo leerlo: lo marcado **[verificado]** se comprobó contra la configuración real de Supabase o ejecutando
la herramienta. Lo marcado **[criterio]** es una recomendación que no se probó en la app.

---

## 1. Qué se revisó y qué se encontró

### Grave

| # | Hallazgo | Estado |
|---|---|---|
| 1 | **El registro está abierto en Supabase.** La configuración pública del proyecto devuelve `disable_signup: false` y `mailer_autoconfirm: true`. Cualquiera con la llave pública (que viaja en el navegador) puede crearse una cuenta con `auth.signUp` y entrar al instante, sin invitación y sin confirmar el correo. Se salta la lista de espera, la aprobación a mano y el tope `MAX_ACTIVE_USERS`. **[verificado]** | **Pendiente: lo debe apagar la dueña en el panel** (Fase 0). No se probó creando una cuenta, para no dejar basura. |

### Corregido en esta revisión

| # | Hallazgo | Arreglo |
|---|---|---|
| 2 | **El enlace de invitación se gastaba solo.** Hotmail/Outlook, Gmail y los antivirus de correo abren los enlaces antes que la persona; `/api/auth/confirm` verificaba el token en el GET y lo consumía. La persona veía «este enlace ya se usó». | `app/api/auth/confirm/route.ts`: el GET solo muestra un botón «Continuar»; el token se verifica en el POST. Solo acepta `type` `invite` y `recovery`, y escapa lo que muestra. Probado en local con tokens falsos. **Falta publicar.** |
| 3 | **Funciones internas ejecutables con la llave pública.** `rls_auto_enable()`, `handle_new_user()` y `seed_user_defaults(uuid)` se podían invocar por `/rest/v1/rpc`. **[verificado]** | Migración `20261129_auth_hardening.sql`, **aplicada**. Las dos primeras quedan sin acceso para `anon` ni `authenticated`; `seed_user_defaults` pierde solo el acceso sin sesión (la app la llama con la sesión de la persona). Además se fijó el `search_path` de `guard_profile_privileged_columns` y `shared__token_hash`. |
| 4 | **Contraseña débil en el formulario de registro.** Mínimo 8 caracteres, sin más reglas, y solo del lado del navegador. | `lib/password.ts` + `app/(auth)/update-password/page.tsx`: mínimo 10, rechaza claves comunes, secuencias, repeticiones y claves con el nombre, @usuario o correo; medidor en vivo. Sin exigir mayúsculas ni símbolos (OWASP / NIST 800-63B). **Falta publicar** y subir el mínimo real en Supabase (Fase 0). |
| 5 | **Datos que faltaban al registrarse.** | El formulario ahora muestra el correo (de solo lectura), y pide día de sueldo (opcional) y un aviso de datos con enlace a `/seguridad`. |

### Pendiente (sin arreglar)

| # | Hallazgo | Riesgo | Fase |
|---|---|---|---|
| 6 | **Dependencias vulnerables.** `npm audit --omit=dev` **[verificado]**: 5 (4 altas, 1 crítica). `next` (crítica, SSRF en `rewrites`; el proyecto no usa `rewrites`, probablemente no explotable), `sharp`, `postcss`, `nanoid`, `source-map-js`. Todas con arreglo disponible. | Medio | 1 |
| 7 | **Lista de espera sin límite.** Solo tiene el campo trampa. Se puede llenar de correos falsos y, de paso, generar correos de aviso al admin. | Medio | 1 |
| 8 | **`seed_user_defaults` no compara `p_user_id` con `auth.uid()`.** Cualquier persona con sesión puede sembrar categorías por defecto en otra cuenta. | Bajo | 1 |
| 9 | **Contraseña mínima solo en el cliente.** Hay que imponerla en Supabase. | Medio | 0 |
| 10 | **Protección contra claves filtradas desactivada** (linter de Supabase). **[verificado]** Suele requerir plan Pro. | Bajo | 0 |
| 11 | **Aislamiento entre cuentas sin prueba automática.** La seguridad de los datos depende de RLS. El linter solo marca `waitlist` sin políticas, y es a propósito. Falta una prueba que verifique «A no ve nada de B». | Alto si fallara | 2 |
| 12 | **~40 funciones `SECURITY DEFINER` de viajes** ejecutables con sesión (intencional: la app las usa). Falta revisar que cada una valide `auth.uid()` y la pertenencia al grupo. **[criterio]** | Medio | 1 |
| 13 | **Buckets de Storage** (avatares, documentos de propiedad, liquidaciones): sin revisar si son públicos o privados. | Medio | 1 |
| 14 | **Cuenta admin sin 2FA** ni registro de acciones. Con acceso a esa cuenta se puede invitar, bloquear y cambiar módulos de todos. | Alto si se compromete | 2 |
| 15 | **Sin borrar cuenta ni exportar datos** desde la app. También es un tema legal. | Medio | 3 |
| 16 | **CSP con `script-src 'unsafe-inline'`:** debilita la defensa contra XSS. | Bajo-medio | 3 |
| 17 | **Subida de PDF (liquidaciones):** validar tipo real, tamaño y contenido, no solo la extensión. | Medio | 3 |
| 18 | **No hay términos ni política de privacidad;** solo `/seguridad`. En Chile aplican la Ley 19.628 y la nueva ley de datos personales. | Medio | 3 |
| 19 | **Intentos de login:** el bloqueo tras fallos es solo del navegador. El límite real lo pone Supabase y no se comprobó. | Bajo | 1 |

### Lo que se vio bien
- Todas las rutas `/api` revisadas tienen sesión o secreto de cron **[verificado por encima]**.
- Cabeceras de seguridad: HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, CSP con `frame-ancestors 'none'` y `form-action 'self'`.
- Tokens de enlaces compartidos guardados con hash, con vencimiento y revocables.
- `is_admin` y `features` no se pueden cambiar desde el navegador (trigger de protección) y cada acción de `/admin` comprueba que quien llama sea admin.
- El proxy de logos tiene protección contra SSRF y solo sirve una lista de dominios sin sesión.
- Los enlaces de invitación y de recuperación se verifican en el servidor, sin pasar tokens por la URL pública después.

---

## 2. Plan por fases

### Fase 0 — la dueña, hoy (~10 min, panel de Supabase)

| Qué | Dónde |
|---|---|
| Apagar **Allow new users to sign up** | Authentication → Sign In / Providers |
| Largo mínimo de contraseña **10** | Authentication → Password |
| Vencimiento del enlace **86400** s (24 h) | Authentication → Providers → Email |
| Protección contra claves filtradas (si el plan la permite) | Authentication → Password |
| **Site URL** = `https://www.bolsillomagico.com` | Authentication → URL Configuration |
| Pegar las plantillas de `supabase/email-templates/` (Invite user y Reset password) | Authentication → Email Templates |

**Listo cuando:** `https://<proyecto>.supabase.co/auth/v1/settings` devuelve `disable_signup: true` (con la llave pública en el encabezado `apikey`).

### Fase 1 — implementación, esta semana (~3-4 h)
1. `npm audit fix`, compilar y comprobar que nada se rompa. Cierra el #6.
2. Lista de espera: límite por IP y CAPTCHA (Cloudflare Turnstile). **Requiere** que la dueña cree la cuenta de Turnstile y pase la clave pública. Cierra el #7.
3. `seed_user_defaults`: comparar con `auth.uid()`. Cierra el #8.
4. Revisión de Storage: listar buckets, cuáles son públicos, qué políticas tienen. Cierra el #13.
5. Revisión de las funciones de viajes: validan `auth.uid()` y pertenencia al grupo. Cierra el #12.
6. Búsqueda de claves en el historial de git (`gitleaks`).
7. Comprobar los límites de intentos de login que impone Supabase (#19).

**Listo cuando:** `npm audit` sale limpio y hay un informe corto de Storage, funciones y secretos con lo que haya que corregir.

### Fase 2 — la semana siguiente (~6-8 h)
1. **Prueba de aislamiento entre cuentas:** dos cuentas de prueba; verifica, tabla por tabla, que A no lee ni escribe nada de B. Corre en cada cambio. Cierra el #11.
2. **Test de rutas `/api`:** falla si una ruta nueva queda sin sesión o sin secreto de cron.
3. **2FA para la cuenta admin** (TOTP) y que `/admin` lo exija. Cierra parte del #14.
4. **Registro de acciones del admin:** quién invitó, bloqueó o cambió módulos, y cuándo, visible en `/admin`. Cierra el resto del #14.
5. **Aviso por correo de «nuevo inicio de sesión».**

**Listo cuando:** la prueba de aislamiento pasa, y `/admin` pide 2FA y muestra el historial.

### Fase 3 — cuando el producto lo justifique (varios días)
- Borrar cuenta y exportar datos desde la app (#15).
- Términos, política de privacidad y plan de qué hacer ante una filtración (#18). **El texto legal lo valida la dueña** o alguien con criterio jurídico.
- CSP con nonces (#16).
- Validación fuerte de los PDF subidos (#17).
- Dependabot y una prueba de restauración de copia de seguridad cada tanto.

### Por qué este orden
- Fase 0 y el punto 1 de la fase 1 protegen contra lo más probable: alguien que se cuela sin invitación y vulnerabilidades ya publicadas.
- La prueba de aislamiento (Fase 2) protege contra lo más grave: que una cuenta lea los datos de otra.
- La Fase 3 pesa más cuando la app se abra a más gente.

---

## 3. Estado de los cambios de esta revisión

| Cambio | Dónde | Estado |
|---|---|---|
| Confirmación en dos pasos del enlace de invitación | `app/api/auth/confirm/route.ts` | Escrito, **sin publicar** |
| Reglas de contraseña + medidor + correo visible + día de sueldo + aviso de datos | `lib/password.ts`, `lib/password.test.ts`, `app/(auth)/update-password/page.tsx` | Escrito, **sin publicar** |
| Endurecimiento de funciones internas | `supabase/migrations/20261129_auth_hardening.sql` | **Aplicada** en la base |
| Plantillas de correo (invitación y recuperar contraseña) | `supabase/email-templates/` | Listas; **hay que pegarlas en Supabase** |
| Correo de aviso de solicitudes (diseño nuevo) | `supabase/functions/notify-waitlist/index.ts` | Desplegado antes del último cambio del logo; **hay que volver a desplegar** |

Notas:
- `npm test` (vitest) no corre en esta máquina por un problema de entorno; las reglas de contraseña se
  comprobaron con un script de Node aparte (rechaza `abc123`, `1234567890`, `Contraseña123`, `qwertyuiop`, y
  acepta `cafe con leche en la tarde`).
- El formulario de registro no se pudo ver en pantalla: solo se muestra con una invitación real.

## 4. Decisiones abiertas
- ¿Se activa el CAPTCHA (Turnstile) en la lista de espera? Requiere la clave de la dueña.
- ¿Se exige 2FA a todas las cuentas o solo a la admin?
- ¿Quién redacta y valida los términos y la política de privacidad?
- ¿El plan de Supabase incluye la protección contra claves filtradas?
