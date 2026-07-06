# Plan: Configuración del usuario en el SideNav + preferencias de visualización

_Creado: julio 2026 — estado: **Fase 1 implementada** (jul 2026) · Fase 2 pendiente._

## Objetivo

Acercar la configuración al usuario (hoy vive solo en `/ajustes`, al final del menú) y hacer la experiencia configurable donde más importa: **cómo se mide el mes en el inicio** — por mes calendario o por período de facturación de la tarjeta, clave para usuarios que pagan ~90% con crédito.

---

## Fase 1 — Menú de usuario en el SideNav ✅ _(implementada jul 2026: `components/UserMenu.tsx`, SideNav sin item Ajustes, layout pasa perfil)_

**Qué:** bloque de usuario al fondo del SideNav, **arriba del botón "Nuevo gasto"**, reemplazando la entrada "Ajustes" del menú superior (no duplicar).

```
┌──────────────────────────┐
│ ▢ Logo Bolsillo Mágico   │
│ MENÚ                     │
│ Inicio / Historial / …   │  ← "Ajustes" sale de esta lista
│ (flex-1)                 │
│ ────────────────────     │
│ (🅒) Cas          ⌄      │  ← NUEVO: avatar + nombre + chevron
│ ────────────────────     │
│ [＋ Nuevo gasto]         │
└──────────────────────────┘
```

**Al tocar, popover hacia arriba** (mismo shell visual de los modales: `var(--surface)`, borde `var(--border)`, radio 18px, sombra estándar) con:

| Ítem | Acción |
|---|---|
| Header: avatar + nombre + email | link a `/ajustes#perfil` |
| Preferencias | `/ajustes#preferencias` |
| Notificaciones | `/ajustes#notificaciones` |
| Tema claro/oscuro | toggle inline (reusar lógica de `ThemeToggle`) |
| — divider — | |
| Cerrar sesión | form POST `/api/auth/signout`, texto coral |

**Técnica:**
- `SideNav` es client component sin datos de usuario → el layout del dashboard (server) ya valida sesión; ahí se fetchea `profiles.display_name, avatar_url` y se pasa como props a `<SideNav user={{name, email, avatarUrl}} />`.
- Popover: estado local + click-outside (patrón de HistorialFilters); nada de librerías.
- Mobile no cambia: BottomNav mantiene su tab de Ajustes.
- Avatar: `avatar_url` o fallback iniciales sobre `var(--primary)` (igual que ProfileEditor).

**Archivos:** `components/SideNav.tsx`, `components/UserMenu.tsx` (nuevo), `app/(dashboard)/layout.tsx`.

---

## Fase 2 — Preferencia estrella: presupuesto por mes o por facturación ⭐

**Qué:** el usuario elige cómo mide el inicio:
- `calendar` (default): "Gastado este mes" = mes calendario (comportamiento actual).
- `billing`: "Gastado este período" = período de facturación de su tarjeta (ej: 26 jun – 25 jul).

**Migración** (`supabase/migrations/2026MMDD_budget_period.sql`):
```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS budget_period text NOT NULL DEFAULT 'calendar'
    CHECK (budget_period IN ('calendar', 'billing')),
  ADD COLUMN IF NOT EXISTS period_card_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL;
```
- `period_card_id`: qué tarjeta define el corte; null = la `is_default` (o la primera de crédito con `billing_day`).

**UI de la preferencia:**
- Card en Ajustes → Preferencias (junto a Día de sueldo), patrón chips como PaydaySelect: `[Mes calendario] [Facturación de tarjeta]` + selector de tarjeta si hay >1 de crédito.
- Acceso rápido también desde el UserMenu de Fase 1 (los 2 chips inline).

**Efecto en `/inicio` cuando `budget_period = 'billing'`:**
La infraestructura ya existe — `currentStatementRange()` y `billingPeriod()` en `lib/utils`, y el inicio ya calcula statements por tarjeta para la card CMR:

| Elemento del hero | Hoy (calendar) | Con billing |
|---|---|---|
| Total gastado | gastos del mes calendario | gastos con `billingPeriod(date, billing_day)` == período actual |
| Label | "Gastado este mes" | "Gastado este período · 26 jun – 25 jul" |
| Presupuesto aplicado | budgets del mes actual | budgets del **mes del statement** (mismo month/year, solo cambia qué gastos cuentan) |
| Días transcurridos/restantes | día del mes / fin de mes | días desde inicio del período / hasta el corte |
| Promedio diario y proyección | sobre días del mes | sobre días del período |
| "vs anterior" pro-rata | mismo día del mes pasado | mismo día del período anterior (`billingPeriodRange` del statement previo) |

**Alcance acotado:** solo `/inicio` en esta fase. `/historial` y `/analisis` ya tienen su toggle manual `view=billing` — se respeta, no se fuerza. (Fase 3 puede sincronizar el default de esos toggles con la preferencia.)

**Archivos:** migración, `components/BudgetPeriodSelect.tsx` (nuevo), `app/(dashboard)/ajustes/page.tsx`, `app/(dashboard)/inicio/page.tsx` (el grueso), `components/UserMenu.tsx`.

---

## Fase 3 — Más preferencias candidatas (backlog del menú)

Orden sugerido por valor:
1. **Default de vista billing en Historial/Análisis** sincronizado con `budget_period` (los toggles manuales siguen ganando).
2. **`billing_alert_days`** (1–7): días de anticipación del aviso de cierre de tarjeta — hoy fijo 1–2 en `notify-billing`.
3. **Tarjeta predeterminada** editable desde Preferencias (hoy solo vía `is_default` en Métodos).
4. **Ocultar secciones de /analisis** (ej: esconder "Cuándo gastas" si no le interesa) — `profiles.hidden_sections text[]`.
5. Exportación rápida del mes desde el UserMenu.

---

## Orden de ejecución

1. **Fase 1** (UserMenu) — sin migraciones, riesgo bajo, mejora visible inmediata.
2. **Fase 2** (budget_period) — la de mayor valor para Cas; requiere migración + rework del hero de inicio. Probar con dos escenarios: tarjeta con corte día 25 (compra el 26 cae al período siguiente) y sin tarjetas de crédito (la preferencia billing se deshabilita con explicación).
3. **Fase 3** — ítems sueltos según demanda.

## Notas de diseño

- El popover del UserMenu sigue las normas: card `var(--surface)` + borde + sombra estándar, filas con hover `surface-2`, texto `text-sm font-semibold`, "Cerrar sesión" en coral.
- Los chips de preferencias reusan el patrón de PaydaySelect/NotificationPrefs (pill activa `var(--primary)` + inactivas `surface-2`).
- Todo aviso/estado de la preferencia billing debe mostrar el rango de fechas concreto ("26 jun – 25 jul") — los usuarios no memorizan su día de corte.
