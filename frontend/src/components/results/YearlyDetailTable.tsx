"use client";

import { useState } from "react";
import type { YearlyDetail } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/utils/formatting";

interface YearlyDetailTableProps {
  details: YearlyDetail[];
}

export function YearlyDetailTable({ details }: YearlyDetailTableProps) {
  const [expanded, setExpanded] = useState(false);

  if (!details || details.length === 0) return null;

  return (
    <div className="flex flex-col gap-default">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-h3 text-text-primary hover:text-accent transition-colors duration-150"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`transition-transform duration-150 ${
            expanded ? "rotate-90" : ""
          }`}
        >
          <path
            d="M4 2l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Year-by-year detail
      </button>

      {expanded && (
        <div className="card overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary text-left">
                <th className="py-3 pr-4 font-medium">Year</th>
                <th className="py-3 pr-4 font-medium text-right">Income</th>
                <th className="py-3 pr-4 font-medium text-right">
                  Conversion
                </th>
                <th className="py-3 pr-4 font-medium text-right">
                  Tax cost
                </th>
                <th className="py-3 pr-4 font-medium text-right">
                  Effective rate
                </th>
                <th className="py-3 font-medium text-right">
                  Marginal bracket
                </th>
              </tr>
            </thead>
            <tbody>
              {details.map((row, i) => (
                <tr
                  key={row.year}
                  className={`border-b border-border last:border-0 ${
                    i % 2 === 1 ? "bg-bg-alt" : ""
                  }`}
                >
                  <td className="py-3 pr-4 font-mono">{row.year}</td>
                  <td className="py-3 pr-4 font-mono text-right">
                    {formatCurrency(row.income)}
                  </td>
                  <td className="py-3 pr-4 font-mono text-right text-accent">
                    {formatCurrency(row.conversion)}
                  </td>
                  <td className="py-3 pr-4 font-mono text-right">
                    {formatCurrency(row.tax_cost)}
                  </td>
                  <td className="py-3 pr-4 font-mono text-right">
                    {formatPercent(row.effective_rate)}
                  </td>
                  <td className="py-3 font-mono text-right">
                    {formatPercent(row.marginal_bracket)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
