"use client";

import { useState, useEffect, useCallback, useRef, FormEvent } from "react";
import type { ScenarioInput, FilingStatus } from "@/lib/types";
import { NumericField } from "@/components/common/NumericField";
import { CurrencyInput } from "@/components/common/CurrencyInput";
import { FormSelect } from "@/components/common/FormSelect";
import { GlowButton } from "@/components/common/GlowButton";
import { ChevronIcon } from "@/components/common/icons";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { IncomeTimelineEditor } from "@/components/calculator/IncomeTimelineEditor";
import { CURRENT_YEAR } from "@/lib/utils/constants";
import { FILING_STATUS_OPTIONS, STATE_OPTIONS } from "@/lib/utils/formOptions";
import { IncomeSourcesEditor } from "@/components/calculator/IncomeSourcesEditor";
import { IncomePreviewChart } from "@/components/calculator/IncomePreviewChart";
import {
  EMPTY_DRAFT,
  applyDraftPatch,
  buildScenarioInput,
  projectedTimeline,
  type DraftPatch,
  type ScenarioDraft,
} from "@/lib/scenario/draft";

interface InputFormProps {
  onSubmit: (input: ScenarioInput) => void;
  loading?: boolean;
  loadingLabel?: string;
  /** Shared scenario draft. When omitted the form manages its own. */
  draft?: ScenarioDraft;
  onDraftChange?: (draft: ScenarioDraft) => void;
}

// Order must match the on-screen layout of fields. Used to find the first
// invalid field to scroll & focus when submit fails validation.
const FIELD_ORDER = [
  "age",
  "filingStatus",
  "currentIncome",
  "traditionalBalance",
  "retirementAge",
  "customStateRate",
  "rothBalance",
  "retirementSpending",
  "currentIncomeEndAge",
  "incomeSources",
  "timeline",
  "yearsInRetirement",
  "householdSize",
  "monthlySlcspPremium",
] as const;

export function InputForm({
  onSubmit,
  loading,
  loadingLabel,
  draft: controlledDraft,
  onDraftChange,
}: InputFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showMore, setShowAdvanced] = useState(false);

  // Refs used to scroll & focus the first invalid field when validation fails.
  // HTMLElement covers both <input> (NumericField/CurrencyInput) and the
  // Radix Select trigger <button> (FormSelect).
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // The form edits a scenario draft. On the calculator page the draft is shared
  // with the conversation (controlled); standalone, the form keeps its own.
  // Required personal-data fields start empty so the user consciously answers
  // them; assumption fields keep sensible defaults.
  const [internalDraft, setInternalDraft] = useState<ScenarioDraft>(EMPTY_DRAFT);
  const draft = controlledDraft ?? internalDraft;
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Functional updates read the latest draft, so several edits in one event all apply.
  const patch = useCallback(
    (changes: DraftPatch) => {
      const next = applyDraftPatch(draftRef.current, changes, CURRENT_YEAR);
      draftRef.current = next;
      if (onDraftChange) onDraftChange(next);
      else setInternalDraft(next);
    },
    [onDraftChange]
  );

  const {
    age,
    filing_status: filingStatus,
    current_income: currentIncome,
    traditional_balance: traditionalBalance,
    roth_balance: rothBalance,
    retirement_age: drawdownStartAge,
    income_growth_rate_pct: incomeGrowthRate,
    retirement_spending: retirementSpending,
    planning_horizon_age: planningHorizonAge,
    investment_return_pct: growthRate,
    discount_rate_pct: discountRate,
    custom_state_rate_pct: customStateRate,
    include_aca: includeAca,
    household_size: householdSize,
    employer_coverage_year: employerCoverageYear,
    current_income_end_age: currentIncomeEndAge,
    income_sources: incomeSources,
    timeline,
  } = draft;
  const horizon = planningHorizonAge ?? 90;
  const sourceErrors: Record<number, string> = {};
  incomeSources.forEach((src, i) => {
    if (src.end_age != null && src.end_age < src.start_age)
      sourceErrors[i] = "Ends before it starts";
  });
  const state = draft.state ?? "none";
  const retirementState = draft.retirement_state ?? "none";
  const monthlySlcspPremium = draft.monthly_slcsp_premium ?? 620;

  const handleResetTimeline = useCallback(() => {
    const d = draftRef.current;
    if (d.age == null || d.retirement_age == null || d.current_income == null) return;
    patch({ timeline: projectedTimeline(d, CURRENT_YEAR) });
  }, [patch]);

  const showTimeline = timeline.length > 0;
  const hasCustomizations = timeline.some(
    (y) => (y.notes && y.notes.length > 0) || y.state != null
  );

  function focusFirstInvalidField(errs: Record<string, string>) {
    const firstKey = FIELD_ORDER.find((k) => k in errs);
    if (!firstKey) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    const behavior: ScrollBehavior = reduced ? "auto" : "smooth";

    // requestAnimationFrame lets React paint the error state (red border,
    // error text) before we scroll so the user sees what changed.
    requestAnimationFrame(() => {
      if (firstKey === "timeline") {
        // Timeline lives in its own block. If the editor isn't rendered
        // (because current income is empty), fall back to the income field
        // since that's the root cause of an empty timeline.
        const target = timelineRef.current ?? fieldRefs.current.currentIncome;
        target?.scrollIntoView({ behavior, block: "center" });
        fieldRefs.current.currentIncome?.focus({ preventScroll: true });
        return;
      }

      const el = fieldRefs.current[firstKey];
      el?.scrollIntoView({ behavior, block: "center" });
      el?.focus({ preventScroll: true });
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};

    const planningHorizonVal = planningHorizonAge ?? 90;
    const hhSize = householdSize ?? 1;

    if (age == null) errs.age = "Enter your age";
    else if (age < 0 || age > 120) errs.age = "Age must be between 0 and 120";
    if (filingStatus == null) errs.filingStatus = "Select your filing status";
    if (currentIncome == null || currentIncome <= 0)
      errs.currentIncome = "Enter your current income";
    if (traditionalBalance == null || traditionalBalance <= 0)
      errs.traditionalBalance = "Enter your traditional IRA/401(k) balance";
    if (drawdownStartAge == null) errs.retirementAge = "Enter your retirement age";
    else if (drawdownStartAge < 1 || drawdownStartAge > 120)
      errs.retirementAge = "Retirement age must be between 1 and 120";
    if (rothBalance != null && rothBalance < 0)
      errs.rothBalance = "Roth balance cannot be negative";
    if (planningHorizonVal < 50)
      errs.yearsInRetirement = "Planning horizon must be age 50 or later";
    if (retirementSpending !== null && retirementSpending < 0)
      errs.retirementSpending = "Spending cannot be negative";
    if (Object.keys(sourceErrors).length > 0)
      errs.incomeSources = "Fix the income source that ends before it starts";
    if (timeline.length === 0)
      errs.timeline = "Enter your income and retirement age to generate a timeline";
    if (timeline.some((y) => y.gross_income < 0)) errs.timeline = "Income cannot be negative";
    if (includeAca) {
      if (hhSize < 1) errs.householdSize = "Household must have at least 1 person";
      if (monthlySlcspPremium < 0) errs.monthlySlcspPremium = "Premium cannot be negative";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      focusFirstInvalidField(errs);
      return;
    }

    // All required fields have passed validation above.
    const input: ScenarioInput = buildScenarioInput(draft);
    onSubmit(input);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-section">
      {/* Pairs that belong together: you, income, savings, retirement, where you live. */}
      <div className="grid grid-cols-1 gap-x-default gap-y-5 sm:grid-cols-2">
        <NumericField
          ref={(el) => {
            fieldRefs.current.age = el;
          }}
          label="Age"
          value={age ?? ""}
          placeholder="e.g. 35"
          min={0}
          max={120}
          required
          error={errors.age}
          onChange={(v) => patch({ age: v })}
        />
        <FormSelect
          ref={(el) => {
            fieldRefs.current.filingStatus = el;
          }}
          label="Filing status"
          value={filingStatus ?? undefined}
          options={FILING_STATUS_OPTIONS}
          placeholder="Choose filing status"
          required
          error={errors.filingStatus}
          onChange={(e) => patch({ filing_status: e.target.value as FilingStatus })}
        />
        <CurrencyInput
          ref={(el) => {
            fieldRefs.current.currentIncome = el;
          }}
          label="Current income"
          value={currentIncome ?? ""}
          placeholder="e.g. 85,000"
          min={0}
          required
          error={errors.currentIncome}
          helper="Taxable income this year, before tax"
          onChange={(v) => patch({ current_income: v })}
        />
        <NumericField
          label="Yearly income growth"
          value={incomeGrowthRate ?? ""}
          decimalScale={1}
          unit="%"
          tooltip="How much you expect your salary to grow each year before inflation. Most people use 2-4%. Higher growth means more taxable income later, making early conversions more valuable."
          onChange={(v) => patch({ income_growth_rate_pct: v })}
        />
        <CurrencyInput
          ref={(el) => {
            fieldRefs.current.traditionalBalance = el;
          }}
          label="Traditional IRA/401(k) balance"
          value={traditionalBalance ?? ""}
          placeholder="e.g. 500,000"
          min={0}
          required
          error={errors.traditionalBalance}
          tooltip="Your total pre-tax retirement savings eligible for Roth conversion. Include traditional IRAs and old 401(k) rollovers. Exclude a current employer 401(k) unless eligible for in-service conversions."
          onChange={(v) => patch({ traditional_balance: v })}
        />
        <CurrencyInput
          ref={(el) => {
            fieldRefs.current.rothBalance = el;
          }}
          label="Roth IRA/401(k) balance"
          value={rothBalance ?? ""}
          placeholder="Optional"
          min={0}
          error={errors.rothBalance}
          onChange={(v) => patch({ roth_balance: v })}
        />
        <NumericField
          ref={(el) => {
            fieldRefs.current.retirementAge = el;
          }}
          label="Retirement age"
          value={drawdownStartAge ?? ""}
          placeholder="e.g. 65"
          min={1}
          max={120}
          required
          error={errors.retirementAge}
          onChange={(v) => patch({ retirement_age: v })}
        />
        <CurrencyInput
          ref={(el) => {
            fieldRefs.current.retirementSpending = el;
          }}
          label="Yearly spend in retirement"
          value={retirementSpending || ""}
          placeholder="Optional (4% rule)"
          min={0}
          error={errors.retirementSpending}
          helper="Total household spending. Your accounts cover whatever income doesn't."
          onChange={(val) => patch({ retirement_spending: val || null })}
        />
        <FormSelect
          label="State"
          value={state}
          options={STATE_OPTIONS}
          onChange={(e) => {
            const newState = e.target.value;
            // Choosing a state also sets the retirement state.
            patch({ state: newState === "none" ? null : newState });
          }}
        />
        <FormSelect
          label="Retirement state"
          value={retirementState}
          options={STATE_OPTIONS}
          onChange={(e) =>
            patch({ retirement_state: e.target.value === "none" ? null : e.target.value })
          }
        />
        {state === "custom" && (
          <NumericField
            ref={(el) => {
              fieldRefs.current.customStateRate = el;
            }}
            label="State tax rate"
            value={customStateRate ?? ""}
            decimalScale={2}
            min={0}
            max={20}
            unit="%"
            error={errors.customStateRate}
            tooltip="Enter your state's approximate income tax rate. This is applied as a flat rate to your taxable income."
            onChange={(v) => patch({ custom_state_rate_pct: v })}
          />
        )}
      </div>

      {/* Income that runs across years: Social Security, pensions, other */}
      <section className="flex flex-col gap-default" aria-labelledby="income-sources-heading">
        <div className="flex flex-col gap-1">
          <h3 id="income-sources-heading" className="text-h3 text-text-primary">
            Income in retirement
          </h3>
          <p className="text-body-sm text-text-secondary">
            Social Security, pensions and anything else taxable you expect. Amounts are per year.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-default sm:grid-cols-2">
          <NumericField
            ref={(el) => {
              fieldRefs.current.currentIncomeEndAge = el;
            }}
            label="Current income ends at age"
            value={currentIncomeEndAge ?? ""}
            placeholder={
              age != null && drawdownStartAge != null && drawdownStartAge > age
                ? `${drawdownStartAge - 1} (year before retirement)`
                : "Continues for life"
            }
            min={0}
            max={120}
            helper="Your age in the last year you earn it"
            onChange={(v) => patch({ current_income_end_age: v })}
          />
        </div>
        <div
          ref={(el) => {
            fieldRefs.current.incomeSources = el;
          }}
        >
          <IncomeSourcesEditor
            sources={incomeSources}
            onChange={(next) => patch({ income_sources: next })}
            age={age}
            retirementAge={drawdownStartAge}
            planningHorizonAge={horizon}
            married={filingStatus === "married_filing_jointly"}
            errors={sourceErrors}
          />
        </div>
      </section>

      {/* Live preview of the year-by-year timeline, with per-year overrides */}
      <div ref={timelineRef} className="flex flex-col gap-default">
        {showTimeline && age != null && drawdownStartAge != null && (
          <section className="flex flex-col gap-tight" aria-labelledby="income-preview-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="income-preview-heading" className="text-h3 text-text-primary">
                Your income, year by year
              </h3>
              <span className="text-caption text-text-tertiary">
                {age} to {age + timeline.length - 1} · {timeline.length} years
              </span>
            </div>
            <IncomePreviewChart
              timeline={timeline}
              sources={incomeSources}
              age={age}
              retirementAge={drawdownStartAge}
              spending={retirementSpending}
            />
          </section>
        )}
        {showTimeline && (
          <IncomeTimelineEditor
            title="Edit individual years"
            allowAddYear={false}
            timeline={timeline}
            onChange={(next) => patch({ timeline: next })}
            onReset={hasCustomizations ? handleResetTimeline : undefined}
            description="Built from your income above. Adjust any year for one-off changes: a job change, time off, a bonus."
            defaultState={state !== "none" ? state : undefined}
          />
        )}
        {errors.timeline && <span className="text-caption text-negative">{errors.timeline}</span>}
      </div>

      {/* Additional settings */}
      <Collapsible open={showMore} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 self-start text-body-sm text-text-secondary transition-colors duration-300 hover:text-text-primary"
          >
            <ChevronIcon
              className={`transition-transform duration-300 ${showMore ? "rotate-90" : ""}`}
            />
            Additional settings
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="grid grid-cols-1 gap-x-default gap-y-5 pt-5 sm:grid-cols-3">
            <NumericField
              ref={(el) => {
                fieldRefs.current.yearsInRetirement = el;
              }}
              label="Plan through age"
              value={planningHorizonAge ?? ""}
              min={1}
              error={errors.yearsInRetirement}
              onChange={(v) => patch({ planning_horizon_age: v })}
            />
            <NumericField
              label="Investment return"
              value={growthRate ?? ""}
              decimalScale={1}
              unit="%"
              tooltip="Expected annual portfolio return before inflation and fees. Stock-heavy: 7-8%. Balanced: 5-6%. Bond-heavy: 3-4%."
              onChange={(v) => patch({ investment_return_pct: v })}
            />
            <NumericField
              label="Discount rate"
              value={discountRate ?? ""}
              decimalScale={1}
              unit="%"
              tooltip="The extra return you'd need to accept a dollar next year instead of today. Think of it as your opportunity cost. Roughly match it to your expected investment return. The default of 5% works well for most people."
              onChange={(v) => patch({ discount_rate_pct: v })}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ACA marketplace coverage */}
      <div className="flex flex-col gap-5">
        {/* A settings row: what it is on the left, the switch on the right. */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="aca-toggle" className="cursor-pointer text-body text-text-primary">
              I buy health insurance on the ACA marketplace
            </Label>
            <p className="text-body-sm text-text-tertiary">
              Accounts for how Roth conversions affect your premium subsidy
            </p>
          </div>
          <Switch
            id="aca-toggle"
            className="mt-0.5"
            checked={includeAca}
            onCheckedChange={(v) => patch({ include_aca: v })}
          />
        </div>

        {includeAca && (
          <div className="grid grid-cols-1 gap-x-default gap-y-5 sm:grid-cols-3">
            <NumericField
              ref={(el) => {
                fieldRefs.current.householdSize = el;
              }}
              label="Household size"
              value={householdSize ?? ""}
              min={1}
              error={errors.householdSize}
              helper="People in your tax household"
              onChange={(v) => patch({ household_size: v })}
            />
            <CurrencyInput
              ref={(el) => {
                fieldRefs.current.monthlySlcspPremium = el;
              }}
              label="Monthly benchmark premium"
              value={monthlySlcspPremium || ""}
              placeholder="620"
              min={0}
              error={errors.monthlySlcspPremium}
              helper="2nd-lowest Silver plan on healthcare.gov"
              onChange={(val) => patch({ monthly_slcsp_premium: val || 620 })}
            />
            <NumericField
              label="Employer coverage resumes"
              value={employerCoverageYear ?? ""}
              placeholder="e.g. 2028"
              min={CURRENT_YEAR}
              max={CURRENT_YEAR + 40}
              helper="Year you get employer insurance back (optional)"
              onChange={(v) => patch({ employer_coverage_year: v })}
            />
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="border-t border-border pt-comfortable">
        <GlowButton type="submit" loading={loading} className="w-full sm:w-auto">
          {loading && loadingLabel ? loadingLabel : "Run my scenario"}
        </GlowButton>
      </div>
    </form>
  );
}
