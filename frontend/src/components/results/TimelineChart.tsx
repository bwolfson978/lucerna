"use client";

import dynamic from "next/dynamic";
import type { TimelineChartPoint } from "@/lib/types";
import { CHART_COLORS } from "@/lib/utils/constants";
import { formatAxisCurrency, formatCurrency } from "@/lib/utils/formatting";
import { DATA_FONT_FAMILY } from "@/lib/utils/styleConstants";
import { Tooltip } from "@/components/common/Tooltip";
import { Card } from "@/components/ui/card";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface TimelineChartProps {
  data: TimelineChartPoint[];
  onYearClick?: (yearIndex: number) => void;
}

export function TimelineChart({ data, onYearClick }: TimelineChartProps) {
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
      fontFamily: "'Manrope', 'DM Sans', system-ui, sans-serif",
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
        borderRadius: 6,
        borderRadiusApplication: "end" as const,
        columnWidth: "52%",
      },
    },
    colors: [CHART_COLORS.income, CHART_COLORS.conversion],
    fill: {
      type: "gradient",
      gradient: {
        shade: "dark",
        type: "vertical",
        shadeIntensity: 0.15,
        opacityFrom: 0.85,
        opacityTo: 0.35,
        stops: [0, 40, 100],
      },
    },
    grid: {
      borderColor: "rgba(255, 255, 255, 0.04)",
      strokeDashArray: 4,
      padding: { left: 8, right: 8 },
    },
    xaxis: {
      categories,
      labels: {
        style: {
          fontSize: "13px",
          fontFamily: DATA_FONT_FAMILY,
          colors: "#B8B0D2",
        },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        formatter: (val: number) => formatAxisCurrency(val),
        style: {
          fontSize: "12px",
          fontFamily: DATA_FONT_FAMILY,
          colors: "#8B8A99",
        },
      },
    },
    tooltip: {
      theme: "dark",
      y: {
        formatter: (val: number) => formatCurrency(val),
      },
      style: { fontSize: "13px" },
    },
    legend: { show: false },
    states: {
      hover: {
        filter: { type: "darken", value: 0.05 } as unknown as { type?: string },
      },
      active: { filter: { type: "none" } },
    },
    annotations: {
      yaxis: bracketBoundaries.map((boundary) => ({
        y: boundary,
        borderColor: "rgba(255, 255, 255, 0.08)",
        strokeDashArray: 4,
        label: {
          text: formatAxisCurrency(boundary),
          position: "left" as const,
          style: {
            fontSize: "12px",
            fontFamily: DATA_FONT_FAMILY,
            color: "#8B8A99",
            background: "transparent",
          },
        },
      })),
    },
    dataLabels: { enabled: false },
  };

  const series = [
    { name: "Earned Income", data: incomeData },
    { name: "Roth Conversion", data: conversionData },
  ];

  return (
    <Card className="flex flex-col gap-default">
      <div className="flex items-center gap-2">
        <h3 className="text-h3 text-text-primary">
          Earned income + Roth conversion by year
        </h3>
        <Tooltip content="Shows how the optimizer distributes Roth conversions across your income timeline. Click a year to see its bracket fill detail." />
      </div>

      {/* Custom legend */}
      <div className="flex items-center gap-5 text-body-sm text-text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: CHART_COLORS.income }} />
          Earned Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: CHART_COLORS.conversion }} />
          Roth Conversion
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
    </Card>
  );
}
