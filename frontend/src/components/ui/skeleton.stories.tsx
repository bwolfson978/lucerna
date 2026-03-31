import type { Meta, StoryObj } from "@storybook/react";
import { Skeleton } from "./skeleton";
import { MetricCardSkeleton, ChartSkeleton, TableSkeleton } from "@/components/common/Skeleton";

const meta: Meta<typeof Skeleton> = {
  title: "UI/Skeleton",
  component: Skeleton,
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Default: Story = {
  args: { className: "h-8 w-48" },
};

export const MetricCard: Story = {
  render: () => <MetricCardSkeleton />,
};

export const Chart: Story = {
  render: () => <ChartSkeleton />,
};

export const Table: Story = {
  render: () => <TableSkeleton rows={4} />,
};
