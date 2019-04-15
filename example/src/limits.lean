import data.real.basic
import algebra.pi_instances
import tactic.linarith
import xenalib.M1P1 

noncomputable theory
local attribute [instance, priority 0] classical.prop_decidable

namespace M1P1

notation `|` x `|` := abs x

definition is_limit (a : ℕ → ℝ) (l : ℝ) : Prop :=
∀ ε > 0, ∃ N, ∀ n ≥ N, | a n - l | < ε

definition has_limit (a : ℕ → ℝ) : Prop := ∃ l : ℝ, is_limit a l

lemma tendsto_const (a : ℝ) : is_limit (λ n, a) a :=
begin
  intros ε εpos,
  use 0,
  intros n _,
  simpa using εpos
end

local attribute [-simp] sub_eq_add_neg
local attribute [simp] sub_zero

lemma tendsto_iff_sub_tendsto_zero {a : ℕ → ℝ} {l : ℝ} :
  is_limit (λ n, a n - l) 0 ↔ is_limit a l :=
begin
  split ; 
  { intros h ε εpos,
    rcases h ε εpos with ⟨N, H⟩,
    use N,
    intros n hn,
    simpa using H n hn }
end

lemma tendsto_of_mul_eps (a : ℕ → ℝ) (l : ℝ) (A : ℝ)
  (h : ∀ ε > 0, ∃ N, ∀ n ≥ N, | a n - l | < A*ε) : is_limit a l :=
begin
  intros ε εpos,
  cases le_or_gt A 0 with Anonpos Apos,
  { 
    exfalso,
    rcases h 1 (by linarith) with ⟨N, H⟩,
    specialize H N (by linarith),
    have : |a N - l| ≥ 0, from abs_nonneg _,
    linarith },
  { 
    rcases h (ε/A) (div_pos εpos Apos) with ⟨N, H⟩,
    rw mul_div_cancel' _ (ne_of_gt Apos) at H,
    tauto }
end

lemma zero_of_abs_lt_all (x : ℝ) (h : ∀ ε > 0, |x| < ε) : x = 0 :=
eq_zero_of_abs_eq_zero $ eq_of_le_of_forall_le_of_dense (abs_nonneg x) $ λ ε ε_pos, le_of_lt (h ε ε_pos)

theorem limits_are_unique (a : ℕ → ℝ) (l m : ℝ) (hl : is_limit a l)
(hm : is_limit a m) : l = m :=
begin
--l = m
  suffices : ∀ ε : ℝ, ε > 0 → |l - m| < ε,
    from eq_of_sub_eq_zero (zero_of_abs_lt_all _ this),
  intros ε ε_pos,
  cases hl (ε/2) (by obvious_ineq) with Nₗ Hₗ,
  cases hm (ε/2) (by obvious_ineq) with Nₘ Hₘ,
  let N := max Nₗ Nₘ,
  have H₁ : Nₗ ≤ N := by obvious_ineq,
  have H : | a N - l| < ε/2 := Hₗ N H₁,
  have H₂ : Nₘ ≤ N := by obvious_ineq,
  have H' : | a N - m| < ε/2 := Hₘ N H₂,
  calc 
    |l - m| = |(l - a N) + (a N - m)| : by ring
        ... ≤ |l - a N| + |a N - m|   : abs_add _ _
        ... = |a N - l | + |a N - m|  : by rw abs_sub
        ... < ε/2 + ε/2               : by obvious_ineq
        ... = ε                       : by ring,
end

theorem tendsto_add (a : ℕ → ℝ) (b : ℕ → ℝ) (l m : ℝ)
  (h1 : is_limit a l) (h2 : is_limit b m) :
  is_limit (a + b) (l + m) :=
begin
  apply tendsto_of_mul_eps,
  intros ε Hε,
  cases (h1 ε Hε) with M₁ HM₁,
  cases (h2 ε Hε) with M₂ HM₂,
  let N := max M₁ M₂,
  use N,
  have H₁ : N ≥ M₁ := by obvious_ineq,
  have H₂ : N ≥ M₂ := by obvious_ineq,
  intros n Hn,
  have Hn₁ : n ≥ M₁ := by linarith,
  have H3 : |a n - l| < ε := HM₁ n Hn₁,
  have H4 : |b n - m| < ε := HM₂ n (by linarith),
  calc |(a + b) n - (l + m)| = |(a n - l) + (b n - m)| : by ring
  ...                        ≤ |(a n - l)| + |(b n - m)| : abs_add _ _
  ...                        < ε + ε : by linarith 
  ...                        = 2*ε : by ring
end


definition has_bound (a : ℕ → ℝ) (B : ℝ) := ∀ n, |a n| ≤ B
definition is_bounded (a : ℕ → ℝ) := ∃ B, has_bound a B

lemma has_bound_const (m : ℝ): has_bound (λ n, m) $ |m|  :=
assume n, by simp

open finset
theorem bounded_of_convergent (a : ℕ → ℝ) (Ha : has_limit a) : is_bounded a :=
begin
  cases Ha with l Hl,
  cases Hl 1 (zero_lt_one) with N HN,
  let X := image (abs ∘ a) (range (N + 1)),
  have H2 : |a 0| ∈ X := mem_image_of_mem _ (mem_range.2 (nat.zero_lt_succ _)),
  have H3 : X ≠ ∅ := ne_empty_of_mem H2,
  let B₀ := max' X H3,
  have HB₀ : ∀ n ≤ N, |a n| ≤ B₀ := λ n Hn, le_max' X H3 _
    (mem_image_of_mem _ (mem_range.2 (nat.lt_succ_of_le Hn))),
  let B := max B₀ ( |l| + 1),
  use B,
  intro n,
  cases le_or_gt n N with Hle Hgt,
  { 
    have h : |a n| ≤ B₀ := HB₀ n Hle,
    have h2 : B₀ ≤ B := le_max_left _ _,
    linarith },
  { 
    have h : |a n - l| < 1 := HN n (le_of_lt Hgt),
    have h2 : |a n| < |l| + 1,
      revert h,unfold abs,unfold max,split_ifs;intros;linarith {restrict_type := ℝ},
    have h3 : |l| + 1 ≤ B := le_max_right _ _,
    linarith   
  }
end

theorem bounded_pos_of_convergent (a : ℕ → ℝ) (Ha : has_limit a) :
∃ B : ℝ, B > 0 ∧ has_bound a B :=
begin
  cases bounded_of_convergent a Ha with B₀ HB₀,
  let B := |B₀| + 1,
  use B,
  split,
  { 
    apply lt_of_lt_of_le zero_lt_one,
    show 1 ≤ |B₀| + 1,
    apply le_add_of_nonneg_left',
    exact abs_nonneg _
  },
  intro n,
  apply le_trans (HB₀ n),
  show B₀ ≤ |B₀| + 1,
  apply le_trans (le_abs_self B₀),
  simp [zero_le_one],
end

lemma tendsto_bounded_mul_zero {a : ℕ → ℝ} {b : ℕ → ℝ} {A : ℝ} (Apos : A > 0)
  (hA : has_bound a A) (hB : is_limit b 0) 
  : is_limit (a*b) 0 :=
begin
  apply tendsto_of_mul_eps,
  intros ε εpos,
  cases hB ε εpos with N H,
  simp at H,
  use N,
  intros n nN,
  calc 
  |(a * b) n - 0| = |a n * b n|    : by simp
              ... = |a n| * |b n|  : abs_mul _ _
              ... ≤ A*|b n|        : mul_le_mul_of_nonneg_right (hA n) (abs_nonneg _)
              ... < A*ε            : mul_lt_mul_of_pos_left (H n nN) Apos
end



theorem tendsto_mul (a : ℕ → ℝ) (b : ℕ → ℝ) (l m : ℝ)
  (h1 : is_limit a l) (h2 : is_limit b m) :
  is_limit (a * b) (l * m) :=
begin
  rw ←tendsto_iff_sub_tendsto_zero,

  have key : (λ n, (a*b) n - l*m) = (λ n, (a n)*(b n - m) + m*(a n - l)),
  by simp ; ring,
  rw key,
  
  suffices : is_limit (λ n, a n * (b n - m)) 0 ∧ is_limit (λ n, m * (a n - l)) 0,
  { rw [show (0 : ℝ) = 0 + 0, by simp],
    exact tendsto_add _ _ _ _ this.left this.right},
  split,
  {
    rcases bounded_pos_of_convergent a ⟨l, h1⟩ with ⟨A, A_pos, hA⟩,
    have limb : is_limit (λ n, b n - m) 0,
     from tendsto_iff_sub_tendsto_zero.2 h2,
    exact tendsto_bounded_mul_zero A_pos hA limb },
  { 
    by_cases Hm : m = 0,
    { simp [Hm, tendsto_const] },
    { 
      have lima : is_limit (λ n, a n - l) 0, 
        from tendsto_iff_sub_tendsto_zero.2 h1,
      exact tendsto_bounded_mul_zero (abs_pos_iff.2 Hm) (has_bound_const m) lima } 
    }
end

theorem tendsto_le_of_le (a : ℕ → ℝ) (b : ℕ → ℝ)
  (l : ℝ) (m : ℝ) (hl : is_limit a l) (hm : is_limit b m) 
  (hle : ∀ n, a n ≤ b n) : l ≤ m :=
begin
  apply le_of_not_lt,
  intro hlt,
  let ε := (l - m) /2,
  have Hε : ε > 0 := show (l - m) / 2 > 0 , by linarith,
  cases hl ε Hε with Na HNa,
  have Hε : ε > 0 := show (l - m) / 2 > 0 , by linarith,
  cases hm ε Hε with Nb HNb,
  let N := max Na Nb,
  have HNa' : Na ≤ N := le_max_left _ _,
  have HNb' : Nb ≤ N := le_max_right _ _,
  have Hl' : |a N - l| < ε := HNa N HNa',
  have Hm' : |b N - m| < ε := HNb N HNb',
  have HN : a N ≤ b N := hle N,
  have Hε : ε = (l - m) / 2 := rfl,
  revert Hl' Hm',
  unfold abs,unfold max,split_ifs;intros;linarith
end


end M1P1
