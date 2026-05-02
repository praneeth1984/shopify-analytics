/**
 * F01 — Leaflet heat map for geographic order/revenue distribution.
 *
 * Lazy-loaded via React.lazy — only fetched when the Geography page is visited.
 * Must be the default export.
 *
 * Privacy: backend returns pre-aggregated clusters only. Individual order
 * coordinates never reach the browser.
 */

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet.heat";
import "leaflet/dist/leaflet.css";
import type { GeoCluster } from "@fbc/shared";
import { ButtonGroup, Button, Text, InlineStack } from "@shopify/polaris";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

type HeatMode = "orders" | "revenue";

type Props = {
  clusters: GeoCluster[];
  isPro: boolean;
};

export default function GeographyMap({ clusters, isPro }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const heatRef = useRef<L.HeatLayer | null>(null);
  const [mode, setMode] = useState<HeatMode>("orders");

  function buildPoints(m: HeatMode): L.HeatLatLngTuple[] {
    if (clusters.length === 0) return [];
    const maxOrders = Math.max(...clusters.map((c) => c.orders), 1);
    const maxRevenue = Math.max(...clusters.map((c) => c.revenue_minor), 1);
    return clusters.map((c) => {
      const intensity =
        m === "orders" ? c.orders / maxOrders : c.revenue_minor / maxRevenue;
      return [c.lat, c.lng, intensity] as L.HeatLatLngTuple;
    });
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [20, 10],
      zoom: 2,
      minZoom: 2,          // prevent zooming out so far the world repeats
      zoomControl: true,
      scrollWheelZoom: true,
      worldCopyJump: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
      noWrap: true,        // prevent tile repetition on wide containers
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      heatRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (heatRef.current) {
      map.removeLayer(heatRef.current);
      heatRef.current = null;
    }

    const points = buildPoints(mode);
    if (points.length === 0) return;

    const heat = L.heatLayer(points, {
      // Do NOT set maxZoom here — leaflet.heat uses it to scale intensity DOWN
      // at zoom levels below maxZoom. Omitting it means full intensity at all zooms.
      radius: 35,
      blur: 20,
      minOpacity: 0.6,     // ensure sparse datasets (1–3 orders) are always visible
      max: 1.0,
      gradient: {
        0.0: "#93c5fd",    // light blue — low intensity
        0.4: "#6d28d9",    // purple — mid
        0.7: "#ec4899",    // pink
        1.0: "#ef4444",    // red — max
      },
    });
    heat.addTo(map);
    heatRef.current = heat;

    // If we have clusters, pan/zoom to show the active data
    if (clusters.length > 0) {
      const latlngs = clusters.map((c) => L.latLng(c.lat, c.lng));
      const bounds = L.latLngBounds(latlngs);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: isPro ? 6 : 4 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters, mode, isPro]);

  return (
    <div>
      <div style={{ marginBottom: "12px" }}>
        <InlineStack align="space-between" blockAlign="center">
          <Text as="span" variant="bodySm" tone="subdued">
            {isPro
              ? "Heat map at ~11 km precision. Zoom in for city-level detail."
              : "Free plan: country-level clustering. Upgrade to Pro for city-level heat map."}
          </Text>
          <ButtonGroup variant="segmented">
            <Button size="slim" pressed={mode === "orders"} onClick={() => setMode("orders")}>
              Orders
            </Button>
            <Button size="slim" pressed={mode === "revenue"} onClick={() => setMode("revenue")}>
              Revenue
            </Button>
          </ButtonGroup>
        </InlineStack>
      </div>
      <div
        ref={containerRef}
        style={{
          height: "480px",
          width: "100%",
          borderRadius: "8px",
          overflow: "hidden",
          border: "1px solid var(--p-color-border)",
        }}
      />
    </div>
  );
}
