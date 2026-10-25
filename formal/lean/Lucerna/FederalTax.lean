/-
Federal income tax: backend/app/engine/tax.py.

The engine has two implementations of the bracket sum:

* `calculate_federal_tax` walks the brackets and stops at the first one whose
  `min` the income does not pass (`loopTax` below);
* `vectorized_federal_tax` adds `max(0, min(x, max) - min) * rate` over every
  bracket (`vecTax`), with the top bracket's `inf` replaced by 1e18.

The DP optimizer uses the vectorized one on grids and the trace and the
results use the loop, so they must agree. `loop_eq_vec` proves they do for any
table whose `min`s ascend and whose brackets are non-empty; the Python test
`test_bracket_tables_meet_the_lean_premises` checks the shipped tables meet
those premises. Amounts are whole dollars and rates whole percent, so a tax
here is 100 times the dollar figure.

Then, for the shipped 2026 tables, the properties the bracket-fill heuristic
and the optimizer rely on:

* more income never means less tax (`fed_mono`),
* one more dollar never costs more than the top rate (`fed_slope_le_top`),
* one more dollar costs at least the rate `get_marginal_rate` reports
  (`fed_slope_ge_marginal`), which is what makes "fill the bracket" safe.
-/

namespace Lucerna.FederalTax

structure Bracket where
  lo : Int
  hi : Int
  rate : Int

/-- `calculate_federal_tax`'s loop: stop at the first bracket the income doesn't enter. -/
def loopTax : List Bracket → Int → Int
  | [], _ => 0
  | b :: bs, x => if x ≤ b.lo then 0 else (min x b.hi - b.lo) * b.rate + loopTax bs x

/-- `vectorized_federal_tax`: every bracket contributes, clipped at zero. -/
def vecTax : List Bracket → Int → Int
  | [], _ => 0
  | b :: bs, x => max 0 (min x b.hi - b.lo) * b.rate + vecTax bs x

/-- Brackets at or above `x` contribute nothing. -/
theorem vecTax_zero_below (x : Int) :
    ∀ bs : List Bracket, (∀ c ∈ bs, x ≤ c.lo) → vecTax bs x = 0
  | [], _ => rfl
  | c :: cs, h => by
    have hc : x ≤ c.lo := h c (List.mem_cons_self ..)
    have hcs : ∀ d ∈ cs, x ≤ d.lo := fun d hd => h d (List.mem_cons_of_mem _ hd)
    have hz : max 0 (min x c.hi - c.lo) = 0 := by omega
    simp only [vecTax, hz, Int.zero_mul, Int.zero_add]
    exact vecTax_zero_below x cs hcs

/-- The two implementations agree on any table with ascending, non-empty brackets. -/
theorem loop_eq_vec (x : Int) :
    ∀ bs : List Bracket,
      bs.Pairwise (fun a b => a.lo ≤ b.lo) → (∀ b ∈ bs, b.lo ≤ b.hi) →
      loopTax bs x = vecTax bs x
  | [], _, _ => rfl
  | b :: bs, hs, hw => by
    have hb : b.lo ≤ b.hi := hw b (List.mem_cons_self ..)
    have hws : ∀ c ∈ bs, c.lo ≤ c.hi := fun c hc => hw c (List.mem_cons_of_mem _ hc)
    have hsorted := List.pairwise_cons.mp hs
    by_cases hx : x ≤ b.lo
    · have hrest : vecTax bs x = 0 :=
        vecTax_zero_below x bs (fun c hc => Int.le_trans hx (hsorted.1 c hc))
      have hz : max 0 (min x b.hi - b.lo) = 0 := by omega
      simp only [loopTax, vecTax, hx, ite_true, hz, Int.zero_mul, hrest, Int.zero_add]
    · have hm : max 0 (min x b.hi - b.lo) = min x b.hi - b.lo := by omega
      simp only [loopTax, vecTax, hx, ite_false, hm]
      rw [loop_eq_vec x bs hsorted.2 hws]

/-! ### The 2026 tables

Each bracket's share of income is `g lo w x = clamp(x - lo, 0, w)`. Working
with `g` as an opaque atom keeps `omega`'s case splits small. -/

/-- The part of `x` that falls in `[lo, lo + w]`. -/
def g (lo w x : Int) : Int := max 0 (min (x - lo) w)

theorem g_eq (lo hi x : Int) : max 0 (min x hi - lo) = g lo (hi - lo) x := by
  unfold g; omega

theorem g_eq' (lo hi w x : Int) (hw : hi - lo = w) : max 0 (min x hi - lo) = g lo w x := by
  unfold g; omega

theorem g_mono {lo w x y : Int} (h : x ≤ y) : g lo w x ≤ g lo w y := by unfold g; omega
theorem g_nonneg (lo w x : Int) : 0 ≤ g lo w x := by unfold g; omega
theorem g_le {lo w x : Int} (hw : 0 ≤ w) : g lo w x ≤ w := by unfold g; omega
theorem g_full {lo w x : Int} (hw : 0 ≤ w) (h : lo + w ≤ x) : g lo w x = w := by unfold g; omega
theorem g_inside {lo w x : Int} (h1 : lo ≤ x) (h2 : x ≤ lo + w) : g lo w x = x - lo := by
  unfold g; omega
theorem g_empty {lo w x : Int} (h : x ≤ lo) : g lo w x = 0 := by unfold g; omega
/-- Between two incomes a bracket gains at most what the income gained. -/
theorem g_slope {lo w x y : Int} (hw : 0 ≤ w) (h : x ≤ y) : g lo w y - g lo w x ≤ y - x := by
  unfold g; omega

/-- Upper end of the top bracket, as in `vectorized_federal_tax` (any large value works). -/
def TOP : Int := 1000000000000

/-- 2026 single brackets (backend/data/tax_brackets_2026.json), tax times 100. -/
def single : List Bracket :=
  [⟨0, 12400, 10⟩, ⟨12400, 50400, 12⟩, ⟨50400, 105700, 22⟩, ⟨105700, 201775, 24⟩,
   ⟨201775, 256225, 32⟩, ⟨256225, 640600, 35⟩, ⟨640600, TOP, 37⟩]

/-- 2026 married filing jointly brackets. -/
def mfj : List Bracket :=
  [⟨0, 24800, 10⟩, ⟨24800, 100800, 12⟩, ⟨100800, 211400, 22⟩, ⟨211400, 403550, 24⟩,
   ⟨403550, 512450, 32⟩, ⟨512450, 768700, 35⟩, ⟨768700, TOP, 37⟩]

theorem single_sorted : single.Pairwise (fun a b => a.lo ≤ b.lo) := by decide
theorem mfj_sorted : mfj.Pairwise (fun a b => a.lo ≤ b.lo) := by decide

/-- `vecTax` on a 7-bracket table, written with `g`. -/
def tax7 (b : List Bracket) (x : Int) : Int :=
  ((b.map fun c => g c.lo (c.hi - c.lo) x * c.rate).foldr (· + ·) 0)

theorem vecTax_eq_tax7 (bs : List Bracket) (x : Int) : vecTax bs x = tax7 bs x := by
  induction bs with
  | nil => rfl
  | cons c cs ih =>
    simp only [vecTax, tax7, List.map_cons, List.foldr_cons] at *
    rw [g_eq, ih]

/-- Taxable income after the standard deduction, as `calculate_federal_tax` computes it. -/
def taxable (deduction gross : Int) : Int := max 0 (gross - deduction)

/-- The single schedule as a closed sum over the seven bracket shares. -/
theorem single_tax (x : Int) :
    vecTax single x =
      g 0 12400 x * 10 + g 12400 38000 x * 12 + g 50400 55300 x * 22 + g 105700 96075 x * 24 +
      g 201775 54450 x * 32 + g 256225 384375 x * 35 + g 640600 (TOP - 640600) x * 37 := by
  simp only [single, vecTax]
  rw [g_eq' 0 12400 12400 x (by decide), g_eq' 12400 50400 38000 x (by decide), g_eq' 50400 105700 55300 x (by decide), g_eq' 105700 201775 96075 x (by decide), g_eq' 201775 256225 54450 x (by decide), g_eq' 256225 640600 384375 x (by decide), g_eq' 640600 TOP (TOP - 640600) x rfl]
  omega

theorem mfj_tax (x : Int) :
    vecTax mfj x =
      g 0 24800 x * 10 + g 24800 76000 x * 12 + g 100800 110600 x * 22 + g 211400 192150 x * 24 +
      g 403550 108900 x * 32 + g 512450 256250 x * 35 + g 768700 (TOP - 768700) x * 37 := by
  simp only [mfj, vecTax]
  rw [g_eq' 0 24800 24800 x (by decide), g_eq' 24800 100800 76000 x (by decide), g_eq' 100800 211400 110600 x (by decide), g_eq' 211400 403550 192150 x (by decide), g_eq' 403550 512450 108900 x (by decide), g_eq' 512450 768700 256250 x (by decide), g_eq' 768700 TOP (TOP - 768700) x rfl]
  omega

/-- More income never means less tax. -/
theorem fed_mono_single {x y : Int} (h : x ≤ y) : vecTax single x ≤ vecTax single y := by
  rw [single_tax, single_tax]
  have := @g_mono 0 12400 _ _ h; have := @g_mono 12400 38000 _ _ h
  have := @g_mono 50400 55300 _ _ h; have := @g_mono 105700 96075 _ _ h
  have := @g_mono 201775 54450 _ _ h; have := @g_mono 256225 384375 _ _ h
  have := @g_mono 640600 (TOP - 640600) _ _ h
  omega

theorem fed_mono_mfj {x y : Int} (h : x ≤ y) : vecTax mfj x ≤ vecTax mfj y := by
  rw [mfj_tax, mfj_tax]
  have := @g_mono 0 24800 _ _ h; have := @g_mono 24800 76000 _ _ h
  have := @g_mono 100800 110600 _ _ h; have := @g_mono 211400 192150 _ _ h
  have := @g_mono 403550 108900 _ _ h; have := @g_mono 512450 256250 _ _ h
  have := @g_mono 768700 (TOP - 768700) _ _ h
  omega

/-- The bracket shares of a contiguous table add up to the income itself (below TOP). -/
theorem single_shares {x : Int} (h0 : 0 ≤ x) (ht : x ≤ TOP) :
    g 0 12400 x + g 12400 38000 x + g 50400 55300 x + g 105700 96075 x +
      g 201775 54450 x + g 256225 384375 x + g 640600 (TOP - 640600) x = x := by
  unfold g; simp only [TOP] at *; omega

theorem mfj_shares {x : Int} (h0 : 0 ≤ x) (ht : x ≤ TOP) :
    g 0 24800 x + g 24800 76000 x + g 100800 110600 x + g 211400 192150 x +
      g 403550 108900 x + g 512450 256250 x + g 768700 (TOP - 768700) x = x := by
  unfold g; simp only [TOP] at *; omega

/-- One more dollar of taxable income never costs more than 37 cents. -/
theorem fed_slope_le_top_single {x y : Int} (h0 : 0 ≤ x) (h : x ≤ y) (ht : y ≤ TOP) :
    vecTax single y - vecTax single x ≤ 37 * (y - x) := by
  rw [single_tax, single_tax]
  have hx := single_shares h0 (Int.le_trans h ht)
  have hy := single_shares (Int.le_trans h0 h) ht
  have := @g_mono 0 12400 _ _ h; have := @g_mono 12400 38000 _ _ h
  have := @g_mono 50400 55300 _ _ h; have := @g_mono 105700 96075 _ _ h
  have := @g_mono 201775 54450 _ _ h; have := @g_mono 256225 384375 _ _ h
  have := @g_mono 640600 (TOP - 640600) _ _ h
  omega

theorem fed_slope_le_top_mfj {x y : Int} (h0 : 0 ≤ x) (h : x ≤ y) (ht : y ≤ TOP) :
    vecTax mfj y - vecTax mfj x ≤ 37 * (y - x) := by
  rw [mfj_tax, mfj_tax]
  have hx := mfj_shares h0 (Int.le_trans h ht)
  have hy := mfj_shares (Int.le_trans h0 h) ht
  have := @g_mono 0 24800 _ _ h; have := @g_mono 24800 76000 _ _ h
  have := @g_mono 100800 110600 _ _ h; have := @g_mono 211400 192150 _ _ h
  have := @g_mono 403550 108900 _ _ h; have := @g_mono 512450 256250 _ _ h
  have := @g_mono 768700 (TOP - 768700) _ _ h
  omega

/-- `get_marginal_rate`: the rate of the bracket with `min <= x < max`, else the top rate. -/
def marginal : List Bracket → Int → Int
  | [], _ => 37
  | b :: bs, x => if b.lo ≤ x ∧ x < b.hi then b.rate else marginal bs x

/-- Converting `y - x` more dollars costs at least the reported marginal rate on each of
them. This is the convexity the bracket-fill heuristic leans on: the next dollar is never
cheaper than the one before it. -/
theorem fed_slope_ge_marginal_single {x y : Int} (h0 : 0 ≤ x) (h : x ≤ y) (ht : y ≤ TOP) :
    marginal single x * (y - x) ≤ vecTax single y - vecTax single x := by
  rw [single_tax, single_tax]
  have hx := single_shares h0 (Int.le_trans h ht)
  have hy := single_shares (Int.le_trans h0 h) ht
  have := @g_mono 0 12400 _ _ h; have := @g_mono 12400 38000 _ _ h
  have := @g_mono 50400 55300 _ _ h; have := @g_mono 105700 96075 _ _ h
  have := @g_mono 201775 54450 _ _ h; have := @g_mono 256225 384375 _ _ h
  have := @g_mono 640600 (TOP - 640600) _ _ h
  have f1 : 12400 ≤ x → g 0 12400 x = 12400 := fun hh => g_full (by decide) (by omega)
  have f2 : 50400 ≤ x → g 12400 38000 x = 38000 := fun hh => g_full (by decide) (by omega)
  have f3 : 105700 ≤ x → g 50400 55300 x = 55300 := fun hh => g_full (by decide) (by omega)
  have f4 : 201775 ≤ x → g 105700 96075 x = 96075 := fun hh => g_full (by decide) (by omega)
  have f5 : 256225 ≤ x → g 201775 54450 x = 54450 := fun hh => g_full (by decide) (by omega)
  have f6 : 640600 ≤ x → g 256225 384375 x = 384375 := fun hh => g_full (by decide) (by omega)
  have u1 := @g_le 0 12400 y (by decide); have u2 := @g_le 12400 38000 y (by decide)
  have u3 := @g_le 50400 55300 y (by decide); have u4 := @g_le 105700 96075 y (by decide)
  have u5 := @g_le 201775 54450 y (by decide); have u6 := @g_le 256225 384375 y (by decide)
  have e2 : x ≤ 12400 → g 12400 38000 x = 0 := fun hh => g_empty hh
  have e3 : x ≤ 50400 → g 50400 55300 x = 0 := fun hh => g_empty hh
  have e4 : x ≤ 105700 → g 105700 96075 x = 0 := fun hh => g_empty hh
  have e5 : x ≤ 201775 → g 201775 54450 x = 0 := fun hh => g_empty hh
  have e6 : x ≤ 256225 → g 256225 384375 x = 0 := fun hh => g_empty hh
  have e7 : x ≤ 640600 → g 640600 (TOP - 640600) x = 0 := fun hh => g_empty hh
  simp only [marginal, single, TOP] at *
  repeat' split
  all_goals omega

theorem fed_slope_ge_marginal_mfj {x y : Int} (h0 : 0 ≤ x) (h : x ≤ y) (ht : y ≤ TOP) :
    marginal mfj x * (y - x) ≤ vecTax mfj y - vecTax mfj x := by
  rw [mfj_tax, mfj_tax]
  have hx := mfj_shares h0 (Int.le_trans h ht)
  have hy := mfj_shares (Int.le_trans h0 h) ht
  have := @g_mono 0 24800 _ _ h; have := @g_mono 24800 76000 _ _ h
  have := @g_mono 100800 110600 _ _ h; have := @g_mono 211400 192150 _ _ h
  have := @g_mono 403550 108900 _ _ h; have := @g_mono 512450 256250 _ _ h
  have := @g_mono 768700 (TOP - 768700) _ _ h
  have f1 : 24800 ≤ x → g 0 24800 x = 24800 := fun hh => g_full (by decide) (by omega)
  have f2 : 100800 ≤ x → g 24800 76000 x = 76000 := fun hh => g_full (by decide) (by omega)
  have f3 : 211400 ≤ x → g 100800 110600 x = 110600 := fun hh => g_full (by decide) (by omega)
  have f4 : 403550 ≤ x → g 211400 192150 x = 192150 := fun hh => g_full (by decide) (by omega)
  have f5 : 512450 ≤ x → g 403550 108900 x = 108900 := fun hh => g_full (by decide) (by omega)
  have f6 : 768700 ≤ x → g 512450 256250 x = 256250 := fun hh => g_full (by decide) (by omega)
  have u1 := @g_le 0 24800 y (by decide); have u2 := @g_le 24800 76000 y (by decide)
  have u3 := @g_le 100800 110600 y (by decide); have u4 := @g_le 211400 192150 y (by decide)
  have u5 := @g_le 403550 108900 y (by decide); have u6 := @g_le 512450 256250 y (by decide)
  have e2 : x ≤ 24800 → g 24800 76000 x = 0 := fun hh => g_empty hh
  have e3 : x ≤ 100800 → g 100800 110600 x = 0 := fun hh => g_empty hh
  have e4 : x ≤ 211400 → g 211400 192150 x = 0 := fun hh => g_empty hh
  have e5 : x ≤ 403550 → g 403550 108900 x = 0 := fun hh => g_empty hh
  have e6 : x ≤ 512450 → g 512450 256250 x = 0 := fun hh => g_empty hh
  have e7 : x ≤ 768700 → g 768700 (TOP - 768700) x = 0 := fun hh => g_empty hh
  simp only [marginal, mfj, TOP] at *
  repeat' split
  all_goals omega

end Lucerna.FederalTax
