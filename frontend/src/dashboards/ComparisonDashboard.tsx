import { useEffect, useState } from "react";
import { Box, Grid, Paper, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { FilterSidebar } from "../components/FilterSidebar";
import { bowlingApi, battingApi } from "../api/client";
import { BOWLING_DIMENSIONS, BATTING_DIMENSIONS } from "../dimensions";
import type { BattingStats, BowlingStats, DeliveryFilters, FilterOptions } from "../types/cricket";
import { EMPTY_FILTERS } from "../types/cricket";
import { colors } from "../theme";

type Discipline = "bowling" | "batting";

interface MetricSpec {
  key: string;
  label: string;
  format?: (value: unknown) => string;
  /** true = higher is better for the bowler/batter (used to colour the winning side). */
  higherIsBetter: boolean;
}

const BOWLING_METRICS: MetricSpec[] = [
  { key: "balls_bowled", label: "Balls Bowled", higherIsBetter: true },
  { key: "economy", label: "Economy", higherIsBetter: false },
  { key: "average", label: "Average", higherIsBetter: false },
  { key: "bowling_strike_rate", label: "Strike Rate", higherIsBetter: false },
  { key: "wickets", label: "Wickets", higherIsBetter: true },
  { key: "dot_ball_pct", label: "Dot Ball %", higherIsBetter: true },
  { key: "boundary_pct", label: "Boundary %", higherIsBetter: false },
];

const BATTING_METRICS: MetricSpec[] = [
  { key: "balls_faced", label: "Balls Faced", higherIsBetter: true },
  { key: "runs", label: "Runs", higherIsBetter: true },
  { key: "strike_rate", label: "Strike Rate", higherIsBetter: true },
  { key: "average", label: "Average", higherIsBetter: true },
  { key: "dismissals", label: "Dismissals", higherIsBetter: false },
  { key: "dot_ball_pct", label: "Dot Ball %", higherIsBetter: false },
  { key: "boundary_pct", label: "Boundary %", higherIsBetter: true },
];

const fmt = (value: unknown) => (value === null || value === undefined ? "—" : String(value));

/**
 * Two independent filter selections, evaluated through the exact same
 * stats endpoint the Bowling/Batting tabs use, shown side by side.
 * This is the spec's "Comparison Engine" - Left-handers vs
 * Right-handers, Good Length vs Full, Over vs Around the Wicket,
 * Opposition A vs B - all of them are just two DeliveryFilters
 * objects, not a new kind of analysis.
 */
interface ComparisonDashboardProps {
  /** Both conditions are scoped to this (in practice: a format tier) -
   * comparing across tiers would reintroduce exactly the format-blending
   * problem this whole restructure exists to avoid. */
  lockedFilters?: DeliveryFilters;
}

export function ComparisonDashboard({ lockedFilters = EMPTY_FILTERS }: ComparisonDashboardProps) {
  const [discipline, setDiscipline] = useState<Discipline>("bowling");
  const [options, setOptions] = useState<FilterOptions | null>(null);

  const [filtersA, setFiltersA] = useState<DeliveryFilters>(lockedFilters);
  const [filtersB, setFiltersB] = useState<DeliveryFilters>(lockedFilters);
  const [statsA, setStatsA] = useState<BowlingStats | BattingStats | null>(null);
  const [statsB, setStatsB] = useState<BowlingStats | BattingStats | null>(null);

  const api = discipline === "bowling" ? bowlingApi : battingApi;
  const dimensions = discipline === "bowling" ? BOWLING_DIMENSIONS : BATTING_DIMENSIONS;
  const metrics = discipline === "bowling" ? BOWLING_METRICS : BATTING_METRICS;
  const sampleKey = discipline === "bowling" ? "balls_bowled" : "balls_faced";

  useEffect(() => {
    setOptions(null);
    setFiltersA(lockedFilters);
    setFiltersB(lockedFilters);
    api.filterOptions().then(setOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discipline]);

  useEffect(() => {
    api.stats(filtersA).then(setStatsA);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discipline, filtersA]);

  useEffect(() => {
    api.stats(filtersB).then(setStatsB);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discipline, filtersB]);

  const sampleA = statsA ? Number((statsA as unknown as Record<string, unknown>)[sampleKey] ?? 0) : 0;
  const sampleB = statsB ? Number((statsB as unknown as Record<string, unknown>)[sampleKey] ?? 0) : 0;

  return (
    <Box sx={{ flexGrow: 1, p: 4 }}>
      <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2 }}>
        Comparison Engine
      </Typography>
      <Typography variant="h3" sx={{ fontWeight: 600, mb: 3 }}>
        Mayes — Compare Conditions
      </Typography>

      <ToggleButtonGroup
        size="small"
        exclusive
        value={discipline}
        onChange={(_, value) => value && setDiscipline(value)}
        sx={{ mb: 3 }}
      >
        <ToggleButton value="bowling">Bowling</ToggleButton>
        <ToggleButton value="batting">Batting</ToggleButton>
      </ToggleButtonGroup>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper elevation={0} sx={{ border: `1px solid ${colors.gold}` }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, p: 2, pb: 0 }}>
              Condition A
            </Typography>
            <FilterSidebar
              title=""
              options={options}
              dimensions={dimensions}
              filters={filtersA}
              onChange={setFiltersA}
            />
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper elevation={0} sx={{ border: `1px solid ${colors.turfGreen}` }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, p: 2, pb: 0 }}>
              Condition B
            </Typography>
            <FilterSidebar
              title=""
              options={options}
              dimensions={dimensions}
              filters={filtersB}
              onChange={setFiltersB}
            />
          </Paper>
        </Grid>
      </Grid>

      {(sampleA < 12 || sampleB < 12) && (
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1.5 }}>
          Small sample on at least one side (A: {sampleA} {sampleKey === "balls_bowled" ? "balls bowled" : "balls faced"},
          {" "}B: {sampleB}) - treat any gap as indicative, not conclusive.
        </Typography>
      )}

      <Paper elevation={0} sx={{ p: 2.5 }}>
        <Grid container sx={{ pb: 1.5, borderBottom: `1px solid ${colors.border}`, mb: 1.5 }}>
          <Grid size={4}>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              METRIC
            </Typography>
          </Grid>
          <Grid size={4}>
            <Typography variant="caption" sx={{ color: colors.gold, fontWeight: 700 }}>
              CONDITION A
            </Typography>
          </Grid>
          <Grid size={4}>
            <Typography variant="caption" sx={{ color: colors.turfGreen, fontWeight: 700 }}>
              CONDITION B
            </Typography>
          </Grid>
        </Grid>

        {metrics.map((metric) => {
          const a = statsA ? (statsA as unknown as Record<string, unknown>)[metric.key] : null;
          const b = statsB ? (statsB as unknown as Record<string, unknown>)[metric.key] : null;
          const aNum = typeof a === "number" ? a : null;
          const bNum = typeof b === "number" ? b : null;
          const aWins = aNum !== null && bNum !== null && aNum !== bNum && (metric.higherIsBetter ? aNum > bNum : aNum < bNum);
          const bWins = aNum !== null && bNum !== null && aNum !== bNum && (metric.higherIsBetter ? bNum > aNum : bNum < aNum);

          return (
            <Grid container key={metric.key} sx={{ py: 1 }}>
              <Grid size={4}>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {metric.label}
                </Typography>
              </Grid>
              <Grid size={4}>
                <Typography variant="body1" sx={{ fontWeight: aWins ? 700 : 400, color: aWins ? colors.gold : "text.primary" }}>
                  {fmt(a)}
                </Typography>
              </Grid>
              <Grid size={4}>
                <Typography variant="body1" sx={{ fontWeight: bWins ? 700 : 400, color: bWins ? colors.turfGreen : "text.primary" }}>
                  {fmt(b)}
                </Typography>
              </Grid>
            </Grid>
          );
        })}
      </Paper>
    </Box>
  );
}
