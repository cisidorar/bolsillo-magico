# Sistema de correos — Bolsillo Mágico

Guía de diseño e implementación para todos los correos transaccionales de la app.
Derivada de la guía de identidad visual y del sistema de diseño (`README.md`).

---

## Principios generales

| Principio | Detalle |
|---|---|
| **Ancho fijo** | 600px, una sola columna. Compatible con todos los clientes de correo y móvil. |
| **Una acción por correo** | Un solo botón principal (CTA) por correo. Sin listas de enlaces compitiendo. |
| **Dato clave arriba y grande** | El usuario debe entender el correo en 3 segundos sin abrir la app. |
| **Sin emojis** | Usar exclusivamente **iconos SVG** inline o iconos de un sistema de iconos consistente (stroke, no fill, `stroke-width: 1.8`, color heredado). Los emojis se renderizan diferente por sistema operativo y cliente de email — no usar. |
| **Tono cercano** | Tuteo directo. Amable, útil. Sin alarmismo ni jerga financiera. |

---

## Anatomía de un correo

Todos los correos siguen esta estructura en orden fijo:

```
1. Encabezado de marca
2. Bloque destacado  ← el dato clave, grande
3. Contenido / desglose
4. Un solo botón CTA
5. Pie con enlaces + baja
```

### 1. Encabezado de marca

- Fondo del color de intención (ver tabla de colores más abajo).
- Logo: ícono cuadrado redondeado (`border-radius: 9px`) con el bolsillo mágico + wordmark "Bolsillo Mágico" en Fredoka 600.
- Ícono de contexto (SVG, 52×52, fondo circular semitransparente) debajo del wordmark.
- Título del correo en Fredoka 600, 22px, color blanco.

### 2. Bloque destacado

- Fondo `#2B7CF6` (o el color de intención si es resumen/positivo).
- Monto o cifra principal: Plus Jakarta Sans 800, 38px, `font-variant-numeric: tabular-nums`.
- Badge de contexto (delta vs. mes anterior, estado, etc.) en pastilla con fondo semitransparente.

### 3. Contenido / desglose

- Tarjetas de ítem: fondo `#F4F7FB` o del color de intención (tinte suave), borde `#E4EAF1`.
- Nombre del ítem: 15px / 700. Subtítulo de estado: 12px / 700, color semántico.
- Barras de presupuesto: height 8px, track `#EDF2F8`, relleno semántico.

### 4. CTA

- Un solo `<a>` con aspecto de botón.
- `border-radius: 12px`, `padding: 14px 32px`, `font-size: 14px`, `font-weight: 700`.
- Color de fondo = color de intención del correo.
- `text-decoration: none`. Centrado.
- Enlace secundario opcional debajo en texto plano (12px, sin botón).

### 5. Pie

- Fondo `#0E2A52`.
- Wordmark en Fredoka 600, 14px, blanco.
- Tres enlaces de texto: "Abrir app", "Ayuda", "Preferencias" (12px, `#9FB5D4`).
- Texto legal / baja: 11px, `#5E7396`, línea 1.6.

---

## Tokens de color por tipo de correo

El **encabezado** y el **botón CTA** cambian de color según la intención. El resto del sistema no cambia.

| Tipo | Uso | Color |
|---|---|---|
| **Informativo** | Resumen mensual, novedades | `#2B7CF6` |
| **Positivo** | Meta cumplida, ahorro logrado | `#1FBE8D` |
| **Recordatorio** | Cobro próximo, vence pronto | `#F59E0B` |
| **Urgente** | Pago atrasado, acción requerida | `#EF5B52` |

Tintes de fondo para tarjetas internas según tipo:

| Tipo | Fondo tarjeta | Borde tarjeta |
|---|---|---|
| Informativo | `#EAF2FE` | `#D6E4FB` |
| Positivo | `#E7F7F0` | `#C9EEDF` |
| Recordatorio | `#FFF8E8` | `#FBE6B5` |
| Urgente | `#FFF4F3` | `#FAD3CF` |

---

## Tipografía en correos

> Los correos deben usar stack seguro de fallback porque los clientes de correo no cargan Google Fonts de forma fiable. Cargar Fredoka vía `<link>` en el `<head>` del HTML del correo y siempre incluir fallback.

| Rol | Fuente | Peso | Tamaño | Notas |
|---|---|---|---|---|
| Wordmark / títulos grandes | `Fredoka, system-ui, sans-serif` | 600 | 22–26px | Solo para títulos y nombre de marca |
| Secciones internas | `Fredoka, system-ui, sans-serif` | 600 | 15–16px | |
| Monto destacado | `Plus Jakarta Sans, system-ui, sans-serif` | 800 | 34–38px | `font-variant-numeric: tabular-nums` |
| Montos secundarios | `Plus Jakarta Sans, system-ui, sans-serif` | 800 | 17–20px | `tabular-nums` |
| Cuerpo | `Plus Jakarta Sans, system-ui, sans-serif` | 500 | 14px | line-height 1.6 |
| Labels / metadata | `Plus Jakarta Sans, system-ui, sans-serif` | 600–700 | 11–12px | |
| CTA | `Plus Jakarta Sans, system-ui, sans-serif` | 700 | 14px | |

---

## Iconos

**No usar emojis.** Usar SVG inline con estas propiedades:

```html
<svg width="20" height="20" viewBox="0 0 20 20" fill="none"
     stroke="currentColor" stroke-width="1.8"
     stroke-linecap="round" stroke-linejoin="round">
  <!-- path aquí -->
</svg>
```

Para el ícono de contexto en el encabezado (52×52 con fondo circular):

```html
<div style="width:52px;height:52px;border-radius:50%;
            background:rgba(255,255,255,0.2);
            display:flex;align-items:center;justify-content:center;
            margin:0 auto 12px">
  <svg width="26" height="26" viewBox="0 0 20 20" fill="none"
       stroke="white" stroke-width="1.8">
    <!-- path aquí -->
  </svg>
</div>
```

Iconos recomendados por tipo de correo:

| Tipo | Ícono | Path SVG sugerido |
|---|---|---|
| Resumen mensual | Gráfica de barras | `<rect x="3" y="11" width="3" height="6" rx="1"/><rect x="8.5" y="7" width="3" height="10" rx="1"/><rect x="14" y="3" width="3" height="14" rx="1"/>` |
| Pago atrasado | Reloj / alerta | `<circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/>` |
| Recordatorio | Campana | `<path d="M5 8a5 5 0 0 1 10 0c0 5 2 6 2 6H3s2-1 2-6"/><path d="M8.5 17a1.5 1.5 0 0 0 3 0"/>` |
| Meta cumplida | Check círculo | `<circle cx="10" cy="10" r="7"/><path d="M7 10l2 2 4-4"/>` |
| Bienvenida | Bolsa / billetera | `<rect x="3" y="5" width="14" height="11" rx="2"/><circle cx="14" cy="10.5" r="1.3" fill="currentColor" stroke="none"/>` |

---

## Plantilla 1 — Resumen mensual

**Tipo:** Informativo (`#2B7CF6`)
**Frecuencia:** 1 vez al mes, el día 1 del mes siguiente
**Asunto sugerido:** `Tu resumen de [mes]: ahorraste $[monto]`
**Preheader:** `[mes] en números — ve a dónde fue tu dinero`

### Estructura de contenido

```
Encabezado azul
  Wordmark
  Icono: gráfica de barras
  Título: "Resumen mensual · [Mes Año]"

Saludo
  "Hola, [nombre]"
  1 línea de contexto ("Este mes ahorraste y...")

Bloque destacado (fondo azul)
  Etiqueta: "Ahorraste este mes"
  Monto grande: $X.XXX
  Badge: "↑ X% vs. [mes anterior]"

Fila de 3 KPIs (horizontal)
  Ingresos | Gastos | Ahorro

Sección: "En qué se fue tu dinero"
  Filas de categoría: icono + nombre + monto + % + barra
  Mostrar máximo 4 categorías

Botón CTA azul
  "Ver reporte completo"

Pie estándar
```

### Variables necesarias del backend

```
user.firstName
month.name               // "junio"
month.year               // "2026"
month.savings            // 1840000
month.savingsVsPrev      // "+22%"
month.income             // 3200000
month.expenses           // 1360000
month.topCategories[]    // [{name, amount, pct, barColor}]
urls.fullReport
```

---

## Plantilla 2 — Pago atrasado

**Tipo:** Urgente (`#EF5B52`)
**Trigger:** Pago recurrente marcado que venció hace N días sin registrarse
**Asunto sugerido:** `Tu pago de [nombre] está atrasado`
**Preheader:** `Venció hace [N] días — regístralo para mantener tus cuentas al día`

> Tono: directo pero sin culpar. No usar palabras como "olvidaste", "incumpliste". El foco es ayudar.

### Estructura de contenido

```
Encabezado coral
  Wordmark
  Icono: reloj
  Título: "Tienes un pago atrasado"

Cuerpo
  "Hola [nombre], este pago venció hace [N] días."
  1 línea motivadora ("Regístralo para mantener...")

Tarjeta del pago (fondo tinte coral)
  Icono del servicio (SVG genérico o inicial)
  Nombre del recurrente
  Subtítulo: "Venció el [fecha] · hace [N] días"
  Monto grande a la derecha

Botón CTA coral
  "Registrar pago ahora"

Enlace secundario (sin botón)
  "¿Ya lo pagaste? Márcalo como pagado"

Pie estándar
  Texto de baja: "Recibes este aviso porque tienes recordatorios de pago activos."
```

### Variables necesarias del backend

```
user.firstName
payment.name             // "Arriendo"
payment.amount           // 320000
payment.dueDate          // "1 de julio"
payment.daysLate         // 3
urls.registerPayment
urls.markAsPaid
urls.adjustAlerts
```

---

## Plantilla 3 — Recordatorio de cobro

**Tipo:** Recordatorio (`#F59E0B`)
**Trigger:** Pago recurrente se cobra en N días (configurable por usuario, default 3 días)
**Asunto sugerido:** `[Nombre] se cobra en [N] días ($[monto])`
**Preheader:** `Ten el saldo listo — [fecha de cobro]`

### Estructura de contenido

```
Encabezado ámbar
  Wordmark
  Icono: campana
  Título: "Un cobro se acerca"

Cuerpo
  "Hola [nombre], esto se cobrará pronto.
   Te avisamos para que tengas el saldo listo."

Tarjeta del cobro (fondo tinte ámbar)
  Icono del servicio
  Nombre del recurrente
  Subtítulo: "Se cobra el [fecha] · en [N] días"
  Monto grande a la derecha

Bloque de contexto (fondo neutro)
  Icono check
  "Tu saldo alcanza: te quedarán $[saldo_post] después del cobro."
  (Solo mostrar si hay datos de saldo disponibles)

Botón CTA ámbar
  "Ver mis recurrentes"

Enlace secundario
  "¿Ya no usas [nombre]? Pausar recordatorio"

Pie estándar
  Texto de baja: "Recibes este recordatorio porque lo activaste para este recurrente."
```

### Variables necesarias del backend

```
user.firstName
recurring.name           // "Spotify Premium"
recurring.amount         // 8250
recurring.chargeDate     // "29 de junio"
recurring.daysUntil      // 3
user.balanceAfterCharge  // 97808 (opcional, mostrar si disponible)
urls.viewRecurrents
urls.pauseAlert
```

---

## Consideraciones técnicas para implementación

### HTML del correo

- Usar **tablas** para layout (no flexbox ni grid — los clientes de correo no los soportan bien).
- `width="600"` en la tabla contenedora externa, `align="center"`.
- Todos los estilos **inline** en el tag `style=""` del elemento — no `<style>` en `<head>` (Gmail los ignora).
- Excepción: `@font-face` para Fredoka puede ir en `<style>` del `<head>` — tendrá fallback automático donde no cargue.
- Imágenes con `alt` siempre definido (muchos usuarios leen correos con imágenes desactivadas).
- Los iconos SVG inline **sí funcionan** en la mayoría de clientes modernos. Para Outlook usar fallback de texto plano.

### Colores en modo oscuro de clientes de correo

Algunos clientes (Apple Mail, iOS Mail) invierten colores automáticamente en dark mode. Para proteger el diseño:

```html
<!-- Forzar fondo blanco en modo oscuro -->
<div style="background-color: #ffffff;"
     data-ogsc
     class="email-body">
```

O usar `@media (prefers-color-scheme: dark)` en el `<style>` del `<head>` para definir variantes explícitas. La guía de tokens de color oscuro está en `README.md`.

### Pruebas recomendadas

Antes de enviar a producción, probar en:
- Gmail web (Chrome)
- Gmail app iOS / Android
- Apple Mail macOS / iOS
- Outlook web
- Outlook desktop (Windows) — el más restrictivo, no soporta muchas propiedades CSS modernas

---

## Tono y redacción

### Sí

- Tuteo directo: "Hola, [nombre]"
- El dato primero: "Ahorraste $1.840"
- Una acción clara por correo
- Dar contexto útil: "tu saldo alcanza"
- Reconocer lo positivo aunque haya un problema: "vas bien en general, solo este pago quedó pendiente"

### No

- Alarmismo o culpa: "olvidaste", "incumpliste", "URGENTE"
- Jerga financiera: "flujo de caja", "liquidez", "déficit"
- Muros de texto sin un dato grande y visible
- Varios botones compitiendo por atención
- Emojis — usar iconos SVG
- Números sin formato: escribir `$1.840` no `$1840`

### Formato de montos

```
Local (CLP):   $1.840.000  →  separador de miles = punto, sin decimales
USD:           $1,840.00   →  separador de miles = coma, 2 decimales
```

En el código: `toLocaleString('es-CL')` para CLP, `toLocaleString('en-US', {minimumFractionDigits:2})` para USD.

---

## Archivos de referencia visual

Los siguientes archivos `.dc.html` del proyecto muestran las plantillas renderizadas.
Ábrelos en un navegador para ver el aspecto final:

| Archivo | Qué contiene |
|---|---|
| `Bolsillo Mágico - Guía de Correos.dc.html` | Guía completa con las 3 plantillas y reglas de color/tipo |
| `Bolsillo Mágico - Email Resumen Mensual.dc.html` | Plantilla de resumen mensual en detalle |

El sistema de diseño base (tokens, tipografía, paleta) está documentado en `README.md`.
