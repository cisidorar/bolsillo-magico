# Guía de Deploy — Gstos

Stack: Next.js 15 · Supabase · Vercel · Cloudflare

---

## 1. Supabase — Base de datos y Auth

### 1.1 Crear proyecto
1. Ve a [supabase.com](https://supabase.com) → **Sign up** con tu Google
2. **New project** → elige nombre `gstos`, región más cercana (Brazil South es la más próxima a Chile)
3. Guarda la contraseña del proyecto (la necesitarás después)
4. Espera ~2 min mientras aprovisiona la BD

### 1.2 Ejecutar el schema
1. En el dashboard de Supabase → **SQL Editor** → **New query**
2. Pega el contenido completo de `supabase/schema.sql`
3. Click **Run** → deberías ver "Success. No rows returned"

### 1.3 Configurar Google OAuth
1. Ve a **Authentication** → **Providers** → **Google**
2. Actívalo con el toggle
3. Necesitas credenciales de Google Cloud:
   - Ve a [console.cloud.google.com](https://console.cloud.google.com)
   - Crea un proyecto nuevo → **APIs & Services** → **Credentials**
   - **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: agrega `https://TU_PROJECT_ID.supabase.co/auth/v1/callback`
   - Copia **Client ID** y **Client Secret** → pégalos en Supabase
4. En Supabase → Authentication → **URL Configuration**:
   - Site URL: `https://tu-dominio.vercel.app` (lo actualizarás después)
   - Redirect URLs: agrega `https://tu-dominio.vercel.app/**`

### 1.4 Obtener las claves API
Ve a **Settings** → **API**:
- Copia `Project URL` → será tu `NEXT_PUBLIC_SUPABASE_URL`
- Copia `anon public` key → será tu `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 2. Vercel — Hosting

### 2.1 Preparar el repositorio
```bash
cd tu-carpeta/gstos
git init
git add .
git commit -m "Initial commit"
```
Crea un repo en [github.com](https://github.com) y haz push:
```bash
git remote add origin https://github.com/TU_USUARIO/gstos.git
git push -u origin main
```

### 2.2 Deploy en Vercel
1. Ve a [vercel.com](https://vercel.com) → **Sign up** con GitHub
2. **Add New Project** → importa el repo `gstos`
3. Framework: **Next.js** (auto-detectado)
4. En **Environment Variables**, agrega:
   ```
   NEXT_PUBLIC_SUPABASE_URL     = https://TU_PROJECT_ID.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = TU_ANON_KEY
   NEXT_PUBLIC_SITE_URL          = https://tu-dominio.vercel.app
   ```
5. Click **Deploy** → espera ~2 min
6. Copia la URL que te da Vercel (ej: `gstos.vercel.app`)

### 2.3 Actualizar Supabase con la URL de Vercel
1. Vuelve a Supabase → **Authentication** → **URL Configuration**
2. Actualiza **Site URL** con tu URL de Vercel
3. En **Redirect URLs** agrega: `https://gstos.vercel.app/**`

---

## 3. Cloudflare — DNS y seguridad (opcional pero recomendado)

> Solo necesario si tienes un dominio propio. Si usas el subdominio de Vercel (`gstos.vercel.app`), puedes saltarte este paso.

### 3.1 Crear cuenta y agregar dominio
1. [cloudflare.com](https://cloudflare.com) → **Sign up**
2. **Add a Site** → ingresa tu dominio (ej: `misgstos.com`)
3. Elige plan **Free**
4. Cloudflare escaneará tus DNS existentes → haz click en **Continue**
5. Te dará 2 nameservers → cómbialos en tu registrador de dominio

### 3.2 Configurar DNS para Vercel
En Cloudflare → **DNS** → agrega estos registros:
```
Tipo    Nombre    Valor                               Proxy
CNAME   @         cname.vercel-dns.com                ON (nube naranja)
CNAME   www       cname.vercel-dns.com                ON (nube naranja)
```

### 3.3 Agregar dominio en Vercel
1. Vercel → tu proyecto → **Settings** → **Domains**
2. Agrega tu dominio → Vercel verificará automáticamente
3. SSL se configura solo (Let's Encrypt vía Cloudflare)

### 3.4 Seguridad básica de Cloudflare
- **SSL/TLS** → Encryption mode: **Full (Strict)**
- **Security** → **Bot Fight Mode**: ON
- **Speed** → **Auto Minify**: JS + CSS + HTML marcados

---

## 4. Verificación final

Abre tu URL y comprueba:
- [ ] La página de login carga correctamente
- [ ] "Continuar con Google" redirige a OAuth y vuelve al dashboard
- [ ] El botón + abre el sheet de gastos
- [ ] Al guardar un gasto aparece en el historial
- [ ] El presupuesto se guarda en Ajustes

---

## 5. Invitar a otros usuarios (hasta 5 personas)

En Supabase → **Authentication** → **Settings**:
- Por defecto, cualquiera con una cuenta Google puede registrarse
- Para restringir a solo correos específicos:
  1. Desactiva **Enable sign-ups**
  2. Ve a **Users** → **Invite User** → ingresa el correo de cada persona
  3. Ellos recibirán un email de invitación

---

## Comandos útiles de desarrollo local

```bash
# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.local.example .env.local
# → edita .env.local con tus claves de Supabase

# Iniciar servidor de desarrollo
npm run dev
# → abre http://localhost:3000

# Build de producción (para verificar antes de deploy)
npm run build
```
