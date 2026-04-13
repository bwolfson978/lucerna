"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import fallbackData from "./federal-brackets-2026.json";

export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number;
}

export interface TaxConfig {
  standard_deduction: {
    single: number;
    married_filing_jointly: number;
  };
  brackets: {
    single: TaxBracket[];
    married_filing_jointly: TaxBracket[];
  };
}

const fallbackConfig: TaxConfig = {
  standard_deduction: fallbackData.standard_deduction,
  brackets: fallbackData.brackets,
};

const TaxConfigContext = createContext<TaxConfig>(fallbackConfig);

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function TaxConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<TaxConfig>(fallbackConfig);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/tax-config`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((data: TaxConfig) => {
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        // Backend unreachable — keep using bundled fallback
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <TaxConfigContext.Provider value={config}>{children}</TaxConfigContext.Provider>;
}

export function useTaxConfig(): TaxConfig {
  return useContext(TaxConfigContext);
}

/** Get the fallback config directly (for non-React contexts or tests). */
export function getFallbackTaxConfig(): TaxConfig {
  return fallbackConfig;
}
