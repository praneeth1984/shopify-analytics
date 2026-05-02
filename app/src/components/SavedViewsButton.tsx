import { useState, useCallback } from "react";
import {
  Popover, ActionList, Button, Modal, TextField, Banner, Text, BlockStack,
} from "@shopify/polaris";
import { useSavedViews } from "../hooks/useSavedViews.js";
import { navigate } from "../App.js";

type Props = {
  currentUrl?: string;
};

export function SavedViewsButton({ currentUrl }: Props) {
  const { views, save, remove } = useSavedViews();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!name.trim()) { setSaveError("Name is required"); return; }
    if (name.length > 40) { setSaveError("Name must be 40 characters or less"); return; }
    setSaving(true);
    const err = await save(name.trim(), currentUrl ?? window.location.pathname + window.location.search);
    setSaving(false);
    if (err) { setSaveError(err); return; }
    setName("");
    setSaveError(null);
    setSaveModalOpen(false);
  }, [name, currentUrl, save]);

  const listItems = views.map((v) => ({
    content: v.name,
    onAction: () => {
      setPopoverOpen(false);
      navigate(v.url);
    },
    suffix: (
      <Button
        variant="plain"
        tone="critical"
        size="micro"
        onClick={() => { void remove(v.name); }}
      >
        ✕
      </Button>
    ),
  }));

  return (
    <>
      <Popover
        active={popoverOpen}
        activator={
          <Button onClick={() => setPopoverOpen((o) => !o)} disclosure>
            Saved views
          </Button>
        }
        onClose={() => setPopoverOpen(false)}
      >
        <ActionList
          actionRole="menuitem"
          sections={[
            ...(listItems.length > 0 ? [{ items: listItems }] : []),
            {
              items: [
                {
                  content: "Save current view…",
                  onAction: () => {
                    setPopoverOpen(false);
                    setSaveModalOpen(true);
                  },
                },
              ],
            },
          ]}
        />
      </Popover>

      <Modal
        open={saveModalOpen}
        onClose={() => { setSaveModalOpen(false); setSaveError(null); setName(""); }}
        title="Save this view"
        primaryAction={{ content: "Save", onAction: () => void handleSave(), loading: saving }}
        secondaryActions={[{ content: "Cancel", onAction: () => setSaveModalOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            {saveError && <Banner tone="critical"><Text as="p">{saveError}</Text></Banner>}
            <TextField
              label="View name"
              value={name}
              onChange={setName}
              placeholder="e.g. Last month comparison"
              maxLength={40}
              showCharacterCount
              autoComplete="off"
            />
            <Text as="p" tone="subdued">
              Free plan: up to 3 saved views. Upgrade to Pro for unlimited.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  );
}
