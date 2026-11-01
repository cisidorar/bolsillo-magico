---
target: app/(dashboard)/recurrentes
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/Users/catalinariquelme/Documents/claude/Projects/Gstos/app/(dashboard)/recurrentes"
timestamp: 2026-10-20T13-03-34Z
slug: app-dashboard-recurrentes
---
Method: dual-agent (A: a1bc607f89a4a820c · B: a714a12ace9f396ab)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Status/next-charge/register affordance hidden below `sm:` on mobile |
| 2 | Match System / Real World | 4 | Genuinely Chile-specific billing modeling (cuotas, estado de cuenta, statement-vs-purchase divergence) |
| 3 | User Control and Freedom | 3 | Pause/reactivate/delete-confirm present but "Registrar ahora" has no mobile path |
| 4 | Consistency and Standards | 2 | Gold-as-text and invented purple hue both violate the project's own written DESIGN.md rules |
| 5 | Error Prevention | 3 | Solid form validation (day ranges, cuota caps, confirm-before-delete) |
| 6 | Recognition Rather Than Recall | 3 | Logos + grouping help; purple badge carries two different meanings by hue alone |
| 7 | Flexibility and Efficiency | 2 | Grouping and suggestion shortcuts exist, but mobile loses the core "register now" action entirely |
| 8 | Aesthetic and Minimalist Design | 2 | 7 stacked modules before content; three different "empty" treatments for one condition |
| 9 | Error Recovery | 2 | Raw `Error: ${err.message}` Supabase text shown to the user |
| 10 | Help and Documentation | 3 | Contextual `InfoTap` on cash-flow and cuotas flow is genuinely good in-context help |
| **Total** | | **26/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment**: Grounded, not generic — but inconsistently so. The *data model* is authentically Chilean: "cada N meses" items anchor to the last real purchase rather than calendar math, statement-vs-purchase-date divergence feeds the 30-day flow, and inline code comments cite specific past bugs ("el refrigerador sigue cobrándose") — real scar tissue a generic subscription tracker would never carry. Where it slips into category-interchangeable territory is the *chrome*: the "anual"/"cada N meses" badges and the installment stepper could be lifted from any billing SaaS, and they're rendered in an invented purple that appears nowhere in the design system.

**Deterministic scan**: 13 findings, all rule `design-system-color` (advisory), 0 other categories, exit code 0 (clean beyond color). All concentrated in 3 files: `RecurringManager.tsx` (9 hits — the purple "anual"/"cada N meses" badges ×2 identical blocks, plus an amber background + a mint fallback hex on the price-increase badge), `FlujoCaja30d.tsx` (2 hits, coral rgba used directly instead of tokens), `RecurringOverdueAlert.tsx` (2 hits, same coral rgba pattern). One finding (`RecurringWidget.tsx:178`, `#D5E6FF`) is a likely false positive — it's the documented `.card` border constant from `CLAUDE.md`, just not mirrored into `DESIGN.md`'s palette file; recommend adding it there rather than treating it as drift. The `#0F9D74` hit is a `var(--mint, #0F9D74)` CSS fallback, not a stray hardcode — lower-priority than the others.

**Visual overlays**: Not available this run — no browser-automation tool is exposed and no dev server is running in this sandbox (Supabase credentials are missing locally), so there is no live `[Human]`-tab overlay to point you to. This is a disclosed gap, not a silent skip.

## Overall Impression

The underlying logic is some of the most domain-faithful code in the app — genuinely Chilean billing mechanics, correctly composed alert-severity orchestration (`muteRiskBanner`), and a celebratory "cuota liberada" moment that earns its mint. But the page has drifted furthest from DESIGN.md's own written rules of any surface reviewed this session: it independently reinvents a 4th accent hue (purple) and reintroduces the exact gold-as-text contrast failure the project named and fixed everywhere else. And it has a P0: on an actual phone, the one thing this page exists for — manually registering a recurring charge — is simply not reachable.

## What's Working

1. **`CommittedTimeline`'s "🎉 se te liberan $X/mes" card** — turns the end of an installment plan into a specific, correctly mint-only, non-actionable celebratory moment grounded in real cuotas data. A textbook peak-end-rule win.
2. **`muteRiskBanner` alert-hierarchy composition** — the page correctly demotes `FlujoCaja30d`'s risk chip when `RecurringOverdueAlert`'s coral banner is already showing, exactly per the Alert Severity Hierarchy Rule. The scaffolding is right; only the chip's color token is wrong (see Priority Issues).
3. **Interval anchoring in `lib/recurring-due.ts`** — "cada N meses" due dates anchor to the last real purchase, not calendar math, directly fixing a documented past bug. Correctly surfaced in copy as "Vencido · {date}" / "Sin cargo pendiente."

## Priority Issues

**[P0] "Registrar ahora" is unreachable on mobile.**
Why it matters: `RecurringManager.tsx` wraps the register-now button, next-charge date, and active/paused badge in `hidden sm:...`, and the edit sheet has no equivalent action. On a 375px phone — this PWA's stated primary surface — a user cannot see whether an item is paused, cannot see when it's next due, and cannot manually register a charge. The one action this page exists for is gone below the `sm` breakpoint.
Fix: give the row a compact, always-visible register affordance (icon-only button + status dot) instead of hiding it past `sm:`, or add "Registrar ahora" as an action inside the edit sheet so at least one mobile path exists.
Suggested command: `/impeccable harden`

**[P1] Gold rendered as text, violating the project's own Gold-Ink Rule.**
Why it matters: `FlujoCaja30d.tsx:62` and `RecurringManager.tsx:584-585` both render `--gold`-family color as foreground text/fallback, the exact ~1.6:1-contrast failure DESIGN.md documents and the rest of the app (TripPlanItems, Compartidos, /inicio) was already swept for this session. Detector confirms: `rgba(245,158,11,0.14)` background + `#0F9D74` fallback at line 584-585 don't even match the documented `--gold`/`--mint` values — a second, unrelated hue pair.
Fix: swap to `var(--gold-ink)` directly (no fallback value that silently resolves to the failing `--gold` when the variable is defined); align the background to the documented `--gold` background token.
Suggested command: `/impeccable harden`

**[P1] Invented, undocumented purple hue for "anual"/"cada N meses" badges — same hue, two different meanings.**
Why it matters: `RecurringManager.tsx:572` and `:576` both use identical `rgba(124,58,237,...)` / `#a78bfa` styling for two badges that mean different things, disambiguated only by small text. Purple appears nowhere in DESIGN.md's token system — it's a 5th accent hue invented ad hoc, confirmed by the detector as the single largest cluster of findings (6 of 13).
Fix: either formalize a neutral-info token in DESIGN.md if this distinction earns a permanent color, or drop the color entirely and rely on `--ink-3`/neutral chip styling + label text only.
Suggested command: `/impeccable harden`

**[P2] Mobile "Calendario" tab is mislabeled.**
Why it matters: the tab bundles `CommittedTimeline` + `FlujoCaja30d` + the actual calendar — a user tapping "Calendario" expecting a calendar sees a bar chart first. Cognitive-load checklist failure: mislabeled grouping forces the user to rebuild a mental model of what the tab actually is.
Fix: rename the tab to match its real content (e.g. "Resumen") or split the calendar into its own third tab.
Suggested command: `/impeccable clarify`

**[P2] Negative cash-flow banner raises alarm with no remedy.**
Why it matters: the coral "Tu flujo proyectado queda en negativo" copy states the problem but gives no next step — it's alarm without the reassurance half the Alert Severity Hierarchy Rule implies for coral-tier issues.
Fix: pair the banner with a one-line actionable hint (e.g. which upcoming charge to move, or how much a wallet transfer would cover).
Suggested command: `/impeccable clarify`

## Persona Red Flags

**Casey (mobile)**: Hit hardest by the P0 above — status badge, next-charge date, and "Registrar ahora" are all `hidden sm:*`. Casey, managing bills one-handed on the PWA's primary device, cannot see or act on the exact things this page exists to surface.

**Sam (accessibility)**: Row items use `<div role="button" tabIndex={0}>` with `onKeyDown` wired only for `Enter` (not `Space`, half the expected ARIA button contract), and that div wraps a real nested `<button>` ("Registrar") — invalid nested-interactive-controls markup that produces ambiguous screen-reader focus order on every row.

**Riley (stress tester)**: Raw Supabase error text (`Error: ${err.message}`) is exactly what Riley hits first on an RLS or constraint failure — no friendliness layer at all. Pause/reactivate right at a `billing_day` boundary and mid-cuota deletes are the kind of off-by-timing edge cases this page's own comments show have bitten the team before.

## Minor Observations

- `toggleActive()` in `RecurringManager.tsx:373` is dead code — never called; the only pause/reactivate path is the sheet toggle.
- `RecurringSuggestions`'s own code comment calls itself a "pastilla gold," but the rendered component uses no gold at all — comment and implementation have drifted apart.
- `loading.tsx` renders a flat 6-row skeleton with no banner/hero/toggle chrome, unlike the real page's module stack — doesn't mirror the actual layout per the project's stated skeleton convention.
- Three sibling "nothing to show" states (list, calendar, cash-flow) use three different visual treatments for what's largely the same underlying condition.
- `RecurringWidget.tsx:178`'s `#D5E6FF` flag is a likely false positive — it's the documented `.card` border constant, just missing from DESIGN.md's palette file itself.

## Questions to Consider

- What if "Registrar ahora" didn't need a dedicated button at all — a row swipe (already expected from iOS Mail/Reminders) registering the charge, removing the competing-affordance problem that caused it to get hidden on mobile in the first place?
- What if the 30-day cash-flow view led the mobile page instead of the raw item list — it's the most time-sensitive, actionable module, yet currently sits behind a mislabeled secondary tab?
- What if overdue items surfaced inline on their own row (a coral border) instead of only in a separate banner — would that tighten the loop between "something's wrong" and "here's exactly which item"?
