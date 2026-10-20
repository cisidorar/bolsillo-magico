---
target: app/(dashboard)/inicio
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/Users/catalinariquelme/Documents/claude/Projects/Gstos/app/(dashboard)/inicio"
timestamp: 2026-10-19T23-47-21Z
slug: app-dashboard-inicio
closed: true
---
Method: dual-agent (A: a40f71530f15ca1c6 · B: a49c39df49e61f05f)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Budget bar segments update together with no transition cue beyond width animation |
| 2 | Match System / Real World | 4 | Genuinely speaks the user's financial vocabulary — statement cycles, card names, CLP integers |
| 3 | User Control and Freedom | 4 | `OverduePaySheet` offers Cancel/X/Escape/backdrop-dismiss before committing a payment |
| 4 | Consistency and Standards | 2 | Gold-as-text (DESIGN.md's own Gold-Ink Rule) repeated 5+ times; coral used for routine deductions, not alerts; 24 detector-confirmed off-palette colors |
| 5 | Error Prevention | 3 | Confirmation modal before marking a payment; no one-tap destructive actions |
| 6 | Recognition Rather Than Recall | 3 | `ServiceLogo` shows real brand icons so users recognize rather than recall |
| 7 | Flexibility and Efficiency | 3 | `AddExpenseInline` gives a fast path without opening the full sheet |
| 8 | Aesthetic and Minimalist Design | 2 | Desktop renders a hero + 3 full columns simultaneously; mobile stacks ~9 sections |
| 9 | Error Recovery | 2 | `OverduePaySheet`'s only failure message is "Error al registrar" — no cause, no retry guidance |
| 10 | Help and Documentation | 4 | `InfoTap` is a genuine, well-placed contextual glossary used consistently |
| **Total** | | **30/40** | **Good** |

## Design Specificity Verdict

**LLM assessment**: Not a generic spending-tracker home screen — authored for the mechanics PRODUCT.md names as the product's edge. `isBillingMode` actually changes which expenses get queried, not just a label (`page.tsx:67, 70-82, 310-312`). `CicloSueldo` deliberately pairs a salary month with a *resolved* card cycle via `lastDueStatementRange`, with a code comment explaining the exact trap it avoids. It refuses to show a countdown or urgency color for an already-due statement — "siempre 'venció', nunca countdown... ni color de urgencia" (`CicloSueldo.tsx:79-86`) — a genuinely considered application of the app's own severity system. The three-segment budget bar (used / pending-to-be-charged / upcoming-not-due) exists only because recurring/installment charges land late, a problem unique to this domain.

Where it slips toward generic: the UI never labels *which* of the product's three statement-range questions a given number answers. "Cupo usado" (still-open `currentStatementRange`) and the Ciclo de sueldo due figure (`lastDueStatementRange`) can show two different totals for the same card with zero copy distinguishing them — handled for the single-card case (`showSeparateStatementCards`, `page.tsx:368`) but not for 2+ cards, which is exactly the power-user case this mechanic exists to serve.

**Deterministic scan**: 24 advisory findings, all `design-system-color`, exit 0. 22 in `page.tsx`, 2 in `OverduePaySheet.tsx`. Five are `#34D6A2` — DESIGN.md's own documented dark-mode `--mint` value, present in prose but missing from the sidecar's tonal ramp (a sidecar/doc sync gap, not real drift — flagged as a likely false positive). The rest — `#f87171`, `#FCA5A5`, `#FFE08A`, `#6EE7B7`, `#FB923C`, `#FAD3CF`, and the `rgba(239,91,82,*)` family — match no canonical or ramp value anywhere in DESIGN.md (coral is `#FF6F61`/`#FF8478`, not `rgb(239,91,82)`). This is a second, parallel off-brand palette — Tailwind red-400/red-300/amber-200/emerald-300/orange-400-shaped hex values — bleeding into exactly the hero and mobile sections Assessment A separately flagged for the Gold-Ink and coral-severity violations. The two assessments converge on the same region of the file from two independent angles: one by reading the colors' *meaning*, one by reading their *literal values* against the documented palette.

**Visual overlays**: not available — no browser-automation tool in this session, and the dev server can't authenticate without Supabase credentials in this sandbox.

## Overall Impression

This is the app's best-reasoned screen in terms of domain logic (the salary/statement pairing, the honest "—" when a number can't be trusted) and its least-disciplined in terms of color governance. The dual desktop/mobile JSX trees have already drifted from each other in a way that specifically weakens the page's one P0-severity signal on the surface used most. Nothing here needs new product thinking — every fix is "use the token that already exists" or "match the two layouts to the hierarchy you already decided on desktop."

## What's Working

- **`CicloSueldo.tsx:33-36, 62-64`** — explicitly refuses to show "queda para ahorro" before salary is registered, with a comment stating a fabricated number would be worse than a dash. The Trustworthy Numbers principle enforced in code, not just documented.
- **`InfoTap.tsx`**, used consistently across the hero (`page.tsx:726-730, 766, 775, 807, 820`) — one glossary mechanism applied everywhere a term could be ambiguous, instead of five bespoke tooltips.
- **`CicloSueldo.tsx:79-86`** — deliberately never shows countdown/urgency color for an already-due statement, a considered application of the severity system rather than a reflex.

## Priority Issues

**[P0] Gold used as text color in at least 5 places, confirmed by both assessments from different angles**
What: DESIGN.md's own Gold-Ink Rule says `--gold` fails WCAG AA as foreground text (~1.6:1) and mandates `--gold-ink` for text on light surfaces. Literal `var(--gold)` is used as text color at `page.tsx:607, 626-627, 1029/1042, 1099-1100` and `NextTripCard.tsx:43`. The detector independently confirms a related, broader problem: 24 off-palette colors in this exact region of the file, several in the amber/orange family (`#FFE08A`, `rgba(255,224,138,0.45)`, `#FB923C`) that aren't even `--gold` — a second, undocumented amber palette sitting next to the real one.
Why it matters: this is a low-vision accessibility failure on the exact content ("closes in 2 days," "due tomorrow") meant to prompt action — the number that matters most is the hardest to read.
Fix: swap every text-position `var(--gold)` for `var(--gold-ink)`; replace the off-palette amber/red/green hex values with the matching documented tokens (`--gold`, `--coral`, `--mint`) so there's one amber, one red, one green in the system, not two.
Suggested command: `/impeccable harden`

**[P1] Coral used for routine deductions, not alerts**
What: `CicloSueldo.tsx:92` colors card debt coral, and `:111-113` colors "Invertido este mes" coral purely because it's a subtraction — not because anything is wrong. DESIGN.md reserves coral exclusively for "requires action today."
Why it matters: once coral means "this is a minus sign," the one real overdue-payment banner on the same page loses its distinctiveness — the user's eye has already been trained to treat coral as routine by the time it needs to mean "urgent."
Fix: use `--ink`/`--ink-2` for ordinary negative line items; reserve coral strictly for the debt-not-yet-paid state and the overdue banner.
Suggested command: `/impeccable clarify`

**[P1] The one P0-severity banner is buried on mobile — the higher-traffic surface**
What: `atrasados` renders 5th of 6 items in desktop's third column, but 8th of 9 sections on mobile (`page.tsx:1402`), behind the trip card, salary cycle, statement cards, category breakdown, and recent expenses.
Why it matters: the product's own severity rule treats this banner as "requires action today, max one per screen" — burying it defeats its purpose specifically on the surface opened most, first thing, to answer "am I okay today."
Fix: move `atrasados` to render immediately after the hero on mobile, matching desktop's effective priority.
Suggested command: `/impeccable layout`

**[P2] Two near-equal-weight numbers in the hero with no primary/secondary differential**
What: "Gastado este mes" and "Te quedan" both render at `text-6xl`/`text-5xl` side by side (`page.tsx:717, 732`).
Why it matters: forces reading the label first to know which number is which, rather than reading the dominant figure and knowing instantly what it means — violates the single-hero-metric pattern this project otherwise follows.
Fix: demote one to a secondary size/weight, or make the dominant figure context-dependent (show "Te quedan" largest only when over budget).
Suggested command: `/impeccable distill`

**[P2] No label distinguishes which statement question a number answers once a user has 2+ credit cards**
What: `showSeparateStatementCards` (`page.tsx:368`) only resolves the single-card ambiguity; with 2+ cards, "Cupo usado" (open cycle) and the Ciclo de sueldo due figure (closed/due cycle) can show different totals for the same card with no copy explaining why.
Why it matters: directly undermines the product's own principle that "a wrong statement shown... is a real failure, not cosmetic" — for exactly the multi-card power user this mechanic exists to serve.
Fix: a short qualifier ("acumulado, aún no cierra" vs. "factura por pagar") or one `InfoTap` resolves it.
Suggested command: `/impeccable clarify`

**[P3] Generic error message with no recovery path**
What: `OverduePaySheet.tsx:64`, `setError('Error al registrar')` — no cause, no retry affordance beyond re-tapping.
Why it matters: a network failure, an RLS denial, and a constraint violation all collapse to the same unhelpful string.
Fix: surface a sanitized `err.message` or branch network-vs-server copy, with a visible retry action.
Suggested command: `/impeccable harden`

## Persona Red Flags

**Sam (Accessibility)**: the gold-text violations are a hard accessibility bug, not a judgment call — ~1.6:1 contrast on text that communicates urgency.

**Alex (Power User)**: the multi-card statement ambiguity specifically fails the 2+ card user — the exact audience this mechanic exists to serve; the single-card path already has a comment acknowledging the risk, but the fix stops short of the harder case.

**Casey (Mobile)**: the dual-render drift hits mobile hardest — the coral banner's buried position only exists on the mobile tree, and the "vs. mes anterior" comparison is demoted to a standalone paragraph there versus a grouped cell on desktop, thinning mobile's context exactly where space is tightest.

## Minor Observations

- `DESIGN.md`'s two-column-collapse convention ("rather than a separate mobile template") is itself violated by this page's approach — two fully independent JSX trees, which is the root cause of the ordering drift above.
- The hero's lightest budget-bar segment (`rgba(255,255,255,0.22)`) is near-invisible against the blue hero gradient — likely intentional per a nearby comment, but worth a direct contrast check.
- The "vs. mes anterior" delta renders a bare `—` with no explanation when `prevTotal` is 0 — silently neither reassuring nor alarming, right where the user might want either.
- `NextTripCard.tsx:54` ("Los gastos del viaje no cuentan en tu presupuesto del mes") is a good disambiguating line that prevents a real "why doesn't my total match" confusion — worth the same treatment anywhere else a number is deliberately excluded. Also worth noting: `NextTripCard` itself still reads as the pre-redesign generic card style and wasn't touched during Compartidos' recent "notebook cadence" redesign — it's the one remaining cross-link into that feature still wearing the old look.

## Questions to Consider

1. Desktop and mobile already disagree on where the coral banner sits with no comment explaining the choice — is this page's ordering actually being designed, or accreting in whatever order features were added? Would a single shared ordering array consumed by both trees prevent future drift even if the JSX itself stays duplicated?
2. The product's own positioning rests on three statement-range functions answering three different questions — if that's foundational enough to document at length, why doesn't the UI ever say which question a given number answers?
3. The Gold-Ink Rule was added recently, after this page was last touched. Is `/inicio`'s violation evidence that other pages written before that date carry the same now-undocumented pattern, and worth a project-wide sweep rather than a page-by-page fix?
