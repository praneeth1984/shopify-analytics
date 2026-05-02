import { Select } from "@shopify/polaris";
import type { ComparisonMode } from "@fbc/shared";

const OPTIONS: { label: string; value: ComparisonMode }[] = [
  { label: "vs. previous period", value: "previous_period" },
  { label: "vs. same period last year", value: "previous_year" },
  { label: "No comparison", value: "none" },
];

type Props = {
  value: ComparisonMode;
  onChange: (value: ComparisonMode) => void;
};

export function ComparisonPicker({ value, onChange }: Props) {
  return (
    <Select
      label="Compare to"
      labelHidden
      options={OPTIONS}
      value={value}
      onChange={(v) => onChange(v as ComparisonMode)}
    />
  );
}
