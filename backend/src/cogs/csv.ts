/**
 * Minimal RFC 4180-ish CSV helpers for COGS export/import.
 *
 * Why not a library: the wire shape is fixed (we own both ends), bundle size
 * matters on Workers, and our edge cases are limited to embedded commas /
 * quotes / newlines in titles. Treat anything outside that as a bug.
 */

import type { CogsEntry } from "@fbc/shared";

export const COGS_CSV_HEADERS = [
  "variant_id",
  "sku",
  "product_id",
  "title",
  "cost_amount",
  "cost_currency",
  "updated_at",
] as const;

type Header = (typeof COGS_CSV_HEADERS)[number];

function escapeCell(value: string): string {
  // Quote if the value contains a comma, quote, CR, or LF. Inside a quoted
  // value, double any embedded quotes.
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Serialise entries to CSV text with a UTF-8 BOM so Excel opens it cleanly. */
export function entriesToCsv(entries: CogsEntry[]): string {
  const rows: string[] = [COGS_CSV_HEADERS.join(",")];
  for (const e of entries) {
    rows.push(
      [
        escapeCell(e.variantId),
        escapeCell(e.sku ?? ""),
        escapeCell(e.productId),
        escapeCell(e.title),
        escapeCell(e.cost.amount),
        escapeCell(e.cost.currency_code),
        escapeCell(e.updatedAt),
      ].join(","),
    );
  }
  // BOM helps Excel detect UTF-8; CRLF for max compatibility.
  return "﻿" + rows.join("\r\n") + "\r\n";
}

/**
 * Parse RFC 4180-ish CSV. Returns rows as string[][]. Strips the optional
 * UTF-8 BOM. Tolerates CRLF or LF line endings. Empty trailing lines are
 * dropped.
 */
export function parseCsv(input: string): string[][] {
  // Strip BOM.
  let i = input.charCodeAt(0) === 0xfeff ? 1 : 0;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  while (i < input.length) {
    const ch = input[i]!;

    if (inQuotes) {
      if (ch === '"') {
        const next = input[i + 1];
        if (next === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      // CR or CRLF — terminate row.
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
      if (input[i + 1] === "\n") i += 2;
      else i++;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  // Flush trailing cell / row.
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Drop blank trailing rows like ['']
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export type ParsedCsvRow = Record<Header, string>;

/**
 * Parse CSV and align each row to the header. Throws on missing required
 * headers. Extra columns are ignored. Cells default to "" when missing.
 */
export function parseCogsCsv(input: string): {
  rows: ParsedCsvRow[];
  headerMissing: Header[];
} {
  const grid = parseCsv(input);
  if (grid.length === 0) return { rows: [], headerMissing: [...COGS_CSV_HEADERS] };

  const header = grid[0]!.map((h) => h.trim().toLowerCase());
  const indexByHeader = new Map<string, number>();
  for (let i = 0; i < header.length; i++) indexByHeader.set(header[i]!, i);

  const required: Header[] = ["variant_id", "cost_amount", "cost_currency"];
  const headerMissing = required.filter((h) => !indexByHeader.has(h));
  if (headerMissing.length > 0) return { rows: [], headerMissing };

  const rows: ParsedCsvRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const raw = grid[r]!;
    // Skip fully blank rows.
    if (raw.every((cell) => cell.trim() === "")) continue;
    const out = {} as ParsedCsvRow;
    for (const h of COGS_CSV_HEADERS) {
      const idx = indexByHeader.get(h);
      out[h] = idx === undefined ? "" : (raw[idx] ?? "").trim();
    }
    rows.push(out);
  }
  return { rows, headerMissing: [] };
}
