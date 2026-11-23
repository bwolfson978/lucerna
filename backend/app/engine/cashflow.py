"""One year of a plan's cash, and the walk over every year of the plan.

Every engine path takes its balances, withdrawals, taxes and value from here, so
they cannot disagree about where a dollar went. The rule (see
``formal/lean/Lucerna/TaxPayment.lean`` and the methodology page):

1. **Spending is after tax.** In a year that funds spending from the accounts,
   withdrawals are sized so that after the year's whole tax bill and any early
   withdrawal penalty the household has exactly its budget. The budget is fixed
   for the plan, so it is the same with or without conversions.
2. **Every tax bill is paid by something.** In those years it comes out of the
   accounts: penalty-free Roth money before 59½, then traditional, then Roth. In a
   working year the household lives on its income, and the conversion's tax comes
   out of that income.
3. **Money outside the accounts grows like money inside them.** Tax paid from
   income, required withdrawals beyond the budget, ACA premium credits and Medicare
   surcharges are carried at the investment return. There is no second rate.

A plan's value is what the accounts provide after tax over the plan, plus what is
left at the end (traditional money at the final year's marginal rate), each brought
back to today at the investment return. Because both sides of every comparison
spend the same budget, a difference in value is a difference in after-tax wealth.

A plan year is a timeline year, a year of growth between the timeline and the
start of withdrawals, or a year after the timeline (no other income, no
conversions) up to ``planning_horizon_age``.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from app.engine.aca import aca_coverage_years, calculate_aca_subsidy
from app.engine.constants import RETIREMENT_SPENDING_RATE
from app.engine.early_withdrawal import (
    CONVERSION_SEASONING_YEARS,
    EARLY_WITHDRAWAL_PENALTY,
    early_fraction,
)
from app.engine.irmaa import IRMAA_LOOKBACK_YEARS, calculate_irmaa
from app.engine.retirement import post_timeline_start, post_timeline_tax, resolve_states
from app.engine.rmd import calculate_rmd, rmd_start_age
from app.engine.types import ScenarioInput
from app.engine.year_tax import YearTax, year_taxes

# Step used to measure a marginal rate: tax on the next $1,000 of income
MARGINAL_STEP = 1_000.0

# The withdrawal table (see ``Plan.table``) is fine up to this income and coarser above
_TABLE_FINE_TOP = 1_500_000.0
_TABLE_FINE_STEP = 250.0
_TABLE_COARSE_POINTS = 300

# A withdrawal is solved to the cent
_CENT = 0.005


@dataclass(frozen=True)
class YearRule:
    """What is fixed about one plan year before any conversion is chosen."""

    index: int  # years from the plan's first year
    year: int
    age: int
    income: float
    tax: YearTax
    # After-tax spending the household funds this year, from income first and then
    # the accounts. None in a working year: income covers spending and the accounts
    # are left alone.
    budget: float | None
    rmd_age: bool
    # Share of a withdrawal lost to the early withdrawal penalty (0 from 59½ on)
    penalty_rate: float
    aca: bool
    in_timeline: bool
    growth_only: bool = False
    # Tax on the year's income alone, and what the accounts must provide after tax
    # when nothing is converted (see ``Walk.value``)
    tax_on_income: float = 0.0
    from_accounts: float = 0.0


@dataclass(frozen=True)
class YearFlow:
    """What happened to the money in one plan year."""

    rule: YearRule
    trad_start: float
    roth_start: float
    rmd: float = 0.0
    conversion: float = 0.0
    # Withdrawals for spending and tax: penalty-free Roth money, then traditional,
    # then other Roth money
    roth_free: float = 0.0
    trad_draw: float = 0.0
    roth_draw: float = 0.0
    # Income the year is taxed on: income, RMD, conversion and traditional withdrawal
    taxed_income: float = 0.0
    tax: float = 0.0
    penalty: float = 0.0
    subsidy: float = 0.0
    # Medicare surcharge this year's income sets, paid two years on
    irmaa: float = 0.0
    # Cash that ends the year outside the accounts: tax paid from income (negative),
    # required withdrawals beyond the budget, or spending the accounts could not
    # cover (negative)
    outside: float = 0.0
    shortfall: float = 0.0
    trad_end: float = 0.0
    roth_end: float = 0.0

    @property
    def base_income(self) -> float:
        """The year's taxed income before its conversion: the conversion is the top
        slice of what the year is taxed on."""
        return self.taxed_income - self.conversion

    @property
    def spending_from_roth(self) -> float:
        return self.roth_free + self.roth_draw


@dataclass(frozen=True)
class Walk:
    """A conversion schedule carried through every year of the plan."""

    flows: list[YearFlow]
    # Today's value of the plan: see the module docstring
    value: float
    trad_end: float
    roth_end: float

    def timeline(self) -> list[YearFlow]:
        return [f for f in self.flows if f.rule.in_timeline]


@dataclass
class Plan:
    """A scenario prepared for walking: each year's rule and withdrawal table."""

    scenario: ScenarioInput
    years: list[YearRule]
    growth: float
    n_timeline: int
    max_income: float
    _tables: dict[int, np.ndarray] = field(default_factory=dict)
    _grid: np.ndarray | None = None
    _terminal_rate: float | None = None
    _no_conversion: Walk | None = None

    # ── Withdrawal table ────────────────────────────────────────────────────

    @property
    def grid(self) -> np.ndarray:
        """Incomes the withdrawal tables are tabulated at."""
        if self._grid is None:
            fine = np.arange(0.0, _TABLE_FINE_TOP, _TABLE_FINE_STEP)
            top = max(self.max_income, _TABLE_FINE_TOP) * 1.01 + 1.0
            coarse = np.geomspace(_TABLE_FINE_TOP, top, _TABLE_COARSE_POINTS)
            self._grid = np.concatenate([fine, coarse])
        return self._grid

    def table(self, rule: YearRule) -> np.ndarray:
        """What is left of taxed income ``grid`` in this year after tax and penalty:
        ``(1 - penalty) * income - tax(income)``. It rises with income (a dollar
        withdrawn never costs a dollar in tax and penalty), so the withdrawal that
        leaves a given amount is found by looking the amount up in it."""
        cached = self._tables.get(rule.index)
        if cached is None:
            kept = (1 - rule.penalty_rate) * self.grid - rule.tax.total(self.grid)
            cached = np.maximum.accumulate(np.asarray(kept, dtype=float))
            self._tables[rule.index] = cached
        return cached

    def _draw_for(
        self, rule: YearRule, base: float, tax_base: float, need: float, cap: float
    ) -> tuple[float, float]:
        """The traditional withdrawal on top of ``base`` income that leaves ``need``
        after its own tax and penalty, at most ``cap``. Returns it with the year's
        tax at ``base`` plus the withdrawal."""
        if need <= 0 or cap <= 0:
            return 0.0, tax_base
        keep = 1 - rule.penalty_rate
        tax = rule.tax.total
        target = need + keep * base - tax_base
        draw = float(np.interp(target, self.table(rule), self.grid)) - base
        if draw >= cap - 1.0:
            # At or near everything that is left: settle that against the exact tax
            tax_at_cap = tax(base + cap)
            if keep * cap - (tax_at_cap - tax_base) <= need:
                return cap, tax_at_cap
        draw = min(max(draw, 0.0), cap)
        tax_at_draw = tax(base + draw)
        # The table is exact between the kinks of the tax schedule; step to the cent
        for _ in range(12):
            miss = keep * (base + draw) - tax_at_draw - target
            if abs(miss) < _CENT:
                break
            if draw >= cap and miss < 0:
                break  # everything that is left, and still short
            slope = keep - (tax(base + draw + 1.0) - tax_at_draw)
            draw = min(max(draw - miss / max(slope, 0.05), 0.0), cap)
            tax_at_draw = tax(base + draw)
        return draw, tax_at_draw

    # ── One year ────────────────────────────────────────────────────────────

    def step(
        self, rule: YearRule, trad: float, roth: float, basis: float, conversion: float
    ) -> tuple[YearFlow, float]:
        """Carry the balances through one year. ``basis`` is the Roth money that can
        be withdrawn before 59½ without penalty; returns the flow and what is left
        of it."""
        g = self.growth
        if rule.growth_only:
            return (
                YearFlow(rule, trad, roth, trad_end=trad * (1 + g), roth_end=roth * (1 + g)),
                basis,
            )

        rmd = min(calculate_rmd(trad, rule.age), trad) if rule.rmd_age else 0.0
        conversion = min(max(0.0, conversion), trad - rmd) if rule.in_timeline else 0.0
        base = rule.income + rmd + conversion
        tax_base = rule.tax.total(base)

        roth_free = trad_draw = roth_draw = shortfall = 0.0
        tax = tax_base
        if rule.budget is None:
            # Working year: income covers spending and its own tax. The conversion's
            # tax comes out of income, and an RMD is saved.
            outside = rmd - (tax_base - rule.tax_on_income)
        else:
            need = rule.budget + tax_base - rule.income - rmd
            if need <= 0:
                outside = -need
            else:
                keep = 1 - rule.penalty_rate
                if rule.penalty_rate > 0:
                    roth_free = max(0.0, min(need, basis, roth))
                    basis -= roth_free
                    need -= roth_free
                trad_draw, tax = self._draw_for(rule, base, tax_base, need, trad - rmd - conversion)
                need -= keep * trad_draw - (tax - tax_base)
                if need > _CENT:
                    roth_draw = min(need / keep, max(0.0, roth + conversion - roth_free))
                    need -= keep * roth_draw
                shortfall = need if need > _CENT else 0.0
                outside = -shortfall

        taxed_income = base + trad_draw
        subsidy = 0.0
        hc = self.scenario.healthcare
        if rule.aca and hc is not None:
            subsidy = calculate_aca_subsidy(
                taxed_income, hc.household_size, hc.monthly_slcsp_premium
            )
        irmaa = 0.0
        if rule.tax.medicare_people > 0:
            irmaa = calculate_irmaa(
                rule.tax.agi(taxed_income),
                self.scenario.filing_status,
                rule.tax.irmaa_scale,
                rule.tax.medicare_people,
            )

        flow = YearFlow(
            rule=rule,
            trad_start=trad,
            roth_start=roth,
            rmd=rmd,
            conversion=conversion,
            roth_free=roth_free,
            trad_draw=trad_draw,
            roth_draw=roth_draw,
            taxed_income=taxed_income,
            tax=tax,
            penalty=rule.penalty_rate * (trad_draw + roth_draw),
            subsidy=subsidy,
            irmaa=irmaa,
            outside=outside,
            shortfall=shortfall,
            trad_end=max(0.0, trad - rmd - conversion - trad_draw) * (1 + g),
            roth_end=max(0.0, roth + conversion - roth_free - roth_draw) * (1 + g),
        )
        return flow, basis

    # ── The whole plan ──────────────────────────────────────────────────────

    def flows(self, conversions: list[float], years: list[YearRule] | None = None):
        """Each year's flow for a conversion schedule (one amount per timeline year)."""
        trad = self.scenario.traditional_ira_balance
        roth = self.scenario.roth_ira_balance
        # Penalty-free Roth money: the existing balance (treated as contributions),
        # then each conversion once five tax years have passed
        basis = roth
        out: list[YearFlow] = []
        for rule in self.years if years is None else years:
            t = rule.index
            if CONVERSION_SEASONING_YEARS <= t < self.n_timeline + CONVERSION_SEASONING_YEARS:
                basis += out[t - CONVERSION_SEASONING_YEARS].conversion
            asked = conversions[t] if t < self.n_timeline else 0.0
            flow, basis = self.step(rule, trad, roth, basis, asked)
            out.append(flow)
            trad, roth = flow.trad_end, flow.roth_end
        return out

    def discount(self, years: float) -> float:
        """Today's value of a dollar ``years`` from now: what would grow into it."""
        return (1 + self.growth) ** (-years)

    def value_of(self, flows: list[YearFlow]) -> float:
        """Today's value of the plan (see the module docstring)."""
        total = 0.0
        for flow in flows:
            rule = flow.rule
            total += (rule.from_accounts + flow.outside + flow.subsidy) * self.discount(rule.index)
            if flow.irmaa:
                total -= flow.irmaa * self.discount(rule.index + IRMAA_LOOKBACK_YEARS)
        last = flows[-1]
        left = last.trad_end * (1 - self.terminal_rate) + last.roth_end
        return total + left * self.discount(len(flows))

    def walk(self, conversions: list[float]) -> Walk:
        flows = self.flows(conversions)
        return Walk(
            flows=flows,
            value=self.value_of(flows),
            trad_end=flows[-1].trad_end,
            roth_end=flows[-1].roth_end,
        )

    @property
    def no_conversion(self) -> Walk:
        if self._no_conversion is None:
            self._no_conversion = self.walk([0.0] * self.n_timeline)
        return self._no_conversion

    @property
    def terminal_rate(self) -> float:
        """Combined federal and state marginal rate in the final plan year, on the
        income that year has without any conversions. Traditional money left at
        the end is worth ``1 - terminal_rate`` per dollar, and since the rate is
        fixed for the scenario every schedule values its leftover the same way."""
        if self._terminal_rate is None:
            flows = self.flows([0.0] * self.n_timeline)
            final = next(f for f in reversed(flows) if not f.rule.growth_only)
            tax = final.rule.tax.total
            rate = (tax(final.taxed_income + MARGINAL_STEP) - tax(final.taxed_income)) / (
                MARGINAL_STEP
            )
            self._terminal_rate = min(max(float(rate), 0.0), 0.99)
        return self._terminal_rate


def _penalty_rate(scenario: ScenarioInput, t: int) -> float:
    return EARLY_WITHDRAWAL_PENALTY * early_fraction(scenario, t)


def _build(scenario: ScenarioInput) -> Plan:
    scenario = resolve_states(scenario)
    n = len(scenario.timeline)
    g = scenario.real_growth_rate
    start_offset = scenario.drawdown_start_age - scenario.age
    owner_rmd_start = rmd_start_age(scenario.age, scenario.timeline[0].year)
    aca_years = aca_coverage_years(scenario)
    taxes = year_taxes(scenario)
    first_year = scenario.timeline[0].year

    # Without a spending figure, the 4% rule on the balance projected to the start
    # of withdrawals. The budget is what that withdrawal leaves after tax.
    four_percent = (
        (scenario.traditional_ira_balance + scenario.roth_ira_balance)
        * (1 + g) ** max(0, start_offset)
        * RETIREMENT_SPENDING_RATE
    )

    years: list[YearRule] = []
    for t, entry in enumerate(scenario.timeline):
        income = entry.gross_income
        tax = taxes[t]
        tax_on_income = float(tax.total(income))
        budget: float | None = None
        if entry.drawdown is not None:
            # An explicit draw is before tax: the budget is what it leaves
            gross = income + entry.drawdown
            budget = gross - float(tax.total(gross))
        elif t >= start_offset:
            if scenario.default_drawdown is not None:
                budget = scenario.default_drawdown
            else:
                gross = income + four_percent
                budget = gross - float(tax.total(gross))
        years.append(
            YearRule(
                index=t,
                year=entry.year,
                age=scenario.age + t,
                income=income,
                tax=tax,
                budget=budget,
                rmd_age=scenario.age + t >= owner_rmd_start,
                penalty_rate=_penalty_rate(scenario, t),
                aca=scenario.healthcare is not None and entry.year in aca_years,
                in_timeline=True,
                tax_on_income=tax_on_income,
                from_accounts=0.0 if budget is None else budget - (income - tax_on_income),
            )
        )

    # Years between the timeline and the start of withdrawals only grow
    phase_start = post_timeline_start(scenario)
    last_year = scenario.planning_horizon_age - scenario.age

    # The most a year can be taxed on: its income plus the whole traditional balance
    max_trad = scenario.traditional_ira_balance * (1 + max(g, 0.0)) ** max(
        n, phase_start, last_year + 1
    )
    plan = Plan(
        scenario=scenario,
        years=years,
        growth=g,
        n_timeline=n,
        max_income=max(y.income for y in years) + max_trad,
    )
    for t in range(n, phase_start):
        years.append(
            YearRule(
                index=t,
                year=first_year + t,
                age=scenario.age + t,
                income=0.0,
                tax=taxes[-1],
                budget=None,
                rmd_age=False,
                penalty_rate=0.0,
                aca=False,
                in_timeline=False,
                growth_only=True,
            )
        )
    if phase_start > last_year:
        return plan

    # Years after the timeline: no other income, spending from the accounts
    spending = scenario.default_drawdown
    if spending is None:
        start = plan.flows([0.0] * n)[-1]
        spending = (start.trad_end + start.roth_end) * RETIREMENT_SPENDING_RATE
    for t in range(phase_start, last_year + 1):
        tax = post_timeline_tax(scenario, t)
        budget = spending
        if scenario.default_drawdown is None:
            budget = spending - float(tax.total(spending))
        years.append(
            YearRule(
                index=t,
                year=first_year + t,
                age=scenario.age + t,
                income=0.0,
                tax=tax,
                budget=budget,
                rmd_age=scenario.age + t >= owner_rmd_start,
                penalty_rate=_penalty_rate(scenario, t),
                aca=False,
                in_timeline=False,
                from_accounts=budget,
            )
        )
    return plan


# Scenario id -> (scenario, plan). Holding the scenario keeps its id from being reused.
_plans: dict[int, tuple[ScenarioInput, Plan]] = {}
_MAX_PLANS = 64


def plan_for(scenario: ScenarioInput) -> Plan:
    """The prepared plan for a scenario, built once per scenario object."""
    cached = _plans.get(id(scenario))
    if cached is not None and cached[0] is scenario:
        return cached[1]
    plan = _build(scenario)
    if len(_plans) >= _MAX_PLANS:
        _plans.pop(next(iter(_plans)))
    _plans[id(scenario)] = (scenario, plan)
    return plan


def walk(scenario: ScenarioInput, conversions: list[float]) -> Walk:
    """Carry a conversion schedule through every year of the scenario's plan."""
    return plan_for(scenario).walk(conversions)
