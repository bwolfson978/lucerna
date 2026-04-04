"use client";

import { useState, FormEvent } from "react";
import type { ScenarioInput, YearlyIncome, FilingStatus, HealthcareInput } from "@/lib/types";
import { NumericField } from "@/components/common/NumericField";
import { CurrencyInput } from "@/components/common/CurrencyInput";
import { FormSelect } from "@/components/common/FormSelect";
import { GlowButton } from "@/components/common/GlowButton";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { CURRENT_YEAR } from "@/lib/utils/constants";

interface InputFormProps {
  onSubmit: (input: ScenarioInput) => void;
  loading?: boolean;
}

const FILING_STATUS_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "married_filing_jointly", label: "Married filing jointly" },
];

function generateTrajectory(
  currentAge: number,
  retAge: number,
  baseIncome: number,
  annualGrowthRate: number
): YearlyIncome[] {
  const yearsToRetirement = retAge - currentAge;
  return Array.from({ length: yearsToRetirement }, (_, i) => ({
    year: CURRENT_YEAR + i,
    gross_income: Math.round(
      baseIncome * Math.pow(1 + annualGrowthRate / 100, i)
    ),
    life_event: "none" as const,
  }));
}

export function InputForm({ onSubmit, loading }: InputFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Form state — nullable so fields can be fully cleared while typing
  const [age, setAge] = useState<number | null>(35);
  const [filingStatus, setFilingStatus] = useState<FilingStatus>("single");
  const [currentIncome, setCurrentIncome] = useState<number>(0);
  const [traditionalBalance, setTraditionalBalance] = useState<number>(0);
  const [rothBalance, setRothBalance] = useState<number>(0);
  const [retirementAge, setRetirementAge] = useState<number | null>(65);
  const [incomeGrowthRate, setIncomeGrowthRate] = useState<number | null>(3);
  const [retirementSpending, setRetirementSpending] = useState<number | null>(
    null
  );

  // Advanced settings
  const [yearsInRetirement, setYearsInRetirement] = useState<number | null>(25);
  const [growthRate, setGrowthRate] = useState<number | null>(7);
  const [discountRate, setDiscountRate] = useState<number | null>(5);

  // ACA healthcare inputs
  const [includeAca, setIncludeAca] = useState(false);
  const [householdSize, setHouseholdSize] = useState<number | null>(1);
  const [monthlySlcspPremium, setMonthlySlcspPremium] = useState<number>(620);
  const [employerCoverageYear, setEmployerCoverageYear] = useState<
    number | null
  >(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};

    const ageVal = age ?? 0;
    const retVal = retirementAge ?? 65;
    const yrsRetVal = yearsInRetirement ?? 25;
    const growthVal = growthRate ?? 7;
    const discountVal = discountRate ?? 5;
    const incGrowthVal = incomeGrowthRate ?? 0;
    const hhSize = householdSize ?? 1;

    if (ageVal < 0 || ageVal > 120) errs.age = "Age must be between 0 and 120";
    if (retVal <= ageVal)
      errs.retirementAge = "Retirement age must be greater than current age";
    if (retVal < 1 || retVal > 120)
      errs.retirementAge = "Retirement age must be between 1 and 120";
    if (currentIncome < 0) errs.currentIncome = "Income cannot be negative";
    if (traditionalBalance <= 0)
      errs.traditionalBalance = "Enter your traditional IRA/401(k) balance";
    if (rothBalance < 0) errs.rothBalance = "Roth balance cannot be negative";
    if (yrsRetVal < 1)
      errs.yearsInRetirement = "Must be at least 1 year";
    if (retirementSpending !== null && retirementSpending < 0)
      errs.retirementSpending = "Spending cannot be negative";
    if (includeAca) {
      if (hhSize < 1)
        errs.householdSize = "Household must have at least 1 person";
      if (monthlySlcspPremium < 0)
        errs.monthlySlcspPremium = "Premium cannot be negative";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const trajectory = generateTrajectory(
      ageVal,
      retVal,
      currentIncome,
      incGrowthVal
    );

    const healthcare: HealthcareInput | null = includeAca
      ? {
          household_size: hhSize,
          monthly_slcsp_premium: monthlySlcspPremium,
          has_employer_coverage_after: employerCoverageYear,
        }
      : null;

    const input: ScenarioInput = {
      age: ageVal,
      filing_status: filingStatus,
      income_trajectory: trajectory,
      traditional_ira_balance: traditionalBalance,
      roth_ira_balance: rothBalance,
      retirement_age: retVal,
      years_in_retirement: yrsRetVal,
      annual_retirement_spending: retirementSpending,
      annual_growth_rate: growthVal / 100,
      discount_rate: discountVal / 100,
      healthcare,
    };
    onSubmit(input);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-section">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-default">
        <NumericField
          label="Age"
          value={age ?? ""}
          min={0}
          max={120}
          error={errors.age}
          onChange={setAge}
        />
        <FormSelect
          label="Filing status"
          value={filingStatus}
          options={FILING_STATUS_OPTIONS}
          onChange={(e) => setFilingStatus(e.target.value as FilingStatus)}
        />
        <CurrencyInput
          label="Current income"
          value={currentIncome || ""}
          placeholder="0"
          min={0}
          error={errors.currentIncome}
          onChange={setCurrentIncome}
        />
        <CurrencyInput
          label="Traditional IRA/401(k) balance"
          value={traditionalBalance || ""}
          placeholder="0"
          min={0}
          error={errors.traditionalBalance}
          helper="Includes 401k rollovers"
          tooltip="Your total pre-tax retirement savings eligible for Roth conversion. Include traditional IRAs and old 401(k) rollovers. Exclude a current employer 401(k) unless eligible for in-service conversions."
          onChange={setTraditionalBalance}
        />
        <NumericField
          label="Retirement age"
          value={retirementAge ?? ""}
          min={1}
          max={120}
          error={errors.retirementAge}
          onChange={setRetirementAge}
        />
        <CurrencyInput
          label="Roth IRA/401(k) balance"
          value={rothBalance || ""}
          placeholder="0"
          min={0}
          error={errors.rothBalance}
          helper="Existing Roth IRA/401(k) balance (optional)"
          onChange={setRothBalance}
        />
      </div>

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
          label="Yearly spend in retirement"
          value={retirementSpending || ""}
          placeholder="Auto (4% rule)"
          min={0}
          error={errors.retirementSpending}
          helper="Leave blank to use the 4% rule"
          onChange={(val) => setRetirementSpending(val || null)}
        />
      </div>

      {/* Advanced settings */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 text-body-sm text-text-secondary hover:text-text-primary transition-colors duration-300 self-start"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className={`transition-transform duration-300 ${showAdvanced ? "rotate-90" : ""}`}
            >
              <path
                d="M4.5 2.5l3.5 3.5-3.5 3.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Advanced settings
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-default pt-default">
            <NumericField
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
              tooltip="The extra return you'd need to accept a dollar next year instead of today. Think of it as your opportunity cost — roughly match it to your expected investment return. The default of 5% works well for most people."
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
              label="Household size"
              value={householdSize ?? ""}
              min={1}
              error={errors.householdSize}
              helper="People in your tax household"
              onChange={setHouseholdSize}
            />
            <CurrencyInput
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
          Run my scenario
        </GlowButton>
      </div>
    </form>
  );
}
