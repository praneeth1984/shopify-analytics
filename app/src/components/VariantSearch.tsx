/**
 * Variant search combobox. Server-side autocomplete via /api/cogs?query=.
 * On selection, calls onSelect with a normalized payload that the parent
 * uses to open the inline cost editor in the COGS table.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Autocomplete,
  Icon,
  Text,
  Spinner,
  InlineStack,
  Box,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import type { CogsSearchVariant } from "../hooks/useCogs.js";

type Props = {
  search: (query: string, cursor?: string | null) => Promise<{ variants: CogsSearchVariant[] }>;
  onSelect: (variant: CogsSearchVariant) => void;
  disabled?: boolean;
};

export function VariantSearch({ search, onSelect, disabled }: Props) {
  const [input, setInput] = useState("");
  const [options, setOptions] = useState<CogsSearchVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const runSearch = useCallback(
    async (q: string) => {
      const myReq = ++seq.current;
      if (q.trim().length < 2) {
        setOptions([]);
        return;
      }
      setLoading(true);
      try {
        const result = await search(q.trim());
        if (seq.current !== myReq) return;
        setOptions(result.variants);
      } catch {
        if (seq.current !== myReq) return;
        setOptions([]);
      } finally {
        if (seq.current === myReq) setLoading(false);
      }
    },
    [search],
  );

  useEffect(() => {
    const t = setTimeout(() => void runSearch(input), 250);
    return () => clearTimeout(t);
  }, [input, runSearch]);

  const optionList = useMemo(
    () =>
      options.map((v) => ({
        value: v.variant_id,
        label: `${v.title}${v.variant_title ? ` — ${v.variant_title}` : ""}${v.sku ? ` (${v.sku})` : ""}`,
      })),
    [options],
  );

  const handleSelect = (selected: string[]) => {
    const id = selected[0];
    if (!id) return;
    const hit = options.find((v) => v.variant_id === id);
    if (hit) {
      onSelect(hit);
      setInput("");
      setOptions([]);
    }
  };

  return (
    <Autocomplete
      options={optionList}
      selected={[]}
      onSelect={handleSelect}
      loading={loading}
      textField={
        <Autocomplete.TextField
          onChange={setInput}
          label="Search products"
          labelHidden
          value={input}
          prefix={<Icon source={SearchIcon} tone="base" />}
          placeholder="Search by product title or SKU"
          autoComplete="off"
          disabled={disabled}
        />
      }
      emptyState={
        <Box padding="200">
          <InlineStack gap="200" blockAlign="center">
            {loading ? (
              <Spinner size="small" accessibilityLabel="Loading" />
            ) : (
              <Text as="span" tone="subdued">
                {input.trim().length < 2
                  ? "Type at least 2 characters."
                  : "No matching products."}
              </Text>
            )}
          </InlineStack>
        </Box>
      }
    />
  );
}
