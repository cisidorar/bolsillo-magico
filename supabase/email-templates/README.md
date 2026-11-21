# Plantillas de correo de Supabase Auth

Estos correos los manda Supabase Auth (no una Edge Function), así que **no se despliegan con el código**: hay que
pegarlos a mano en el panel. Cada vez que se cambie un archivo de esta carpeta, hay que volver a pegarlo.

| Archivo | Plantilla en Supabase | Asunto |
|---|---|---|
| `invite.html` | Authentication → Email Templates → **Invite user** | `Te invitaron a Bolsillo Mágico` |
| `recovery.html` | Authentication → Email Templates → **Reset password** | `Cambia tu clave de Bolsillo Mágico` |

## Pasos

1. Abre la plantilla en el panel, pon el asunto de la tabla y pega el contenido del archivo en el cuerpo.
2. Guarda.
3. Prueba: invita una cuenta de prueba desde `/admin` (o pide recuperar la contraseña) y abre el correo.

## Por qué el enlace es especial

El botón no usa `{{ .ConfirmationURL }}`. Apunta a la ruta de la app que verifica el token:

```
https://bolsillomagico.com/api/auth/confirm?token_hash={{ .TokenHash }}&type=invite|recovery&next=…
```

La dirección del botón y la del logo van escritas completas (no con `{{ .SiteURL }}`): si el Site URL de Supabase está
mal puesto, el logo sale roto y el botón apunta a otro sitio.

`/api/auth/confirm` (ver `app/api/auth/confirm/route.ts`) valida el `token_hash` en el servidor y deja la sesión
iniciada. Con la plantilla por defecto el enlace llega a esa ruta sin `token_hash` y termina en
«Este enlace ya se usó o venció».

## Ajustes de Supabase que lo acompañan

- **Authentication → URL Configuration → Site URL:** `https://bolsillomagico.com` (lo usan los demás correos de Supabase y las redirecciones).
- **Authentication → Providers → Email → vencimiento del código:** `86400` (24 horas). Por defecto es 1 hora y aplica a
  invitaciones, recuperar contraseña y los demás enlaces por correo.
- **Authentication → SMTP Settings:** si no hay SMTP propio, el correo sale desde el remitente de Supabase y con límite de
  envíos bajo. Con SMTP propio (por ejemplo Resend) sale desde `noreply@bolsillomagico.com`.

## Variables que usa la plantilla de invitación

`{{ .Data.display_name }}` es el nombre que se escribe en el formulario de invitar de `/admin`. Si queda vacío,
el saludo es solo «Hola.».
