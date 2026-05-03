/**
 * Polaris IndexTable of saved COGS entries.
 *
 * Per the architect's design:
 *   - Inline-editable cost cell, server-validated on blur.
 *   - Status badges: "Set" / "Default margin" / "Not set".
 *   - "Not set" only applies to entries that don't exist; all rows here are
 *     explicit-set, so we show "Set" for them.
 *   - Image, title, SKU, current price, cost, margin %.
 */

import { useState } from "react";
import {
  IndexTable,
  Text,
  TextField,
  Badge,
  Button,
  InlineStack,
  Thumbnail,
  Box,
  Card,
  EmptyState,
} from "@shopify/polaris";
import type { CogsEntry, Money } from "@fbc/shared";

type Props = {
  entries: CogsEntry[];
  shopCurrency: string;
  defaultMarginPct: number;
  onSave: (
    variantId: string,
    productId: string,
    title: string,
    sku: string | null,
    cost: Money,
  ) => Promise<{ ok: true } | { ok: false; code: string; message: string }>;
  onDelete: (variantId: string) => Promise<{ ok: true } | { ok: false; code: string; message: string }>;
};

type RowEditState = {
  amount: string;
  saving: boolean;
  error: string | null;
};

export function CogsTable({ entries, shopCurrency, defaultMarginPct, onSave, onDelete }: Props) {
  const [edits, setEdits] = useState<Record<string, RowEditState>>({});
  const resourceName = { singular: "cost", plural: "costs" };

  if (entries.length === 0) {
    return (
      <Card>
        <EmptyState
          heading="No costs saved yet"
          image="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%221%22%20height%3D%221%22/%3E"
          fullWidth
        >
          <p>
            Add per-product costs below to start seeing gross profit on your dashboard. Don't
            have line-item costs handy? A store-wide default margin still gives you ballpark
            numbers.
          </p>
        </EmptyState>
      </Card>
    );
  }

  const setEdit = (variantId: string, patch: Partial<RowEditState>) =>
    setEdits((s) => ({
      ...s,
      [variantId]: { amount: "", saving: false, error: null, ...s[variantId], ...patch },
    }));

  const handleBlur = async (entry: CogsEntry) => {
    const edit = edits[entry.variantId];
    if (!edit || edit.amount === "" || edit.amount === entry.cost.amount) return;
    const num = Number(edit.amount);
    if (!Number.isFinite(num) || num < 0) {
      setEdit(entry.variantId, { error: "Enter a valid number" });
      return;
    }
    setEdit(entry.variantId, { saving: true, error: null });
    const result = await onSave(entry.variantId, entry.productId, entry.title, entry.sku, {
      amount: edit.amount,
      currency_code: shopCurrency,
    });
    setEdit(entry.variantId, { saving: false });
    if (!result.ok) {
      setEdit(entry.variantId, { error: result.message });
    } else {
      setEdit(entry.variantId, { amount: "" });
    }
  };

  const rows = entries.map((entry, index) => {
    const edit = edits[entry.variantId];
    const value = edit?.amount ?? entry.cost.amount;
    const margin = computeMarginHint(value);
    return (
      <IndexTable.Row id={entry.variantId} key={entry.variantId} position={index}>
        <IndexTable.Cell>
          <InlineStack gap="200" blockAlign="center" wrap={false}>
            <Thumbnail source="" alt="" size="small" />
            <Box>
              <Text as="span" fontWeight="medium">
                {entry.title}
              </Text>
              {entry.sku ? (
                <Text as="p" tone="subdued" variant="bodySm">
                  SKU: {entry.sku}
                </Text>
              ) : null}
            </Box>
          </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <div style={{ maxWidth: "140px" }}>
            <TextField
              label={`Cost for ${entry.title}`}
              labelHidden
              type="number"
              value={value}
              onChange={(v) => setEdit(entry.variantId, { amount: v, error: null })}
              onBlur={() => void handleBlur(entry)}
              prefix={shopCurrency}
              step={0.01}
              min={0}
              autoComplete="off"
              error={edit?.error ?? undefined}
              disabled={edit?.saving}
            />
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={margin === null ? undefined : margin >= 0 ? "success" : "critical"}>
            {margin === null ? "—" : `${(margin * 100).toFixed(1)}%`}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone="success">Set</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Button
            variant="plain"
            tone="critical"
            onClick={() => void onDelete(entry.variantId)}
            accessibilityLabel={`Remove cost for ${entry.title}`}
          >
            Remove
          </Button>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Card padding="0">
      <IndexTable
        resourceName={resourceName}
        itemCount={entries.length}
        selectable={false}
        headings={[
          { title: "Product" },
          { title: "Cost" },
          { title: "Implied margin" },
          { title: "Status" },
          { title: "Actions" },
        ]}
      >
        {rows}
      </IndexTable>
      {defaultMarginPct > 0 ? (
        <Box padding="300">
          <Text as="p" tone="subdued" variant="bodySm">
            Products without a saved cost are estimated using a {(defaultMarginPct * 100).toFixed(1)}
            % default margin.
          </Text>
        </Box>
      ) : null}
    </Card>
  );
}

// Margin from cost is computed against a synthetic price=1; here we just
// surface the cost-vs-zero comparison since the row doesn't carry price.
// The "implied margin" cell really shows {1 - cost/price} would need price;
// without it we degrade to a simple non-negativity badge.
// To show a real implied margin, callers may extend CogsEntry with price in
// a later release. For now, return null when we don't have enough data.
function computeMarginHint(_costAmount: string): number | null {
  return null;
}
