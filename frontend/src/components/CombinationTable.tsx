import { useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { Box, MenuItem, Paper, Select, Typography, type SelectChangeEvent } from "@mui/material";
import { colors } from "../theme";
import { labelFor } from "../dimensions";

ModuleRegistry.registerModules([AllCommunityModule]);

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

const NONE = "__none__";

export interface MetricColumn {
  key: string;
  label: string;
  width?: number;
}

interface CombinationTableProps {
  title: string;
  helpText: string;
  /** Every dimension the user is allowed to combine on. */
  availableDimensions: string[];
  /** How many dimension pickers to show (a "combination" of up to this many). */
  maxDimensions?: number;
  defaultDimensions: string[];
  fetchRows: (groupBy: string[]) => Promise<Record<string, unknown>[]>;
  /** Which field holds the sample size (balls_bowled / balls_faced) - drives the small-sample note. */
  countKey: string;
  metricColumns: MetricColumn[];
  smallSampleThreshold?: number;
}

/**
 * The combination engine: pick up to N dimensions (Length, Batting
 * Hand, Side of Wicket, ...) and see every distinct combination's
 * full stats as a table - "Good length to left-handers Around the
 * Wicket", etc. Not a bespoke analysis per combination - one generic
 * table over whatever the breakdown endpoint returns for the chosen
 * group_by list (see main.py's bowling_breakdown docstring). Row
 * count shrinks fast as dimensions are added, so every row's sample
 * size is shown and small ones are flagged rather than hidden.
 */
export function CombinationTable({
  title,
  helpText,
  availableDimensions,
  maxDimensions = 3,
  defaultDimensions,
  fetchRows,
  countKey,
  metricColumns,
  smallSampleThreshold = 12,
}: CombinationTableProps) {
  const [dimensions, setDimensions] = useState<string[]>(() => {
    const padded = [...defaultDimensions];
    while (padded.length < maxDimensions) padded.push(NONE);
    return padded.slice(0, maxDimensions);
  });
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  const activeDimensions = dimensions.filter((d) => d !== NONE);

  useEffect(() => {
    if (activeDimensions.length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);
    fetchRows(activeDimensions)
      .then(setRows)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(activeDimensions)]);

  const columnDefs = useMemo<ColDef[]>(() => {
    const dimensionCols: ColDef[] = activeDimensions.map((dim) => ({
      field: dim,
      headerName: labelFor(dim),
      flex: 1,
      valueFormatter: (p) => (p.value === null || p.value === undefined ? "—" : String(p.value)),
    }));
    const metricCols: ColDef[] = metricColumns.map((col) => ({
      field: col.key,
      headerName: col.label,
      width: col.width ?? 110,
      valueFormatter: (p) => (p.value === null || p.value === undefined ? "—" : String(p.value)),
    }));
    return [...dimensionCols, ...metricCols];
  }, [activeDimensions, metricColumns]);

  const handleChange = (index: number) => (event: SelectChangeEvent) => {
    const next = [...dimensions];
    next[index] = event.target.value;
    setDimensions(next);
  };

  const smallSampleCount = rows.filter((r) => Number(r[countKey] ?? 0) < smallSampleThreshold).length;

  return (
    <Paper elevation={0} sx={{ p: 2.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.25 }}>
        {title}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 2 }}>
        {helpText}
      </Typography>

      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        {Array.from({ length: maxDimensions }).map((_, index) => (
          <Select
            key={index}
            size="small"
            value={dimensions[index]}
            onChange={handleChange(index)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value={NONE}>
              <em>{index === 0 ? "Pick a dimension" : "(none)"}</em>
            </MenuItem>
            {availableDimensions.map((dim) => (
              <MenuItem key={dim} value={dim} disabled={dimensions.includes(dim) && dimensions[index] !== dim}>
                {labelFor(dim)}
              </MenuItem>
            ))}
          </Select>
        ))}
      </Box>

      {smallSampleCount > 0 && rows.length > 0 && (
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1 }}>
          {smallSampleCount} of {rows.length} combination(s) have fewer than {smallSampleThreshold} balls - treat
          those rows as indicative only.
        </Typography>
      )}

      <Box sx={{ height: 420, width: "100%" }}>
        {activeDimensions.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 2 }}>
            Pick at least one dimension above to see the breakdown.
          </Typography>
        ) : (
          <AgGridReact
            theme={gridTheme}
            rowData={rows}
            columnDefs={columnDefs}
            loading={loading}
            pagination
            paginationPageSize={20}
            paginationPageSizeSelector={[20, 50, 100]}
            defaultColDef={{ sortable: true, resizable: true }}
          />
        )}
      </Box>
    </Paper>
  );
}
