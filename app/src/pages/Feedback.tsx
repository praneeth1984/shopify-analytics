/**
 * Feedback & Feature Requests Hub (F42).
 *
 * Two-tab submission form (Bug / Feature) above a community list of public
 * feedback items. Merchants upvote items they care about — top-voted items
 * float to the top. We read every submission.
 */

import { useMemo, useState } from "react";
import {
  Page,
  Layout,
  Card,
  Tabs,
  TextField,
  Select,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Banner,
  EmptyState,
  SkeletonBodyText,
  SkeletonDisplayText,
  Box,
  ButtonGroup,
} from "@shopify/polaris";
import { CaretUpIcon } from "@shopify/polaris-icons";
import { useFeedback } from "../hooks/useFeedback.js";
import { showToast } from "../lib/toast.js";
import type {
  FeedbackItem,
  FeedbackType,
  BugSeverity,
  FeatureFrequency,
} from "@fbc/shared";

const FORM_TABS = [
  { id: "bug", content: "Bug Report", panelID: "bug-panel" },
  { id: "feature", content: "Feature Request", panelID: "feature-panel" },
];

const PAGE_OPTIONS = [
  { label: "Select page (optional)", value: "" },
  { label: "Overview / Dashboard", value: "overview" },
  { label: "Profit", value: "profit" },
  { label: "Products", value: "products" },
  { label: "Customers", value: "customers" },
  { label: "Marketing", value: "marketing" },
  { label: "Reports", value: "reports" },
  { label: "Settings", value: "settings" },
  { label: "Plan & Billing", value: "billing" },
  { label: "Other", value: "other" },
];

const SEVERITY_OPTIONS: { label: string; value: BugSeverity | "" }[] = [
  { label: "Select severity (optional)", value: "" },
  { label: "Minor — annoying but I can work around it", value: "minor" },
  { label: "Blocks me from completing a task", value: "blocks" },
  { label: "Data looks wrong", value: "data_wrong" },
];

const FREQUENCY_OPTIONS: { label: string; value: FeatureFrequency | "" }[] = [
  { label: "How often would you use it? (optional)", value: "" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Occasionally", value: "occasionally" },
];

const TITLE_MIN = 10;
const TITLE_MAX = 100;
const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 1000;

type ListFilter = "all" | "feature_request" | "bug_report";
type StatusFilter = "open" | "planned" | "shipped";

const LIST_TABS = [
  { id: "all", content: "All", panelID: "all-panel" },
  { id: "features", content: "Features", panelID: "features-panel" },
  { id: "bugs", content: "Bugs", panelID: "bugs-panel" },
];

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "planned", label: "Planned" },
  { id: "shipped", label: "Shipped" },
];

type BadgeTone = "info" | "success" | "warning" | "attention" | undefined;

function statusTone(status: FeedbackItem["status"]): BadgeTone {
  switch (status) {
    case "shipped":
      return "success";
    case "planned":
      return "info";
    case "open":
    default:
      return undefined;
  }
}

function typeTone(type: FeedbackType): BadgeTone {
  return type === "bug_report" ? "warning" : "info";
}

function typeLabel(type: FeedbackType): string {
  return type === "bug_report" ? "Bug" : "Feature";
}

function statusLabel(status: FeedbackItem["status"]): string {
  switch (status) {
    case "shipped":
      return "Shipped";
    case "planned":
      return "Planned";
    case "open":
    default:
      return "Open";
  }
}

export function Feedback() {
  const { items, loading, error, submit, toggleUpvote } = useFeedback();

  // ---- Form state ----
  const [formTab, setFormTab] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [page, setPage] = useState("");
  const [severity, setSeverity] = useState<BugSeverity | "">("");
  const [frequency, setFrequency] = useState<FeatureFrequency | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ---- List filter state ----
  const [listTab, setListTab] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");

  const trimmedTitle = title.trim();
  const trimmedDesc = description.trim();
  const titleValid = trimmedTitle.length >= TITLE_MIN && trimmedTitle.length <= TITLE_MAX;
  const descValid =
    trimmedDesc.length >= DESCRIPTION_MIN && trimmedDesc.length <= DESCRIPTION_MAX;
  const canSubmit = titleValid && descValid && !submitting;

  const formType: FeedbackType = formTab === 0 ? "bug_report" : "feature_request";

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPage("");
    setSeverity("");
    setFrequency("");
    setSubmitError(null);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submit({
        type: formType,
        title: trimmedTitle,
        description: trimmedDesc,
        page: page || undefined,
        severity: formType === "bug_report" && severity ? severity : undefined,
        frequency:
          formType === "feature_request" && frequency ? frequency : undefined,
      });
      resetForm();
      showToast("Thanks! We read every submission.");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  const listFilter: ListFilter =
    listTab === 1 ? "feature_request" : listTab === 2 ? "bug_report" : "all";

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (item.status !== statusFilter) return false;
      if (listFilter !== "all" && item.type !== listFilter) return false;
      return true;
    });
  }, [items, listFilter, statusFilter]);

  return (
    <Page
      title="Feedback & feature requests"
      subtitle="Tell us what to fix or build next. Every submission is read by the team."
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Tabs
                tabs={FORM_TABS}
                selected={formTab}
                onSelect={(idx) => {
                  setFormTab(idx);
                  setSubmitError(null);
                }}
                fitted
              />

              {submitError && (
                <Banner tone="critical" title="Submission failed" onDismiss={() => setSubmitError(null)}>
                  {submitError}
                </Banner>
              )}

              <TextField
                label={
                  formType === "bug_report"
                    ? "Short summary of the bug"
                    : "Short summary of the feature"
                }
                value={title}
                onChange={setTitle}
                placeholder={
                  formType === "bug_report"
                    ? "e.g. Profit chart shows wrong total for last 7 days"
                    : "e.g. Email digest of weekly performance"
                }
                autoComplete="off"
                maxLength={TITLE_MAX}
                showCharacterCount
                error={
                  title.length > 0 && !titleValid
                    ? `Title must be between ${TITLE_MIN} and ${TITLE_MAX} characters.`
                    : undefined
                }
              />

              <TextField
                label="Details"
                value={description}
                onChange={setDescription}
                multiline={4}
                placeholder={
                  formType === "bug_report"
                    ? "What did you expect? What happened? Steps to reproduce."
                    : "What problem would this solve? How would you use it?"
                }
                autoComplete="off"
                maxLength={DESCRIPTION_MAX}
                showCharacterCount
                error={
                  description.length > 0 && !descValid
                    ? `Details must be between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters.`
                    : undefined
                }
              />

              <InlineStack gap="400" wrap>
                <Box minWidth="240px">
                  <Select
                    label="Page"
                    options={PAGE_OPTIONS}
                    value={page}
                    onChange={setPage}
                  />
                </Box>
                {formType === "bug_report" ? (
                  <Box minWidth="280px">
                    <Select
                      label="Severity"
                      options={SEVERITY_OPTIONS.map((o) => ({
                        label: o.label,
                        value: o.value,
                      }))}
                      value={severity}
                      onChange={(v) => setSeverity(v as BugSeverity | "")}
                    />
                  </Box>
                ) : (
                  <Box minWidth="280px">
                    <Select
                      label="Usage frequency"
                      options={FREQUENCY_OPTIONS.map((o) => ({
                        label: o.label,
                        value: o.value,
                      }))}
                      value={frequency}
                      onChange={(v) => setFrequency(v as FeatureFrequency | "")}
                    />
                  </Box>
                )}
              </InlineStack>

              <InlineStack align="end">
                <Button
                  variant="primary"
                  onClick={() => void handleSubmit()}
                  disabled={!canSubmit}
                  loading={submitting}
                >
                  {formType === "bug_report" ? "Submit bug report" : "Submit feature request"}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Community board
                </Text>
                <Text as="p" tone="subdued">
                  Browse what other merchants are asking for. Upvote anything
                  you'd like us to ship.
                </Text>
              </BlockStack>

              <Tabs
                tabs={LIST_TABS}
                selected={listTab}
                onSelect={setListTab}
                fitted
              />

              <ButtonGroup variant="segmented">
                {STATUS_TABS.map((s) => (
                  <Button
                    key={s.id}
                    pressed={statusFilter === s.id}
                    onClick={() => setStatusFilter(s.id)}
                  >
                    {s.label}
                  </Button>
                ))}
              </ButtonGroup>

              {error ? (
                <Banner tone="critical" title="Could not load feedback">{error}</Banner>
              ) : loading ? (
                <BlockStack gap="300">
                  {[0, 1, 2].map((i) => (
                    <Card key={i}>
                      <BlockStack gap="200">
                        <SkeletonDisplayText size="small" />
                        <SkeletonBodyText lines={2} />
                      </BlockStack>
                    </Card>
                  ))}
                </BlockStack>
              ) : filteredItems.length === 0 ? (
                <EmptyState
                  heading={
                    statusFilter === "shipped"
                      ? "Nothing shipped yet in this view"
                      : statusFilter === "planned"
                        ? "Nothing on the planned list yet"
                        : "No feedback yet"
                  }
                  image="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%221%22%20height%3D%221%22/%3E"
                >
                  <p>
                    {statusFilter === "open"
                      ? "Be the first to share what you'd like to see — submit above."
                      : "Check back here once items move through review."}
                  </p>
                </EmptyState>
              ) : (
                <BlockStack gap="300">
                  {filteredItems.map((item) => (
                    <Card key={item.id}>
                      <InlineStack align="space-between" blockAlign="start" wrap={false} gap="400">
                        <BlockStack gap="200">
                          <InlineStack gap="200" blockAlign="center" wrap>
                            <Badge tone={typeTone(item.type)}>{typeLabel(item.type)}</Badge>
                            <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                          </InlineStack>
                          <Text as="h3" variant="headingSm">
                            {item.title}
                          </Text>
                        </BlockStack>
                        <Box minWidth="80px">
                          <Button
                            icon={CaretUpIcon}
                            pressed={item.hasUpvoted}
                            onClick={() => void toggleUpvote(item.id)}
                            accessibilityLabel={
                              item.hasUpvoted
                                ? `Remove your upvote, currently ${item.upvotes} upvotes`
                                : `Upvote, currently ${item.upvotes} upvotes`
                            }
                          >
                            {String(item.upvotes)}
                          </Button>
                        </Box>
                      </InlineStack>
                    </Card>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
