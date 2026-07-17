# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

```bash
npm run dev       # dev server on http://localhost:3000
npm run build     # production build (also validates TypeScript)
npm run lint      # ESLint
npx tsc --noEmit  # type-check without building
```

Test suite: `npm test` (vitest) — covers `lib/utils` (billing/dates), `lib/expense-icons` and `lib/technical.ts` (decision-rule scenarios: uptrend/euforia/bajista/data-jump). Validate changes with `npx tsc --noEmit` AND `npm test` before committing. Any change to `lib/technical.ts` rules must keep or consciously update `lib/technical.test.ts`.

Environment: copy `.env.local.example` → `.env.local` and fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## Architecture

**Stack:** Next.js 15 App Router · Supabase (auth + Postgres + RLS + Storage) · TypeScript strict · Tailwind CSS · Lucide React · Nunito font.

**Route groups:**
- `app/(auth)/` — login page, unauthenticated
- `app/(dashboard)/` — protected pages; layout checks session and redirects to `/login`
- `app/(marketing)/` — public landing page at `/`
- `app/demo/` — public demo, no auth required
- `app/api/` — logo proxy, CSV import/export, auth callbacks

**Dashboard shell** (`app/(dashboard)/layout.tsx`):
- Page background is always `#EEF4FF` (never white)
- `SideNav` fixed left at `w-60`, `hidden lg:flex` — desktop only
- `BottomNav` `lg:hidden` — mobile only
- `<main className="lg:pl-60 main-content-pad">` — no `max-w` wrapper; pages use full width
- `.main-content-pad` = `padding-bottom: calc(6rem + env(safe-area-inset-bottom))` on mobile, `3rem` on `lg+`
- `AutoRegister` runs in the background to auto-create expenses for recurring items with `auto_register = true`

**Auth pattern:**
- `getServerSession()` in `lib/supabase/server.ts` — wrapped with `React.cache()`, deduplicated per request. Uses `getUser()` (validates JWT against Supabase, not just `getSession()` which reads the cookie only).
- Middleware re-validates the user on every request for protected routes. Security of data comes from Supabase RLS, not just middleware.

**Data flow:** Server Components (`page.tsx`) fetch all data directly from Supabase and pass it as props to Client Components. No API layer between pages and DB.

---

## Key Design Patterns

### Brand Colors & CSS Utilities

Brand colors are defined in `tailwind.config.ts` but because Tailwind JIT can't generate responsive variants of custom colors (e.g., `lg:text-brand-600` doesn't work), **always use `style={{ color: '#1B6DD4' }}` for inline brand colors in responsive contexts**. Static non-responsive brand classes work fine.

Core palette:
- `#1B6DD4` — primary blue (CTAs, active states)
- `#0A1F44` — dark navy (headings)
- `#EEF4FF` — page background
- `#D5E6FF` — card borders

CSS utilities defined in `app/globals.css`:
- `.card` — white card with border `1.5px solid #D5E6FF` and `box-shadow: 0 4px 20px rgba(27,109,212,0.09)`, `rounded-3xl`
- `.hero-gradient` — solid `#1B6DD4` background for the dashboard hero
- `.fab-gradient` — FAB button blue with glow shadow
- `.glass-nav` — bottom nav frosted glass
- `.main-content-pad` — responsive bottom padding for BottomNav clearance
- `.scrollbar-none` — hide scrollbar

**Brand color Tailwind classes** (`.text-brand-*`, `.bg-brand-*`, `.border-brand-*`) are declared with `!important` in `globals.css` because Tailwind JIT was not generating them reliably with the custom color config.

### Date Handling

All dates in the DB are `YYYY-MM-DD` strings. Always parse them with noon time to avoid timezone shifts:
```ts
new Date(dateStr + 'T12:00:00')
```

### Billing Mode vs Purchase Mode

Every page with expense data has two views:
- **Por compra** (`view` param absent) — expense belongs to its purchase month
- **Por facturación** (`view=billing`) — expense belongs to the credit card's statement month

`billingPeriod(purchaseDate, billingDay)` in `lib/utils.ts` maps a purchase date to its statement month. `billingDay = null` means debit/cash → returns purchase month.

Credit card statement periods: if purchase day ≤ billing_day → same month statement; if purchase day > billing_day → next month statement.

### Month-over-Month Comparison

When displaying "vs anterior" for the **current month**, compare only up to today's day number in the previous month (same-date, pro-rata comparison). For past completed months, compare full month to full previous month. This logic is implemented in both `app/(dashboard)/inicio/page.tsx` and `app/(dashboard)/analisis/page.tsx`.

### Category Icons

`category.icon` is either:
- A Lucide component name (starts with uppercase ASCII, e.g., `"ShoppingCart"`) → use `getCategoryIcon(icon)` from `lib/category-icons.ts`
- An emoji string → use `isEmoji(icon)` from `lib/utils.ts` to detect, render as `<span>`

```ts
isEmoji(str)  // returns true if str does NOT start with uppercase ASCII letter
getCategoryIcon(name)  // returns the Lucide component for a given icon name string
```

### Expense Icons (auto-detection)

`getExpenseIcon(description, categoryName)` in `lib/expense-icons.tsx` returns `{ icon: LucideIcon, color, bg }`. It matches the description against regex patterns first (e.g., "uber" → Car icon), then falls back to category name keyword matching. Used for expense list rows and analysis cards.

### ServiceLogo Component

`ServiceLogo` is a client component that fetches brand logos via `/api/logo?domain=…`. The API proxies requests through Clearbit, Google Favicons, and DuckDuckGo with SSRF protection. The component probes the URL client-side and falls back to an avatar with the service's initial if the logo fails to load.

### Charts

All charts are **hand-coded SVG** or `div`-based bars — no external chart library is used in practice (recharts is installed but not used in the main views). When adding charts, continue this pattern.

### Multi-Category URL Filter

Historial supports filtering by multiple categories simultaneously using a comma-separated `cats` URL param: `?cats=uuid1,uuid2,uuid3`. Parse with `cats.split(',').filter(Boolean)`, query with `.in('category_id', catIds)`.

---

## Database Schema (summary)

Tables in Supabase (all with RLS, all scoped to `user_id`):

| Table | Key columns |
|---|---|
| `categories` | `icon` (Lucide name or emoji), `color`, `bg_color`, `sort_order` |
| `payment_methods` | `card_type` (debit/credit/cash/digital), `billing_day` (1-31, null for non-credit), `domain` |
| `expenses` | `amount` (integer CLP), `date` (YYYY-MM-DD), `category_id`, `payment_method_id`, `recurring_expense_id`, `description` |
| `recurring_expenses` | `billing_day` (1-28), `auto_register`, `is_active`, `total_installments` (null=indefinite), `paid_installments`, `domain` |
| `budgets` | Monthly total budget; unique per `(user_id, month, year)` |
| `category_budgets` | Per-category budget limits; unique per `(user_id, category_id)` |
| `profiles` | `display_name`, `avatar_url` (Supabase Storage bucket `avatars`) |
| `usd_purchases` | Billetera USD: `kind` (deposit/sell), `usd_amount` (numeric USD), `total_paid_clp` (CLP con comisión; null en sells), `purchase_date`. Saldo = Σ movimientos − Σ `stock_positions.wallet_cost_usd` (porción del costo de cada posición financiada por la billetera; lo legacy no descuenta). Comprar/comprar-más con billetera activa valida contra el saldo y suma a `wallet_cost_usd`; venta parcial lo reduce proporcional; vender devuelve una fila sell |
| `stock_sales` / `stock_purchases` | Historial de operaciones: cada venta guarda `cost_basis_usd`, `proceeds_usd`, `realized_pnl_usd`, `sale_date` y enlaza a la fila sell de la billetera; cada compra queda en `stock_purchases`. Vista Ventas: acumulado + desglose por año y por ticker |
| `stock_positions.trail_stop_usd` | Trailing stop persistido (jul 2026): el cron `sync-prices` guarda cada día `max(valor guardado, alarm del análisis)` — solo sube (ratchet). Se resetea a `null` al comprar más (el cliente); la UI usa `max(alarm del día, trail)` como alarma efectiva. El alarm del motor incluye chandelier (máx 22 ruedas − 3×ATR) vía `exitRef` en `lib/technical.ts` |
| `daily_decisions` | Decisión diaria de portafolio por usuario (jul 2026, Fase 5.4): una fila por usuario por día con el veredicto explícito de convicción (`lib/conviction.ts`) — `ticker=null` significa "hoy no compres nada". La llena el cron `sync-prices` (`computeDailyDecisions`), la lee la Edge Function `notify-watchlist-digest` para abrir el correo con la decisión en vez de una lista de señales |

All `amount` values are **integers in Chilean Pesos (CLP)** — no decimals ever. Format with `formatCLP()` from `lib/utils.ts`.

**Currency convention (jul 2026):** todo el flujo de la app es CLP, excepto el mundo inversión en USD (acciones y billetera USD). La entrada a ese mundo se registra en CLP ("pagué X CLP por N USD" — la comisión queda absorbida en la tasa implícita, sin campo aparte); desde ahí saldo y rendimiento se muestran en USD, porque es raro que ese dinero vuelva a Chile. La conversión a CLP aparece solo como dato secundario y en el patrimonio global (`usd_clp` en `net_worth_snapshots`).

Schema changes go in a new migration file under `supabase/migrations/` (chronological order is the source of truth). `supabase/schema.sql` is FROZEN at jun 2026 (8 base tables) — do not rely on it for a full setup. To check which migrations a database is missing, run `supabase/verify_setup.sql` in the SQL Editor.

---

## UX/UI Rules

- **Mobile-first PWA.** Every layout must work at 375px (mobile) and 1280px+ (desktop). Use `lg:` prefix for desktop variants.
- **No max-width container** in dashboard pages. The layout provides sidebar offset (`lg:pl-60`); pages own their own horizontal padding (`px-4 lg:px-8`).
- **Responsive padding convention:** `pt-6 lg:pt-8 pb-8` at page top; `px-4 lg:px-8` horizontal.
- **Cards always use `.card` class.** Never create a card with ad-hoc rounded + border + shadow.
- **Category colors always come from the category's own `color`/`bg_color` fields**, not from the brand palette. This makes category badges and progress bars match the user's customization.
- **Two-column desktop layouts** use `lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-5 lg:space-y-0` — the space-y handles mobile stacking automatically.
- **Asymmetric grids** (e.g., fixed sidebar + growing content) use `style={{ gridTemplateColumns: 'Xpx 1fr' }}` since Tailwind can't express arbitrary column sizes.
- **Collapsible sections** and **date group headers** in Historial follow the Calendar icon + label + total + ChevronUp/Down pattern.
- **Floating bulk action bars** are `fixed bottom-24 lg:bottom-8 left-0 lg:left-60 right-0 z-[60]` — mobile clears BottomNav, desktop clears nothing but still offsets for SideNav.
- **Loading skeletons** mirror the actual page layout using `animate-pulse` divs. Each route has a `loading.tsx`.
- **Insights and "vs anterior" chips** always show both a % change and the absolute CLP difference when comparing months.
- **Icons for categories** render with their actual category icon (via `isEmoji` + `getCategoryIcon`), not with `getExpenseIcon`. Use `getExpenseIcon` only for individual expense rows (description-matching).
- **Montos siempre en CLP completo** con `formatCLP()` — nunca abreviaturas tipo `$120k` o `$1.2M` en la vista mensual ni en labels de gráficos (usar `text-[9px]` + `whitespace-nowrap` si el espacio aprieta). Única excepción: la tabla anual densa (`fmtCell`) donde el CLP completo no cabe físicamente.
- **Labels de mes en gráficos SVG:** cuidar el escalado del viewBox — un viewBox angosto estirado a todo el ancho agiganta la tipografía. Usar viewBox ancho (~560) con fontSize 9 y el mes bajo cada barra (capitalize).
- **Secciones de /analisis mensual siempre dentro de una `.card`** con su header interno (título `text-sm font-bold` + subtítulo/acciones), como Patrimonio y "Con qué pagaste" — nunca títulos sueltos sobre el fondo de página.
