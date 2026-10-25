/-
When required minimum distributions start: backend/app/engine/rmd.py.

`rmd_start_age(current_age, current_year=2026)` finds the birth year as
`current_year - current_age` and applies the SECURE 2.0 rules from
backend/data/rmd_tables.json. Every engine caller passes only the age
(`rmd_start_age(scenario.age)`), so the year is always 2026, while the plan
itself starts in `timeline[0].year`, which the tools set to the current
calendar year (`app.tools.draft.current_year`).

The specification: the start age depends on the person's birth year, which is
the plan's first year minus their age. `engine_meets_spec_in_2026` proves the
code meets it for plans starting in 2026. `engine_misses_spec_from_2027` shows
it does not for plans starting in 2027: a 67-year-old (born 1960, RMDs at 75)
is given RMDs from 73. `wrong_exactly_when` says which people are affected.
-/

namespace Lucerna.RmdStartAge

/-- SECURE 2.0 start age by birth year (rmd_tables.json `start_age_rules`). -/
def ruleFor (birthYear : Int) : Int :=
  if birthYear ≤ 1950 then 72 else if birthYear ≤ 1959 then 73 else 75

/-- What the engine computes: `rmd_start_age(scenario.age)`, year defaulting to 2026. -/
def engine (age : Int) : Int := ruleFor (2026 - age)

/-- What it should compute for a plan whose first year is `planYear`. -/
def spec (age planYear : Int) : Int := ruleFor (planYear - age)

theorem engine_meets_spec_in_2026 (age : Int) : engine age = spec age 2026 := rfl

theorem engine_misses_spec_from_2027 : engine 67 = 73 ∧ spec 67 2027 = 75 := by decide

/-- The start age never decreases for later birth years, and is 72 to 75. -/
theorem rule_mono {y y' : Int} (h : y ≤ y') : ruleFor y ≤ ruleFor y' := by
  unfold ruleFor; split <;> split <;> (try split) <;> (try split) <;> omega

theorem rule_range (y : Int) : 72 ≤ ruleFor y ∧ ruleFor y ≤ 75 := by
  unfold ruleFor; split <;> (try split) <;> omega

/-- For a plan starting in 2027, the engine is wrong for exactly the people born in
1951 and 1960: those turning 76 and 67 that year. In 2028 it is born 1951-1952 and
1960-1961, and so on: one more birth year each January. -/
theorem wrong_exactly_when (age : Int) :
    engine age ≠ spec age 2027 ↔ (age = 76 ∨ age = 67) := by
  unfold engine spec ruleFor
  constructor
  · intro h; split at h <;> split at h <;> (try split at h) <;> (try split at h) <;> omega
  · intro h; rcases h with h | h <;> subst h <;> decide

end Lucerna.RmdStartAge
