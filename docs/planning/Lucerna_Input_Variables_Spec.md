# Lucerna — Optimization Input Variables & Multi-Year Model

**Last updated:** March 18, 2026
**Place in repo:** `docs/specs/input-variables.md`

---

## Design principle: Income timeline first, defaults for everything else

The core input is the user's **year-by-year income forecast** — this is what makes Lucerna different from every other tool. The user should be able to get a meaningful first result by entering **5 things**: their age, filing status, traditional IRA balance, and a few years of expected income. Everything else has smart defaults. The fewer decisions required to get a first result, the better.

---

## Group 1: Who you are (required)

These are the minimum inputs needed to run the optimizer.

| Variable | Type | Validation | Notes |
|----------|------|-----------|-------|
| Age | integer | 18–80 | Current age. Used to calculate years to retirement, years to RMD age, etc. |
| Filing status | enum | Single, Married Filing Jointly | MFS, HoH are future. For MFJ, we model one spouse's IRA but use joint brackets. |
| Traditional IRA/401(k) balance | currency | ≥ 0 | Total pre-tax retirement balance available for conversion. Includes rollover IRAs, traditional IRAs, and any 401(k) eligible for rollover. |
| Income timeline | list of (year, income) | 1–15 years, each ≥ 0 | **This is the core input that makes Lucerna different.** Year-by-year income forecast. Pre-populated with a sensible default (e.g., 5 years at current income). User adjusts years where income dips or spikes. |

**For MFJ:** We also need spouse's age (for survivor scenario modeling in future phases). For MVP, we assume same age.

**Minimum viable input:** If the user provides just age + filing status + IRA balance + current income (as a single number), the system creates a default 5-year timeline with that income repeated, then prompts: "Is your income changing in the next few years? Adjust the years where it's different." This lets users start fast but naturally discover the multi-year capability.

---

## Group 2: Your situation (has smart defaults)

These inputs refine the model. All have defaults so a user can skip them entirely on first run.

| Variable | Type | Default | Notes |
|----------|------|---------|-------|
| Current Roth IRA balance | currency | $0 | Existing Roth balance. Grows tax-free alongside any conversions. |
| Non-retirement savings (taxable) | currency | $0 | Used to determine if user can pay conversion tax from outside the IRA (important: paying from IRA reduces the benefit). Displayed as a warning if taxable savings < estimated conversion tax. |
| State of residence | enum/dropdown | None (federal only) | MVP: federal only. Phase 2: state tax modeling. State affects the marginal cost of conversion. |
| Deductions | enum | Standard deduction | Options: "Standard deduction" (auto-calculated from filing status + year) or "Itemized" with a manual override amount. Most users take standard. |
| Pre-tax contributions to IRA | boolean | No | Whether the user has non-deductible (after-tax) contributions in their traditional IRA. Triggers pro-rata rule warning. MVP: just a warning/educational note. Phase 2: model the pro-rata calculation. |

---

## Group 3: Your future (has smart defaults, power users adjust)

| Variable | Type | Default | Notes |
|----------|------|---------|-------|
| Retirement age | integer | 65 | When the user expects to stop working and begin drawing down retirement accounts. |
| Years in retirement | integer | 25 | How long retirement lasts. Default 25 gives coverage to ~age 90. Used to model withdrawal period. |
| Annual retirement spending | currency | Based on 4% rule | Default: `(traditional_balance + roth_balance) * 0.04`. User can override. This is the annual pre-tax withdrawal target during retirement. |
| Expected investment return | percentage | 7% | Nominal annual return on all retirement assets. |
| Inflation rate | percentage | 3% | Used to express future values in today's dollars. Also used to grow spending target in nominal terms if we model nominal. |
| Discount rate | percentage | 5% | For NPV calculation. Default = expected return - inflation + small risk premium. Power users can adjust. Hidden behind "Advanced" toggle — most users should never see this. |

---

## Group 4: Income timeline (the multi-year core)

This is where Lucerna differentiates. Instead of asking "how much do you want to convert?", we ask "what does your income look like over the next few years?" and the optimizer finds the valleys.

### User input model

The user provides a **year-by-year income forecast** for a configurable horizon (default: 5 years, max: 15 years). For each year, they enter:

| Variable | Type | Default | Notes |
|----------|------|---------|-------|
| Year label | string | Auto: "2026", "2027", etc. | Just for display. |
| Expected gross income | currency | Current year income | Pre-populated with current income. User adjusts years where income dips or spikes. |
| Life event tag (optional) | enum | None | Optional labels like "Grad school", "Sabbatical", "Startup year 1", "Career change", "Part-time", "Early retirement", "Back to work". Used for AI explanations and personalization, not for math. |

### How the optimizer uses this

The optimizer's job is to find the **conversion schedule** — an amount to convert in each year — that maximizes total after-tax wealth (NPV) across the entire horizon, subject to constraints.

**The core insight the user should experience:** They enter their income timeline, and the optimizer finds "valleys" — years where income is low enough that conversion is cheap — and fills them optimally. The output is a year-by-year conversion plan that shows exactly how much to convert each year and why.

### What the engine does with the income timeline

For each year `t` in the horizon:

1. Start with the user's projected income for year `t`
2. Add the conversion amount `c_t` (decision variable) to get total taxable income
3. Calculate federal tax on total taxable income using that year's brackets (assuming bracket inflation indexing if enabled)
4. Calculate the marginal cost of the conversion: `tax(income_t + c_t) - tax(income_t)`
5. Reduce traditional IRA by `c_t`, increase Roth IRA by `c_t`
6. Grow both accounts by the expected return rate
7. At the end of the horizon, model retirement withdrawals and terminal value

**Decision variables:** `c_0, c_1, ..., c_N` (conversion amount per year)

**Objective:** Maximize NPV of all after-tax cash flows (conversion tax payments + retirement withdrawal streams + terminal account values)

**Constraints:**
- `c_t ≥ 0` for all t (can't un-convert)
- `c_t ≤ traditional_balance_t` for all t (can't convert more than you have)
- `sum(c_t) ≤ initial_traditional_balance` (total conversions can't exceed starting balance, accounting for growth)
- Traditional balance must remain ≥ 0 after conversion in each year

---

## Group 5: Advanced / Future phase variables

These are NOT in the MVP but are architecturally planned for. They should be represented in the data model (Pydantic types) even if the engine doesn't use them yet.

| Variable | Phase | Notes |
|----------|-------|-------|
| State tax brackets | Phase 2 | Model state income tax on conversions and withdrawals. Major impact for high-tax states (CA, NY, MA). |
| ACA marketplace coverage | Phase 2 | Boolean: is user on ACA? If yes, model how conversion income affects premium tax credits. This is the #1 pain point for FIRE users — a $10K conversion can cost $3K in lost subsidies. |
| ACA household size | Phase 2 | Number of people on the ACA plan. Affects FPL thresholds. |
| Social Security: expected benefit | Phase 3 | Monthly benefit amount. Conversion income can trigger up to 85% SS benefit taxation. |
| Social Security: claiming age | Phase 3 | When they plan to claim (62-70). Affects when SS income enters the tax picture. |
| RMD modeling | Phase 2 | Auto-calculated from traditional balance and IRS Uniform Lifetime Table. Shows what happens if user doesn't convert — forced withdrawals at potentially higher rates. |
| IRMAA thresholds | Phase 3 | Medicare Part B/D premium surcharges triggered by high income 2 years prior. Relevant for ages 63+. |
| Capital gains harvesting | Phase 3 | Model interaction with 0% LTCG bracket. Every dollar of conversion that fills the 12% bracket is a dollar that can't be used for 0% LTCG harvesting. |
| Spouse's income timeline | Phase 2 | For MFJ, spouse's separate income timeline. |
| Spouse's IRA balance | Phase 2 | For MFJ, spouse may also have conversion opportunities. |
| Pension / annuity income | Phase 3 | Fixed income streams that fill brackets in retirement. |
| Bracket inflation indexing | Phase 2 | Assume brackets grow with inflation (historically true). Default: on. Affects long-term projections. |
| Tax law sunset scenarios | Phase 3 | TCJA rates are now permanent under OBBBA (July 2025), but future changes possible. Allow scenario comparison with higher rates. |
| Estate planning toggle | Future | Model leaving assets to heirs vs. full liquidation. Changes the terminal value calculation significantly. |

---

## Optimizer: Technical approach

The optimizer uses `scipy.optimize.minimize` with SLSQP to find the optimal conversion schedule across all years in the income timeline. There is no separate single-year mode — a single-year scenario is simply a timeline of length 1.

**Formulation:**

1. **Decision variables:** `[c_0, c_1, ..., c_N]` — the conversion amount for each year in the timeline. These are continuous variables.

2. **Objective:** Minimize negative NPV (i.e., maximize NPV). NPV is the sum of all after-tax cash flows — conversion tax payments (negative, immediate), retirement withdrawal streams (positive, discounted), and terminal account values (positive, discounted).

3. **Bounds:** `0 ≤ c_t ≤ remaining_traditional_balance_t` for each year.

4. **Constraints (nonlinear inequality):**
   - Traditional balance must remain ≥ 0 after each year's conversion and growth
   - Total conversions across all years cannot exceed initial balance plus accumulated growth

5. **Smart initialization (critical for performance and correctness):**
   - **Greedy bracket-fill heuristic:** For each year, calculate the conversion amount that fills brackets up to the point where the marginal rate exceeds the expected retirement withdrawal rate. This is a fast, deterministic starting point.
   - **Multiple restarts:** Run the optimizer from 3-5 different starting points: greedy, uniform split (balance / N per year), front-loaded, back-loaded, and zero. Take the best result. This handles the non-convexity that Kotlikoff describes — tax brackets create discontinuities that can trap gradient-based optimizers in local optima.

6. **Performance target:** < 2 seconds for a 5-year optimization, < 5 seconds for a 15-year optimization, on Railway's infrastructure. The greedy heuristic alone runs in < 50ms and provides a good-enough answer even if scipy fails.

7. **Fallback:** If scipy doesn't converge, return the greedy heuristic result with a note that it's an approximation. The greedy result is usually within 5% of optimal for typical scenarios.

### The "valley finder" UX

The multi-year experience should feel like this:

1. User enters their income timeline (a simple editable row of numbers, one per year)
2. The system highlights which years are "valleys" — where income is lower than their long-run average
3. User hits "Optimize"
4. The engine returns a conversion schedule showing how much to convert each year
5. The results page shows:
   - A stacked bar chart: income (gray) + conversion (blue) per year, with bracket boundaries overlaid
   - The total lifetime tax savings vs. not converting
   - Year-by-year breakdown: conversion amount, tax cost, effective rate, marginal bracket
   - The wealth timeline chart showing how the Roth grows over time

The key visualization is the **income + conversion stacked bar chart with bracket lines.** The user can see at a glance: "My income dips in years 2-3 because I'm in grad school. The optimizer fills those low-bracket years with conversions. In year 4 when my income comes back, it converts nothing." The bracket lines make it viscerally clear why the optimizer chose what it chose.

---

## Input form UX: Progressive disclosure

### Screen 1: The basics (3 fields + timeline)
- Age
- Filing status
- Traditional IRA balance
- **Income timeline editor** — starts with current year income field. Below it, a prompt: "Is your income changing in the next few years?" → expanding to show 3-5 editable year rows, pre-populated with the current income. User adjusts years where income dips or spikes. Optional life event tags per year (dropdown).

→ "Find my optimal conversion plan" button available as soon as timeline has ≥ 1 year

### Screen 2: Refine your scenario (optional, expandable)
- Roth balance
- Non-retirement savings
- State (dropdown, "Federal only" default)
- Deductions (standard vs. itemized)

### Screen 3: Your future (optional, with defaults shown)
- Retirement age (slider, default 65)
- Years in retirement (slider, default 25)
- Retirement spending (auto-calculated, editable)
- Expected return (slider, default 7%)

### Advanced panel (hidden by default)
- Discount rate
- Inflation rate
- Bracket inflation indexing toggle

---

## Validation rules

| Rule | Error | Warning |
|------|-------|---------|
| Age must be 18-80 | Hard block | — |
| Income must be ≥ 0 | Hard block | — |
| IRA balance must be ≥ 0 | Hard block | — |
| Retirement age must be > current age | Hard block | — |
| Retirement age > 75 | — | "Are you sure? This limits your conversion window." |
| Non-retirement savings < estimated conversion tax | — | "You may need to pay conversion taxes from your IRA, which reduces the benefit." |
| Conversion fills 32%+ bracket | — | "You're converting into the 32% bracket. The optimizer will determine if this is still beneficial." |
| Income timeline has no low-income years | — | "Your income is relatively stable. Conversion benefits may be modest." |
| IRA balance < $10,000 | — | "With a smaller balance, the absolute tax savings may be limited." |

---

## Data model (Pydantic)

```python
from pydantic import BaseModel, Field
from enum import Enum
from typing import Optional

class FilingStatus(str, Enum):
    SINGLE = "single"
    MFJ = "married_filing_jointly"

class LifeEvent(str, Enum):
    NONE = "none"
    GRAD_SCHOOL = "grad_school"
    SABBATICAL = "sabbatical"
    STARTUP = "startup"
    CAREER_CHANGE = "career_change"
    PART_TIME = "part_time"
    EARLY_RETIREMENT = "early_retirement"
    PARENTAL_LEAVE = "parental_leave"
    BACK_TO_WORK = "back_to_work"
    LAYOFF = "layoff"

class YearlyIncome(BaseModel):
    year: int
    gross_income: float = Field(ge=0)
    life_event: LifeEvent = LifeEvent.NONE

class UserScenario(BaseModel):
    # Group 1: Required
    age: int = Field(ge=18, le=80)
    filing_status: FilingStatus
    traditional_balance: float = Field(ge=0)
    
    # Income timeline (the core input — always required, min 1 year)
    income_timeline: list[YearlyIncome] = Field(min_length=1, max_length=15)
    
    # Group 2: Situation (defaults)
    roth_balance: float = Field(default=0, ge=0)
    taxable_savings: float = Field(default=0, ge=0)
    state: Optional[str] = None  # Phase 2
    deduction_type: str = Field(default="standard")  # "standard" or "itemized"
    itemized_amount: Optional[float] = None
    has_nondeductible_contributions: bool = False
    
    # Group 3: Future (defaults)
    retirement_age: int = Field(default=65, ge=30, le=80)
    retirement_years: int = Field(default=25, ge=5, le=40)
    retirement_spending: Optional[float] = None  # Auto-calc if None
    expected_return: float = Field(default=0.07, ge=0, le=0.20)
    inflation_rate: float = Field(default=0.03, ge=0, le=0.10)
    discount_rate: float = Field(default=0.05, ge=0, le=0.15)
    
    # Computed default for retirement spending
    def get_retirement_spending(self) -> float:
        if self.retirement_spending is not None:
            return self.retirement_spending
        total_balance = self.traditional_balance + self.roth_balance
        return round(total_balance * 0.04, -2)  # 4% rule, rounded to nearest $100


class OptimizationResult(BaseModel):
    # Per-year results
    yearly_conversions: list[float]
    yearly_tax_cost: list[float]
    yearly_effective_rate: list[float]
    yearly_marginal_bracket: list[str]
    
    # Summary
    total_conversion: float
    total_tax_cost: float
    lifetime_tax_savings: float  # vs. no conversion
    npv: float
    
    # Balance projections
    traditional_at_retirement: float
    roth_at_retirement: float
    
    # For the chart
    wealth_curve: list[dict]  # [{amount, npv}, ...] for single-year
    
    # Reasoning trace (for AI explanations)
    reasoning: dict  # Structured data the AI layer uses to generate explanations
```

---

## Key architectural decisions

1. **Multi-year is the only mode.** There is no separate "single-year" mode. A single-year scenario is just a timeline of length 1. The engine always operates on a list of years and always uses scipy.optimize.

2. **The optimizer finds the schedule; the user adjusts it.** After optimization, the user can manually override any year's conversion amount and see the impact in real time. The editable income timeline table is always available.

3. **Income timeline builds from a simple starting point.** If the user enters just a single income number, the system creates a default 5-year timeline and prompts: "Is your income changing? Adjust the years where it's different." This lets users start fast but naturally discover the multi-year capability.

4. **All dollar amounts are nominal internally, displayed in today's dollars.** The inflation rate converts future values for display. The engine works in nominal terms to keep tax bracket math correct (brackets are nominal).

5. **Tax brackets are data, not code.** Stored as a configuration file (JSON/YAML) that can be updated annually. Supports multiple years of brackets for multi-year modeling with bracket indexing.
