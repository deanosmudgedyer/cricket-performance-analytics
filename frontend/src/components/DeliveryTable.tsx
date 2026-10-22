import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
} from "ag-grid-community";
import { Box, Paper, Typography } from "@mui/material";
import { colors } from "../theme";

ModuleRegistry.registerModules([AllCommunityModule]);

// Restyle AG Grid's default look to match the rest of the dashboard,
// rather than leaving the default light/corporate theme in place.
const gridTheme = themeQuartz.withParams({
  backgroundColor: colors.surface,
  foregroundColor: colors.chalk,
  headerBackgroundColor: colors.surfaceAlt,
  headerTextColor: colors.chalkMuted,
  oddRowBackgroundColor: colors.surfaceAlt,
  borderColor: colors.border,
  rowHoverColor: colors.surfaceAlt,
  accentColor: colors.gold,
  fontFamily: "Inter, sans-serif",
});

/** Over.Ball is displayed as text (e.g. "100.1"), which sorts wrong
 * alphabetically ("100.1" would come before "3.1"). Comparing the real
 * numeric over/ball fields underneath fixes that - true cricket over
 * order, not string order. Shared by both bowling and batting tables. */
export function overBallComparator<T extends { over_number: number; ball_number: number }>(
  _valueA: unknown,
  _valueB: unknown,
  nodeA: { data?: T },
  nodeB: { data?: T }
): number {
  const a = nodeA.data ? nodeA.data.over_number * 10 + nodeA.data.ball_number : 0;
  const b = nodeB.data ? nodeB.data.over_number * 10 + nodeB.data.ball_number : 0;
  return a - b;
}

interface DeliveryTableProps<T> {
  rows: T[];
  columnDefs: ColDef<T>[];
  loading: boolean;
  title?: string;
  subtitle?: string;
}

/**
 * Ball-by-ball table beneath the aggregated stats. Coaches often want
 * to drop from "the economy is 2.1" down to "show me exactly which
 * balls" - this is that drill-down, with sorting/filtering built in
 * for free via AG Grid Community. Generic over the row shape/columns
 * so the same table serves both bowling and batting deliveries -
 * each dashboard supplies its own column definitions.
 */
export function DeliveryTable<T>({
  rows,
  columnDefs,
  loading,
  title = "Ball-by-Ball",
  subtitle = "Every delivery matching the current filters - click a column header to sort",
}: DeliveryTableProps<T>) {
  const memoColumns = useMemo(() => columnDefs, [columnDefs]);

  return (
    <Paper elevation={0} sx={{ p: 2.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.25 }}>
        {title}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", mb: 2, display: "block" }}>
        {subtitle}
      </Typography>

      {/* minWidth: 0 overrides a flex item's default min-width: auto -
          see CombinationTable.tsx for why this matters on narrow
          screens. */}
      <Box sx={{ height: 420, width: "100%", minWidth: 0 }}>
        <AgGridReact
          theme={gridTheme}
          rowData={rows}
          columnDefs={memoColumns}
          loading={loading}
          pagination
          paginationPageSize={20}
          paginationPageSizeSelector={[20, 50, 100]}
          defaultColDef={{ sortable: true, resizable: true }}
        />
      </Box>
    </Paper>
  );
}
