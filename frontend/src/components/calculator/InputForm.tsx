"use client";

import { useState, FormEvent } from "react";
import type { ScenarioInput, YearlyIncome, FilingStatus } from "@/lib/types";
import { Input } from "@/components/common/Input";
import { Select } from "@/components/common/Select";
import { Button } from "@/components/common/Button";
import { IncomeTrajectoryEditor } from "./IncomeTrajectoryEditor";
import { CURRENT_YEAR } from "@/lib/utils/constants";

interface InputFormProps {
  onSubmit: (input: ScenarioInput) => void;
  loading?: boolean;
}

const FILING_STATUS_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "married_filing_jointly", label: "Married filing jointly" },
];

const STEPS = ["Personal info", "Income & accounts", "Review & settings"];

export function InputForm({ onSubmit, loading }: InputFormProps) {
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form state
  const [age, setAge] = useState<number>(35);
  const [filingStatus, setFilingStatus] = useState<FilingStatus>("single");
  const [trajectory, setTrajectory] = useState<YearlyIncome[]>([
    { year: CURRENT_YEAR, gross_income: 0, life_event: "none" },
    { year: CURRENT_YEAR + 1, gross_income: 0, life_event: "none" },
    { year: CURRENT_YEAR + 2, gross_income: 0, life_event: "none" },
  ]);
  const [traditionalBalance, setTraditionalBalance] = useState<number>(0);
  const [rothBalance, setRothBalance] = useState<number>(0);
  const [retirementAge, setRetirementAge] = useState<number>(65);
  const [retirementSpending, setRetirementSpending] = useState<number | null>(
    null
  );
  const [yearsInRetirement, setYearsInRetirement] = useState<number>(25);
  const [growthRate, setGrowthRate] = useState<number>(7);
  const [discountRate, setDiscountRate] = useState<number>(5);

  function validateStep(s: number): boolean {
    const errs: Record<string, string> = {};
    if (s === 0) {
      if (age < 18 || age > 80) errs.age = "Age must be between 18 and 80";
      if (retirementAge <= age)
        errs.retirementAge = "Retirement age must be greater than current age";
    }
    if (s === 1) {
      if (trajectory.some((y) => y.gross_income < 0))
        errs.income = "Income cannot be negative";
      if (traditionalBalance <= 0)
        errs.traditionalBalance = "Enter your traditional IRA balance";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function generateTrajectory(
    currentAge: number,
    retAge: number,
    baseIncome: number
  ): YearlyIncome[] {
    const yearsToRetirement = retAge - currentAge;
    return Array.from({ length: yearsToRetirement }, (_, i) => ({
      year: CURRENT_YEAR + i,
      gross_income: baseIncome,
      life_event: "none" as const,
    }));
  }

  function handleNext() {
    if (validateStep(step)) {
      // Auto-generate trajectory when moving from step 0 to step 1
      if (step === 0) {
        const baseIncome = trajectory[0]?.gross_income || 0;
        const newTrajectory = generateTrajectory(
          age,
          retirementAge,
          baseIncome
        );
        // Preserve any existing edits for overlapping years
        for (let i = 0; i < newTrajectory.length && i < trajectory.length; i++) {
          if (trajectory[i].gross_income > 0) {
            newTrajectory[i].gross_income = trajectory[i].gross_income;
          }
          if (trajectory[i].life_event !== "none") {
            newTrajectory[i].life_event = trajectory[i].life_event;
          }
        }
        setTrajectory(newTrajectory);
      }
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validateStep(step)) return;

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
    };
    onSubmit(input);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-section">
      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`
                w-7 h-7 rounded-full flex items-center justify-center text-caption font-medium transition-colors duration-150
                ${i <= step ? "bg-accent text-white" : "bg-bg-hover text-text-tertiary"}
              `}
            >
              {i + 1}
            </div>
            <span
              className={`text-body-sm hidden sm:inline ${
                i === step ? "text-text-primary font-medium" : "text-text-tertiary"
              }`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div className="w-8 h-px bg-border" />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Personal Info */}
      {step === 0 && (
        <div className="flex flex-col gap-default">
          <h2 className="text-h2 text-text-primary">Personal info</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-default">
            <Input
              label="Age"
              type="number"
              value={age}
              numeric
              min={18}
              max={80}
              error={errors.age}
              onChange={(e) => setAge(parseInt(e.target.value) || 0)}
            />
            <Select
              label="Filing status"
              value={filingStatus}
              options={FILING_STATUS_OPTIONS}
              onChange={(e) =>
                setFilingStatus(e.target.value as FilingStatus)
              }
            />
            <Input
              label="Retirement age"
              type="number"
              value={retirementAge}
              numeric
              min={30}
              max={80}
              error={errors.retirementAge}
              onChange={(e) =>
                setRetirementAge(parseInt(e.target.value) || 65)
              }
            />
            <Input
              label="Yearly spend in retirement"
              type="number"
              value={retirementSpending || ""}
              placeholder="Auto (4% rule)"
              numeric
              min={0}
              helper="Leave blank to use the 4% rule"
              onChange={(e) =>
                setRetirementSpending(
                  e.target.value ? parseFloat(e.target.value) : null
                )
              }
            />
          </div>
        </div>
      )}

      {/* Step 2: Income & Accounts */}
      {step === 1 && (
        <div className="flex flex-col gap-section">
          <IncomeTrajectoryEditor
            trajectory={trajectory}
            onChange={setTrajectory}
          />
          {errors.income && (
            <span className="text-caption text-negative">{errors.income}</span>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-default">
            <Input
              label="Traditional IRA balance"
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
            <Input
              label="Roth IRA balance"
              type="number"
              value={rothBalance || ""}
              placeholder="0"
              numeric
              min={0}
              helper="Existing Roth balance (optional)"
              onChange={(e) =>
                setRothBalance(parseFloat(e.target.value) || 0)
              }
            />
          </div>
        </div>
      )}

      {/* Step 3: Review & Settings */}
      {step === 2 && (
        <div className="flex flex-col gap-default">
          <h2 className="text-h2 text-text-primary">
            Review & advanced settings
          </h2>
          <p className="text-body-sm text-text-secondary">
            Defaults work well for most scenarios. Adjust if needed.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-default">
            <Input
              label="Years in retirement"
              type="number"
              value={yearsInRetirement}
              numeric
              min={5}
              max={40}
              onChange={(e) =>
                setYearsInRetirement(parseInt(e.target.value) || 25)
              }
            />
            <Input
              label="Annual growth rate (%)"
              type="number"
              value={growthRate}
              numeric
              min={0}
              max={20}
              step={0.5}
              helper="Expected investment return"
              onChange={(e) =>
                setGrowthRate(parseFloat(e.target.value) || 7)
              }
            />
            <Input
              label="Discount rate (%)"
              type="number"
              value={discountRate}
              numeric
              min={0}
              max={15}
              step={0.5}
              helper="Time value of money adjustment"
              onChange={(e) =>
                setDiscountRate(parseFloat(e.target.value) || 5)
              }
            />
          </div>

          {/* Summary */}
          <div className="card bg-bg-alt">
            <h3 className="text-h3 mb-2">Summary</h3>
            <div className="grid grid-cols-2 gap-2 text-body-sm">
              <span className="text-text-secondary">Age</span>
              <span className="font-mono">{age}</span>
              <span className="text-text-secondary">Filing status</span>
              <span>{filingStatus === "single" ? "Single" : "Married filing jointly"}</span>
              <span className="text-text-secondary">Income years</span>
              <span className="font-mono">{trajectory.length}</span>
              <span className="text-text-secondary">Traditional IRA</span>
              <span className="font-mono">
                ${traditionalBalance.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-comfortable border-t border-border">
        {step > 0 ? (
          <Button variant="secondary" type="button" onClick={handleBack}>
            Back
          </Button>
        ) : (
          <div />
        )}

        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={handleNext}>
            Continue
          </Button>
        ) : (
          <Button type="submit" loading={loading}>
            Analyze my scenario
          </Button>
        )}
      </div>
    </form>
  );
}
