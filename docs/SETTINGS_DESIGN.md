# Ajustes — Guía de diseño

Especificación de la pantalla de **Ajustes** de Bolsillo Mágico, para implementar
en el codebase. Hereda todos los tokens del sistema (`README.md`) — colores,
tipografía, radios. Aquí solo se documenta lo específico de esta pantalla.

---

## Principios de esta pantalla

| Principio | Detalle |
|---|---|
| **Sin barra dentro de barra** | La navegación entre secciones va en **pestañas horizontales arriba**, NUNCA una segunda barra lateral junto al menú principal de la app. Un solo nivel de navegación vertical. |
| **El control vive con su ajuste** | Cada ajuste es una tarjeta que contiene su propio control (toggle, segmentado, chips, dropdown). No separar el control del texto que describe. |
| **Tarjetas del tamaño de su contenido** | Nada de cajas enormes con el contenido apilado a la izquierda y 60% de ancho vacío. La tarjeta mide lo que mide su contenido. |
| **Dos columnas** | El contenido de cada pestaña se reparte en una rejilla de 2 columnas para llenar el ancho y evitar pantallas a medio llenar. |
| **Iconos, no emojis** | Cada ajuste lleva un tile de ícono SVG (ver más abajo). Nunca emojis. |

---

## Estructura de la pantalla

```
[ Sidebar app ]  [ Main ]
                   Header (título + subtítulo)
                   Tabs horizontales  ← Perfil · Preferencias · Notificaciones · Finanzas · Datos · Cuenta
                   Rejilla 2 columnas de tarjetas de ajuste
```

- Contenedor central: `max-width: 1080px`, centrado, `padding: 32px 36px`.
- Header: título Fredoka 600 26px + subtítulo `#5A6B85` 14px.
- Tabs: fila con `gap: 8px`, `flex-wrap`, borde inferior `#1E2A40`, `padding-bottom: 16px`.
- Rejilla de contenido: `grid-template-columns: 1fr 1fr; gap: 18px; align-items: start`.
- Cada columna: `flex-direction: column; gap: 18px`.

---

## Pestañas (tabs)

Píldoras horizontales. Una activa a la vez.

| Estado | Estilo |
|---|---|
| Activa | fondo `#4D93FF`, texto `#07122A`, peso 700, `border-radius: 999px`, `padding: 9px 16px` |
| Inactiva | texto `#9DB0CC`, peso 600, fondo transparente; hover `background:#131C2E; color:#EAF1FB` |

Orden: **Perfil · Preferencias · Notificaciones · Finanzas · Datos · Cuenta**

---

## Anatomía de una tarjeta de ajuste

```
┌─────────────────────────────────────┐
│ [tile icon]  Título del ajuste       │   ← encabezado de la tarjeta
│              Descripción corta        │
│                                       │
│ [ control: segmentado / chips /       │   ← control debajo, ancho completo
│   toggle / dropdown ]                 │
└─────────────────────────────────────┘
```

- Tarjeta: fondo `#131C2E`, borde `1px solid #25324C`, `border-radius: 16px`, `padding: 20px`.
- Encabezado: fila con `gap: 13px`, `margin-bottom: 16px`.
  - Tile de ícono: `38×38`, `border-radius: 11px`, fondo tinte del color temático, ícono SVG 18px del color pleno.
  - Título: 15px / 700 / `#EAF1FB`. Descripción: 12px / 500 / `#9DB0CC`, `margin-top: 2px`.

### Tiles de ícono por tema

| Tema | Fondo tile | Color ícono | Uso |
|---|---|---|---|
| Azul | `#16233D` | `#4D93FF` | Presupuesto, idioma, general |
| Menta | `#11241D` | `#34D6A2` | Sueldo, fechas, positivo |
| Dorado | `#2A2410` | `#FFD166` | Moneda, dinero |
| Violeta | `#221A33` | `#A78BFA` | Apariencia |
| Coral | `#1E1012` | `#FF8478` | Acciones destructivas (cerrar sesión, eliminar) |

---

## Controles (patrones reutilizables)

### Segmentado (2–3 opciones)
Contenedor `#0E1626`, borde `#25324C`, `border-radius: 11px`, `padding: 4px`.
Opción activa: fondo `#4D93FF`, texto `#07122A` 700. Inactiva: texto `#9DB0CC` 600.
Cada opción `flex: 1; text-align: center; padding: 9px 0; border-radius: 8px`.
Ejemplos: Período (Mes calendario / Facturación tarjeta), Inicio de semana (Lunes / Domingo).

### Chips (selección de un valor entre varios)
Chips `42×42` (o alto 42 con padding para "Otro"), `border-radius: 11px`.
- No seleccionado: fondo `#0E1626`, borde `#25324C`, texto `#9DB0CC` 700; hover borde `#3A4A68`.
- Seleccionado: fondo `#4D93FF`, texto `#07122A` 800, sin borde.
Números con `font-variant-numeric: tabular-nums`.
Ejemplo: Día de sueldo (1 · 5 · 15 · 25 · 28 · 30 · Otro).

### Toggle
Pista `46×27`, `border-radius: 999px`, knob `21×21` blanco.
- ON: fondo `#4D93FF` (o `#34D6A2` para acciones "seguras"), knob a la derecha.
- OFF: fondo `#1B2740`, borde `#25324C`, knob a la izquierda.
Va dentro de una fila `#0E1626` con ícono + label + estado a la izquierda.

### Dropdown / selector
Fila `#0E1626`, borde `#25324C`, `border-radius: 11px`, `padding: 12px 16px`.
Valor 14px / 700 / `#EAF1FB` a la izquierda, chevron `▾` `#5A6B85` a la derecha.
Hover: borde `#3A4A68`.

### Swatches de color (acento)
Círculos `24×24`. El seleccionado lleva `border: 2px solid #EAF1FB`.
Curar 3–4 opciones: `#4D93FF` · `#34D6A2` · `#A78BFA` · `#FFD166`.

---

## Contenido por pestaña

### Preferencias (implementada)
Columna izquierda:
- **Período del presupuesto** — segmentado: Mes calendario / Facturación tarjeta
- **Día de sueldo** — chips 1/5/15/25/28/30/Otro
- **Moneda** — dropdown (CLP $)

Columna derecha:
- **Apariencia** — toggle Modo oscuro + swatches Color de acento
- **Idioma y región** — dropdown idioma + dropdown formato de fecha
- **Inicio de semana** — segmentado Lunes / Domingo

### Perfil (sugerido)
- Foto + nombre + email (editable)
- Teléfono, país
- Botón "Guardar cambios"

### Notificaciones (sugerido)
Lista de toggles agrupados:
- Resumen mensual (email)
- Alertas de gasto alto
- Recordatorios de pago recurrente
- Pago atrasado
Cada uno con su antelación configurable donde aplique (ej. recordatorio: 1/3/7 días antes).

### Finanzas (sugerido)
- Presupuesto total mensual
- Presupuestos por categoría (lista con montos editables)
- Métodos de pago (CMR, transferencia, +)

### Datos (sugerido)
- Exportar mes (CSV) / exportar todo
- Importar movimientos
- Categorías personalizadas

### Cuenta (sugerido)
- Cambiar contraseña
- Plan (Free → Pro)
- **Cerrar sesión** (tile coral)
- **Eliminar cuenta** (texto coral, con confirmación)

---

## Reglas de acciones destructivas

- Cerrar sesión, eliminar cuenta, borrar datos → color **coral** (`#FF8478` / tile `#1E1012`).
- Siempre requieren confirmación (modal) antes de ejecutar.
- Nunca ponerlas juntas a acciones comunes sin separación visual.

---

## Responsive

- A ancho completo (escritorio): 2 columnas.
- Bajo ~840px: colapsar a **1 columna** (las tarjetas se apilan).
- Las tabs pasan a scroll horizontal si no caben, nunca se parten en dos filas desordenadas.

---

## Archivo de referencia visual

`Bolsillo Mágico - Ajustes.dc.html` — pestaña Preferencias renderizada con todos
estos patrones. Ábrelo en un navegador para ver el resultado final.
