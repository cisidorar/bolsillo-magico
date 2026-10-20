---
name: Bolsillo Mágico
description: Una libreta de cuentas chilena, cálida pero precisa, que traduce lo complejo (ciclos de facturación, señales técnicas de inversión) en números de confianza.
colors:
  primary: "#4D93FF"
  primary-ink: "#FFFFFF"
  primary-soft: "#E8EFFE"
  mint: "#1FBE8D"
  coral: "#FF6F61"
  gold: "#FFC23C"
  gold-ink: "#B45309"
  mint-on-brand: "#34D6A2"
  mint-on-brand-soft: "#6EE7B7"
  coral-on-brand: "#f87171"
  coral-on-brand-soft: "#FCA5A5"
  gold-on-brand: "#FFE08A"
  bronze: "#92400E"
  bg: "#F4F7FB"
  surface: "#FFFFFF"
  surface-2: "#EDF2F8"
  border: "#E4EAF1"
  ink: "#0E2A52"
  ink-2: "#5B6B82"
  ink-3: "#94A3B8"
typography:
  display:
    fontFamily: "Fredoka, system-ui, sans-serif"
    fontWeight: 800
    fontSize: "clamp(1.5rem, 2.2vw, 2.25rem)"
    lineHeight: 1
  headline:
    fontFamily: "Fredoka, system-ui, sans-serif"
    fontWeight: 600
    fontSize: "1.25rem"
    lineHeight: 1.2
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontWeight: 400
    fontSize: "0.875rem"
    lineHeight: 1.5
  label:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontWeight: 700
    fontSize: "0.625rem"
    letterSpacing: "0.1em"
  caption:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontWeight: 400
    fontSize: "0.6875rem"
  micro:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontWeight: 700
    fontSize: "0.5625rem"
    letterSpacing: "0.05em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  card: "18px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.lg}"
    padding: "12px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "16px"
  chip-gold:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.gold}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
---

# Design System: Bolsillo Mágico

## Overview

**Creative North Star: "The Friendly Ledger"**

Bolsillo Mágico reads like a ledger a trusted friend keeps for you: rounded, warm shapes (Fredoka headlines, 18-16-12px radii, soft tinted borders) that never feel corporate or cold, wrapped around numbers that are never allowed to be ambiguous. The tone is **cálido pero preciso** — warm but precise — personality lives in shape and color, never at the expense of a number reading correctly at a glance. Nothing here performs the "fintech dashboard" look of hard edges and dense data-chrome; nothing performs a toy either. One soft blue (`--primary`) carries nearly all interactive meaning, and three semantic colors (mint, coral, gold) carry alert severity and never mean anything else.

Depth is intentionally quiet. Elevation is a small ambient hint, not a design statement — cards are told apart mostly by their 1.5px tinted border, with shadow in a supporting role. The one place depth gets to speak a little louder is a primary action (the "Nuevo gasto" button, the FAB, a few key CTAs), which carries a soft brand-tinted glow — still restrained, never a loud drop shadow.

**Key Characteristics:**
- Rounded, friendly geometry (Fredoka display type, 12–18px corner radii) paired with disciplined, precise body copy (Plus Jakarta Sans) and `tabular-nums` on every amount.
- One soft blue (`--primary` / Soft Trust Blue) carries almost all interactive and brand meaning; mint/coral/gold are reserved strictly for alert severity (see the Alert Severity Hierarchy rule below).
- Flat-leaning elevation: a near-invisible ambient shadow plus a 1.5px tinted border does most of the "this is a surface" work; shadow intensifies only for primary actions, and even then stays soft.
- Full light/dark parity via CSS custom properties (`--bg`, `--surface`, `--ink`, …) — every token has a dark-mode counterpart, never an afterthought overlay.

## Colors

A deliberately narrow palette: one soft, friendly blue carries the brand and nearly all interaction; three semantic colors are reserved exclusively for alert severity; everything else is a quiet blue-navy-tinted neutral ramp.

### Primary
- **Soft Trust Blue** (`#4D93FF`, `--primary`): the only brand/interactive color. Active nav states, icons, focus rings, chart bars, CTA backgrounds, the `/inicio` hero. Identical hex in light and dark mode — only its surrounding neutrals shift.
- **Primary Ink** (`#FFFFFF` light / `#07122A` dark, `--primary-ink`): text/icon color placed on top of a primary-filled surface (always flips with theme so it stays legible).
- **Primary Soft** (`#E8EFFE` light / `#16233D` dark, `--primary-soft`): the tint behind an active/selected state (active nav pill, selected chip, focus halo) — never the primary itself at full strength for a background.

### Neutral
- **Page Wash** (`#F4F7FB` light / `#0B1220` dark, `--bg`): the page background behind every card.
- **Surface** (`#FFFFFF` light / `#131C2E` dark, `--surface`): card and sheet background.
- **Surface Subtle** (`#EDF2F8` light / `#1B2740` dark, `--surface-2`): inset wells — input backgrounds, inactive chip fills, unselected nav icon containers.
- **Hairline Border** (`#E4EAF1` light / `#25324C` dark, `--border`): the 1.5px border that does most of a card's definition work.
- **Ink** (`#0E2A52` light / `#EAF1FB` dark, `--ink`): primary text and headline color.
- **Ink Muted** (`#5B6B82` light / `#9DB0CC` dark, `--ink-2`): secondary text, subtitles, section labels.
- **Ink Faint** (`#94A3B8` light / `#64748B` dark, `--ink-3`): tertiary text, placeholder, inactive icon/label color.

### Named Rules
**The Alert Severity Hierarchy Rule.** Coral, gold, and mint each map to exactly one severity and are never interchanged:
- **Coral** (`#FF6F61` light / `#FF8478` dark, `--coral`) + a full bordered banner (icon + tinted background `rgba(255,111,97,0.08-0.1)` + `1-1.5px solid rgba(255,111,97,0.25)`) = requires action **today**. At most one coral banner per screen; a second urgent condition degrades to a gold chip instead of a second banner.
- **Gold** (`#FFC23C` light / `#FFD166` dark, `--gold`) + a small inline pill (`rounded-full`, `rgba(255,194,60,0.15)` background, never a banner-sized box) = attention needed soon, not today.
- **Mint** (`#1FBE8D` light / `#34D6A2` dark, `--mint`) = positive confirmation only — never a banner, never anything actionable, even when the news is good.

**The Gold-Ink Rule.** `--gold` (`#FFC23C`) is a background/icon-tint color only — at ~1.6:1 against white it fails WCAG AA as foreground text. Anywhere gold needs to read as *text or an icon glyph* on a light surface (an overdue-reservation label, an over-cap warning), use `--gold-ink` (`#B45309` light / `#FFD166` dark — in dark mode the bright `--gold` already reads fine on dark surfaces, so the two tokens converge) instead of `--gold` directly.

**The On-Brand Accent Rule.** `--mint`/`--coral`/`--gold` are tuned for neutral (`--surface`/`--bg`) grounds, not for sitting directly on the hero's solid `--primary` blue — on that one surface, use `--mint-on-brand` (`#34D6A2`), `--coral-on-brand` (`#f87171`), and `--gold-on-brand` (`#FFE08A`) instead, each theme-invariant like `--primary` itself since the hero is always that blue regardless of light/dark. A `-soft` variant of mint/coral (`--mint-on-brand-soft` `#6EE7B7`, `--coral-on-brand-soft` `#FCA5A5`) exists for a second, lower-emphasis figure on the same hero (e.g. a month-over-month delta next to the primary remaining-budget figure) — never introduce a third shade by hand; reach for `-soft` first.

**The Ranking Accent Rule.** A numbered leaderboard position (top categories by spend) is decorative ranking, not alert severity — it borrows gold for 1st place by convention (matching `.rank-gold`) but 3rd place uses `--bronze` (`#92400E` light / `#D97706` dark, matching `.rank-bronze`), never a new orange invented for the occasion.

**The One Interactive Blue Rule.** `--primary` is the only color that means "this is interactive / this is the brand." A second static blue utility (`.text-brand-600` etc., `#2B7CF6`) exists purely as a technical workaround — Tailwind JIT can't generate responsive variants of a CSS-custom-property-backed color — and should be treated as an implementation detail of that workaround, never a second brand hue to design with intentionally.

## Typography

**Display Font:** Fredoka (with system-ui, sans-serif fallback)
**Body Font:** Plus Jakarta Sans (with system-ui, sans-serif fallback)

**Character:** Fredoka's rounded, slightly playful letterforms carry warmth on headlines and hero amounts; Plus Jakarta Sans stays clean and businesslike everywhere money needs to be read precisely. The pairing is the Cálido pero preciso rule made literal — one typeface for feeling, one for facts.

### Hierarchy
- **Display** (extrabold/800, `text-3xl` → `text-4xl` on `lg:`, `leading-none`, `tabular-nums`, Fredoka): the single hero amount on a stat card (`/inicio`'s spent-this-month, portfolio value). Always paired with a `text-[10px]` uppercase label above it.
- **Headline** (semibold/600, `text-xl`, Fredoka — applied automatically to every `h1`/`h2`/`h3`): page titles ("Categorías", "Inicio").
- **Title** (bold/700, `text-sm`, Plus Jakarta Sans): card section headers ("Por categoría", "Flujo de caja").
- **Body** (regular/400, `text-sm`, Plus Jakarta Sans): list rows, descriptions, form labels.
- **Label** (bold/700, `text-[10px]`–`text-xs`, uppercase, `tracking-widest`, Plus Jakarta Sans): micro-labels above a stat ("Disponible", "Por día"), nav captions.
- **Caption** (regular/400, `text-[11px]`, Plus Jakarta Sans): secondary hint text under a field or section header — the single most-repeated size in the app (`FieldLabel`'s hint, section hints), promoted from an undocumented one-off to a real step rather than left as drift.
- **Micro** (bold/700, `text-[9px]`, uppercase, `tracking-wider`, Plus Jakarta Sans): the smallest live step — a stamp-like status badge ("Anulado"), a chart's rotated month label. Used sparingly; reach for Label (10px) first.

### Named Rules
**The Tabular Numerals Rule.** Every monetary amount renders with `tabular-nums`, no exceptions — numbers must line up in lists and never visually jitter as digits change.

## Layout

Mobile-first, no `max-width` container on dashboard pages — the shell provides the only horizontal constraint (`lg:pl-60` for the fixed sidebar), and each page owns its own `px-4 lg:px-8`. Two-column desktop layouts collapse to a single stacked column below `lg:` via `space-y-5 lg:space-y-0` rather than a separate mobile template. Floating bulk-action bars sit `fixed bottom-24 lg:bottom-8`, clearing the mobile `BottomNav` and offsetting for the desktop `SideNav`. Vertical rhythm: `pt-6 lg:pt-8 pb-8` at the top of a page, `gap-4`–`gap-6` between card-level sections.

## Elevation & Depth

Flat-by-default, ambient-not-material. Most of a surface's separation from the page comes from its 1.5px tinted border (`--border`), not its shadow — the shadow is a near-invisible hint (`--shadow`: `rgba(14,42,82,.06)` light / `rgba(0,0,0,.28)` dark) layered under every `.card`. Depth is never used to imply a z-axis stack of overlapping panels; there is no elevation *scale*, just "flat card" and "primary action, slightly lifted."

### Shadow Vocabulary
- **Ambient card shadow** (`box-shadow: 0 8px 18px var(--shadow)`): the default and only resting-state shadow for any `.card` surface. Supporting role only — the border carries the definition.
- **Primary action glow** (`box-shadow: 0 Npx Mpx rgba(43,124,246,0.18)` light / `rgba(77,147,255,0.18)` dark, N/M scaled to the control's size — 14-20px blur on buttons, 28px on the FAB): reserved for the one or two primary CTAs on a screen (FAB, "Nueva categoría", a submit button, a selected chart bar). Soft, not a loud drop shadow — intensity was deliberately brought down from an earlier, heavier glow (previously up to `0.45`) to stay consistent with the Flat-by-Default rule.

### Named Rules
**The Flat-by-Default Rule.** Surfaces are flat at rest, told apart by their border; shadow only intensifies as a response to being the primary action on screen, and even then stays soft rather than becoming a "lifted panel" effect.

## Shapes

Generously rounded throughout — the system has no sharp corners outside of hairline dividers. `.card` uses an 18px radius (a deliberate value between Tailwind's `rounded-xl`/12px and `rounded-2xl`/16px steps); inputs and modals use `rounded-2xl` (16px); nav items, chips, and small buttons use `rounded-xl` (12px); pills, avatars, and the FAB use `rounded-full`. Borders are consistently 1.5px (never 1px or 2px) and always drawn from the `--border` token, never a one-off gray.

## Components

### Buttons
- **Shape:** `rounded-xl`–`rounded-2xl` (12–16px) depending on the button's size; the FAB is the one `rounded-full` exception.
- **Primary:** `background: var(--primary)`, `color: var(--primary-ink)`, bold text, a soft brand-tinted glow (see Elevation), `active:scale-[.98]` and `hover:brightness-110` as the only state feedback — no color-swap on hover.
- **Ghost/Secondary:** transparent background, `--ink-2` text, background lightens to `--surface-2` on hover; used for the "¿Me lo puedo comprar?" and similar low-emphasis actions.
- **Touch target:** every tappable control (bottom nav items, chips) keeps a `min-width/min-height: 44px` hit area even when its visible icon is smaller.

### Chips / Badges
- **Category badge** (`.cat-badge`): background and text color come from the category's own `color`/`bg_color` fields, never the brand palette — this is the one place per-item customization overrides the system palette.
- **Severity chip:** `rounded-full`, `text-[10px] font-bold`, `px-2 py-0.5`, background = the severity color at ~15% opacity, text = the severity color at full strength. Gold is the only severity that appears as a chip rather than a banner by default.
- **Sheet toggle chip:** `rounded-2xl` pill with `--surface-2`/`--border` at rest, flips to `--primary-soft` background + `--primary` border + bold text when active.

### Cards / Containers
- **Corner Style:** 18px radius (`.card` class), consistent everywhere.
- **Background:** `--surface`; `.card-brand` variant uses `--bg` instead for a nested card against the page wash.
- **Shadow Strategy:** ambient card shadow only (see Elevation).
- **Border:** always `1.5px solid var(--border)`.
- **Internal Padding:** `px-5 py-4` on stat/hero cards, `p-4` on general content cards.

### Inputs / Fields
- **Style:** `--surface-2` background, `1px solid --border` (via `.sheet-input`), `rounded-2xl`, `px-4 py-2.5`–`py-3`.
- **Focus:** border shifts to `--primary` (`focus-within:border-brand-400` in light; the dark override targets `--primary` directly).
- **Error:** background and border shift to a coral tint (`border-red-300 bg-red-50` light; themed equivalently in dark).

### Navigation
- **Desktop (`SideNav`):** fixed `w-60` rail, `--surface` background, `--border` right edge. Active item: `--primary-soft` background pill + `--primary` text/icon. Inactive: `--ink-2` text, `--ink-3` icon, hover lightens to `--surface-2`.
- **Mobile (`BottomNav`):** frosted glass (`backdrop-filter: blur(20px)` over a translucent `--surface`), active icon gets a `--primary-soft` chip behind it, FAB floats center with the Primary Action Glow.

### Alert Severity Hierarchy (signature system)
The project's most distinctive, load-bearing component convention: coral banner (urgent, today, max one per screen) → gold chip (soon, inline, never banner-sized) → mint (confirmation only, never actionable). See the Named Rule under Colors; this governs every alert-shaped surface in the app, from budget overruns to statement due dates to investment signals.

## Do's and Don'ts

### Do:
- **Do** keep `--primary` as the only color that signals "interactive" — new UI should reach for it before reaching for any other hue.
- **Do** use `tabular-nums` on every rendered money amount, no exceptions.
- **Do** let the 1.5px `--border` carry a card's definition; treat shadow as a secondary, near-invisible cue.
- **Do** reserve the Primary Action Glow for the one or two true primary CTAs on a screen — not every button with `background: var(--primary)` needs one.
- **Do** keep every new color token dark-mode-complete (a light value with no `.dark` counterpart is an incomplete token).

### Don't:
- **Don't** mix severity colors — mint never appears on anything actionable, and coral never appears as mere "soon" information once it already escalated.
- **Don't** add a second coral banner to a screen that already has one; degrade the lesser condition to a gold chip instead.
- **Don't** reach for a sharp corner or a hard, high-contrast drop shadow anywhere — both read as off-system immediately.
- **Don't** introduce a new blue. The `.text-brand-600`-family static utility (`#2B7CF6`) is a Tailwind-JIT workaround for responsive contexts, not license to design with a second brand blue.
- **Don't** give category badges a palette-driven color — they intentionally read from the category's own `color`/`bg_color` fields.
