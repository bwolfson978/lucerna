"use client";

import { useState, useEffect, useCallback, useRef, FormEvent } from "react";
import type { ScenarioInput, YearlyIncome, FilingStatus, HealthcareInput } from "@/lib/types";
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
import { generateTimeline, mergeTimeline } from "@/lib/utils/timeline";

interface InputFormProps {
  onSubmit: (input: ScenarioInput) => void;
  loading?: boolean;
  loadingLabel?: string;
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
  "timeline",
  "yearsInRetirement",
  "householdSize",
  "monthlySlcspPremium",
] as const;

export function InputForm({ onSubmit, loading, loadingLabel }: InputFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showMore, setShowAdvanced] = useState(false);

  // Refs used to scroll & focus the first invalid field when validation fails.
  // HTMLElement covers both <input> (NumericField/CurrencyInput) and the
  // Radix Select trigger <button> (FormSelect).
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // Form state. Required personal-data fields start as null so they appear
  // genuinely empty — the user should consciously answer them rather than
  // inherit a silent default.
  const [age, setAge] = useState<number | null>(null);
  const [filingStatus, setFilingStatus] = useState<FilingStatus | null>(null);
  const [currentIncome, setCurrentIncome] = useState<number | null>(null);
  const [traditionalBalance, setTraditionalBalance] = useState<number | null>(null);
  const [rothBalance, setRothBalance] = useState<number | null>(null);
  const [retirementAge, setRetirementAge] = useState<number | null>(null);
  // Assumption fields keep their sensible defaults — users don't know these
  // numbers and the engine has defensible industry standards.
  const [incomeGrowthRate, setIncomeGrowthRate] = useState<number | null>(3);
  const [retirementSpending, setRetirementSpending] = useState<number | null>(
    null
  );

  // Additional settings
  const [yearsInRetirement, setYearsInRetirement] = useState<number | null>(25);
  const [growthRate, setGrowthRate] = useState<number | null>(7);
  const [discountRate, setDiscountRate] = useState<number | null>(5);

  // State tax inputs
  const [state, setState] = useState<string>("none");
  const [retirementState, setRetirementState] = useState<string>("none");
  const [retirementStateSameAsCurrent, setRetirementStateSameAsCurrent] = useState(true);
  const [customStateRate, setCustomStateRate] = useState<number | null>(null);

  // ACA healthcare inputs
  const [includeAca, setIncludeAca] = useState(false);
  const [householdSize, setHouseholdSize] = useState<number | null>(1);
  const [monthlySlcspPremium, setMonthlySlcspPremium] = useState<number>(620);
  const [employerCoverageYear, setEmployerCoverageYear] = useState<
    number | null
  >(null);

  // Income timeline state
  const [timeline, setTimeline] = useState<YearlyIncome[]>([]);

  // Regenerate timeline when base inputs change, preserving pinned years.
  // All three personal-data inputs must be filled before the timeline is
  // meaningful — otherwise we'd generate wrong-length arrays from defaults.
  useEffect(() => {
    if (
      age == null ||
      retirementAge == null ||
      currentIncome == null ||
      currentIncome <= 0
    ) {
      setTimeline([]);
      return;
    }
    const incGrowthVal = incomeGrowthRate ?? 0;
    const fresh = generateTimeline(age, retirementAge, currentIncome, incGrowthVal);
    setTimeline((prev) => (prev.length === 0 ? fresh : mergeTimeline(fresh, prev)));
  }, [age, retirementAge, currentIncome, incomeGrowthRate]);

  const handleResetTimeline = useCallback(() => {
    if (age == null || retirementAge == null || currentIncome == null) return;
    const incGrowthVal = incomeGrowthRate ?? 0;
    setTimeline(generateTimeline(age, retirementAge, currentIncome, incGrowthVal));
  }, [age, retirementAge, currentIncome, incomeGrowthRate]);

  const showTimeline = timeline.length > 0;
  const hasCustomizations = timeline.some((y) => (y.notes && y.notes.length > 0) || y.state != null);

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

    const yrsRetVal = yearsInRetirement ?? 25;
    const growthVal = growthRate ?? 7;
    const discountVal = discountRate ?? 5;
    const hhSize = householdSize ?? 1;

    if (age == null) errs.age = "Enter your age";
    else if (age < 0 || age > 120) errs.age = "Age must be between 0 and 120";
    if (filingStatus == null) errs.filingStatus = "Select your filing status";
    if (currentIncome == null || currentIncome <= 0)
      errs.currentIncome = "Enter your current income";
    if (traditionalBalance == null || traditionalBalance <= 0)
      errs.traditionalBalance = "Enter your traditional IRA/401(k) balance";
    if (retirementAge == null) errs.retirementAge = "Enter your retirement age";
    else if (retirementAge < 1 || retirementAge > 120)
      errs.retirementAge = "Retirement age must be between 1 and 120";
    if (rothBalance != null && rothBalance < 0)
      errs.rothBalance = "Roth balance cannot be negative";
    if (yrsRetVal < 1)
      errs.yearsInRetirement = "Must be at least 1 year";
    if (retirementSpending !== null && retirementSpending < 0)
      errs.retirementSpending = "Spending cannot be negative";
    if (timeline.length === 0)
      errs.timeline = "Enter your income and retirement age to generate a timeline";
    if (timeline.some((y) => y.gross_income < 0))
      errs.timeline = "Income cannot be negative";
    if (includeAca) {
      if (hhSize < 1)
        errs.householdSize = "Household must have at least 1 person";
      if (monthlySlcspPremium < 0)
        errs.monthlySlcspPremium = "Premium cannot be negative";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      focusFirstInvalidField(errs);
      return;
    }

    // All required fields have passed validation above — the non-null
    // assertions below are safe.
    const healthcare: HealthcareInput | null = includeAca
      ? {
          household_size: hhSize,
          monthly_slcsp_premium: monthlySlcspPremium,
          has_employer_coverage_after: employerCoverageYear,
        }
      : null;

    const input: ScenarioInput = {
      age: age!,
      filing_status: filingStatus!,
      income_timeline: timeline,
      traditional_ira_balance: traditionalBalance!,
      roth_ira_balance: rothBalance ?? 0,
      retirement_age: retirementAge!,
      years_in_retirement: yrsRetVal,
      annual_retirement_spending: retirementSpending,
      annual_growth_rate: growthVal / 100,
      discount_rate: discountVal / 100,
      healthcare,
      state: state !== "none" ? state : null,
      retirement_state: retirementStateSameAsCurrent ? null : (retirementState !== "none" ? retirementState : null),
      custom_state_rate: state === "custom" && customStateRate ? customStateRate / 100 : null,
    };
    onSubmit(input);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-section">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-default">
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
          onChange={setAge}
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
          onChange={(e) => setFilingStatus(e.target.value as FilingStatus)}
        />
        <FormSelect
          label="State"
          value={state}
          options={STATE_OPTIONS}
          onChange={(e) => setState(e.target.value)}
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
          onChange={setCurrentIncome}
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
          helper="Includes 401k rollovers"
          tooltip="Your total pre-tax retirement savings eligible for Roth conversion. Include traditional IRAs and old 401(k) rollovers. Exclude a current employer 401(k) unless eligible for in-service conversions."
          onChange={setTraditionalBalance}
        />
        <NumericField
          ref={(el) => {
            fieldRefs.current.retirementAge = el;
          }}
          label="Retirement age"
          value={retirementAge ?? ""}
          placeholder="e.g. 65"
          min={1}
          max={120}
          required
          error={errors.retirementAge}
          onChange={setRetirementAge}
        />
        {state !== "none" && (
          <FormSelect
            label="Retirement state"
            value={retirementStateSameAsCurrent ? "same" : retirementState}
            options={[
              { value: "same", label: `Same as current${state !== "custom" ? ` (${STATE_OPTIONS.find(s => s.value === state)?.label.split(" (")[0] || state})` : ""}` },
              ...STATE_OPTIONS.filter(s => s.value !== "none"),
            ]}
            onChange={(e) => {
              if (e.target.value === "same") {
                setRetirementStateSameAsCurrent(true);
                setRetirementState("none");
              } else {
                setRetirementStateSameAsCurrent(false);
                setRetirementState(e.target.value);
              }
            }}
          />
        )}
        <CurrencyInput
          ref={(el) => {
            fieldRefs.current.rothBalance = el;
          }}
          label="Roth IRA/401(k) balance"
          value={rothBalance ?? ""}
          placeholder="Optional"
          min={0}
          error={errors.rothBalance}
          helper="Existing Roth IRA/401(k) balance"
          onChange={setRothBalance}
        />
      </div>

      {state === "custom" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-default">
          <NumericField
            ref={(el) => {
              fieldRefs.current.customStateRate = el;
            }}
            label="State tax rate (%)"
            value={customStateRate ?? ""}
            decimalScale={2}
            min={0}
            max={20}
            error={errors.customStateRate}
            helper="Flat state income tax rate"
            tooltip="Enter your state's approximate income tax rate. This is applied as a flat rate to your taxable income."
            onChange={setCustomStateRate}
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-default">
        <NumericField
          label="Income growth rate (%)"
          value={incomeGrowthRate ?? ""}
          decimalScale={1}
          helper="Annual income growth assumption"
          tooltip="How much you expect your salary to grow each year before inflation. Most people use 2-4%. Higher growth means more taxable income later, making early conversions more valuable."
          onChange={setIncomeGrowthRate}
        />
        <CurrencyInput
          ref={(el) => {
            fieldRefs.current.retirementSpending = el;
          }}
          label="Yearly spend in retirement"
          value={retirementSpending || ""}
          placeholder="Auto (4% rule)"
          min={0}
          error={errors.retirementSpending}
          helper="Leave blank to use the 4% rule"
          onChange={(val) => setRetirementSpending(val || null)}
        />
      </div>

      {/* Inline income timeline editor */}
      <div ref={timelineRef}>
        {showTimeline && (
          <IncomeTimelineEditor
            timeline={timeline}
            onChange={setTimeline}
            onReset={hasCustomizations ? handleResetTimeline : undefined}
            description="Projected from your inputs above. Adjust any year to reflect expected changes: job transitions, time off, or anything else on the horizon."
            defaultState={state !== "none" ? state : undefined}
          />
        )}
        {errors.timeline && (
          <span className="text-caption text-negative">{errors.timeline}</span>
        )}
      </div>

      {/* Additional settings */}
      <Collapsible open={showMore} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 text-body-sm text-text-secondary hover:text-text-primary transition-colors duration-300 self-start"
          >
            <ChevronIcon className={`transition-transform duration-300 ${showMore ? "rotate-90" : ""}`} />
            Additional settings
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-default pt-default">
            <NumericField
              ref={(el) => {
                fieldRefs.current.yearsInRetirement = el;
              }}
              label="Years in retirement"
              value={yearsInRetirement ?? ""}
              min={1}
              error={errors.yearsInRetirement}
              onChange={setYearsInRetirement}
            />
            <NumericField
              label="Investment return (%)"
              value={growthRate ?? ""}
              decimalScale={1}
              helper="Expected annual return"
              tooltip="Expected annual portfolio return before inflation and fees. Stock-heavy: 7-8%. Balanced: 5-6%. Bond-heavy: 3-4%."
              onChange={setGrowthRate}
            />
            <NumericField
              label="Discount rate (%)"
              value={discountRate ?? ""}
              decimalScale={1}
              helper="Time value of money"
              tooltip="The extra return you'd need to accept a dollar next year instead of today. Think of it as your opportunity cost. Roughly match it to your expected investment return. The default of 5% works well for most people."
              onChange={setDiscountRate}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ACA marketplace coverage */}
      <div className="flex flex-col gap-default">
        <div className="flex items-center gap-3">
          <Switch
            id="aca-toggle"
            checked={includeAca}
            onCheckedChange={setIncludeAca}
          />
          <Label htmlFor="aca-toggle" className="text-body text-text-primary cursor-pointer">
            I buy health insurance on the ACA marketplace
          </Label>
        </div>
        <p className="text-body-sm text-text-tertiary -mt-1">
          Accounts for how Roth conversions affect your premium subsidy
        </p>

        {includeAca && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-default">
            <NumericField
              ref={(el) => {
                fieldRefs.current.householdSize = el;
              }}
              label="Household size"
              value={householdSize ?? ""}
              min={1}
              error={errors.householdSize}
              helper="People in your tax household"
              onChange={setHouseholdSize}
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
              onChange={(val) => setMonthlySlcspPremium(val || 620)}
            />
            <NumericField
              label="Employer coverage resumes"
              value={employerCoverageYear ?? ""}
              placeholder="e.g. 2028"
              min={CURRENT_YEAR}
              max={CURRENT_YEAR + 40}
              helper="Year you get employer insurance back (optional)"
              onChange={setEmployerCoverageYear}
            />
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="pt-comfortable border-t border-border">
        <GlowButton type="submit" loading={loading}>
          {loading && loadingLabel ? loadingLabel : "Run my scenario"}
        </GlowButton>
      </div>
    </form>
  );
}
