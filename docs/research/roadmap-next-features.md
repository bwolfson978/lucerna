# Lucerna Roadmap: Top 3 Next Features Beyond Roth Conversion Optimizer

## Context

Lucerna currently serves one critical moment in the customer journey: **"How much should I convert, and when?"** — the quantification step during a low-income window. But the Informed DIYer's journey is broader:

```
Realization → Education → Quantification → Tradeoff Analysis → Execution → Monitoring → "What else?"
     ↑                         ↑                    ↑                                        ↑
  (content)              (Lucerna today)        (GAP #1)                                 (GAP #2, #3)
```

The three features below fill the most valuable gaps along this journey, ranked by (a) how tightly coupled they are to the existing Roth conversion decision, (b) demand signal from the FIRE/Bogleheads community, and (c) natural fit with Lucerna's existing engine architecture.

---

## Feature 1: ACA Subsidy-Aware Conversion Optimizer

### Why this is #1
For Lucerna's largest target segment (FIRE/early retirees, ~975K in r/financialindependence), **the Roth conversion decision is inseparable from ACA subsidy implications.** Every Bogleheads thread on Roth conversions immediately becomes an ACA subsidy discussion. The "true marginal cost" of a conversion includes subsidy loss — a $10K conversion might cost $2,200 in federal tax but $4,000 in lost ACA subsidies, making the effective rate 62% instead of 22%.

**No existing tool combines multi-year Roth conversion optimization with ACA subsidy modeling.** Users currently cross-reference 3-4 separate calculators (KFF subsidy calculator, their tax software, Lucerna/Boldin for conversions, a spreadsheet to tie it together). This is exactly the fragmented experience Lucerna was built to eliminate.

### What it does
- Models ACA premium tax credits as a function of MAGI (which includes Roth conversions)
- Shows the **combined marginal rate** (federal tax + subsidy loss) for each dollar of conversion
- Identifies the "sweet spot" — the optimal conversion amount that balances tax bracket filling against subsidy preservation
- Handles the 2026 subsidy cliff (400% FPL hard cutoff) vs. enhanced subsidy scenarios
- Inputs: household size, SLCSP monthly premium (with sensible default)

### Customer journey fit
This serves the **Tradeoff Analysis** step — the moment right after the user sees their optimal conversion schedule and asks "but wait, what about my health insurance?" Currently that question sends them away from Lucerna to external calculators. This feature keeps them in the product.

### Architecture fit
- Extends `ScenarioInput` with healthcare inputs (household size, SLCSP premium)
- Adds ACA subsidy calculation to the NPV model in `optimizer.py` (subsidy loss is a cost, like tax)
- The bracket-fill visualization naturally extends to show the "subsidy cliff" as another boundary line
- Reasoning trace already has the structure for "cost of converting $1K more" — just adds subsidy component

### Demand signals
- 10+ active Bogleheads threads with 100+ replies each on this exact interaction
- Adviser.best built a standalone ACA calculator specifically because no planning tool integrates it
- Already identified as Phase 2 priority in Lucerna's own roadmap — this research confirms it should be the **first** Phase 2 feature

---

## Feature 2: Tax-Gain Harvesting Coordinator (0% LTCG Bracket)

### Why this is #2
During the **same low-income windows** that make Roth conversions attractive, the **0% long-term capital gains bracket is also available** ($48,350 single / $96,700 MFJ for 2025). These two strategies share the same taxable income "budget" but no tool coordinates them together.

The typical Informed DIYer with a $210K traditional IRA also has a taxable brokerage account with embedded gains. They're leaving money on the table if they fill ordinary income brackets with Roth conversions but ignore the parallel opportunity to realize long-term capital gains at 0% tax. Conversely, they might over-convert and push their LTCG rate from 0% to 15%, costing them thousands.

### What it does
- Adds taxable brokerage account with embedded gains/losses to the input model
- Jointly optimizes: (1) Roth conversion amount (ordinary income brackets) + (2) capital gains realization (LTCG brackets) per year
- Shows the **combined bracket-fill** — ordinary income from conversions AND capital gains layered on top, with clear visualization of when you'd push into 15% LTCG territory
- Identifies tax-loss harvesting opportunities that create "room" for larger Roth conversions
- Calculates the **total tax alpha** from coordinating both strategies vs. doing either alone

### Customer journey fit
This serves the **"What else should I optimize?"** step. After seeing their Roth conversion plan, power users immediately ask about capital gains. Schwab and CNBC both describe tax-gain harvesting as "one of the most underused strategies" — Lucerna can surface this proactively.

### Architecture fit
- The optimizer already maximizes NPV across multiple years — adding a second decision variable (gains realization per year) is a natural extension of the SLSQP formulation
- The bracket-fill visualization (`BracketChart.tsx`) already shows stacked bars — gains harvesting is another colored segment
- Tax calculation in `tax.py` would need LTCG bracket logic (separate rate schedule, but straightforward)
- Fits the "deterministic engine + AI explanation" architecture perfectly — the engine coordinates, the AI explains the interaction

### Demand signals
- Schwab, CNBC, and Ameriprise all published 2025 articles on the 0% bracket opportunity
- Bogleheads thread "Roth conversions vs 0% LTCG vs ACA subsidy in low-income year" directly asks for this coordination
- No consumer-facing tool jointly optimizes these two strategies
- Extends Lucerna's positioning from "Roth conversion optimizer" to "low-income window optimizer"

---

## Feature 3: Retirement Withdrawal Sequencing Simulator

### Why this is #3
Roth conversion optimization answers **"how should I prepare?"** — but users immediately follow up with **"so what does my retirement actually look like?"** The conversion decision is forward-looking (convert now to save taxes later), but users need to see the "later" to trust the recommendation.

Withdrawal sequencing — the order in which you draw from traditional, Roth, and taxable accounts in retirement — determines whether the conversions actually pay off. A user who converts optimally but then withdraws suboptimally could negate the benefit. More importantly, **showing the withdrawal plan makes the conversion recommendation concrete and credible.**

### What it does
- Given the user's post-conversion projected balances (which Lucerna already computes), models year-by-year retirement withdrawals
- Optimizes withdrawal order: traditional (taxable), Roth (tax-free), taxable (capital gains rates), Social Security (partially taxable)
- Shows projected tax bills in each retirement year under different withdrawal strategies
- Visualizes the "tax torpedo" — years where RMDs + Social Security push you into higher brackets
- Highlights how the Roth conversion strategy reduces future RMD burden and tax exposure

### Customer journey fit
This serves the **"convince me it's worth it"** moment. The current Lucerna output shows "estimated lifetime tax savings" as a single number. The withdrawal simulator makes that number tangible: "In 2045, you'll withdraw $40K tax-free from your Roth instead of paying $8,800 in tax on a traditional IRA withdrawal." This builds confidence to act.

### Architecture fit
- The NPV model in `optimizer.py` already simulates retirement withdrawals internally (Phase 3: retirement withdrawals, Phase 4: terminal liquidation) — this feature **surfaces that simulation to the user** rather than hiding it inside the optimizer
- Extends the trajectory chart to show the "other side" — accumulation + conversion years followed by withdrawal years
- Naturally leads into RMD and Social Security modeling (Phase 3 features) by providing the visualization framework

### Demand signals
- MoneyGuidePro users cite distribution sequencing as the #1 reason they need external spreadsheets
- "Withdrawal sequencing" is a top search term in retirement planning communities
- Boldin and ProjectionLab both offer this but without Roth conversion optimization — Lucerna would be the first to connect both sides
- Makes the free-to-paid upgrade compelling: free tier shows conversion plan, paid tier shows the full retirement picture

---

## Summary: Priority Ranking

| Rank | Feature | Journey Step | Build Complexity | Revenue Signal |
|------|---------|-------------|-----------------|----------------|
| 1 | ACA Subsidy-Aware Optimizer | Tradeoff Analysis | Medium (extends existing optimizer) | Table stakes for FIRE segment |
| 2 | Tax-Gain Harvesting Coordinator | "What else?" | Medium-High (new decision variable) | Differentiator — no one does this |
| 3 | Withdrawal Sequencing Simulator | "Convince me" | Medium (surfaces existing internals) | Paid tier conversion driver |

### What was considered but deprioritized
- **Social Security timing optimization** — important but more distant from the core low-income-window use case; better as a module within Feature 3
- **IRMAA (Medicare premium) modeling** — only relevant at 65+, niche within the FIRE segment
- **State tax modeling** — enhancement to existing feature, not a new product surface; already on Phase 2 roadmap
- **RMD projections** — downstream of Feature 3; build the withdrawal framework first, then add RMD detail
- **Estate planning / generational wealth** — explicitly out of scope per project brief; different user persona

### Strategic framing
These three features together transform Lucerna from a **single-strategy optimizer** into a **low-income-window command center** — the one place an Informed DIYer goes during a life transition to coordinate all the tax-advantaged moves available to them. This matches the project brief's broader vision: "a financial thought partner for life transitions."
