import { Select } from "@shopify/polaris";
import type { DateRangePreset } from "@fbc/shared";

const OPTIONS: { label: string; value: DateRangePreset }[] = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "last_7_days" },
  { label: "Last 30 days", value: "last_30_days" },
  { label: "Last 90 days", value: "last_90_days" },
  { label: "Month to date", value: "month_to_date" },
  { label: "Year to date", value: "year_to_date" },
];

type Props = {
  value: DateRangePreset;
  onChange: (value: DateRangePreset) => void;
};

export function RangePicker({ value, onChange }: Props) {
  return (
    <Select
      label="Date range"
      labelHidden
      options={OPTIONS}
      value={value}
      onChange={(v) => onChange(v as DateRangePreset)}
    />
  );
}
