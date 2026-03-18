"use client";

import dynamic from "next/dynamic";
import type { TrajectoryChartPoint } from "@/lib/types";
import { Tooltip } from "@/components/common/Tooltip";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface TrajectoryChartProps {
  data: TrajectoryChartPoint[];
  onYearClick?: (yearIndex: number) => void;
}

export function TrajectoryChart({ data, onYearClick }: TrajectoryChartProps) {
  if (!data || data.length === 0) return null;

  const categories = data.map((d) => String(d.year));
  const incomeData = data.map((d) => Math.round(d.income));
  const conversionData = data.map((d) => Math.round(d.conversion));

  // Get bracket boundaries from first year (they're the same across years for same filing status)
  const bracketBoundaries = data[0]?.bracket_boundaries || [];

  const options: ApexCharts.ApexOptions = {
    chart: {
      type: "bar" as const,
      stacked: true,
      fontFamily: "'JetBrains Mono', 'Geist Sans', system-ui, sans-serif",
      toolbar: { show: false },
      zoom: { enabled: false },
      background: "transparent",
      animations: {
        enabled: true,
        speed: 600,
      },
      events: {
        dataPointSelection: (
          _event: MouseEvent,
          _chartContext?: ApexCharts,
          options?: { dataPointIndex: number }
        ) => {
          if (options) onYearClick?.(options.dataPointIndex);
        },
      },
    },
    plotOptions: {
      bar: {
        borderRadius: 2,
        columnWidth: "60%",
      },
    },
    colors: ["#6B7280", "#2563EB"],
    grid: {
      borderColor: "rgba(0, 0, 0, 0.06)",
      strokeDashArray: 3,
    },
    xaxis: {
      categories,
      labels: {
        style: {
          fontSize: "12px",
          fontFamily: "'JetBrains Mono', monospace",
          colors: "#6B6B6B",
        },
      },
    },
    yaxis: {
      labels: {
        formatter: (val: number) =>
          val >= 1000 ? `$${(val / 1000).toFixed(0)}K` : `$${val}`,
        style: {
          fontSize: "11px",
          fontFamily: "'JetBrains Mono', monospace",
          colors: "#6B6B6B",
        },
      },
    },
    tooltip: {
      y: {
        formatter: (val: number) => `$${val.toLocaleString()}`,
      },
      style: { fontSize: "12px" },
    },
    legend: { show: false },
    states: {
      hover: { filter: { type: "none" } },
      active: { filter: { type: "none" } },
    },
    annotations: {
      yaxis: bracketBoundaries.map((boundary) => ({
        y: boundary,
        borderColor: "rgba(0, 0, 0, 0.12)",
        strokeDashArray: 4,
        label: {
          text: `$${(boundary / 1000).toFixed(0)}K`,
          position: "left" as const,
          style: {
            fontSize: "10px",
            fontFamily: "'JetBrains Mono', monospace",
            color: "#9B9B9B",
            background: "transparent",
          },
        },
      })),
    },
    dataLabels: { enabled: false },
  };

  const series = [
    { name: "Income", data: incomeData },
    { name: "Conversion", data: conversionData },
  ];

  return (
    <div className="flex flex-col gap-tight">
      <div className="flex items-center gap-2">
        <h3 className="text-h3 text-text-primary">
          Income + conversion by year
        </h3>
        <Tooltip content="Shows how the optimizer distributes conversions across your income trajectory. Click a year to see its bracket fill detail." />
      </div>

      {/* Custom legend */}
      <div className="flex items-center gap-4 text-body-sm">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-neutral" />
          Income
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-accent" />
          Conversion
        </span>
      </div>

      <div className="min-h-[200px]">
        <Chart
          options={options}
          series={series}
          type="bar"
          height={280}
          width="100%"
        />
      </div>
    </div>
  );
}
