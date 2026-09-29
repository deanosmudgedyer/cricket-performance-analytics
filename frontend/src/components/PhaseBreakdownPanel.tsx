import { Box, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { colors } from "../theme";
import { EconomyBarChart } from "./charts/EconomyBarChart";
import type { PhaseBreakdown } from "../api/client";

interface PhaseColumn {
  key: string;
  label: string;
}

interface PhaseBreakdownPanelProps {
  title: string;
  helpText: string;
  data: PhaseBreakdown | null;
  loading: boolean;
  phaseLabels: string[];
  /** The same breakpoints passed to the API call - needed to work out
   * which CONCEPTUAL phase (not which surviving row) a phase is, so
   * labels stay correct when an early phase has zero balls (e.g. a
   * middle-order batsman who didn't face the first phase at all). */
  breakpoints: number[];
  valueKey: string;
  valueLabel: string;
  countKey: string;
  countLabel: string;
  columns: PhaseColumn[];
}

/**
 * Spell/innings-progression analysis - a bar chart of the chosen rate
 * per phase, a precise table underneath, and (when the data supports
 * it) one cautiously-worded note comparing the first and last phase.
 * phaseLabels are matched to phases by their CONCEPTUAL slot among
 * `breakpoints` (see conceptualPhaseIndex below), not by their
 * position in the (possibly shorter, after empty phases are dropped)
 * returned list - otherwise a batsman who came in during the second
 * phase would have that phase mislabelled as the first. If there are
 * more phases than labels (or no labels for this tier, e.g. an
 * unclassified competition), the raw over range is shown instead of
 * inventing a name.
 */
function conceptualPhaseIndex(overStart: number, breakpoints: number[]): number {
  return breakpoints.filter((bp) => overStart > bp).length;
}

export function PhaseBreakdownPanel({
  title,
  helpText,
  data,
  loading,
  phaseLabels,
  breakpoints,
  valueKey,
  valueLabel,
  countKey,
  countLabel,
  columns,
}: PhaseBreakdownPanelProps) {
  const phases = data?.phases ?? [];

  const labelFor = (overStart: number, overRange: unknown) => {
    const preset = phaseLabels[conceptualPhaseIndex(overStart, breakpoints)];
    return preset ? `${preset} (${overRange})` : `Overs ${overRange}`;
  };

  const chartData = phases.map((phase) => ({
    ...phase,
    over_range: labelFor(phase["over_start"] as number, phase["over_range"]),
  }));

  return (
    <Box>
      <EconomyBarChart
        title={title}
        helpText={helpText}
        data={chartData}
        groupKey="over_range"
        loading={loading}
        valueKey={valueKey}
        valueLabel={valueLabel}
        countKey={countKey}
        countLabel={countLabel}
      />

      {data?.note && (
        <Paper elevation={0} sx={{ p: 2, mt: 2, borderLeft: `3px solid ${colors.gold}`, bgcolor: colors.surfaceAlt }}>
          <Typography variant="body2" sx={{ color: "text.primary", lineHeight: 1.6 }}>
            {data.note}
          </Typography>
        </Paper>
      )}

      {phases.length > 0 && (
        <Table size="small" sx={{ mt: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: "text.secondary" }}>Phase</TableCell>
              {columns.map((col) => (
                <TableCell key={col.key} sx={{ color: "text.secondary" }}>
                  {col.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {phases.map((phase) => (
              <TableRow key={String(phase["over_range"])}>
                <TableCell>{labelFor(phase["over_start"] as number, phase["over_range"])}</TableCell>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    {(phase[col.key] as string | number | null) ?? "—"}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}
