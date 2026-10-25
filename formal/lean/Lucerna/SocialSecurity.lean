/-
Taxable Social Security: `taxable_social_security` in backend/app/engine/year_tax.py.

The engine computes the taxable part of benefits with a closed form. Here it is
checked against the IRS's own procedure, Worksheet 1 in Publication 915, line
by line, and shown to have the properties the optimizer needs:

* `code_eq_worksheet`: the closed form equals the worksheet,
* `taxable_bounds`: never negative, never more than 85% of benefits,
* `taxable_mono`: more other income never makes less of the benefit taxable,
* `taxable_slope`: one more dollar of other income makes at most 85 cents of
  benefits taxable, so the function has no jumps at the two thresholds.

Units: every amount is 200 times dollars, so halves and 85% of the inputs are
whole numbers. `o` is other income, `b` the benefit, `lo` and `hi` the two
provisional income thresholds (after `fixed_scale`).
-/

set_option linter.unusedVariables false

namespace Lucerna.SocialSecurity

/-- Provisional income, times 200: other income plus half the benefit. -/
def prov (o b : Int) : Int := 200 * o + 100 * b

/-- The engine's formula, transcribed from `taxable_social_security`. -/
def code (lo hi o b : Int) : Int :=
  let p := prov o b
  let L := 200 * lo
  let H := 200 * hi
  let B := 200 * b
  let middle := min ((p - L) / 2) (B / 2)
  let upper := min (85 * B / 100) (85 * (p - H) / 100 + min (B / 2) ((H - L) / 2))
  if p ≤ L then 0 else if p ≤ H then middle else upper

/-- IRS Publication 915, Worksheet 1, lines 9 to 20 (no exclusions or adjustments). -/
def worksheet (lo hi o b : Int) : Int :=
  let line2 := 200 * b / 2
  let line9 := prov o b
  let line10 := 200 * lo
  if line10 ≥ line9 then 0 else
  let line11 := line9 - line10
  let line12 := 200 * hi - 200 * lo
  let line13 := max 0 (line11 - line12)
  let line14 := min line11 line12
  let line15 := line14 / 2
  let line16 := min line2 line15
  let line17 := 85 * line13 / 100
  let line18 := line16 + line17
  let line19 := 85 * (200 * b) / 100
  min line18 line19

theorem code_eq_worksheet (lo hi o b : Int) (hb : 0 ≤ b) (hlh : lo ≤ hi) :
    code lo hi o b = worksheet lo hi o b := by
  unfold code worksheet prov; simp only []; omega

theorem taxable_bounds (lo hi o b : Int) (hb : 0 ≤ b) (hlh : lo ≤ hi) :
    0 ≤ code lo hi o b ∧ code lo hi o b ≤ 85 * (200 * b) / 100 := by
  unfold code prov; simp only []; omega

theorem taxable_mono (lo hi o o' b : Int) (hb : 0 ≤ b) (hlh : lo ≤ hi) (h : o ≤ o') :
    code lo hi o b ≤ code lo hi o' b := by
  unfold code prov; simp only []; omega

/-- 85 cents per dollar, in the 200x units: 200 * 0.85 = 170. -/
theorem taxable_slope (lo hi o o' b : Int) (hb : 0 ≤ b) (hlh : lo ≤ hi) (h : o ≤ o') :
    code lo hi o' b - code lo hi o b ≤ 170 * (o' - o) := by
  unfold code prov; simp only []; omega

end Lucerna.SocialSecurity
