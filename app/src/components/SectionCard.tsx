import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Icon,
  Box,
  SkeletonBodyText,
} from "@shopify/polaris";
import { ChevronRightIcon } from "@shopify/polaris-icons";
import { navigate } from "../App.js";

interface SectionCardProps {
  title: string;
  description: string;
  status: string | null;
  href: string;
  ctaLabel: string;
}

export function SectionCard({ title, description, status, href, ctaLabel }: SectionCardProps) {
  const ariaLabel = `${title}: ${status ?? "Loading"}. ${ctaLabel}`;

  function go() {
    navigate(href);
  }

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      }}
      style={{ cursor: "pointer" }}
    >
      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="start" wrap={false}>
            <BlockStack gap="100">
              <Text as="h3" variant="headingMd">
                {title}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {description}
              </Text>
            </BlockStack>
            <Icon source={ChevronRightIcon} tone="subdued" />
          </InlineStack>
          <Box
            paddingBlockStart="300"
            borderBlockStartWidth="025"
            borderColor="border-disabled"
          >
            {status === null ? (
              <SkeletonBodyText lines={1} />
            ) : (
              <Text as="p" variant="bodyMd">
                {status}
              </Text>
            )}
          </Box>
          <Text as="p" variant="bodySm" tone="success">
            {`${ctaLabel} →`}
          </Text>
        </BlockStack>
      </Card>
    </div>
  );
}
