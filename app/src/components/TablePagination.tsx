/**
 * Reusable pagination footer + client-side pagination hook for all data tables.
 *
 * For server-side cursor pagination (OrderReport), manage cursorStack yourself
 * and pass the props directly to <TablePagination>.
 *
 * For client-side pagination (all other tables), use useClientPagination:
 *   const pg = useClientPagination(allRows);
 *   // render pg.page instead of allRows
 *   // <TablePagination {...pg.props} />
 */

import { useEffect, useMemo, useState } from "react";
import { Box, InlineStack, Pagination, Select } from "@shopify/polaris";

export const PAGE_SIZE_OPTIONS = [
  { label: "10 per page",  value: "10" },
  { label: "25 per page",  value: "25" },
  { label: "50 per page",  value: "50" },
  { label: "100 per page", value: "100" },
];

export const DEFAULT_PAGE_SIZE = 10;

type PaginationProps = {
  pageIdx: number;
  pageSize: number;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPageSizeChange: (size: number) => void;
};

export function TablePagination({ pageIdx, pageSize, hasNext, onPrev, onNext, onPageSizeChange }: PaginationProps) {
  return (
    <Box padding="300" borderColor="border" borderBlockStartWidth="025">
      <InlineStack align="space-between" blockAlign="center">
        <Select
          label="Rows per page"
          labelHidden
          options={PAGE_SIZE_OPTIONS}
          value={String(pageSize)}
          onChange={(v) => onPageSizeChange(Number(v))}
        />
        <Pagination
          hasPrevious={pageIdx > 0}
          onPrevious={onPrev}
          hasNext={hasNext}
          onNext={onNext}
          label={`Page ${pageIdx + 1}`}
        />
      </InlineStack>
    </Box>
  );
}

/** Client-side pagination hook. Pass all items; get back the current page slice + props. */
export function useClientPagination<T>(items: T[], initialPageSize = DEFAULT_PAGE_SIZE) {
  const [pageIdx, setPageIdx] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Reset to page 1 whenever the dataset changes (e.g. filter/reload).
  const count = items.length;
  useEffect(() => { setPageIdx(0); }, [count]);

  const page = useMemo(
    () => items.slice(pageIdx * pageSize, (pageIdx + 1) * pageSize),
    [items, pageIdx, pageSize],
  );

  function onPageSizeChange(size: number) {
    setPageSize(size);
    setPageIdx(0);
  }

  return {
    page,
    props: {
      pageIdx,
      pageSize,
      hasNext: (pageIdx + 1) * pageSize < items.length,
      onPrev: () => setPageIdx((p) => Math.max(0, p - 1)),
      onNext: () => setPageIdx((p) => p + 1),
      onPageSizeChange,
    } satisfies PaginationProps,
  };
}
