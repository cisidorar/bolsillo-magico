# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Cas (cisidorar@gmail.com) is the sole real user of the product. Registration has been closed since jul 2026 (`ROADMAP-uso-personal.md`): no public landing, no signup form, Supabase sign-ups disabled at the project level. Cas uses the full app day-to-day: expense tracking, budgets, recurring bills, income, investments, and property.

A second kind of participant exists but is narrow in scope: people Cas invites into a shared trip (`/compartidos`). They get their own login and see only their own share of that trip's expenses — never Cas's dashboard, income, budget, or any other section. They are not a general audience; design work outside `/compartidos` does not need to serve them.

RLS and the multi-tenant `user_id` scoping stay in place everywhere as defense in depth, even though there is currently one primary user — this is a deliberate security posture, not evidence of a broader audience.

## Product Purpose

A personal finance tool for Cas, built around how money actually works in Chile: integer CLP amounts, credit-card statement cycles (not calendar months), recurring bills with auto-registration, and a monthly budget that reacts to both. Beyond day-to-day expense tracking it also covers: income/payslip tracking, a rental property check (`/propiedad`), a USD investment ledger with a daily technical "conviction" signal engine for a stock/ETF watchlist (digest emails, buy/sell/hold verdicts), and shared-trip expense splitting with a travel companion by income ratio without revealing either person's actual income.

Success is Cas trusting the numbers enough to use them for real decisions (can I afford this, is this statement closing soon, should I act on this stock signal, what's my share of this trip) without having to double check them against a bank statement or spreadsheet.

## Positioning

Not a generic budgeting SaaS. Its edge is modeling the specific, finicky mechanics a Chilean cardholder/investor actually lives with — three distinct statement-range functions (currently accruing vs. last closed vs. last due) with a 2pm Chile-time cutover on the closing day itself, billing-mode vs. purchase-mode toggles everywhere, and a shared-trip split that computes an income ratio via a security-definer function so no party ever sees the other's actual income. A neighboring generic expense tracker could not truthfully copy this without rebuilding that domain logic.

## Operating Context

- Mobile-first PWA, installed to the home screen on Android/iOS (`manifest.json`, `apple-touch-icon`); also used at a desktop widths.
- Spanish (Chile) throughout, including code comments and docs.
- Credit card billing cycles, recurring auto-registered expenses, and a monthly budget are checked often enough that their numbers need to be trustworthy without cross-checking a bank app.
- The investment side runs semi-autonomously in the background: a cron computes daily buy/hold/sell verdicts and a watchlist digest email, so Cas's actual interaction is often reading a verdict rather than running the analysis.
- Shared trips (`/compartidos`) are planned months ahead, paid for partly in advance, and settled after the trip — a slower, episodic cadence than the daily expense/budget loop.

## Capabilities and Constraints

- All money amounts are integer CLP (no decimals) except the investment world, which is USD end-to-end (entry recorded once in CLP, then tracked and shown in USD because that money typically doesn't come back to Chile).
- Credit card statement math (`billingPeriod`, `currentStatementRange`, `lastClosedStatementRange`, `lastDueStatementRange`) is foundational and must stay correct — see `CLAUDE.md` for the exact semantics and the 2pm Chile-time cutover edge case.
- Shared-trip income ratio is computed server-side via a `SECURITY DEFINER` Postgres function; neither party's raw income is ever exposed to the other, only the resulting %.
- No public signup surface exists or should be reintroduced; `/`, `/demo`, and marketing pages were deliberately deleted in jul 2026 and `robots.ts` blocks all crawling.
- The investment/technical-signal engine (conviction score, chandelier exit, ATR-based trailing stops) is built on real technical-analysis logic, but the product's job is to translate it into a plain-language verdict ("comprar" / "esperar" / "vender") — jargon and raw indicator values are implementation detail, not the primary surface a user reads. This applies even though Cas personally understands the underlying technicals: the product's bar is a non-specialist decision, not a literacy test.
- Dark mode is supported and synced server-side via `profiles.theme` (SSR, no flash).

## Brand Commitments

- Name: **Bolsillo Mágico** (wordmark split "Bolsillo" / "Mágico" in two weights, primary color on the second word).
- Logo assets exist in both standard and inverted variants (`public/bolsillo-magico-*.svg`, icon + horizontal lockup), plus PWA icon set (`icon-192`, `icon-512`, maskable variant, apple-touch-icon) — see the `app/layout.tsx` icon-handling history for why "any" and "maskable" variants are kept separate.
- Primary brand blue in current use: `#2B7CF6` (viewport `themeColor`); `CLAUDE.md`'s documented `#1B6DD4` may be stale — worth reconciling when `DESIGN.md` is written (`/impeccable document`).
- Fonts: Fredoka (display) + Plus Jakarta Sans (body), loaded as CSS variables in the root layout.

## Evidence on Hand

No testimonials, case studies, or external proof — not applicable to a personal-use product with one real user. Nothing here should be fabricated to look like a multi-customer SaaS.

## Product Principles

1. **Chile-specific financial reality over generic budgeting conventions.** Statement cycles, CLP integers, and billing-mode/purchase-mode toggles are load-bearing, not nice-to-haves.
2. **Numbers must be trustworthy at a glance.** Cas uses this instead of a bank statement or spreadsheet — ambiguity or a wrong statement shown for most of the month is a real failure, not a cosmetic one (see `CLAUDE.md`'s statement-range function distinctions).
3. **Translate technical signals into plain decisions.** The investment engine's job is a jargon-free verdict a non-specialist could act on, even though its one user could read the raw technicals.
4. **Privacy within shared features.** Compartidos exposes only what's needed (a trip, an expense, an income %) and never raw income or unrelated personal data, by construction (RLS + security-definer functions), not by UI convention alone.
5. **Closed by design, not by obscurity.** The product being single-user is enforced (disabled signup, no public surface, robots blocking) rather than relying on the URL being unknown.

## Accessibility & Inclusion

No product-specific accessibility requirement has been established beyond the existing UX conventions already in `CLAUDE.md` (44px touch targets, severity-coded alerts, mobile-first layouts at 375px+). Record a specific need here if one comes up.
