---
target: app/(dashboard)/inversiones
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/catalinariquelme/Documents/claude/Projects/Gstos/app/(dashboard)/inversiones"
timestamp: 2026-10-20T16-31-06Z
slug: app-dashboard-inversiones
---
Method: dual-agent (A: af9214c2081873469 · B: a2a430ba2b1ef8082)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Market-open pill, staleness warning, quote-fetch retry chip all present; per-ticker loading state leaks "indicadores" jargon |
| 2 | Match System / Real World | 3 | Jargon translated almost everywhere that matters, but raw RSI/SMA200 labels sit unexplained beside the translated panels |
| 3 | User Control and Freedom | 3 | Undo toast on untrack, real delete-confirm screen, swipe-to-close; no audited Esc-dismiss on overlays |
| 4 | Consistency and Standards | 2 | Hero stat colors hand-roll hex instead of this app's own on-brand tokens that `/inicio`'s identical hero already uses correctly |
| 5 | Error Prevention | 3 | Plain-language delete confirmation; leverage/earnings auto-halve suggested buy size before over-sizing is possible |
| 6 | Recognition Rather Than Recall | 2 | Mobile tab bar goes icon-only with `hidden sm:inline` labels and no `aria-label` fallback |
| 7 | Flexibility and Efficiency | 3 | 6-way sort, prefilled amounts from suggestions, native `<details>` progressive disclosure |
| 8 | Aesthetic and Minimalist Design | 3 | Deliberate Resumen→Plan→Gráfico→Señales→Historial layering keeps the default view to "what to do today" |
| 9 | Error Recovery | 3 | Visible retry chip for quote-fetch failures with a dated comment explaining the prior silent-504 bug |
| 10 | Help and Documentation | 1 | Only 2 `InfoTap` tooltips across a 1114-line technical detail view full of RSI/SMA/leverage/conviction-score concepts |
| **Total** | | **26/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment:** Grounded, not generic — with one glaring regression. `TechnicalDetail.tsx` collapses "if winning / if losing" generic copy into the one branch that actually applies, with the user's real dollar P&L inserted. The trailing stop is narrated in one plain sentence ("subió junto al precio y no baja aunque los niveles del día bajen"). The rate-scenario card has an explicit code comment enforcing "tope gold, NUNCA coral" against a hypothetical competing with real alerts — someone is actively defending the house severity rule under pressure to feel more urgent, which is rare design discipline. The regression: the hero card hand-rolls raw hex instead of this exact app's own `--mint-on-brand`/`--coral-on-brand` tokens that `/inicio`'s identical solid-blue hero already uses correctly — not "could be any stock app," but "doesn't match this app's other screen."

**Deterministic scan:** 20 findings across 2 rules, all advisory, exit 0. 18 `design-system-color` + 2 `design-system-font-size` (`RiskRail.tsx:73,84`, `text-[8px]`, below DESIGN.md's documented smallest step of 9px). Of the color hits, 12 are a likely false-positive pattern — `rgba(43,124,246,…)` at alphas (0.06-0.2) other than DESIGN.md's one literally-spelled alpha (0.18) for the same documented brand blue; not real drift, just an alpha the detector doesn't generalize. The two that are NOT false positives and independently confirm Assessment A's P1: `#7EEBC7`/`#FFB4AB` at `Radar.tsx:1002,1042` — exactly the hero-stat hex Assessment A flagged, with matching line numbers. The six `rgba(0,0,0,0.65)`/`rgba(0,0,0,0.15)` hits (modal backdrops) don't match DESIGN.md's one black literal either (`rgba(0,0,0,.28)`, dark-mode card shadow) — real, if lower-priority, drift.

**Visual overlays:** Not available this run — no browser-automation tool exposed, no dev server running (Supabase credentials missing locally). Disclosed gap.

## Overall Impression

This is the most domain-committed page critiqued this session — the team is translating genuinely complex technical-analysis math (chandelier exits, leverage decay, conviction scoring) into cost-aware plain language most finance apps don't bother with, and is visibly defending its own severity-hierarchy rule against pressure to inflate urgency. But the execution has real cracks: a hero card that reinvented color tokens its own sibling page already solved, 15+ gold-as-text instances with zero use of the documented `--gold-ink` fix, and — the sharpest single miss — a calming "no action needed today" message rendered in the one color this app reserves for "something is wrong, act now."

## What's Working

1. **Cost-aware, branch-specific plain language in `TechnicalDetail.tsx`** — collapsing "winning/losing" copy to the one branch that applies, with the user's real dollar P&L inserted, goes further than the product principle asks for.
2. **The conviction/entry-trigger reconciliation logic** — when two "best candidate" panels would otherwise disagree, the UI narrates *why* instead of hiding the seam, a documented real bug now actively defended against regressing.
3. **Disciplined severity restraint on hypothetical content** — the rate-scenario card's own code comment ("un escenario hipotético no compite con las alertas reales") shows someone enforcing the Alert Severity Hierarchy against the temptation to make speculative content feel urgent.

## Priority Issues

**[P1] Gold used as text color, with zero use of `--gold-ink` anywhere on this page.**
Why it matters: 15+ `color: 'var(--gold)'` text instances across `Radar.tsx`/`TechnicalDetail.tsx`/`WeekSnapshotCard.tsx` (leverage warning, earnings-soon warning, caution-sell text, RSI-overbought number) fail WCAG AA per DESIGN.md's own documented ~1.6:1 contrast — on exactly the messages meant to carry the most weight.
Fix: swap every gold-as-text usage to `var(--gold-ink)`; reserve `--gold` for backgrounds/icon tints only.
Suggested command: `/impeccable harden`

**[P1] Hero stat colors hand-roll hex instead of this app's own on-brand tokens.**
Why it matters: `Radar.tsx:1002,1042` use `#7EEBC7`/`#FFB4AB` (confirmed by both assessments) directly on the solid-blue hero card for return/wallet-balance figures, while `/inicio`'s identical hero already solves this correctly with `--mint-on-brand`/`--coral-on-brand`. A future palette tweak updates every other hero except this one.
Fix: replace the raw hex with the matching documented on-brand tokens.
Suggested command: `/impeccable polish`

**[P1] Severity-color mismatch on the "don't buy today" message.**
Why it matters: `Radar.tsx:~1584` renders "Hoy no compres nada de tu lista." in bold `var(--coral)` — reserved for urgent/action-required-today — while surrounding copy explicitly frames the state as calm and guilt-free ("la meta puede esperar... sin apuro"). Color is read before text; a fast scan reads alarm where the product intends reassurance, undermining the severity hierarchy's own purpose.
Fix: render this state in neutral `--ink`, never coral — coral is already correctly reserved for `sell` elsewhere on this same page.
Suggested command: `/impeccable clarify`

**[P2] Icon-only mobile navigation with no accessible name.**
Why it matters: `InversionesToggle.tsx` hides all 4 tab labels on mobile via `hidden sm:inline` (invisible to screen readers too) with icons that have no `aria-label` fallback, on the exact device class this app is mobile-first for.
Fix: add `aria-label` to each tab `Link`, or use `sr-only` instead of `hidden` for the label span.
Suggested command: `/impeccable harden`

**[P2] Zero `aria-label` coverage in the transactional modal.**
Why it matters: `TransactionModal.tsx` (879 lines handling real buy/sell/delete of money positions) has no `aria-label` at all — icon-only close/delete buttons and unlabeled numeric inputs are a real barrier on the one screen where a mistake has direct financial consequences.
Fix: audit every icon-button and bare input in the modal and add explicit labels.
Suggested command: `/impeccable harden`

## Persona Red Flags

**Sam (accessibility):** Can't navigate `InversionesToggle`'s unlabeled mobile tabs by screen reader; can't confidently confirm a delete action in `TransactionModal` before activating it; gets the least legible treatment on exactly the gold risk warnings meant to carry weight.

**Riley (stress tester):** The "¿Qué comprar hoy?" panel already guards one reconciliation bug (score #1 vs. actionable #1 disagreeing) — worth checking whether `todayDecision` (last night, server) vs. live recalculation can still flash a contradicting verdict mid-glance before `allLoaded`. Also: `removeTicker`'s 5-second undo is `setTimeout`-based — closing the tab within that window needs verification that the delete still fires server-side rather than silently leaving a ticker un-removed.

**Jordan (first-timer):** Lands on "Impulso · RSI" with a bare 0-100 number and colored bar, no `InfoTap`, no explanation — one of only two technical terms on the page without the contextual-help pattern the team otherwise uses well. The "70/100" conviction score driving every recommendation is never defined anywhere visible in this flow.

## Minor Observations

- `fmtUSD`/`fmtUSDSigned`/`fmtPct` are redefined nearly identically in `Radar.tsx`, `TransactionModal.tsx`, and `UsdWalletManager.tsx` — a future formatting tweak needs three edits.
- The "Calculando indicadores de {ticker}…" loading message uses "indicadores," the one jargon word leaking into an otherwise plain-language loading state.
- `RiskRail.tsx:73,84` use `text-[8px]`, below DESIGN.md's documented smallest type step (9px `micro`).
- Six `rgba(0,0,0,0.65)`/`rgba(0,0,0,0.15)` modal-backdrop values don't match DESIGN.md's one black literal (`rgba(0,0,0,.28)`) — low-priority but real drift.

## Questions to Consider

- What if "Hoy no compres nada" used the exact same visual register as the reassuring "patience is part of the method" copy right below it — would removing coral from that one spot change how often the "do nothing" verdict is actually trusted?
- Would fixing the 15+ gold-as-text contrast failures alone make caution signals read as more credible, without changing a single word?
- What if `InfoTap` — already used twice — became the default pattern on every raw indicator label (RSI, SMA200, conviction score) instead of an occasional one?
