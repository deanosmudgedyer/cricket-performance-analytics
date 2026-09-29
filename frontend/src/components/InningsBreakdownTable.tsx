import { useEffect, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { Box, MenuItem, Paper, Select, Typography, type SelectChangeEvent } from "@mui/material";
import { colors } from "../theme";
import { labelFor } from "../dimensions";
import type { InningsBreakdownRow } from "../api/client";

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

interface InningsBreakdownTableProps {
  availableDimensions: string[];
  defaultDimension: string;
  fetchRows: (by: string) => Promise<InningsBreakdownRow[]>;
}

/**
 * "Batting by Position" / "Batting by Ground" / "Batting by Opposition"
 * - genuine innings-level figures (Innings played, Highest Score, Not
 * Outs, 50s/100s), not a ball-count. See
 * app/services/batting_stats.py's innings_summary_by() for why this
 * needs its own endpoint rather than reusing the ball-level
 * Combination Engine: an innings count or a highest score simply
 * isn't computable by grouping individual balls.
 */
export function InningsBreakdownTable({ availableDimensions, defaultDimension, fetchRows }: InningsBreakdownTableProps) {
  const [dimension, setDimension] = useState(defaultDimension);
  const [rows, setRows] = useState<InningsBreakdownRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchRows(dimension)
      .then(setRows)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimension]);

  const columnDefs: ColDef[] = [
    { field: dimension, headerName: labelFor(dimension), flex: 1 },
    { field: "innings", headerName: "Inns", width: 80 },
    { field: "runs", headerName: "Runs", width: 90 },
    { field: "highest_score", headerName: "HS", width: 80 },
    { field: "average", headerName: "Avg", width: 90, valueFormatter: (p) => p.value ?? "N/A" },
    { field: "strike_rate", headerName: "SR", width: 90, valueFormatter: (p) => p.value ?? "—" },
    { field: "not_outs", headerName: "Not Out", width: 90 },
    { field: "fifties", headerName: "50s", width: 70 },
    { field: "hundreds", headerName: "100s", width: 70 },
    { field: "dismissals", headerName: "Dismissals", width: 100 },
  ];

  const handleChange = (event: SelectChangeEvent) => setDimension(event.target.value);

  return (
    <Paper elevation={0} sx={{ p: 2.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.25 }}>
        Batting by {labelFor(dimension)}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 2 }}>
        Innings-level figures - Highest Score, Not Outs and 50s/100s are computed per innings, not per ball
      </Typography>

      <Select size="small" value={dimension} onChange={handleChange} sx={{ minWidth: 180, mb: 2 }}>
        {availableDimensions.map((dim) => (
          <MenuItem key={dim} value={dim}>
            {labelFor(dim)}
          </MenuItem>
        ))}
      </Select>

      <Box sx={{ height: 300, width: "100%" }}>
        <AgGridReact
          theme={gridTheme}
          rowData={rows}
          columnDefs={columnDefs}
          loading={loading}
          defaultColDef={{ sortable: true, resizable: true }}
        />
      </Box>
    </Paper>
  );
}
