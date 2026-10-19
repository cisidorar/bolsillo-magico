---
target: components/TripPlanItems.tsx
total_score: 34
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/catalinariquelme/Documents/claude/Projects/Gstos/components/TripPlanItems.tsx"
target_fingerprint: "sha256:0a763b6602de91aefa52f28d0ec4a2188d2d417cf8dd88edd0922816fee63e24"
target_path: /Users/catalinariquelme/Documents/claude/Projects/Gstos/components/TripPlanItems.tsx
timestamp: 2026-10-19T13-41-10Z
slug: components-tripplanitems-tsx
---
Method: dual-agent (A: abdfe73b9ac7e4769 · B: a12d6351538cb5b38)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | `remove()` disables the trash button but gives no in-progress feedback during delete (line 321) |
| 2 | Match System / Real World | 4 | Solid — reservation/ongoing-spend split and due-date ladder map to how a traveler actually thinks |
| 3 | User Control and Freedom | 2 | Pay has a two-step confirm with an escape hatch; delete (lines 380-384) has neither |
| 4 | Consistency and Standards | 4 | Reuses `SheetParts` primitives consistently; matches `TripPlanCard`'s visual language |
| 5 | Error Prevention | 3 | Required fields validated; quantity (line 301/356) has no plausibility bound |
| 6 | Recognition Rather Than Recall | 4 | Categories always visible as chips, not a dropdown; edit pre-fills current values |
| 7 | Flexibility and Efficiency | 3 | Fine for episodic trip planning; no duplicate-item shortcut for entering similar reservations |
| 8 | Aesthetic and Minimalist Design | 4 | Restrained, consistent with DESIGN.md's flat-by-default direction |
| 9 | Error Recovery | 3 | Error text renders once at the bottom (line 378), disconnected from which field is wrong |
| 10 | Help and Documentation | 4 | Inline `FieldLabel` hints do real just-in-time teaching at this product's scale |
| **Total** | | **34/40** | **Good** |

## Design Specificity Verdict

**LLM assessment**: Not a generic "budget line items" component — genuinely authored for a Chilean shared-trip-cost planner. The three-bucket model (reservas/durante/opcionales) encodes a real mental model of trip costs, not a flat tagged list. `fmtDue` (lines 20-28) is a hand-tuned, Spanish, Chile-register date ladder ("vence hoy"/"vence mañana"/"venció hace N d"/"en N días", falling back to a real calendar date past 45 days) — not `Intl.RelativeTimeFormat` defaults. The pay flow (lines 151-176) explicitly converts a plan line into a real shared expense with copy that states the consequence ("se reparte entre todos"), modeling the app's actual expense/shares machinery. Placeholder copy ("Airbnb en Pucón") is concretely Chilean. Verdict: **authored**, not swappable.

**Deterministic scan**: `impeccable detect --json components/TripPlanItems.tsx` exits 0 with one advisory finding: `design-system-font-size` at line 129 — `text-[11px]` on the section-hint paragraph is off DESIGN.md's documented type ramp (which has a 10px step but not 11px). Cross-referencing the shared `SheetParts.tsx` primitive this component depends on turns up the *identical* finding at line 56 (`FieldLabel`'s hint text) — so this 11px choice is an existing, repeated pattern in the sheet system, not something newly introduced here. Not a false positive (11px genuinely isn't in the ramp); more a pre-existing, low-severity type-scale drift than a defect unique to this file.

**Visual overlays**: Not available this run — no browser-automation tool is exposed in this session, and the dev server can't authenticate without Supabase credentials in this sandbox. No user-visible overlay exists; treat this critique as a static-code assessment.

## Overall Impression

This is one of the more domain-faithful components in the codebase — the due-date language, the pay-into-expense conversion, and the reservation/budget split all show real product thinking. The gap between it and "excellent" is concrete and fixable: a safety-net asymmetry (pay is carefully guarded, delete isn't) and a contrast failure on the app's own "attention" color used as the component's main urgency signal. Neither requires new product thinking, just applying patterns the app already has elsewhere in this exact file's own neighborhood.

## What's Working

- **`fmtDue` (lines 20-28)**: a genuinely well-crafted date-humanizer with a graduated Spanish ladder that never degrades into "en 212 días" — exactly the kind of detail a generic component skips.
- **Inline pay confirmation (lines 151-176)**: expands in place under the row instead of stacking a modal, keeps the user anchored to what they're paying for, states the consequence plainly, and gives a real escape ("Todavía no") — while correctly reusing the trip's actual payment methods instead of a free-text field.
- **Conditional live total (lines 359-361)**: `Total: Q × $unit = $total` removes mental math exactly where it matters (multi-unit entries) and stays quiet when it wouldn't add value.

## Priority Issues

**[P1] Gold text fails WCAG contrast everywhere it's the sole urgency signal**
- **Why it matters**: `var(--gold)` (#FFC23C) is used as foreground text directly on light surfaces at lines 98, 100-102, 248, and 367 — computed contrast of #FFC23C on white is ≈1.6:1, far under the 3:1/4.5:1 AA floors. This is the app's own designated "attention needed soon" signal (DESIGN.md's Alert Severity Hierarchy), and it's currently close to invisible for low-vision users — undermining the one named system rule this component exists to express correctly.
- **Fix**: never render gold as foreground text on a light background; keep gold for the chip-background treatment already used correctly elsewhere (`rgba(255,194,60,0.18)` bg), pairing it with `--ink`/`--ink-2` text plus an icon, or introduce a darker gold token specifically for text use.
- **Suggested command**: `/impeccable harden`

**[P1] Deleting a plan item has zero confirmation, inconsistent with the rest of the feature**
- **Why it matters**: the trash icon (lines 380-384) calls `remove()` on a single tap — no second confirm, no undo. `SharedTripView.tsx` already establishes an arm/confirm pattern for a comparably destructive action (removing a trip member, lines 440-448). The same user, same session, gets two different safety guarantees for two similarly destructive actions — and a planned reservation (sometimes representing real deposited money) can vanish from one mis-tap.
- **Fix**: reuse the arm/confirm pattern from `SharedTripView`, or add an "Eliminado del plan — Deshacer" toast with a real undo (re-insert via `savePlanItem`).
- **Suggested command**: `/impeccable harden`

**[P2] The add/edit sheet shows 7-8 live fields and 6 category chips at once with no chunking**
- **Why it matters**: `PlanItemSheet` (lines 332-393) renders kind, description, a 6-way category choice, price, quantity, cap, (conditionally) due date, and the optional toggle in one unbroken scroll — violating both the ≤4-visible-choices and chunking guidelines for a financial entry form, even though cap and due-date already read as optional in their own labels.
- **Fix**: collapse "Tope por unidad" and "Vence" under a single "Más opciones" disclosure, defaulted closed.
- **Suggested command**: `/impeccable distill`

**[P2] Quantity accepts up to 999 with no plausibility check**
- **Why it matters**: the qty input (line 356) allows any 1-3 digit value; the only safety net is the live total preview, which only appears when `q > 1` and sits in small, non-bold text. A fat-fingered "999" noches produces a wildly wrong total with nothing stopping save — exactly the kind of failure the product's own principle ("numbers must be trustworthy at a glance") treats as real, not cosmetic.
- **Fix**: warn (gold chip, not block) above a sane per-kind threshold, and always show the computed total prominently next to the quantity field rather than conditionally.
- **Suggested command**: `/impeccable harden`

**[P3] Independent `detail`/`paying`/`sheet` state slots allow redundant, uncoordinated surfaces for the same item**
- **Why it matters**: `detail` (line 57) and `paying` (line 58) have no mutual exclusion — a user can open the inline "Pagar" panel for a row and then tap the same row to open the full-screen detail sheet without the inline panel closing underneath it. Not a crash, but two UI entry points doing the same job with no single source of truth.
- **Fix**: route both pay triggers through one `setPaying` call; opening `detail` or `sheet` for an item should implicitly clear `paying` for any other item.
- **Suggested command**: `/impeccable clarify`

## Persona Red Flags

**Sam (Accessibility)**: The gold-as-text contrast failure above is the headline issue — systemic across this file, not a one-off. The toggle switch (lines 214-219) has correct `role="switch"`/`aria-checked`/`aria-label`, but its visual off-state (`var(--border)` track, white thumb) is low-contrast against the white sheet, so a sighted low-vision user can't easily tell on/off apart without relying on thumb position alone. Counter-example worth keeping: the row-opening button (line 92) correctly carries `aria-label="Ver detalle de {description}"`.

**Riley (Deliberate Stress Tester)**: Quantity 999 with no validation (line 356) is the clear one. A reservation due 45+ days out is already handled correctly (falls back to a calendar date, lines 26-27) — confirmed working, not a gap. Deleting an item mid-pay-confirmation on another device/tab wouldn't crash, but the inline pay panel would just silently disappear with no explanation.

**Casey (Distracted Mobile User)**: Mostly well served — touch targets are consistently ≥44px throughout (add button, "Pagar" button, toggle). The row's action slot is a fixed `w-[68px]` (line 107), which is tight alongside a long description and the "Pagar" button on a 375px screen, mitigated by `truncate` on the description but worth a quick visual check with a long real description.

## Minor Observations

- `SheetParts.tsx`'s `SheetShell`/`FieldLabel` hardcode `bg-white`/`text-gray-900`/`border-gray-100` rather than `--surface`/`--ink`/`--border` tokens — a shared-component issue (not unique to this file) that affects how `TripPlanItems.tsx` looks in dark mode.
- `qtyUnit` (line 330) silently switches its label between "días"/"veces"/"noches"/"unidades" based on kind/tripDays/category — clever, but a user editing a "durante" item before trip dates are set will see "veces" change to "días" later, which could read as a bug.
- Error text in `PlanItemSheet` (line 378) uses raw `text-red-500` instead of `var(--coral)`, which the rest of the file (line 227) and the app's error convention use — a small token inconsistency.
- The detector's only finding (`text-[11px]` off the DESIGN.md type ramp, line 129) mirrors an identical pre-existing choice in `SheetParts.tsx`'s `FieldLabel` — low-severity, not new debt.

## Questions to Consider

1. Reservation due dates already feed the app's 30-day cash-flow views — should a reservation due within a few days render the *same* gold "soon" chip pattern used for statement due dates elsewhere, instead of a plain color-shifted text string that currently fails contrast anyway?
2. Why does "pay" get a deliberate two-step confirm with an escape hatch, while "delete" — arguably harder to recover from — gets none? If the reasoning is "this is low-frequency/personal use," should that same reasoning loosen the pay confirmation too, or is the asymmetry accidental?
3. `PlanItemSheet` tries to serve three different mental models (a dated reservation, a recurring per-day budget, a toggleable optional) with one undifferentiated field list. Would three lighter, purpose-fit forms — switched by the kind/optional chips the user already picks first — fix the chunking problem outright, rather than patching it with a "more options" disclosure?
