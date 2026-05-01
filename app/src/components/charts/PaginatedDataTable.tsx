import { useMemo, useState } from "react";
import { Box, DataTable, InlineStack, Pagination } from "@shopify/polaris";

const PAGE_SIZE = 10;

type Props = {
  columnContentTypes: Array<"text" | "numeric">;
  headings: string[];
  rows: string[][];
};

export function PaginatedDataTable({ columnContentTypes, headings, rows }: Props) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = useMemo(
    () => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [rows, page],
  );

  return (
    <Box>
      <DataTable columnContentTypes={columnContentTypes} headings={headings} rows={pageRows} />
      {totalPages > 1 && (
        <Box paddingBlockStart="200">
          <InlineStack align="center">
            <Pagination
              hasPrevious={page > 0}
              onPrevious={() => setPage((p) => p - 1)}
              hasNext={page < totalPages - 1}
              onNext={() => setPage((p) => p + 1)}
              label={`Page ${page + 1} of ${totalPages}`}
            />
          </InlineStack>
        </Box>
      )}
    </Box>
  );
}
