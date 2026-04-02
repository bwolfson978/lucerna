"use client";

import { useState, FormEvent } from "react";
import type { ScenarioInput, YearlyIncome, FilingStatus, HealthcareInput } from "@/lib/types";
import { FormField } from "@/components/common/FormField";
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

  // Form state
  const [age, setAge] = useState<number>(35);
  const [filingStatus, setFilingStatus] = useState<FilingStatus>("single");
  const [currentIncome, setCurrentIncome] = useState<number>(0);
  const [traditionalBalance, setTraditionalBalance] = useState<number>(0);
  const [rothBalance, setRothBalance] = useState<number>(0);
  const [retirementAge, setRetirementAge] = useState<number>(65);
  const [incomeGrowthRate, setIncomeGrowthRate] = useState<number>(3);
  const [retirementSpending, setRetirementSpending] = useState<number | null>(
    null
  );

  // Advanced settings
  const [yearsInRetirement, setYearsInRetirement] = useState<number>(25);
  const [growthRate, setGrowthRate] = useState<number>(7);
  const [discountRate, setDiscountRate] = useState<number>(5);

  // ACA healthcare inputs
  const [includeAca, setIncludeAca] = useState(false);
  const [householdSize, setHouseholdSize] = useState<number>(1);
  const [monthlySlcspPremium, setMonthlySlcspPremium] = useState<number>(620);
  const [employerCoverageYear, setEmployerCoverageYear] = useState<
    number | null
  >(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (age < 0 || age > 120) errs.age = "Age must be between 0 and 120";
    if (retirementAge <= age)
      errs.retirementAge = "Retirement age must be greater than current age";
    if (retirementAge < 1 || retirementAge > 120)
      errs.retirementAge = "Retirement age must be between 1 and 120";
    if (currentIncome < 0) errs.currentIncome = "Income cannot be negative";
    if (traditionalBalance <= 0)
      errs.traditionalBalance = "Enter your traditional IRA/401(k) balance";
    if (rothBalance < 0) errs.rothBalance = "Roth balance cannot be negative";
    if (yearsInRetirement < 1)
      errs.yearsInRetirement = "Must be at least 1 year";
    if (retirementSpending !== null && retirementSpending < 0)
      errs.retirementSpending = "Spending cannot be negative";
    if (includeAca) {
      if (householdSize < 1)
        errs.householdSize = "Household must have at least 1 person";
      if (monthlySlcspPremium < 0)
        errs.monthlySlcspPremium = "Premium cannot be negative";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const trajectory = generateTrajectory(
      age,
      retirementAge,
      currentIncome,
      incomeGrowthRate
    );

    const healthcare: HealthcareInput | null = includeAca
      ? {
          household_size: householdSize,
          monthly_slcsp_premium: monthlySlcspPremium,
          has_employer_coverage_after: employerCoverageYear,
        }
      : null;

    const input: ScenarioInput = {
      age,
      filing_status: filingStatus,
      income_trajectory: trajectory,
      traditional_ira_balance: traditionalBalance,
      roth_ira_balance: rothBalance,
      retirement_age: retirementAge,
      years_in_retirement: yearsInRetirement,
      annual_retirement_spending: retirementSpending,
      annual_growth_rate: growthRate / 100,
      discount_rate: discountRate / 100,
      healthcare,
    };
    onSubmit(input);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-section">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-default">
        <FormField
          label="Age"
          type="number"
          value={age}
          numeric
          min={0}
          max={120}
          error={errors.age}
          onChange={(e) => setAge(parseInt(e.target.value) || 0)}
        />
        <FormSelect
          label="Filing status"
          value={filingStatus}
          options={FILING_STATUS_OPTIONS}
          onChange={(e) => setFilingStatus(e.target.value as FilingStatus)}
        />
        <FormField
          label="Current income"
          type="number"
          value={currentIncome || ""}
          placeholder="0"
          numeric
          min={0}
          error={errors.currentIncome}
          onChange={(e) => setCurrentIncome(parseFloat(e.target.value) || 0)}
        />
        <FormField
          label="Traditional IRA/401(k) balance"
          type="number"
          value={traditionalBalance || ""}
          placeholder="0"
          numeric
          min={0}
          error={errors.traditionalBalance}
          helper="Includes 401k rollovers"
          onChange={(e) =>
            setTraditionalBalance(parseFloat(e.target.value) || 0)
          }
        />
        <FormField
          label="Retirement age"
          type="number"
          value={retirementAge}
          numeric
          min={1}
          max={120}
          error={errors.retirementAge}
          onChange={(e) => setRetirementAge(parseInt(e.target.value) || 65)}
        />
        <FormField
          label="Roth IRA/401(k) balance"
          type="number"
          value={rothBalance || ""}
          placeholder="0"
          numeric
          min={0}
          error={errors.rothBalance}
          helper="Existing Roth IRA/401(k) balance (optional)"
          onChange={(e) => setRothBalance(parseFloat(e.target.value) || 0)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-default">
        <FormField
          label="Income growth rate (%)"
          type="number"
          value={incomeGrowthRate}
          numeric
          step={0.5}
          helper="Annual income growth assumption"
          onChange={(e) =>
            setIncomeGrowthRate(parseFloat(e.target.value) || 0)
          }
        />
        <FormField
          label="Yearly spend in retirement"
          type="number"
          value={retirementSpending || ""}
          placeholder="Auto (4% rule)"
          numeric
          min={0}
          error={errors.retirementSpending}
          helper="Leave blank to use the 4% rule"
          onChange={(e) =>
            setRetirementSpending(
              e.target.value ? parseFloat(e.target.value) : null
            )
          }
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
            <FormField
              label="Years in retirement"
              type="number"
              value={yearsInRetirement}
              numeric
              min={1}
              error={errors.yearsInRetirement}
              onChange={(e) =>
                setYearsInRetirement(parseInt(e.target.value) || 25)
              }
            />
            <FormField
              label="Investment return (%)"
              type="number"
              value={growthRate}
              numeric
              step={0.5}
              helper="Expected annual return"
              onChange={(e) => setGrowthRate(parseFloat(e.target.value) || 7)}
            />
            <FormField
              label="Discount rate (%)"
              type="number"
              value={discountRate}
              numeric
              step={0.5}
              helper="Time value of money"
              onChange={(e) => setDiscountRate(parseFloat(e.target.value) || 5)}
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
            <FormField
              label="Household size"
              type="number"
              value={householdSize}
              numeric
              min={1}
              error={errors.householdSize}
              helper="People in your tax household"
              onChange={(e) =>
                setHouseholdSize(parseInt(e.target.value) || 1)
              }
            />
            <FormField
              label="Monthly benchmark premium"
              type="number"
              value={monthlySlcspPremium || ""}
              placeholder="620"
              numeric
              min={0}
              step={10}
              error={errors.monthlySlcspPremium}
              helper="2nd-lowest Silver plan on healthcare.gov"
              onChange={(e) =>
                setMonthlySlcspPremium(parseFloat(e.target.value) || 620)
              }
            />
            <FormField
              label="Employer coverage resumes"
              type="number"
              value={employerCoverageYear || ""}
              placeholder="e.g. 2028"
              numeric
              min={CURRENT_YEAR}
              max={CURRENT_YEAR + 40}
              helper="Year you get employer insurance back (optional)"
              onChange={(e) =>
                setEmployerCoverageYear(
                  e.target.value ? parseInt(e.target.value) : null
                )
              }
            />
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="pt-comfortable border-t border-border">
        <GlowButton type="submit" loading={loading}>
          Analyze my scenario
        </GlowButton>
      </div>
    </form>
  );
}
