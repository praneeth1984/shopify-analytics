import { useState } from "react";
import {
  Card, BlockStack, Text, TextField, Button, InlineStack, Box, Banner,
  Divider, EmptyState, Badge, Modal,
} from "@shopify/polaris";
import { useCogs } from "../../hooks/useCogs.js";
import type { CogsSearchVariant } from "../../hooks/useCogs.js";
import { usePreferences } from "../../hooks/usePreferences.js";
import { CogsTable } from "../../components/CogsTable.js";
import { CogsCapBanner } from "../../components/CogsCapBanner.js";
import { CogsBackupCard } from "../../components/CogsBackupCard.js";
import { DefaultMarginField } from "../../components/DefaultMarginField.js";
import { VariantSearch } from "../../components/VariantSearch.js";
import { showToast } from "../../lib/toast.js";
import { navigate } from "../../App.js";

export function CogsSettingsTab() {
  const cogs = useCogs();
  const prefs = usePreferences();
  const [pendingVariant, setPendingVariant] = useState<CogsSearchVariant | null>(null);
  const [pendingCost, setPendingCost] = useState("");
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [savingPending, setSavingPending] = useState(false);

  const used = cogs.entries.length;
  const atCap = cogs.plan === "free" && Number.isFinite(cogs.cap) && used >= cogs.cap;
  const totalCount = cogs.meta?.totalCount ?? 0;
  const showBackupTip = totalCount > 0 && prefs.preferences?.cogsBackupTipDismissed !== true;

  const handleSelectVariant = (v: CogsSearchVariant) => {
    setPendingVariant(v);
    setPendingError(null);
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
    variantId: string, productId: string, title: string,
    sku: string | null, cost: { amount: string; currency_code: string },
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

  const [syncBanner, setSyncBanner] = useState<{ synced: number; capped: boolean } | null>(null);
  const [confirmSyncOpen, setConfirmSyncOpen] = useState(false);

  const handleSync = async (overwrite = false) => {
    setSyncBanner(null);
    const result = await cogs.syncFromShopify(overwrite);
    if (!result.ok) {
      showToast(result.message, { isError: true });
      return;
    }
    const { synced, capped } = result.result;
    if (synced === 0) {
      showToast("No new costs found in Shopify.");
    } else {
      showToast(`Synced ${synced} cost${synced !== 1 ? "s" : ""} from Shopify.`);
    }
    if (capped) setSyncBanner({ synced, capped: true });
  };

  return (
    <BlockStack gap="400">
      {cogs.error && (
        <Banner tone="critical" title="Could not load settings">
          <p>{cogs.error}</p>
        </Banner>
      )}

      {showBackupTip && (
        <Banner
          tone="info"
          title="Tip: back up your costs"
          onDismiss={() => void prefs.setPreference("cogsBackupTipDismissed", true)}
        >
          <p>Export your costs to CSV regularly. Uninstalling the app removes all stored data.</p>
        </Banner>
      )}

      <CogsCapBanner plan={cogs.plan} used={used} cap={cogs.cap} />

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingMd">Default margin</Text>
          <Text as="p" tone="subdued">
            When a product has no per-unit cost saved, we'll use this margin to estimate profit.
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

      {syncBanner && (
        <Banner
          tone="warning"
          title={`Free plan: only ${syncBanner.synced} costs synced`}
          onDismiss={() => setSyncBanner(null)}
        >
          <p>Upgrade to Pro to sync all your product costs without limits.</p>
        </Banner>
      )}

      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h3" variant="headingMd">Sync from Shopify</Text>
            <Badge tone="info">Recommended</Badge>
          </InlineStack>
          <Text as="p" tone="subdued">
            Import costs directly from Shopify's "Cost per item" field (Products → variant → Inventory).
            Existing manual overrides are preserved — only variants without a saved cost are filled in.
          </Text>
          <InlineStack gap="200">
            <Button
              variant="primary"
              onClick={() => void handleSync(false)}
              loading={cogs.syncing}
              disabled={cogs.loading}
            >
              Sync from Shopify
            </Button>
            {cogs.entries.length > 0 && (
              <Button
                onClick={() => setConfirmSyncOpen(true)}
                loading={cogs.syncing}
                disabled={cogs.loading}
                tone="critical"
              >
                Overwrite all with Shopify costs
              </Button>
            )}
          </InlineStack>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingMd">Add cost for a product</Text>
          <Text as="p" tone="subdued">
            Search by product title or SKU.{" "}
            {cogs.plan === "free" && Number.isFinite(cogs.cap)
              ? `Free plan: ${used} of ${cogs.cap} costs used.`
              : null}
          </Text>
          {!atCap && (
            <VariantSearch search={async (q) => cogs.search(q)} onSelect={handleSelectVariant} disabled={atCap} />
          )}
          {pendingVariant && (
            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
              <BlockStack gap="200">
                <Text as="p" fontWeight="medium">
                  {pendingVariant.display_name}
                  {pendingVariant.sku ? ` (SKU: ${pendingVariant.sku})` : ""}
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Current price: {pendingVariant.price.amount} {pendingVariant.price.currency_code}
                </Text>
                <InlineStack gap="200" blockAlign="end" wrap={false}>
                  <div style={{ maxWidth: "180px" }}>
                    <TextField
                      label="Cost"
                      type="number"
                      value={pendingCost}
                      onChange={(v) => { setPendingCost(v); setPendingError(null); }}
                      prefix={pendingVariant.price.currency_code}
                      step={0.01}
                      min={0}
                      autoComplete="off"
                      error={pendingError ?? undefined}
                    />
                  </div>
                  <Button variant="primary" onClick={() => void handleSavePending()} loading={savingPending}>
                    Save cost
                  </Button>
                  <Button onClick={() => { setPendingVariant(null); setPendingCost(""); setPendingError(null); }} disabled={savingPending}>
                    Cancel
                  </Button>
                </InlineStack>
              </BlockStack>
            </Box>
          )}
        </BlockStack>
      </Card>

      <Divider />

      <BlockStack gap="200">
        <Text as="h3" variant="headingMd">Saved costs</Text>
        {cogs.entries.length === 0 ? (
          <Card>
            <EmptyState heading="No saved costs yet" image="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%221%22%20height%3D%221%22/%3E">
              <p>
                Sync costs from Shopify's "Cost per item" field, or add them manually using the search above.
              </p>
              <Button
                variant="primary"
                onClick={() => void handleSync(false)}
                loading={cogs.syncing}
                disabled={cogs.loading}
              >
                Sync from Shopify
              </Button>
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

      <Text as="p" variant="bodySm" tone="subdued">
        Need to track expenses like ad spend?{" "}
        <Button variant="plain" onClick={() => navigate("/settings/expenses")}>
          Go to Expenses
        </Button>
      </Text>

      <Modal
        open={confirmSyncOpen}
        onClose={() => setConfirmSyncOpen(false)}
        title="Replace your costs with Shopify's costs?"
        primaryAction={{
          content: "Yes, overwrite all",
          destructive: true,
          onAction: () => {
            void handleSync(true);
            setConfirmSyncOpen(false);
          },
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setConfirmSyncOpen(false) },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Any costs you've edited manually will be replaced with values from Shopify's
            "Cost per item" field. This cannot be undone.
          </Text>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}
