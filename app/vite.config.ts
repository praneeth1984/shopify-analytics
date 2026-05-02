/// <reference types="node" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev the Shopify CLI tunnels the embedded app; the backend is reached via
// the public Worker URL (set in VITE_BACKEND_URL). For local-only iteration the
// /api proxy below also works.
export default defineConfig({
  // Shopify CLI injects SHOPIFY_API_KEY into the dev-server process.
  // Expose it as VITE_SHOPIFY_API_KEY so index.html's %VITE_SHOPIFY_API_KEY%
  // substitution and any import.meta.env usage in source files can read it.
  define: {
    "import.meta.env.VITE_SHOPIFY_API_KEY": JSON.stringify(
      process.env.SHOPIFY_API_KEY ?? process.env.VITE_SHOPIFY_API_KEY ?? "",
    ),
  },
  plugins: [react()],
  server: {
    // Shopify CLI assigns a dynamic port for the frontend via env. Fall back to
    // 5173 for standalone `pnpm dev` runs.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    strictPort: false,
    // Shopify CLI tunnels through *.trycloudflare.com (host changes per session).
    // Allow any host — this is dev only; production is bundled and served from
    // the Worker, where this setting has no effect.
    allowedHosts: true,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
    // Recharts is large (~150 KB gz). Keep it in its own chunk so the
    // initial dashboard render doesn't pay for it; the chart components are
    // lazy-loaded with React.Suspense.
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ["recharts"],
          leaflet: ["leaflet", "leaflet.heat"],
        },
      },
    },
  },
});
