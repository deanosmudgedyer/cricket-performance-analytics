import { useEffect, useState } from "react";
import { Box, Grid, Typography } from "@mui/material";
import type { ColDef } from "ag-grid-community";
import { FilterSidebar } from "../components/FilterSidebar";
import { BattingKpiGrid } from "../components/BattingKpiGrid";
import { EconomyBarChart } from "../components/charts/EconomyBarChart";
import { DistributionPieChart } from "../components/charts/DistributionPieChart";
import { WagonWheel } from "../components/charts/WagonWheel";
import { OverTrendChart } from "../components/charts/OverTrendChart";
import { InsightsPanel } from "../components/InsightsPanel";
import { DeliveryTable, overBallComparator } from "../components/DeliveryTable";
import { CombinationTable } from "../components/CombinationTable";
import { StrengthsWeaknessesPanel } from "../components/StrengthsWeaknessesPanel";
import { InningsBreakdownTable } from "../components/InningsBreakdownTable";
import { PhaseBreakdownPanel } from "../components/PhaseBreakdownPanel";
import { battingApi, type Insight, type PhaseBreakdown, type StrengthsWeaknesses } from "../api/client";
import { BATTING_DIMENSIONS } from "../dimensions";
import { breakpointsForTier, phaseLabelsForTier } from "../phasePresets";
import type {
  BattingBreakdownRow,
  BattingDelivery,
  BattingOverRow,
  BattingStats,
  DeliveryFilters,
  FilterOptions,
} from "../types/cricket";
import { EMPTY_FILTERS } from "../types/cricket";
import { colors } from "../theme";

const DELIVERY_COLUMNS: ColDef<BattingDelivery>[] = [
  { field: "over_ball", headerName: "Over.Ball", width: 110, sort: "asc", comparator: overBallComparator },
  { field: "opposition", headerName: "Opposition", flex: 1 },
  { field: "bowler", headerName: "Bowler", flex: 1 },
  { field: "bowler_type", headerName: "Bowler Type", flex: 1, valueFormatter: (p) => p.value ?? "—" },
  { field: "line", headerName: "Line", flex: 1 },
  { field: "length", headerName: "Length", flex: 1 },
  { field: "shot", headerName: "Shot", flex: 1 },
  { field: "runs_scored", headerName: "Runs", width: 90 },
  { field: "run_type", headerName: "Run Type", flex: 1, valueFormatter: (p) => p.value ?? "—" },
  { field: "dismissal_type", headerName: "Dismissal", flex: 1, valueFormatter: (p) => p.value ?? "—" },
  { field: "area_scored", headerName: "Area", flex: 1, valueFormatter: (p) => p.value ?? "—" },
];

const DISMISSAL_COLUMNS: ColDef<BattingDelivery>[] = [
  { field: "match_date", headerName: "Date", width: 110 },
  { field: "opposition", headerName: "Opposition", flex: 1 },
  { field: "over_ball", headerName: "Over.Ball", width: 100 },
  { field: "bowler", headerName: "Bowler", flex: 1 },
  { field: "bowler_type", headerName: "Bowler Type", flex: 1, valueFormatter: (p) => p.value ?? "—" },
  { field: "line", headerName: "Line", flex: 1 },
  { field: "length", headerName: "Length", flex: 1 },
  { field: "shot", headerName: "Shot", flex: 1 },
  { field: "dismissal_type", headerName: "Dismissal", flex: 1 },
  { field: "area_scored", headerName: "Area", flex: 1, valueFormatter: (p) => p.value ?? "—" },
];

interface BattingDashboardProps {
  /** See BowlingDashboard.tsx's identical prop for the contract. */
  lockedFilters?: DeliveryFilters;
}

/**
 * Batting's counterpart to BowlingDashboard.tsx - same layout, same
 * components, same visual language, driven by /api/batting/* instead.
 * Kept as a near-mirror deliberately: a coach who's learned to read
 * the bowling tab shouldn't have to re-learn anything to read this one.
 */
export function BattingDashboard({ lockedFilters = EMPTY_FILTERS }: BattingDashboardProps) {
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [filters, setFilters] = useState<DeliveryFilters>(lockedFilters);
  const activeTier = lockedFilters.equals.format_tier?.[0];
  const phaseBreakpoints = breakpointsForTier(activeTier);
  const phaseLabels = phaseLabelsForTier(activeTier);

  const [stats, setStats] = useState<BattingStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [byLength, setByLength] = useState<BattingBreakdownRow[]>([]);
  const [byLine, setByLine] = useState<BattingBreakdownRow[]>([]);
  const [byBowler, setByBowler] = useState<BattingBreakdownRow[]>([]);
  const [byBowlerType, setByBowlerType] = useState<BattingBreakdownRow[]>([]);
  const [byArea, setByArea] = useState<BattingBreakdownRow[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  const [byOver, setByOver] = useState<BattingOverRow[]>([]);
  const [overLoading, setOverLoading] = useState(false);

  const [phaseData, setPhaseData] = useState<PhaseBreakdown | null>(null);
  const [phaseLoading, setPhaseLoading] = useState(false);

  const [deliveryRows, setDeliveryRows] = useState<BattingDelivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  const [dismissalRows, setDismissalRows] = useState<BattingDelivery[]>([]);
  const [dismissalsLoading, setDismissalsLoading] = useState(false);

  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const [strengthsWeaknesses, setStrengthsWeaknesses] = useState<StrengthsWeaknesses | null>(null);
  const [strengthsLoading, setStrengthsLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const onBackendError = () =>
    setError("Couldn't reach the backend. Make sure `uvicorn app.main:app --reload` is running.");

  useEffect(() => {
    battingApi.filterOptions().then(setFilterOptions).catch(onBackendError);
  }, []);

  useEffect(() => {
    setStatsLoading(true);
    battingApi
      .stats(filters)
      .then((result) => {
        setStats(result);
        setError(null);
      })
      .catch(onBackendError)
      .finally(() => setStatsLoading(false));
  }, [filters]);

  useEffect(() => {
    setBreakdownLoading(true);
    Promise.all([
      battingApi.breakdown("length", filters),
      battingApi.breakdown("line", filters),
      battingApi.breakdown("bowler", filters),
      battingApi.breakdown("bowler_type", filters),
      battingApi.breakdown("area_scored", filters),
    ])
      .then(([lengthRows, lineRows, bowlerRows, bowlerTypeRows, areaRows]) => {
        setByLength(lengthRows);
        setByLine(lineRows);
        setByBowler(bowlerRows);
        setByBowlerType(bowlerTypeRows);
        setByArea(areaRows);
      })
      .catch(onBackendError)
      .finally(() => setBreakdownLoading(false));
  }, [filters]);

  useEffect(() => {
    setOverLoading(true);
    battingApi.byOver(filters).then(setByOver).catch(onBackendError).finally(() => setOverLoading(false));
  }, [filters]);

  useEffect(() => {
    setPhaseLoading(true);
    battingApi
      .phaseBreakdown(phaseBreakpoints, filters)
      .then(setPhaseData)
      .catch(onBackendError)
      .finally(() => setPhaseLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, JSON.stringify(phaseBreakpoints)]);

  useEffect(() => {
    setDeliveriesLoading(true);
    battingApi
      .deliveries(filters)
      .then(setDeliveryRows)
      .catch(onBackendError)
      .finally(() => setDeliveriesLoading(false));
  }, [filters]);

  useEffect(() => {
    setInsightsLoading(true);
    battingApi.insights(filters).then(setInsights).catch(onBackendError).finally(() => setInsightsLoading(false));
  }, [filters]);

  useEffect(() => {
    setStrengthsLoading(true);
    battingApi
      .strengthsWeaknesses(filters)
      .then(setStrengthsWeaknesses)
      .catch(onBackendError)
      .finally(() => setStrengthsLoading(false));
  }, [filters]);

  useEffect(() => {
    setDismissalsLoading(true);
    battingApi
      .dismissals(filters)
      .then(setDismissalRows)
      .catch(onBackendError)
      .finally(() => setDismissalsLoading(false));
  }, [filters]);

  return (
    <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, flexGrow: 1, minHeight: 0 }}>
      <Box
        sx={{
          width: { xs: "100%", md: 300 },
          flexShrink: 0,
          borderRight: { xs: "none", md: `1px solid ${colors.border}` },
          borderBottom: { xs: `1px solid ${colors.border}`, md: "none" },
          bgcolor: colors.surface,
        }}
      >
        <FilterSidebar
          title="Batting Filters"
          options={filterOptions}
          dimensions={BATTING_DIMENSIONS}
          filters={filters}
          onChange={setFilters}
          overMinKey="over_min"
          overMaxKey="over_max"
        />
      </Box>

      <Box sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 4 } }}>
        <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2 }}>
          Batting Analytics
        </Typography>
        <Typography variant="h3" sx={{ fontWeight: 600, mb: 3 }}>
          Mayes — Batting Performance
        </Typography>

        {error && (
          <Typography variant="body2" sx={{ color: colors.clayRed, mb: 2 }}>
            {error}
          </Typography>
        )}

        <BattingKpiGrid stats={stats} loading={statsLoading && !stats} />

        <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2, display: "block", mt: 5, mb: 2 }}>
          Coach's Notes
        </Typography>
        <InsightsPanel insights={insights} loading={insightsLoading && insights.length === 0} />

        <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2, display: "block", mt: 5, mb: 2 }}>
          Strengths &amp; Weaknesses
        </Typography>
        <StrengthsWeaknessesPanel data={strengthsWeaknesses} loading={strengthsLoading && !strengthsWeaknesses} />

        <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2, display: "block", mt: 5, mb: 2 }}>
          Trend
        </Typography>
        <OverTrendChart
          data={byOver}
          loading={overLoading}
          title="Strike Rate Trend by Over"
          helpText="Per-over strike rate vs. the running strike rate across the selection - gaps mark overs not faced"
          rateKey="strike_rate"
          cumulativeRateKey="cumulative_strike_rate"
          rateLabel="Over Strike Rate"
          cumulativeLabel="Running Strike Rate"
        />

        <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2, display: "block", mt: 5, mb: 2 }}>
          Innings Progression
        </Typography>
        <PhaseBreakdownPanel
          title="Strike Rate by Phase"
          helpText="Runs per 100 balls, grouped into innings phases"
          data={phaseData}
          loading={phaseLoading}
          phaseLabels={phaseLabels}
          breakpoints={phaseBreakpoints}
          valueKey="strike_rate"
          valueLabel="Strike Rate"
          countKey="balls_faced"
          countLabel="balls"
          columns={[
            { key: "balls_faced", label: "Balls" },
            { key: "runs", label: "Runs" },
            { key: "dismissals", label: "Out" },
            { key: "strike_rate", label: "SR" },
            { key: "dot_ball_pct", label: "Dot %" },
            { key: "boundary_pct", label: "Bdry %" },
          ]}
        />

        <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2, display: "block", mt: 2, mb: 2 }}>
          Breakdown
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <WagonWheel
              data={byArea}
              loading={breakdownLoading}
              title="Scoring Wagon Wheel"
              runsField="runs"
              ballsField="balls_faced"
              runsLabel="runs scored"
              ballsLabel="shot frequency"
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <DistributionPieChart
              title="Scoring Areas"
              helpText="Where Thomas's scoring shots went"
              data={stats?.area_distribution ?? {}}
              loading={statsLoading && !stats}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <EconomyBarChart
              title="Strike Rate by Length"
              helpText="Runs per 100 balls, grouped by the length faced"
              data={byLength}
              groupKey="length"
              loading={breakdownLoading}
              valueKey="strike_rate"
              valueLabel="Strike Rate"
              countKey="balls_faced"
              countLabel="balls"
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <EconomyBarChart
              title="Strike Rate by Line"
              helpText="Runs per 100 balls, grouped by the line faced"
              data={byLine}
              groupKey="line"
              loading={breakdownLoading}
              valueKey="strike_rate"
              valueLabel="Strike Rate"
              countKey="balls_faced"
              countLabel="balls"
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <EconomyBarChart
              title="Strike Rate by Bowler"
              helpText="Runs per 100 balls against each bowler faced"
              data={byBowler}
              groupKey="bowler"
              loading={breakdownLoading}
              valueKey="strike_rate"
              valueLabel="Strike Rate"
              countKey="balls_faced"
              countLabel="balls"
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <EconomyBarChart
              title="Strike Rate by Bowler Type"
              helpText="Runs per 100 balls against each bowler type faced - bowlers with no type assigned yet (see Manage Data) are left out"
              data={byBowlerType}
              groupKey="bowler_type"
              loading={breakdownLoading}
              valueKey="strike_rate"
              valueLabel="Strike Rate"
              countKey="balls_faced"
              countLabel="balls"
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <DistributionPieChart
              title="Length Mix Faced"
              helpText="Share of deliveries faced at each length"
              data={stats?.length_distribution ?? {}}
              loading={statsLoading && !stats}
            />
          </Grid>
        </Grid>

        <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2, display: "block", mt: 5, mb: 2 }}>
          Combination Analysis
        </Typography>
        <CombinationTable
          title="Combination Engine"
          helpText="Pick up to three dimensions to see every combination's full figures (e.g. Length + Line + Shot)"
          availableDimensions={BATTING_DIMENSIONS}
          defaultDimensions={["length", "line"]}
          fetchRows={(groupBy) => battingApi.breakdown(groupBy, filters)}
          countKey="balls_faced"
          metricColumns={[
            { key: "balls_faced", label: "Balls" },
            { key: "runs", label: "Runs" },
            { key: "dismissals", label: "Out", width: 70 },
            { key: "strike_rate", label: "SR" },
            { key: "average", label: "Avg" },
            { key: "dot_ball_pct", label: "Dot %" },
            { key: "boundary_pct", label: "Bdry %" },
          ]}
        />

        <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2, display: "block", mt: 5, mb: 2 }}>
          Batting By Position / Ground / Opposition
        </Typography>
        <InningsBreakdownTable
          availableDimensions={["batting_position", "ground", "opposition", "innings_label"]}
          defaultDimension="batting_position"
          fetchRows={(by) => battingApi.inningsBreakdown(by, filters)}
        />

        <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2, display: "block", mt: 5, mb: 2 }}>
          Dismissal Analysis
        </Typography>
        {dismissalRows.length === 0 && !dismissalsLoading ? (
          <Typography variant="body2" color="text.secondary">
            No dismissals in the current selection.
          </Typography>
        ) : (
          <DeliveryTable
            rows={dismissalRows}
            columnDefs={DISMISSAL_COLUMNS}
            loading={dismissalsLoading}
            title="Dismissal Log"
            subtitle="Every delivery that dismissed Thomas, matching the current filters"
          />
        )}

        <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2, display: "block", mt: 5, mb: 2 }}>
          Ball-by-Ball
        </Typography>
        <DeliveryTable rows={deliveryRows} columnDefs={DELIVERY_COLUMNS} loading={deliveriesLoading} />
      </Box>
    </Box>
  );
}
