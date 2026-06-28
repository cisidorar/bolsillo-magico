# Gstos — Features actuales y mejoras propuestas

## Stack

Next.js 15 App Router · Supabase (auth + Postgres + RLS + Storage) · TypeScript strict · Tailwind CSS · DeepSeek API

---

## Features actuales

### Gastos
- Registro de gastos con monto, descripción, categoría, método de pago y fecha
- Edición y eliminación de gastos existentes
- Selección rápida de fecha: hoy / ayer / anteayer + selector manual
- **Clasificación automática de categoría con IA** — al escribir la descripción, sugiere la categoría:
  1. Regla exacta aprendida (máxima confianza)
  2. Match difuso por primer token / contenido
  3. Similitud por embeddings (si hay key de OpenAI)
  4. Frecuencia en historial de 90 días
  5. DeepSeek fallback: clasifica usando las categorías del usuario + ejemplos reales de cada una
- Badge de confianza en la sugerencia: "regla guardada" / "historial" / "IA"
- Aprendizaje automático: al guardar, la descripción se guarda como regla para el próximo gasto similar (`category_rules`)

### Historial
- Lista de todos los gastos filtrable por mes
- Filtro por texto libre (búsqueda en descripción)
- Filtro por múltiples categorías simultáneas (comma-separated en URL)
- Collapsible por fecha con subtotal del día
- Modo **Por compra** (mes del gasto) y **Por facturación** (mes del estado de cuenta)
- Edición inline de cualquier gasto

### Análisis mensual
- **Salud financiera** (score 0–100) con 4 señales: gastos vs ingresos, tendencia vs mes anterior, categorías excedidas, proyección al cierre
- Gráfico de barras de gastos por categoría
- Comparación mes a mes (% + CLP absoluto) con lógica pro-rata para el mes en curso
- Vista anual: tabla de gastos mensual por categoría con minibarra de intensidad
- Drill-down por categoría con minigráfico de tendencia histórica
- **Oportunidades de mejora con IA**: 3 insights generados por DeepSeek analizando patrones del mes (gasto único atípico, categoría sobre presupuesto, suscripciones sin presupuesto, etc.)
  - Cache de 6 horas invalidado por hash de gastos
  - Rate limit de 10 minutos para evitar llamadas duplicadas
  - Badge "IA" cuando hay insights activos

### Recurrentes
- Gestión de gastos recurrentes: suscripciones, cuotas, anuales
- Tipos soportados: indefinido / N cuotas fijas / anual (mes específico)
- **Auto-registro automático**: en cada carga del dashboard, registra automáticamente los recurrentes con `auto_register = true` si corresponde al período actual
- Botón "Registrar ahora" manual por ítem
- Calendario de pagos visual con próximos vencimientos del mes
- Logo de servicio detectado automáticamente por dominio (Clearbit / Google Favicons)
- Cargo de administración opcional por método de pago (se registra automáticamente en el billing_day)

### Presupuesto
- Presupuesto global mensual con barra de progreso
- Presupuestos por categoría individuales
- Alerta visual cuando se supera el límite
- Comparación gasto real vs presupuesto por categoría

### Métodos de pago
- Creación de tarjetas de débito, crédito, efectivo y digital
- Día de facturación configurable por tarjeta (1–31)
- Vista de estado de cuenta por tarjeta (`/cuenta/[cardId]`) con movimientos agrupados por período
- Cargo de administración mensual por tarjeta

### Categorías
- Categorías personalizables con nombre, ícono (Lucide o emoji) y color
- Orden personalizable por drag implícito (sort_order)
- Ícono auto-detectado en las listas de gastos según descripción (`getExpenseIcon`)

### Notificaciones (Edge Functions en Supabase)
- **notify-billing**: alerta cuando se acerca el cierre de tarjeta de crédito
- **notify-budget**: alerta cuando se supera o está cerca del presupuesto mensual
- **notify-monthly-summary**: resumen mensual de gastos con HTML estilizado
- Configurables por usuario desde Ajustes (toggles por tipo)
- Programadas con pg_cron en Supabase

### Importación / Exportación
- **Importar CSV**: detección automática de columnas (fecha, monto, descripción, categoría, método), crea categorías faltantes automáticamente (cap 30), maneja múltiples formatos de fecha y monto
- **Exportar CSV**: rango de fechas configurable, columnas sanitizadas contra CSV injection

### Ajustes y perfil
- Nombre de display y foto de avatar (Storage de Supabase)
- Tema claro / oscuro sincronizado con Supabase
- Preferencias de notificaciones por tipo

### Seguridad (OWASP Top 10 auditado)
- Auth con JWT validado en cada request (no solo cookie)
- RLS en todas las tablas — los datos son del usuario
- Rate limiting en `/api/analyze-month` (10 min cooldown)
- Sanitización de inputs antes de enviar a la IA (anti prompt injection)
- Whitelist de enum fields antes de insertar en BD
- Cap de recursos en import (5 MB, 30 categorías auto)
- Errores internos no se exponen al cliente

---

## Mejoras propuestas

### Alta prioridad

**1. Ingresos reales por mes**
La tabla `incomes` ya existe y el score de salud la consume, pero no hay UI para registrarlos. Sin ingreso registrado el score no puede evaluar si "gastas menos de lo que ganas". Una pantalla simple o un campo en Ajustes/Inicio para registrar el sueldo mensual cambia mucho el valor del score.

**2. Metas de ahorro**
Hoy el presupuesto solo define un tope de gasto. Agregar metas ("quiero ahorrar $200.000 este mes") con progreso visual daría un objetivo positivo, no solo un límite. Tabla: `savings_goals(user_id, name, target_amount, month, year)`.

**3. Múltiples usuarios / familia**
Hoy todo está aislado por `user_id`. Un modo "hogar compartido" donde dos usuarios ven los mismos gastos requeriría un concepto de `household_id` con RLS ajustada. Útil para parejas o flatmates.

**4. Widget de ingreso rápido desde inicio**
El FAB abre el sheet completo. Un modo ultra-rápido (solo monto + categoría, sin descripción ni fecha) para registrar algo en 2 taps reduciría la fricción en el uso diario mobile.

### Media prioridad

**5. Adjuntar foto de boleta**
Supabase Storage ya está habilitado (para avatares). Permitir subir una imagen a cada gasto y guardar la URL en `expenses.receipt_url`. Útil para gastos de trabajo o garantías.

**6. Tags y notas en gastos**
La columna `tags` ya existe en el schema (text[]) pero no hay UI. Agregar un campo de tags y notas permitiría filtrar historial por proyecto, viaje, etc.

**7. Split de gastos**
Registrar un gasto compartido con otra persona: "pagué $50.000, me deben $25.000". Una tabla `splits` con el estado de deuda y quién debe cuánto.

**8. Exportar a PDF**
El CSV ya existe. Un PDF formateado del estado de cuenta mensual (como el email de notify-monthly-summary pero descargable) sería útil para contabilidad o reembolsos.

**9. Proyección por categoría**
La proyección al cierre existe a nivel total. Mostrar en el análisis qué categorías van a cerrar sobre presupuesto si el ritmo continúa, con días restantes del mes.

**10. Comparar dos meses manualmente**
Hoy siempre compara vs el mes anterior. Un selector "comparar con" permitiría elegir cualquier mes histórico como base de comparación.

### Baja prioridad / futuro

**11. Integración bancaria (Open Banking)**
Importar movimientos automáticamente desde el banco vía scraping o API (Fintoc en Chile soporta esto para algunos bancos). Eliminaría el registro manual.

**12. Clasificación retroactiva con IA**
Un botón "clasificar todos mis gastos sin categoría con IA" que procese en batch los gastos que quedaron en "Sin categoría". Útil después de una importación CSV masiva.

**13. Modo viaje / presupuesto temporal**
Un presupuesto con fecha de inicio y fin (no mensual) para vacaciones o eventos. Separado del presupuesto mensual normal.

**14. Notificaciones push (PWA)**
Las notificaciones hoy son por email. Web Push permitiría alertas instantáneas en mobile sin email. Requiere service worker + push subscription.

**15. Dashboard público / embeddable**
Un link compartible de solo lectura del resumen mensual (sin auth) para mostrar a un contador o socio.

---

_Última actualización: junio 2026_
