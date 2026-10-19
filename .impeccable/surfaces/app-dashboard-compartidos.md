---
version: 1
slug: "app-dashboard-compartidos"
primary_target: "app/(dashboard)/compartidos"
related_targets: ["components/SharedTripView.tsx","components/TripPlanItems.tsx","components/TripPlanCard.tsx","components/TripSpendHero.tsx"]
---

## Direction contract

THESIS: Compartidos refuses the daily-dashboard density it currently borrows from `/inicio`. The one idea this surface owns: a trip is read a page at a time, not a grid of stat cards — the composition itself is quieter and more occasional, because a trip is planned once, lived through once, and settled once, not checked every morning.

OWN-WORLD: Bolsillo Mágico's tokens stay fixed — `--primary` #4D93FF, Fredoka display, Plus Jakarta Sans body, flat 1.5px-border cards, the Alert Severity Hierarchy (coral/gold/mint). What's new: plan items (reserva/durante/opcional) stop rendering as generic icon-chip rows and instead carry a validated / used / anulado coupon-stub state language — borrowed discipline from a jet-age airline-ticket-wallet system (carbon-copy legs that cancel rather than disappear) fused onto the existing `isActive`/`paid_at`/`optional` data model. Spacing roughly 1.5x the app's normal rhythm; never more than one hero-weight fact per screen.

STORY: The visitor opens a trip and reads one dominant fact appropriate to where the trip actually is — "can I afford this," "day 3 of 7, here's today," or "here's what's left to settle" — before anything else competes for attention. Plan items read as a trip passbook, each line a stub that gets validated (paid) or stays open, never a flat data row.

FIRST VIEWPORT: Composition changes structurally by phase, not just a label swap. Planning: the affordability verdict (ready/yes/tight/no) as a severity-coded badge dominates, budget/plan items below it as coupon stubs. Traveling: "Día N de M" + today's spend become the dominant pair, generous whitespace around them, category/member detail recedes below the fold. Settling: a two-column reconciliation layout (who-owes-whom) replaces the card-stack entirely for that phase. The trip list page gets room to breathe — fewer simultaneous facts per row, phase determines what's visually loudest, not a uniform chip.

FORM: Candidate 7 of 7 on the grounded list ("Minimal density, notebook cadence"), dealt as the roll's lead card; chosen by the user over "Veredicto como protagonista" (candidate 2) and "Tarjeta de identidad por viaje" (candidate 6). Raised by the jet-age-ticket-wallet catalog challenger (`vernacular-ephemera-jet-age-ticket-wallet`), which donated its validated/used/void state discipline for plan items; the split-flap-concourse and acetate-tab-manual challengers were competitive but not adopted this round. seed:165be92910168df6

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
