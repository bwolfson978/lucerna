/-
When required minimum distributions start: backend/app/engine/rmd.py.

`rmd_start_age(current_age, current_year)` finds the birth year as
`current_year - current_age` and applies the SECURE 2.0 rules from
backend/data/rmd_tables.json. Every engine caller passes the plan's first year,
`rmd_start_age(scenario.age, scenario.timeline[0].year)`.

The specification: the start age depends on the person's birth year, which is
the plan's first year minus their age. `engine_meets_spec` proves the code
meets it for every plan year.

Before PR #198 callers passed only the age, so the year was always 2026
(`oldEngine`). `old_engine_misses_spec_from_2027` and `old_wrong_exactly_when`
keep the counterexample that found it: from 2027 a 67-year-old (born 1960,
RMDs at 75) was given RMDs from 73.
-/

namespace Lucerna.RmdStartAge

/-- SECURE 2.0 start age by birth year (rmd_tables.json `start_age_rules`). -/
def ruleFor (birthYear : Int) : Int :=
  if birthYear ≤ 1950 then 72 else if birthYear ≤ 1959 then 73 else 75

/-- What it should compute for a plan whose first year is `planYear`. -/
def spec (age planYear : Int) : Int := ruleFor (planYear - age)

/-- What the engine computes: `rmd_start_age(scenario.age, scenario.timeline[0].year)`. -/
def engine (age planYear : Int) : Int := ruleFor (planYear - age)

theorem engine_meets_spec (age planYear : Int) : engine age planYear = spec age planYear := rfl

/-- The engine before PR #198: `rmd_start_age(scenario.age)`, year defaulting to 2026. -/
def oldEngine (age : Int) : Int := ruleFor (2026 - age)

theorem old_engine_meets_spec_in_2026 (age : Int) : oldEngine age = spec age 2026 := rfl

theorem old_engine_misses_spec_from_2027 : oldEngine 67 = 73 ∧ spec 67 2027 = 75 := by decide

/-- The start age never decreases for later birth years, and is 72 to 75. -/
theorem rule_mono {y y' : Int} (h : y ≤ y') : ruleFor y ≤ ruleFor y' := by
  unfold ruleFor; split <;> split <;> (try split) <;> (try split) <;> omega

theorem rule_range (y : Int) : 72 ≤ ruleFor y ∧ ruleFor y ≤ 75 := by
  unfold ruleFor; split <;> (try split) <;> omega

/-- For a plan starting in 2027, the old engine was wrong for exactly the people born in
1951 and 1960: those turning 76 and 67 that year. In 2028 it is born 1951-1952 and
1960-1961, and so on: one more birth year each January. -/
theorem old_wrong_exactly_when (age : Int) :
    oldEngine age ≠ spec age 2027 ↔ (age = 76 ∨ age = 67) := by
  unfold oldEngine spec ruleFor
  constructor
  · intro h; split at h <;> split at h <;> (try split at h) <;> (try split at h) <;> omega
  · intro h; rcases h with h | h <;> subst h <;> decide

end Lucerna.RmdStartAge
