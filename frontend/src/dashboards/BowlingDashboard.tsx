import { useEffect, useState, type ReactNode } from "react";
import { Box, Grid, Typography } from "@mui/material";
import type { ColDef } from "ag-grid-community";
import { FilterSidebar } from "../components/FilterSidebar";
import { KpiGrid } from "../components/KpiGrid";
import { EconomyBarChart } from "../components/charts/EconomyBarChart";
import { DistributionPieChart } from "../components/charts/DistributionPieChart";
import { WagonWheel } from "../components/charts/WagonWheel";
import { OverTrendChart } from "../components/charts/OverTrendChart";
import { InsightsPanel } from "../components/InsightsPanel";
import { DeliveryTable, overBallComparator } from "../components/DeliveryTable";
import { CombinationTable } from "../components/CombinationTable";
import { PhaseBreakdownPanel } from "../components/PhaseBreakdownPanel";
import { bowlingApi, type BowlingMilestones, type Insight, type PhaseBreakdown } from "../api/client";
import { BOWLING_DIMENSIONS } from "../dimensions";
import { breakpointsForTier, phaseLabelsForTier } from "../phasePresets";
import { FIRST_CLASS } from "../formatTiers";
import type {
  BowlingBreakdownRow,
  BowlingDelivery,
  BowlingOverRow,
  BowlingStats,
  DeliveryFilters,
  FilterOptions,
} from "../types/cricket";
import { EMPTY_FILTERS } from "../types/cricket";
import { colors } from "../theme";

const DELIVERY_COLUMNS: ColDef<BowlingDelivery>[] = [
  { field: "over_ball", headerName: "Over.Ball", width: 110, sort: "asc", comparator: overBallComparator },
  { field: "opposition", headerName: "Opposition", flex: 1 },
  { field: "batsman", headerName: "Batsman", flex: 1 },
  { field: "batting_hand", headerName: "Hand", width: 90 },
  { field: "bowling_end", headerName: "End", flex: 1 },
  { field: "side_of_wicket", headerName: "Side", flex: 1 },
  { field: "line", headerName: "Line", flex: 1 },
  { field: "length", headerName: "Length", flex: 1 },
  { field: "runs_off_bat", headerName: "Runs", width: 90 },
  { field: "run_type", headerName: "Run Type", flex: 1, valueFormatter: (p) => p.value ?? "—" },
  { field: "dismissal_type", headerName: "Dismissal", flex: 1, valueFormatter: (p) => p.value ?? "—" },
  { field: "area_scored", headerName: "Area", flex: 1, valueFormatter: (p) => p.value ?? "—" },
];

const WICKET_COLUMNS: ColDef<BowlingDelivery>[] = [
  { field: "match_date", headerName: "Date", width: 110 },
  { field: "opposition", headerName: "Opposition", flex: 1 },
  { field: "over_ball", headerName: "Over.Ball", width: 100 },
  { field: "batsman", headerName: "Batsman", flex: 1 },
  { field: "batting_hand", headerName: "Hand", width: 80 },
  { field: "bowling_end", headerName: "End", flex: 1 },
  { field: "side_of_wicket", headerName: "Side", flex: 1 },
  { field: "line", headerName: "Line", flex: 1 },
  { field: "length", headerName: "Length", flex: 1 },
  { field: "shot", headerName: "Shot", flex: 1 },
  { field: "dismissal_type", headerName: "Dismissal", flex: 1 },
  { field: "wicket_explanation", headerName: "Detail", flex: 1.4, valueFormatter: (p) => p.value ?? "—" },
];

interface BowlingDashboardProps {
  /** Pre-applied, non-removable filters (in practice: which format
   * tier this view is scoped to). The caller is expected to remount
   * this component (e.g. via a `key`) when lockedFilters changes,
   * rather than this component reconciling a mid-life filter swap. */
  lockedFilters?: DeliveryFilters;
}

/**
 * The original single-page bowling dashboard, now driven by
 * /api/bowling/* and the fuller filter set (competition, opposition,
 * ground, batting hand, side of wicket, etc.) instead of the original
 * 6-field slice. Same components, same visual language - see
 * BattingDashboard.tsx for the mirrored batting equivalent.
 */
export function BowlingDashboard({ lockedFilters = EMPTY_FILTERS }: BowlingDashboardProps) {
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [filters, setFilters] = useState<DeliveryFilters>(lockedFilters);
  const activeTier = lockedFilters.equals.format_tier?.[0];
  const phaseBreakpoints = breakpointsForTier(activeTier);
  const phaseLabels = phaseLabelsForTier(activeTier);

  const [stats, setStats] = useState<BowlingStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [milestones, setMilestones] = useState<BowlingMilestones | null>(null);
  const [milestonesLoading, setMilestonesLoading] = useState(false);

  const [byLength, setByLength] = useState<BowlingBreakdownRow[]>([]);
  const [byEnd, setByEnd] = useState<BowlingBreakdownRow[]>([]);
  const [byHand, setByHand] = useState<BowlingBreakdownRow[]>([]);
  const [bySide, setBySide] = useState<BowlingBreakdownRow[]>([]);
  const [byArea, setByArea] = useState<BowlingBreakdownRow[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  const [byOver, setByOver] = useState<BowlingOverRow[]>([]);
  const [overLoading, setOverLoading] = useState(false);

  const [phaseData, setPhaseData] = useState<PhaseBreakdown | null>(null);
  const [phaseLoading, setPhaseLoading] = useState(false);

  const [deliveryRows, setDeliveryRows] = useState<BowlingDelivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  const [wicketRows, setWicketRows] = useState<BowlingDelivery[]>([]);
  const [wicketsLoading, setWicketsLoading] = useState(false);

  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const onBackendError = () =>
    setError("Couldn't reach the backend. Make sure `uvicorn app.main:app --reload` is running.");

  useEffect(() => {
    bowlingApi.filterOptions(lockedFilters).then(setFilterOptions).catch(onBackendError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setStatsLoading(true);
    bowlingApi
      .stats(filters)
      .then((result) => {
        setStats(result);
        setError(null);
      })
      .catch(onBackendError)
      .finally(() => setStatsLoading(false));
  }, [filters]);

  useEffect(() => {
    setMilestonesLoading(true);
    bowlingApi
      .milestones(filters)
      .then(setMilestones)
      .catch(onBackendError)
      .finally(() => setMilestonesLoading(false));
  }, [filters]);

  useEffect(() => {
    setBreakdownLoading(true);
    Promise.all([
      bowlingApi.breakdown("length", filters),
      bowlingApi.breakdown("bowling_end", filters),
      bowlingApi.breakdown("batting_hand", filters),
      bowlingApi.breakdown("side_of_wicket", filters),
      bowlingApi.breakdown("area_scored", filters),
    ])
      .then(([lengthRows, endRows, handRows, sideRows, areaRows]) => {
        setByLength(lengthRows);
        setByEnd(endRows);
        setByHand(handRows);
        setBySide(sideRows);
        setByArea(areaRows);
      })
      .catch(onBackendError)
      .finally(() => setBreakdownLoading(false));
  }, [filters]);

  useEffect(() => {
    setPhaseLoading(true);
    bowlingApi
      .phaseBreakdown(phaseBreakpoints, filters)
      .then(setPhaseData)
      .catch(onBackendError)
      .finally(() => setPhaseLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, JSON.stringify(phaseBreakpoints)]);

  useEffect(() => {
    setOverLoading(true);
    bowlingApi.byOver(filters).then(setByOver).catch(onBackendError).finally(() => setOverLoading(false));
  }, [filters]);

  useEffect(() => {
    setDeliveriesLoading(true);
    bowlingApi
      .deliveries(filters)
      .then(setDeliveryRows)
      .catch(onBackendError)
      .finally(() => setDeliveriesLoading(false));
  }, [filters]);

  useEffect(() => {
    setInsightsLoading(true);
    bowlingApi.insights(filters).then(setInsights).catch(onBackendError).finally(() => setInsightsLoading(false));
  }, [filters]);

  useEffect(() => {
    setWicketsLoading(true);
    bowlingApi.wickets(filters).then(setWicketRows).catch(onBackendError).finally(() => setWicketsLoading(false));
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
          title="Bowling Filters"
          options={filterOptions}
          dimensions={BOWLING_DIMENSIONS}
          filters={filters}
          onChange={setFilters}
          overMinKey="over_min"
          overMaxKey="over_max"
        />
      </Box>

      <Box sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 4 } }}>
        <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2 }}>
          Bowling Analytics
        </Typography>
        <Typography variant="h3" sx={{ fontWeight: 600, mb: 3 }}>
          Mayes — Bowling Performance
        </Typography>

        {error && (
          <Typography variant="body2" sx={{ color: colors.clayRed, mb: 2 }}>
            {error}
          </Typography>
        )}

        <KpiGrid
          stats={stats}
          milestones={milestones}
          loading={(statsLoading && !stats) || (milestonesLoading && !milestones)}
          showTenWicketHauls={activeTier === FIRST_CLASS}
        />

        <SectionLabel mt={5}>Coach's Notes</SectionLabel>
        <InsightsPanel insights={insights} loading={insightsLoading && insights.length === 0} />

        <SectionLabel mt={5}>Trend</SectionLabel>
        <OverTrendChart data={byOver} loading={overLoading} />

        <SectionLabel mt={5}>Spell / Phase Analysis</SectionLabel>
        <PhaseBreakdownPanel
          title="Economy by Phase"
          helpText="Runs conceded per over, grouped into innings phases"
          data={phaseData}
          loading={phaseLoading}
          phaseLabels={phaseLabels}
          breakpoints={phaseBreakpoints}
          valueKey="economy"
          valueLabel="Economy"
          countKey="balls_bowled"
          countLabel="balls"
          columns={[
            { key: "overs", label: "Overs" },
            { key: "runs_conceded", label: "Runs" },
            { key: "wickets", label: "Wkts" },
            { key: "economy", label: "Economy" },
            { key: "dot_ball_pct", label: "Dot %" },
            { key: "boundary_pct", label: "Bdry %" },
          ]}
        />

        <SectionLabel mt={2}>Breakdown</SectionLabel>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <WagonWheel data={byArea} loading={breakdownLoading} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <DistributionPieChart
              title="Scoring Areas"
              helpText="Where the batsman's scoring shots went"
              data={stats?.area_distribution ?? {}}
              loading={statsLoading && !stats}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <EconomyBarChart
              title="Economy by Length"
              helpText="Runs conceded per over, grouped by delivery length"
              data={byLength}
              groupKey="length"
              loading={breakdownLoading}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <EconomyBarChart
              title="Economy by Bowling End"
              helpText="Runs conceded per over, grouped by bowling end"
              data={byEnd}
              groupKey="bowling_end"
              loading={breakdownLoading}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <EconomyBarChart
              title="Economy vs Batting Hand"
              helpText="Left-handers vs right-handers"
              data={byHand}
              groupKey="batting_hand"
              loading={breakdownLoading}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <EconomyBarChart
              title="Economy: Over vs Around the Wicket"
              helpText="Tactical split by side of wicket"
              data={bySide}
              groupKey="side_of_wicket"
              loading={breakdownLoading}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <DistributionPieChart
              title="Length Mix"
              helpText="Share of deliveries bowled at each length"
              data={stats?.length_distribution ?? {}}
              loading={statsLoading && !stats}
            />
          </Grid>
        </Grid>

        <SectionLabel mt={5}>Combination Analysis</SectionLabel>
        <CombinationTable
          title="Combination Engine"
          helpText="Pick up to three dimensions to see every combination's full figures (e.g. Length + Batting Hand + Side of Wicket)"
          availableDimensions={BOWLING_DIMENSIONS}
          defaultDimensions={["length", "batting_hand"]}
          fetchRows={(groupBy) => bowlingApi.breakdown(groupBy, filters)}
          countKey="balls_bowled"
          metricColumns={[
            { key: "overs", label: "Overs" },
            { key: "runs_conceded", label: "Runs" },
            { key: "wickets", label: "Wkts", width: 70 },
            { key: "economy", label: "Econ" },
            { key: "average", label: "Avg" },
            { key: "dot_ball_pct", label: "Dot %" },
            { key: "boundary_pct", label: "Bdry %" },
          ]}
        />

        <SectionLabel mt={5}>Wicket Analysis</SectionLabel>
        {wicketRows.length === 0 && !wicketsLoading ? (
          <Typography variant="body2" color="text.secondary">
            No wickets in the current selection.
          </Typography>
        ) : (
          <DeliveryTable
            rows={wicketRows}
            columnDefs={WICKET_COLUMNS}
            loading={wicketsLoading}
            title="Wicket Log"
            subtitle="Every wicket-taking delivery matching the current filters, in full context"
          />
        )}

        <SectionLabel mt={5}>Ball-by-Ball</SectionLabel>
        <DeliveryTable rows={deliveryRows} columnDefs={DELIVERY_COLUMNS} loading={deliveriesLoading} />
      </Box>
    </Box>
  );
}

function SectionLabel({ children, mt }: { children: ReactNode; mt: number }) {
  return (
    <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2, display: "block", mt, mb: 2 }}>
      {children}
    </Typography>
  );
}
