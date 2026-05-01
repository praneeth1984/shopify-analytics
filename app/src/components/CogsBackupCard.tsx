/**
 * Backup & restore for COGS — paired Export / Import buttons in a Polaris Card.
 *
 * Why we need this: app-data metafields are deleted by Shopify on uninstall.
 * Merchants who entered cost data lose it unless they back it up. This is the
 * "user owns their own backup" escape hatch consistent with our stateless,
 * metafield-only storage model.
 *
 * Behaviour:
 *   - Export: fetch /api/cogs/export with the App Bridge session token, then
 *     trigger a Blob download. We can't use `window.location.assign` for the
 *     auth-gated endpoint because the browser would send the request without
 *     our Bearer token.
 *   - Import: open a modal with a Polaris DropZone (.csv only, max 1MB). On
 *     submit, POST the file as `text/csv` and surface a summary toast.
 */

import { useCallback, useState } from "react";
import {
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Modal,
  DropZone,
  Banner,
  List,
  Box,
} from "@shopify/polaris";
import { ApiError, apiFetch } from "../lib/api.js";
import { getSessionToken } from "../lib/app-bridge.js";
import { showToast } from "../lib/toast.js";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? "";
const MAX_BYTES = 1 * 1024 * 1024; // 1 MB
const EXPORT_PATH = "/api/cogs/export";
const IMPORT_PATH = "/api/cogs/import";

type ImportResponse = {
  imported: number;
  skipped: Array<{
    row: number;
    variant_id: string;
    reason:
      | "invalid_variant_id"
      | "missing_product_id"
      | "invalid_cost"
      | "currency_mismatch"
      | "free_cap";
    message: string;
  }>;
  cap: number | null;
};

type Props = {
  /** Called after a successful import so the table reloads. */
  onImported: () => void | Promise<void>;
};

export function CogsBackupCard({ onImported }: Props) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      const token = await getSessionToken();
      const url = BACKEND_URL ? `${BACKEND_URL}${EXPORT_PATH}` : EXPORT_PATH;
      const res = await fetch(url, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new ApiError(res.status, "export_failed", text || "Export failed");
      }
      // Filename comes from the Content-Disposition header; fall back to a sane default.
      const cd = res.headers.get("content-disposition") ?? "";
      const m = cd.match(/filename="([^"]+)"/i);
      const filename = m?.[1] ?? `firstbridge-cogs-${new Date().toISOString().slice(0, 10)}.csv`;
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      showToast("Export downloaded");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Export failed";
      setExportError(msg);
      showToast("Export failed", { isError: true });
    } finally {
      setExporting(false);
    }
  }, []);

  const handleDrop = useCallback(
    (_dropFiles: File[], acceptedFiles: File[], rejectedFiles: File[]) => {
      setFileError(null);
      setImportResult(null);
      if (rejectedFiles.length > 0) {
        setFileError("Only .csv files up to 1MB are accepted.");
        setFile(null);
        return;
      }
      const f = acceptedFiles[0];
      if (!f) return;
      if (f.size > MAX_BYTES) {
        setFileError("File is larger than 1MB. Split it up and try again.");
        setFile(null);
        return;
      }
      setFile(f);
    },
    [],
  );

  const handleImport = useCallback(async () => {
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const csv = await file.text();
      const result = await apiFetch<ImportResponse>(IMPORT_PATH, {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: csv,
      });
      setImportResult(result);
      // Build a summary toast that mirrors the architect's spec.
      const skipsByReason = result.skipped.reduce<Record<string, number>>((acc, s) => {
        acc[s.reason] = (acc[s.reason] ?? 0) + 1;
        return acc;
      }, {});
      const currency = skipsByReason.currency_mismatch ?? 0;
      const cap = skipsByReason.free_cap ?? 0;
      const otherSkipped = result.skipped.length - currency - cap;
      const parts = [`Imported ${result.imported} entries`];
      if (currency > 0) parts.push(`skipped ${currency} (currency mismatch)`);
      if (otherSkipped > 0) parts.push(`skipped ${otherSkipped} (validation)`);
      parts.push(`${cap} hit free-tier cap`);
      showToast(parts.join(", "));
      await onImported();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Import failed";
      setFileError(msg);
      showToast("Import failed", { isError: true });
    } finally {
      setImporting(false);
    }
  }, [file, onImported]);

  const closeModal = useCallback(() => {
    if (importing) return;
    setModalOpen(false);
    setFile(null);
    setFileError(null);
    setImportResult(null);
  }, [importing]);

  return (
    <>
      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingMd">
            Backup &amp; restore
          </Text>
          <Text as="p" tone="subdued">
            Export your saved costs to a CSV file or restore them from a previous export. App
            data is removed if the app is uninstalled, so a periodic backup keeps your costs
            safe.
          </Text>
          <InlineStack gap="200">
            <Button onClick={() => void handleExport()} loading={exporting} disabled={exporting}>
              Export to CSV
            </Button>
            <Button onClick={() => setModalOpen(true)} disabled={exporting}>
              Import from CSV
            </Button>
          </InlineStack>
          {exportError ? (
            <Banner tone="critical" title="Could not export">
              <p>{exportError}</p>
            </Banner>
          ) : null}
        </BlockStack>
      </Card>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title="Import costs from CSV"
        primaryAction={{
          content: "Import",
          onAction: () => void handleImport(),
          disabled: !file || importing,
          loading: importing,
        }}
        secondaryActions={[
          {
            content: "Close",
            onAction: closeModal,
            disabled: importing,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Banner tone="info" title="How import works">
              <List>
                <List.Item>
                  Importing <strong>merges</strong> with existing costs — variants not in the CSV
                  are kept as-is.
                </List.Item>
                <List.Item>
                  Free plan is capped at 20 saved costs. Rows beyond that limit are skipped (not
                  rejected) so you can still see what came in.
                </List.Item>
                <List.Item>
                  CSV must include columns <code>variant_id</code>, <code>cost_amount</code>, and{" "}
                  <code>cost_currency</code>. The currency must match your shop currency.
                </List.Item>
              </List>
            </Banner>
            <DropZone
              accept=".csv,text/csv"
              type="file"
              allowMultiple={false}
              onDrop={handleDrop}
              errorOverlayText="Only .csv files are accepted"
              variableHeight
            >
              {file ? (
                <Box padding="300">
                  <Text as="p">
                    Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
                  </Text>
                </Box>
              ) : (
                <DropZone.FileUpload actionTitle="Select CSV" />
              )}
            </DropZone>
            {fileError ? (
              <Banner tone="critical" title="Import error">
                <p>{fileError}</p>
              </Banner>
            ) : null}
            {importResult ? (
              <Banner
                tone={importResult.skipped.length === 0 ? "success" : "warning"}
                title={`Imported ${importResult.imported} entries`}
              >
                {importResult.skipped.length > 0 ? (
                  <>
                    <p>{importResult.skipped.length} rows were skipped:</p>
                    <List>
                      {importResult.skipped.slice(0, 10).map((s) => (
                        <List.Item key={`${s.row}-${s.variant_id}`}>
                          Row {s.row}: {s.message}
                        </List.Item>
                      ))}
                    </List>
                    {importResult.skipped.length > 10 ? (
                      <Text as="p" tone="subdued" variant="bodySm">
                        …and {importResult.skipped.length - 10} more.
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </Banner>
            ) : null}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  );
}
