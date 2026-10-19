---
target: app/(dashboard)/compartidos
total_score: 24
max_score: 36
na_heuristics: 10
p0_count: 2
p1_count: 2
target_identity: "file:/Users/catalinariquelme/Documents/claude/Projects/Gstos/app/(dashboard)/compartidos"
timestamp: 2026-10-19T14-28-41Z
slug: app-dashboard-compartidos
---
Method: dual-agent (A: a889a0ff421364d52 · B: a9a1b501f84309439)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | `tripAffordability`'s computed verdict (ready/yes/tight/no) is never surfaced as a status indicator, only buried in a sentence (lib/trip-plan.ts:34, TripPlanCard.tsx:127-137) |
| 2 | Match System / Real World | 3 | Phase-chip taxonomy ("Por saldar", "Terminado") requires inferring `tripPhase` logic the UI never explains (SharedTripView.tsx:375) |
| 3 | User Control and Freedom | 3 | Settle/undo and confirm-before-delete patterns present throughout |
| 4 | Consistency and Standards | 2 | `SheetParts.tsx` hardcodes `bg-white`/`text-gray-900` instead of design tokens — breaks dark mode for every sheet in the feature |
| 5 | Error Prevention | 3 | Validation present; qty-implausibility nudge is silent/easy to miss |
| 6 | Recognition Rather Than Recall | 2 | Member income % only shows when `wSum > 0`; no persistent "your %" near the split toggle |
| 7 | Flexibility and Efficiency | 3 | Equal/exact/income split kinds give power users real options |
| 8 | Aesthetic and Minimalist Design | 2 | Icon-chip+title+subtitle+chevron repeated identically across 4 unrelated entity types dilutes all of them |
| 9 | Error Recovery | 3 | Inline errors consistent but generic; `SharedExpenseSheet` uses raw `text-red-500` instead of `var(--coral)` |
| 10 | Help and Documentation | n/a | Not expected for this personal-use app |
| **Total** | | **24/36** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment**: This surface is a generic trip-expense-splitter wearing Bolsillo Mágico's color tokens, not a product authored around its own mechanics. The domain logic underneath is genuinely distinctive — `tripAffordability`'s five-verdict savings model, `splitByWeights`'s income-ratio math with largest-remainder tie-breaking, the reserva/durante/opcional plan lifecycle, the never-reveal-income consent flow, `card_extra` (what your card absorbed for a travel companion). None of it is visible in the composition. Every screen reduces to four visual primitives — icon-chip+text row, `.card` with label+hero-number+subtext, progress bar, pill — reused identically regardless of what each row or number actually represents:

- **List page** (`page.tsx:168-200`): textbook generic list-row (icon chip + title/subtitle + chevron) for every trip regardless of phase — a "Por saldar" trip and a three-months-out "Planificando" trip get the same `Plane` icon, same chip, same chrome. The empty state (219-229) is the canonical SaaS-onboarding template (icon-in-rounded-square + heading + body + CTA) verbatim.
- **`TripSpendHero`**: the hero-metric template applied reflexively — kicker label, big Fredoka number, supporting stat, progress bar — then the identical smaller pattern repeated per category underneath.
- **`TripPlanCard`**: the same hero-metric opening, then three differently-purposed progress bars (before/during split, savings goal, implicitly budget-vs-spent) rendered with identical visual weight, while the actual `verdict` the domain logic computes is discarded in favor of plain prose.
- **`TripPlanItems`**: reservas, ongoing budget lines, and optional extras all render through one shared `Row()` — a plane ticket and a kayak tour are visually indistinguishable.
- **`SheetParts.tsx`** (every creation/edit flow in the feature is built on this): hardcodes `bg-white`/`text-gray-900`/`text-gray-400`/`border-gray-100` instead of the app's own `--surface`/`--ink`/`--border` tokens — the most mechanical tell of ungoverned, template-sourced code, in a codebase whose own CLAUDE.md names full light/dark parity as a commitment.

**Deterministic scan**: 17 findings across 13 files, all advisory, exit 0 everywhere. 15 are the identical `text-[11px]` micro-caption size used consistently feature-wide — not scattered drift, but one repeated intentional size absent from DESIGN.md's documented ramp (worth adding to the ramp rather than treating as 15 separate defects). The remaining 2 are low-alpha black `boxShadow` values on interactive elements (a selected pill, a toggle thumb) — plausible false positives if DESIGN.md's color ramp isn't meant to govern shadow alpha, flagged for human judgment rather than suppressed. Nothing the detector catches overlaps with the genericness findings above — by construction, a token/ramp linter cannot see "this list row template is reused for four unrelated entity types." That gap is exactly why this review leads with the LLM assessment.

**Visual overlays**: Not available — no browser-automation tool in this session, and the dev server can't authenticate without Supabase credentials in this sandbox. Static-code assessment only.

## Overall Impression

The verdict in one line: **the logic is bespoke, the composition is a template.** `tripAffordability`, the income-ratio consent flow, and `card_extra` have no generic-app equivalent — nothing a Splitwise clone could copy without rebuilding real backend math. But visually, none of that shows up: every number sits in the same hero-card, every list row uses the same icon-chip shape, every form is the same bottom sheet. The biggest single opportunity is not "add more polish" — it's letting the actual domain state (a verdict, a trip's current day, the income-privacy guarantee, the gap your card absorbed) dictate a distinct visual treatment instead of flowing through the same four interchangeable primitives every time.

## What's Working

- **`overCap` warning chip** (`TripPlanItems.tsx:107-111`) — appears only when a planned item's price exceeds a self-set cap, tied directly to real cap logic in `lib/trip-plan-items.ts`. Small, but genuinely earned by the data, not decorative.
- **The income-consent dual-path accept** (`SharedInviteCard.tsx:63-74`, "Aceptar y mostrar mi %" vs "Entrar sin mostrar mi %") — correctly externalizes the product's real privacy guarantee into an actual choice rather than a buried setting. The interaction model is domain-correct even where its visual template isn't yet.
- **The reserva/durante/opcional plan model itself** — reservations with due dates feeding a 30-day cash-flow view, ongoing per-day spend, toggleable optionals — reflects real product thinking most generic splitting apps simply don't have.

## Priority Issues

**[P0] The affordability verdict is computed but never shown**
What: `tripAffordability()` (`lib/trip-plan.ts:57-78`) returns a graded `verdict: 'ready'|'yes'|'tight'|'no'|'unknown'`, but `TripPlanCard.tsx:127-137` only reads `perMonth`/`months`/`remaining` to build one plain sentence — the verdict itself is discarded.
Why it matters: this is the single most decision-relevant fact during planning ("can I actually afford this") computed server-accurate then thrown away for ambiguous prose — directly against the product's own principle that "numbers must be trustworthy at a glance."
Fix: surface `verdict` as a small severity-coded badge next to the hero number, using the existing Alert Severity Hierarchy (gold for tight/no, mint only for a genuinely "ready" state, never a banner).
Suggested command: `/impeccable clarify`

**[P0] One generic row template serves four unrelated entity types**
What: trip rows (`page.tsx:168-200`), expense rows (`SharedTripView.tsx:326-346`), plan-item rows (`TripPlanItems.tsx:93-121`), and member rows (`SharedTripView.tsx:416-452`) are visually identical — icon chip + title/subtitle + chevron — with only text content differing.
Why it matters: this is precisely the "generic list-row... repeated identically regardless of what the row represents" pattern the project's own design doctrine exists to ban. A user scanning has no visual cue for what kind of thing a row is without reading every word.
Fix: differentiate by what's load-bearing per type — plan items need reserva/durante/opcional state visually distinct, trip rows need phase to dominate (not a tiny pill), expense rows need payer identity more prominent than a text aside.
Suggested command: `/impeccable shape`

**[P1] `SheetParts.tsx` hardcodes light-mode-only colors, breaking dark mode for the whole feature**
What: `bg-white`, `text-gray-900`, `text-gray-400`, `bg-gray-100`, `border-gray-100/200` throughout — every sheet (new trip, budget, settings, add/edit expense, plan item) inherits this instead of `--surface`/`--ink`/`--border`/`--surface-2`.
Why it matters: dark mode is an explicit, SSR-synced product commitment; this is a structural violation baked into the one primitive every creation/edit flow depends on.
Fix: replace the hardcoded classes with the design tokens already used throughout `SharedTripView.tsx`.
Suggested command: `/impeccable harden`

**[P1] The income-ratio privacy mechanic has no distinct visual treatment**
What: the consent checkbox and "nadie ve el sueldo de otro" disclosure (`SharedTripView.tsx:507-515`) render at the same visual weight as any other form control.
Why it matters: per PRODUCT.md this privacy guarantee *is* the product's edge — visually it reads as a throwaway checkbox, undercutting the one mechanic that should feel most distinctly trustworthy.
Fix: give it its own quietly confident visual moment (not a banner) — consistent weight with the mint confirmation treatment, wherever income-ratio splitting is active.
Suggested command: `/impeccable bolder`

**[P2] "Día 3 de 7" — the most specific, real-time fact in the feature — gets no visual weight**
What: `tripDay` (`SharedTripView.tsx:129`) renders as plain inline text, same weight as a static date range.
Why it matters: this is the one fact that says "a real trip is happening right now" — exactly the non-generic signal a redesign should lean into, currently indistinguishable from any other header subtext.
Fix: treat "currently traveling, day N of M" as its own small visual marker, distinct from planning/settling states.
Suggested command: `/impeccable delight`

**[P2] Gold reused for two different severities**
What: "you owe money" (`SharedTripView.tsx:115`, not urgent) and "approaching budget cap" (`TripSpendHero.tsx:51`, soon) both use gold.
Why it matters: the Alert Severity Hierarchy is this project's most load-bearing color convention — conflating "a debt not due today" with "spending nearing a cap" dilutes the one system meant to carry precise meaning.
Fix: reserve gold strictly for "needs action soon"; give "you owe a friend" a neutral directional treatment that doesn't borrow severity color.
Suggested command: `/impeccable clarify`

**[P3] Every trip in the feature shares one icon with zero visual identity of its own**
What: the same `Plane` icon in the same `--primary-soft` chip represents every trip, in the list, the empty state, and the new-trip sheet.
Why it matters: a product built around specific episodic trips (Chiloé, Pucón) gets zero differentiation between them, flattening a personal list into interchangeable records.
Fix: even a simple per-trip accent (a color or glyph chosen at creation) would make the list read as "my trips," not "a table of rows."
Suggested command: `/impeccable colorize`

## Persona Red Flags

**Jordan (invited companion, first-timer)**: `SharedInviteCard.tsx`'s income-mode disclosure is a wall of gray prose explaining a privacy-sensitive mechanic before two buttons — no visual scaffolding signals "this is safe" beyond density of text, at exactly the moment a new, possibly non-finance-app-fluent person is asked to trust the app with something sensitive.

**Riley (stress-tester)**: when a trip has no start date (a fully supported state), `TripPlanCard.tsx:133-137`'s only CTA is a plain text link — the entire affordability/savings-pace machinery silently degrades with no visual indication that a whole feature is unavailable because of one missing input.

**Casey (mobile)**: `SharedExpenseSheet.tsx`'s "Cómo se reparte" + "Entre quiénes" + per-person exact-amount inputs stack into a long undifferentiated scroll on a 375px viewport, especially once `kind === 'exact'` adds one input row per member.

## Minor Observations

- `TripSpendHero`'s per-category icon chips use a flat gray container, quieter than the category-color treatment the rest of the app gives real expense categories — trip categories here get no comparable identity.
- `TripBudgetSheet.tsx` carries the same hardcoded gray/white classes as `SheetParts.tsx`.
- The pending-transfer list and the completed-settlement list are conceptually the same thing (money moving between people) rendered with two unrelated visual treatments (a `Handshake` button row vs. a `Check` icon row) — no shared visual language between "proposed" and "done."
- `loading.tsx` only skeletons 2 trip rows and never the "Anteriores" section or invite cards.
- Detector note: 15 of 17 findings are the same `text-[11px]` caption size used consistently everywhere — likely worth adding to DESIGN.md's type ramp as a documented step rather than leaving it permanently "undocumented."

## Questions to Consider

1. What would a trip's *timeline* look like if the composition itself visibly shifted shape as a trip moves through its lifecycle, instead of the same card stack with a phase pill swapped out?
2. The income split is computed by a Postgres function specifically so neither party sees the other's raw salary — what would make *not knowing* visually tangible, rather than a checkbox and a percentage?
3. `card_extra` — the gap between what your card absorbed for a travel companion and what you actually owe — is unique to this product. What would it look like as a first-class visible fact instead of a tooltip aside?
4. This feature is explicitly episodic (planned months ahead, settled after the trip) — yet it's styled with the exact same density and rhythm as the daily `/inicio` dashboard. What would a surface that *felt* slower and more occasional actually look like?
