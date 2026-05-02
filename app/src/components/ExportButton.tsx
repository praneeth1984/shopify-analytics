import { Button } from "@shopify/polaris";
import { ExportIcon } from "@shopify/polaris-icons";
import { useCallback, useState } from "react";
import { getSessionToken } from "../lib/app-bridge.js";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? "";

type Props = {
  panel: string;
  preset: string;
  start?: string;
  end?: string;
  label?: string;
};

export function ExportButton({ panel, preset, start, end, label = "Export CSV" }: Props) {
  const [loading, setLoading] = useState(false);

  const handleDownload = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getSessionToken();
      const params = new URLSearchParams({ preset });
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      const url = `${BACKEND_URL}/api/exports/${panel}?${params.toString()}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `firstbridge-${panel}.csv`;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objUrl);
    } finally {
      setLoading(false);
    }
  }, [panel, preset, start, end]);

  return (
    <Button icon={ExportIcon} onClick={handleDownload} loading={loading} size="slim">
      {label}
    </Button>
  );
}
