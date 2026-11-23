/-
Who pays the conversion tax: the valuation in `_npv_parts`
(backend/app/engine/optimizer.py) and the dynamic programming search.

A small world: one traditional balance `B`, one conversion `c` today, one flat
tax rate `a / b` on every traditional dollar, now or later. By the end of the
plan an invested dollar has become `G` dollars, and a dollar at the end of the
plan is worth `1 / D` today (so `D` is the discount factor over the same years).
Amounts are whole dollars; every value below is `b` times the dollar figure so
the flat rate needs no division.

With one flat rate there is nothing to gain from converting: the tax is the
same share of the same money whenever it is paid. So a correct valuation must
show zero gain for every `c`, whatever the return and the discount rate are.

* `old_gain`: the earlier engine subtracted the tax at today's value while the
  converted money grew, so a conversion showed a gain of `a * c * (G - D)`:
  positive whenever the return beats the discount rate (`old_breaks_neutrality`).
* `income_neutral`: tax paid from income and carried to the end of the plan at
  the investment return shows no gain.
* `accounts_neutral`: tax taken out of the converted money shows no gain.

Then the yearly withdrawal that nets the budget after tax:

* `net_strict_mono`: when a dollar withdrawn never costs a dollar or more in
  tax and penalty, a larger withdrawal always leaves more to spend, so
* `gross_up_unique`: there is at most one withdrawal that meets a budget, and
  every engine path that finds one finds the same one.
-/

namespace Lucerna.TaxPayment

/-- After-tax wealth at the end of the plan, times `b`: the traditional balance
    left is taxed at `a / b`, the Roth balance is not. -/
def endWealth (a b G trad roth : Int) : Int := (b - a) * (trad * G) + b * (roth * G)

/-- The earlier engine, times `b * D`: end wealth with the whole conversion in the
    Roth account, less the tax `a * c / b` at today's value. -/
def oldValue (a b G D B c : Int) : Int := endWealth a b G (B - c) c - a * c * D

/-- Tax paid from income, carried to the end of the plan at the investment return. -/
def incomeValue (a b G B c : Int) : Int := endWealth a b G (B - c) c - a * c * G

/-- Tax taken out of the converted money: the Roth account receives `c - a * c / b`.
    Times `b`, so the Roth term is `(b - a) * c` before the outer `b` is divided out. -/
def accountsValue (a b G B c : Int) : Int := (b - a) * ((B - c) * G) + (b - a) * (c * G)

theorem old_gain (a b G D B c : Int) :
    oldValue a b G D B c - oldValue a b G D B 0 = a * c * (G - D) := by
  unfold oldValue endWealth; grind

/-- The earlier engine showed a gain from any conversion at a flat rate whenever
    the return beat the discount rate. -/
theorem old_breaks_neutrality (a b G D B c : Int) (ha : 0 < a) (hc : 0 < c) (h : D < G) :
    oldValue a b G D B 0 < oldValue a b G D B c := by
  have hg := old_gain a b G D B c
  have hpos : 0 < a * c * (G - D) :=
    Int.mul_pos (Int.mul_pos ha hc) (by omega)
  omega

theorem income_neutral (a b G B c : Int) :
    incomeValue a b G B c = incomeValue a b G B 0 := by
  unfold incomeValue endWealth; grind

theorem accounts_neutral (a b G B c : Int) :
    accountsValue a b G B c = accountsValue a b G B 0 := by
  unfold accountsValue; grind

/-- Both ways of paying give the same end wealth as never converting. -/
theorem income_eq_accounts (a b G B c : Int) :
    incomeValue a b G B c = accountsValue a b G B c := by
  unfold incomeValue accountsValue endWealth; grind

/-- What a withdrawal `w` on top of income `base` leaves to spend, times 100:
    the withdrawal less its tax and a penalty of `p` percent. -/
def net (T : Int → Int) (p base w : Int) : Int :=
  100 * w - 100 * (T (base + w) - T base) - p * w

/-- If one more dollar of income never adds more than `k` cents of tax, and `k`
    plus the penalty rate is under 100, a larger withdrawal leaves more to spend. -/
theorem net_strict_mono (T : Int → Int) (k p base w w' : Int)
    (hT : ∀ x y, x ≤ y → 100 * (T y - T x) ≤ k * (y - x))
    (hk : k + p < 100) (hw : w < w') :
    net T p base w < net T p base w' := by
  have h := hT (base + w) (base + w') (by omega)
  unfold net
  have e : base + w' - (base + w) = w' - w := by omega
  rw [e] at h
  have hd : 0 < w' - w := by omega
  have hk' : k * (w' - w) + p * (w' - w) < 100 * (w' - w) := by
    have := Int.mul_lt_mul_of_pos_right hk hd
    rw [Int.add_mul] at this
    exact this
  have e2 : p * w' - p * w = p * (w' - w) := by rw [Int.mul_sub]
  omega

/-- At most one withdrawal meets a budget. -/
theorem gross_up_unique (T : Int → Int) (k p base w w' need : Int)
    (hT : ∀ x y, x ≤ y → 100 * (T y - T x) ≤ k * (y - x))
    (hk : k + p < 100)
    (h1 : net T p base w = need) (h2 : net T p base w' = need) : w = w' := by
  rcases Int.lt_trichotomy w w' with h | h | h
  · have := net_strict_mono T k p base w w' hT hk h; omega
  · exact h
  · have := net_strict_mono T k p base w' w hT hk h; omega

end Lucerna.TaxPayment
