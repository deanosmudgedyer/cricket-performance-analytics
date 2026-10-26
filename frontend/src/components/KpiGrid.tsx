import { Box, Grid, Typography } from "@mui/material";
import { KpiCard, type KpiTone } from "./KpiCard";
import type { BowlingMilestones } from "../api/client";
import type { BowlingStats } from "../types/cricket";

interface KpiGridProps {
  stats: BowlingStats | null;
  milestones: BowlingMilestones | null;
  loading: boolean;
}

// Thresholds below are illustrative starting points for Test-match
// bowling, not a fixed law of cricket - easy to tune per format later.
function economyTone(economy: number | null): KpiTone {
  if (economy === null) return "neutral";
  if (economy < 3) return "good";
  if (economy < 5) return "neutral";
  return "bad";
}

function dotBallTone(pct: number | null): KpiTone {
  if (pct === null) return "neutral";
  if (pct >= 60) return "good";
  if (pct >= 40) return "neutral";
  return "bad";
}

function boundaryTone(pct: number | null): KpiTone {
  if (pct === null) return "neutral";
  if (pct < 8) return "good";
  if (pct < 15) return "neutral";
  return "bad";
}

const naIfNull = (value: number | null) => (value === null ? "N/A" : value);

export function KpiGrid({ stats, milestones, loading }: KpiGridProps) {
  if (loading) {
    return (
      <Typography variant="body2" color="text.secondary">
        Updating…
      </Typography>
    );
  }

  if (!stats || stats.balls_bowled === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No deliveries match the current filters. Try widening your selection.
      </Typography>
    );
  }

  return (
    <Box>
      {stats.small_sample && (
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1.5 }}>
          Small sample - {stats.balls_bowled} balls. Treat rates as indicative, not conclusive.
        </Typography>
      )}

      {/* Main figures: matches/innings/overs/maidens/runs/wickets/
          economy/5W/10W/strike rate - the scorecard-level numbers a
          coach checks first. Matches/Innings/Maidens/5W/10W come from
          /api/bowling/milestones (an innings-or-match-level fact, not
          derivable from the same ball-level filter as the rest of
          `stats` - see compute_bowling_milestones), so they're hidden
          while that call is still in flight rather than shown as 0. */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Matches" value={milestones?.matches ?? "—"} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Innings" value={milestones?.innings ?? "—"} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Overs" value={stats.overs} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Maidens" value={milestones?.maidens ?? "—"} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Runs" value={stats.runs_conceded} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard
            label="Wickets"
            value={stats.wickets}
            helpText={
              stats.wickets_small_sample
                ? "Very few wickets in this selection - treat average/strike rate as an early signal only"
                : undefined
            }
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard
            label="Economy"
            value={stats.economy ?? "—"}
            tone={economyTone(stats.economy)}
            helpText="Runs conceded per over, excluding leg byes/byes"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard
            label="5W"
            value={milestones?.five_wicket_hauls ?? "—"}
            helpText="Innings with 5 or more wickets"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard
            label="10W"
            value={milestones?.ten_wicket_matches ?? "—"}
            helpText="Matches with 10 or more wickets combined across the innings bowled"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard
            label="Strike Rate"
            value={naIfNull(stats.bowling_strike_rate)}
            helpText="Balls bowled per wicket"
          />
        </Grid>
      </Grid>

      <Typography
        variant="overline"
        sx={{ color: "text.secondary", letterSpacing: 1.5, display: "block", mt: 3, mb: 1.5 }}
      >
        More Detail
      </Typography>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Average" value={naIfNull(stats.average)} small helpText="Runs conceded per wicket" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Wickets / Over" value={naIfNull(stats.wickets_per_over)} small />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard
            label="Dot Ball %"
            value={stats.dot_ball_pct !== null ? `${stats.dot_ball_pct}%` : "—"}
            tone={dotBallTone(stats.dot_ball_pct)}
            small
            helpText="Share of balls where no run at all was scored - pressure built"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard
            label="Boundary %"
            value={stats.boundary_pct !== null ? `${stats.boundary_pct}%` : "—"}
            tone={boundaryTone(stats.boundary_pct)}
            small
            helpText="Share of balls hit for 4 or 6"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="4s / 6s Conceded" value={`${stats.fours} / ${stats.sixes}`} small />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard
            label="Scoring Shot %"
            value={stats.scoring_shot_pct !== null ? `${stats.scoring_shot_pct}%` : "—"}
            small
            helpText="Share of balls where the batsman scored any run off the bat"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Runs / Ball" value={stats.runs_per_ball ?? "—"} small />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Wides / No Balls" value={`${stats.wides} / ${stats.no_balls}`} small />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Most Bowled Length" value={stats.most_frequent_length ?? "—"} small />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Most Attacked Area" value={stats.most_frequent_area ?? "—"} small />
        </Grid>
      </Grid>
    </Box>
  );
}
