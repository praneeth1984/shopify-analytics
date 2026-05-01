/**
 * Settings page — per-variant COGS entry + store-wide default margin.
 *
 * UX shape:
 *   1. Default-margin field (debounced PATCH).
 *   2. Variant search box. Choosing a result reveals an inline cost editor
 *      that defaults to the current price * (1 - defaultMarginPct).
 *   3. Table of saved costs with inline editing and removal.
 *   4. CogsCapBanner appears when used >= cap on Free.
 *
 * All mutations route through useCogs(); errors are surfaced as Polaris
 * toasts via App Bridge when available, falling back to inline.
 */

import { useState } from "react";
import {
  Page,
  Card,
  BlockStack,
  Layout,
  Text,
  TextField,
  Button,
  InlineStack,
  Box,
  Banner,
  Divider,
  EmptyState,
} from "@shopify/polaris";
import { useCogs } from "../hooks/useCogs.js";
import type { CogsSearchVariant } from "../hooks/useCogs.js";
import { usePreferences } from "../hooks/usePreferences.js";
import { CogsTable } from "../components/CogsTable.js";
import { CogsCapBanner } from "../components/CogsCapBanner.js";
import { CogsBackupCard } from "../components/CogsBackupCard.js";
import { DefaultMarginField } from "../components/DefaultMarginField.js";
import { VariantSearch } from "../components/VariantSearch.js";
import { showToast } from "../lib/toast.js";

export function Settings() {
  const cogs = useCogs();
  const prefs = usePreferences();
  const [pendingVariant, setPendingVariant] = useState<CogsSearchVariant | null>(null);
  const [pendingCost, setPendingCost] = useState("");
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [savingPending, setSavingPending] = useState(false);

  const used = cogs.entries.length;
  const atCap = cogs.plan === "free" && Number.isFinite(cogs.cap) && used >= cogs.cap;
  const totalCount = cogs.meta?.totalCount ?? 0;
  // Show the backup tip once any costs exist and the merchant hasn't dismissed it.
  const showBackupTip =
    totalCount > 0 && prefs.preferences?.cogsBackupTipDismissed !== true;

  const handleSelectVariant = (v: CogsSearchVariant) => {
    setPendingVariant(v);
    setPendingError(null);
    // Pre-fill with default-margin estimate when available.
    const margin = cogs.meta?.defaultMarginPct ?? 0;
    if (margin > 0) {
      const num = Number(v.price.amount);
      if (Number.isFinite(num)) {
        setPendingCost((num * (1 - margin)).toFixed(2));
        return;
      }
    }
    setPendingCost(v.existing_cost?.amount ?? "");
  };

  const handleSavePending = async () => {
    if (!pendingVariant) return;
    const num = Number(pendingCost);
    if (!Number.isFinite(num) || num < 0) {
      setPendingError("Enter a valid non-negative cost.");
      return;
    }
    setSavingPending(true);
    setPendingError(null);
    const result = await cogs.upsert({
      variantId: pendingVariant.variant_id,
      productId: pendingVariant.product_id,
      title: pendingVariant.display_name,
      sku: pendingVariant.sku,
      cost: { amount: pendingCost, currency_code: pendingVariant.price.currency_code },
    });
    setSavingPending(false);
    if (!result.ok) {
      if (result.code === "COGS_CAP_EXCEEDED") {
        setPendingError("Free plan cap reached. Upgrade to Pro to add more SKUs.");
      } else {
        setPendingError(result.message);
      }
      return;
    }
    showToast(`Saved cost for ${pendingVariant.display_name}`);
    setPendingVariant(null);
    setPendingCost("");
  };

  const handleSaveTableRow = async (
    variantId: string,
    productId: string,
    title: string,
    sku: string | null,
    cost: { amount: string; currency_code: string },
  ) => {
    const result = await cogs.upsert({ variantId, productId, title, sku, cost });
    if (result.ok) showToast("Cost updated");
    return result;
  };

  const handleDeleteRow = async (variantId: string) => {
    const result = await cogs.remove(variantId);
    if (result.ok) showToast("Cost removed");
    return result;
  };

  return (
    <Page
      title="Settings"
      subtitle="Tell us what your products cost so we can show profit, not just revenue."
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {cogs.error ? (
              <Banner tone="critical" title="Could not load settings">
                <p>{cogs.error}</p>
              </Banner>
            ) : null}

            {showBackupTip ? (
              <Banner
                tone="info"
                title="Tip: back up your costs"
                onDismiss={() => void prefs.setPreference("cogsBackupTipDismissed", true)}
              >
                <p>
                  Export your costs to CSV regularly. Uninstalling the app removes all stored
                  data, including saved costs.
                </p>
              </Banner>
            ) : null}

            <CogsCapBanner plan={cogs.plan} used={used} cap={cogs.cap} />

            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  Default margin
                </Text>
                <Text as="p" tone="subdued">
                  When a product has no per-unit cost saved, we'll use this margin to estimate
                  profit. Enter the percent of the selling price you keep after cost of goods.
                </Text>
                <DefaultMarginField
                  initialValuePct={cogs.meta?.defaultMarginPct ?? 0}
                  onSave={async (pct) => {
                    const r = await cogs.setDefaultMargin(pct);
                    if (r.ok) showToast("Default margin saved");
                    return r.ok ? { ok: true } : { ok: false, message: r.message };
                  }}
                  disabled={!cogs.meta || cogs.loading}
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  Add cost for a product
                </Text>
                <Text as="p" tone="subdued">
                  Search by product title or SKU. {cogs.plan === "free" && Number.isFinite(cogs.cap)
                    ? `Free plan: ${used} of ${cogs.cap} costs used.`
                    : null}
                </Text>
                {atCap ? null : (
                  <VariantSearch
                    search={async (q) => cogs.search(q)}
                    onSelect={handleSelectVariant}
                    disabled={atCap}
                  />
                )}
                {pendingVariant ? (
                  <Box
                    background="bg-surface-secondary"
                    padding="300"
                    borderRadius="200"
                  >
                    <BlockStack gap="200">
                      <Text as="p" fontWeight="medium">
                        {pendingVariant.display_name}
                        {pendingVariant.sku ? ` (SKU: ${pendingVariant.sku})` : ""}
                      </Text>
                      <Text as="p" tone="subdued" variant="bodySm">
                        Current price: {pendingVariant.price.amount}{" "}
                        {pendingVariant.price.currency_code}
                      </Text>
                      <InlineStack gap="200" blockAlign="end" wrap={false}>
                        <div style={{ maxWidth: "180px" }}>
                          <TextField
                            label="Cost"
                            type="number"
                            value={pendingCost}
                            onChange={(v) => {
                              setPendingCost(v);
                              setPendingError(null);
                            }}
                            prefix={pendingVariant.price.currency_code}
                            step={0.01}
                            min={0}
                            autoComplete="off"
                            error={pendingError ?? undefined}
                          />
                        </div>
                        <Button
                          variant="primary"
                          onClick={() => void handleSavePending()}
                          loading={savingPending}
                          disabled={savingPending}
                        >
                          Save cost
                        </Button>
                        <Button
                          onClick={() => {
                            setPendingVariant(null);
                            setPendingCost("");
                            setPendingError(null);
                          }}
                          disabled={savingPending}
                        >
                          Cancel
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Box>
                ) : null}
              </BlockStack>
            </Card>

            <Divider />

            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                Saved costs
              </Text>
              {cogs.entries.length === 0 ? (
                <Card>
                  <EmptyState heading="No saved costs yet" image="">
                    <p>Use the search above to add your first product cost.</p>
                  </EmptyState>
                </Card>
              ) : (
                <CogsTable
                  entries={cogs.entries}
                  shopCurrency={cogs.meta?.currency_code ?? "USD"}
                  defaultMarginPct={cogs.meta?.defaultMarginPct ?? 0}
                  onSave={handleSaveTableRow}
                  onDelete={handleDeleteRow}
                />
              )}
            </BlockStack>

            <CogsBackupCard onImported={() => cogs.reload()} />
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
