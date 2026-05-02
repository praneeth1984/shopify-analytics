import { useState, useEffect } from "react";
import {
  BlockStack, Card, Text, TextField, Button, InlineStack, Banner,
  IndexTable, Badge, Spinner, EmptyState,
} from "@shopify/polaris";
import type { NonEmptyArray } from "@shopify/polaris/build/ts/src/types.js";
import type { GatewayRate } from "@fbc/shared";
import { usePreferences } from "../../hooks/usePreferences.js";
import { showToast } from "../../lib/toast.js";

const HEADINGS: NonEmptyArray<{ title: string }> = [
  { title: "Gateway" },
  { title: "Rate %" },
  { title: "Fixed fee" },
  { title: "" },
];

const COMMON_GATEWAYS: GatewayRate[] = [
  { gateway: "shopify_payments", pct: 2.9, fixed_minor: 30 },
  { gateway: "paypal", pct: 3.49, fixed_minor: 49 },
  { gateway: "stripe", pct: 2.9, fixed_minor: 30 },
];

function displayName(gateway: string): string {
  const map: Record<string, string> = {
    shopify_payments: "Shopify Payments",
    paypal: "PayPal",
    stripe: "Stripe",
  };
  return map[gateway.toLowerCase()] ?? gateway;
}

export function GatewayRatesTab() {
  const prefs = usePreferences();
  const [rates, setRates] = useState<GatewayRate[]>([]);
  const [newGateway, setNewGateway] = useState("");
  const [newPct, setNewPct] = useState("");
  const [newFixed, setNewFixed] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ gateway?: string; pct?: string; fixed?: string }>({});

  useEffect(() => {
    if (prefs.preferences?.gatewayRates !== undefined) {
      setRates(prefs.preferences.gatewayRates);
    }
  }, [prefs.preferences]);

  async function saveRates(updated: GatewayRate[]) {
    setSaving(true);
    try {
      await prefs.setPreference("gatewayRates", updated);
      setRates(updated);
      showToast("Gateway rates saved");
    } finally {
      setSaving(false);
    }
  }

  function validate(): boolean {
    const e: typeof errors = {};
    if (!newGateway.trim()) e.gateway = "Enter a gateway name";
    const pctNum = parseFloat(newPct);
    if (isNaN(pctNum) || pctNum < 0 || pctNum > 100) e.pct = "Enter a percentage (0–100)";
    const fixedNum = parseFloat(newFixed);
    if (isNaN(fixedNum) || fixedNum < 0) e.fixed = "Enter a non-negative amount";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleAdd() {
    if (!validate()) return;
    const rate: GatewayRate = {
      gateway: newGateway.trim().toLowerCase().replace(/\s+/g, "_"),
      pct: parseFloat(newPct),
      fixed_minor: Math.round(parseFloat(newFixed) * 100),
    };
    const updated = [...rates.filter((r) => r.gateway !== rate.gateway), rate];
    void saveRates(updated);
    setNewGateway("");
    setNewPct("");
    setNewFixed("");
    setErrors({});
  }

  function handleRemove(gateway: string) {
    void saveRates(rates.filter((r) => r.gateway !== gateway));
  }

  function handleAddCommon(preset: GatewayRate) {
    if (rates.some((r) => r.gateway === preset.gateway)) return;
    void saveRates([...rates, preset]);
  }

  if (prefs.loading) return <Spinner size="small" />;

  return (
    <BlockStack gap="400">
      <Text as="p" tone="subdued">
        Configure your payment processing rates so the P&L and Product reports can estimate fees.
        Actual fees may vary — these are estimates only.
      </Text>

      {prefs.error && (
        <Banner tone="critical" title="Could not load preferences">
          <p>{prefs.error}</p>
        </Banner>
      )}

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingMd">Quick add</Text>
          <InlineStack gap="200" wrap>
            {COMMON_GATEWAYS.map((g) => (
              <Button
                key={g.gateway}
                size="slim"
                disabled={rates.some((r) => r.gateway === g.gateway)}
                onClick={() => handleAddCommon(g)}
              >
                {`${displayName(g.gateway)} (${g.pct}% + $${(g.fixed_minor / 100).toFixed(2)})`}
              </Button>
            ))}
          </InlineStack>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingMd">Add custom rate</Text>
          <InlineStack gap="200" blockAlign="end" wrap>
            <div style={{ minWidth: "180px" }}>
              <TextField
                label="Gateway name"
                value={newGateway}
                onChange={setNewGateway}
                placeholder="e.g. shopify_payments"
                autoComplete="off"
                error={errors.gateway}
              />
            </div>
            <div style={{ width: "100px" }}>
              <TextField
                label="Rate %"
                value={newPct}
                onChange={setNewPct}
                placeholder="2.9"
                suffix="%"
                autoComplete="off"
                error={errors.pct}
              />
            </div>
            <div style={{ width: "120px" }}>
              <TextField
                label="Fixed fee"
                value={newFixed}
                onChange={setNewFixed}
                placeholder="0.30"
                prefix="$"
                autoComplete="off"
                error={errors.fixed}
              />
            </div>
            <Button onClick={handleAdd} loading={saving} variant="primary">Add</Button>
          </InlineStack>
        </BlockStack>
      </Card>

      <Card padding="0">
        {rates.length === 0 ? (
          <EmptyState heading="No gateway rates configured" image="">
            <p>Add rates above to see estimated payment fees in your P&L and product reports.</p>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={{ singular: "gateway", plural: "gateways" }}
            itemCount={rates.length}
            headings={HEADINGS}
            selectable={false}
          >
            {rates.map((r, idx) => (
              <IndexTable.Row id={r.gateway} key={r.gateway} position={idx}>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="semibold">{displayName(r.gateway)}</Text>
                  {" "}
                  <Badge tone="info">{r.gateway}</Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>{r.pct.toFixed(2)}%</IndexTable.Cell>
                <IndexTable.Cell>${(r.fixed_minor / 100).toFixed(2)}</IndexTable.Cell>
                <IndexTable.Cell>
                  <Button tone="critical" variant="plain" size="slim" onClick={() => handleRemove(r.gateway)}>
                    Remove
                  </Button>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        )}
      </Card>
    </BlockStack>
  );
}
