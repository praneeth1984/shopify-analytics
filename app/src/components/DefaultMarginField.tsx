/**
 * Debounced input for the store-wide default margin %. Saves on blur or
 * after a 600ms idle. Calls the parent's `onSave(decimalFraction)` —
 * the field UX uses 0..100 (whole percent) and converts to 0..1 for the API.
 */

import { useEffect, useRef, useState } from "react";
import { TextField, InlineStack, Text } from "@shopify/polaris";

type Props = {
  initialValuePct: number; // 0..1
  onSave: (decimalFraction: number) => Promise<{ ok: true } | { ok: false; message: string }>;
  disabled?: boolean;
};

export function DefaultMarginField({ initialValuePct, onSave, disabled }: Props) {
  const [value, setValue] = useState<string>(toUiPct(initialValuePct));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync if parent reloads.
  useEffect(() => {
    setValue(toUiPct(initialValuePct));
  }, [initialValuePct]);

  const trigger = (raw: string) => {
    setValue(raw);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void commit(raw);
    }, 600);
  };

  const commit = async (raw: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      setError("Enter a percent between 0 and 100");
      return;
    }
    setError(null);
    setSaving(true);
    const result = await onSave(num / 100);
    setSaving(false);
    if (!result.ok) setError(result.message);
  };

  return (
    <InlineStack gap="200" blockAlign="center">
      <div style={{ maxWidth: "180px" }}>
        <TextField
          label="Default margin %"
          type="number"
          value={value}
          onChange={trigger}
          onBlur={() => void commit(value)}
          autoComplete="off"
          suffix="%"
          min={0}
          max={100}
          step={0.1}
          error={error ?? undefined}
          disabled={disabled || saving}
          helpText="Used when a product has no per-unit cost set."
        />
      </div>
      {saving ? (
        <Text as="span" tone="subdued" variant="bodySm">
          Saving…
        </Text>
      ) : null}
    </InlineStack>
  );
}

function toUiPct(decimal: number): string {
  if (!Number.isFinite(decimal)) return "0";
  return (Math.round(decimal * 1000) / 10).toString();
}
