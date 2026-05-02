import { useState, useEffect } from "react";
import {
  Card, BlockStack, Text, TextField, Button, Banner, InlineGrid,
  Spinner, InlineStack, Divider,
} from "@shopify/polaris";
import { useExpenses } from "../hooks/useExpenses.js";
import type { MonthlyExpenses } from "@fbc/shared";

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonth(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type FieldState = {
  meta_ads: string;
  google_ads: string;
  tiktok_ads: string;
  other_marketing: string;
};

function fromExpenses(e: MonthlyExpenses): FieldState {
  return {
    meta_ads: e.meta_ads > 0 ? String(e.meta_ads) : "",
    google_ads: e.google_ads > 0 ? String(e.google_ads) : "",
    tiktok_ads: e.tiktok_ads > 0 ? String(e.tiktok_ads) : "",
    other_marketing: e.other_marketing > 0 ? String(e.other_marketing) : "",
  };
}

function toExpenses(fields: FieldState): MonthlyExpenses {
  return {
    meta_ads: parseFloat(fields.meta_ads) || 0,
    google_ads: parseFloat(fields.google_ads) || 0,
    tiktok_ads: parseFloat(fields.tiktok_ads) || 0,
    other_marketing: parseFloat(fields.other_marketing) || 0,
    other: [],
  };
}

function MonthExpensesEditor({ month }: { month: string }) {
  const { data, loading, saving, error, save } = useExpenses(month);
  const [fields, setFields] = useState<FieldState>({
    meta_ads: "",
    google_ads: "",
    tiktok_ads: "",
    other_marketing: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setFields(fromExpenses(data.expenses));
  }, [data]);

  function update(key: keyof FieldState, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    const ok = await save(toExpenses(fields));
    if (ok) setSaved(true);
  }

  if (loading) return <Spinner size="small" />;

  return (
    <BlockStack gap="300">
      <Text as="h3" variant="headingSm">{monthLabel(month)}</Text>
      {error && <Banner tone="critical"><Text as="p">{error}</Text></Banner>}
      <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
        <TextField label="Meta Ads" type="number" prefix="$" value={fields.meta_ads} onChange={(v) => update("meta_ads", v)} autoComplete="off" />
        <TextField label="Google Ads" type="number" prefix="$" value={fields.google_ads} onChange={(v) => update("google_ads", v)} autoComplete="off" />
        <TextField label="TikTok Ads" type="number" prefix="$" value={fields.tiktok_ads} onChange={(v) => update("other_marketing", v)} autoComplete="off" />
        <TextField label="Other Marketing" type="number" prefix="$" value={fields.other_marketing} onChange={(v) => update("other_marketing", v)} autoComplete="off" />
      </InlineGrid>
      <InlineStack align="end" gap="200">
        {saved && <Text as="span" tone="success">Saved</Text>}
        <Button onClick={() => void handleSave()} loading={saving} variant="primary">Save</Button>
      </InlineStack>
    </BlockStack>
  );
}

export function ExpensesCard() {
  const months = [currentMonth(), prevMonth()];

  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">Monthly Expenses</Text>
          <Text as="p" tone="subdued">
            Enter your ad spend and other fixed costs. These are used to compute net profit on the
            Break-Even calculator. Free plan: current and previous month only.
          </Text>
        </BlockStack>
        <MonthExpensesEditor month={months[0]!} />
        <Divider />
        <MonthExpensesEditor month={months[1]!} />
      </BlockStack>
    </Card>
  );
}
