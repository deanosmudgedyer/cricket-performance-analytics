import { Box, Grid, Typography } from "@mui/material";
import { KpiCard, type KpiTone } from "./KpiCard";
import type { BattingCareerSummary } from "../api/client";
import type { BattingStats } from "../types/cricket";

interface BattingKpiGridProps {
  stats: BattingStats | null;
  career: BattingCareerSummary["career"] | null;
  loading: boolean;
}

function strikeRateTone(sr: number | null): KpiTone {
  if (sr === null) return "neutral";
  if (sr >= 80) return "good";
  if (sr >= 45) return "neutral";
  return "bad";
}

function dotBallTone(pct: number | null): KpiTone {
  // Inverted vs bowling's dotBallTone - a high dot % is pressure ON
  // the batsman here, not pressure he's building.
  if (pct === null) return "neutral";
  if (pct <= 35) return "good";
  if (pct <= 55) return "neutral";
  return "bad";
}

const naIfNull = (value: number | null) => (value === null ? "N/A" : value);

export function BattingKpiGrid({ stats, career, loading }: BattingKpiGridProps) {
  if (loading) {
    return (
      <Typography variant="body2" color="text.secondary">
        Updating…
      </Typography>
    );
  }

  if (!stats || stats.balls_faced === 0) {
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
          Small sample - {stats.balls_faced} balls faced. Treat rates as indicative, not conclusive.
        </Typography>
      )}

      {/* Main figures: matches/innings/not-outs/runs/highest-score/
          average/strike-rate/100s/50s - the scorecard-level numbers.
          Matches/innings/not-outs/highest-score/100s/50s come from
          career (/api/batting/innings-summary's innings-level summary,
          not derivable from the ball-level `stats` filter), so they
          show "—" rather than 0 while that call is still in flight. */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Matches" value={career?.matches ?? "—"} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Innings" value={career?.innings_played ?? "—"} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Not Outs" value={career?.not_outs ?? "—"} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Runs" value={stats.runs} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Highest Score" value={career?.highest_score ?? "—"} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard
            label="Average"
            value={naIfNull(stats.average)}
            helpText={
              stats.dismissals_small_sample
                ? "Very few dismissals in this selection - treat as an early signal only"
                : "Runs per dismissal"
            }
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard
            label="Strike Rate"
            value={stats.strike_rate ?? "—"}
            tone={strikeRateTone(stats.strike_rate)}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="100s" value={career?.hundreds ?? "—"} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="50s" value={career?.fifties ?? "—"} />
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
          <KpiCard
            label="Dot Ball %"
            value={stats.dot_ball_pct !== null ? `${stats.dot_ball_pct}%` : "—"}
            tone={dotBallTone(stats.dot_ball_pct)}
            small
            helpText="Share of balls faced with no run scored"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard
            label="Boundary %"
            value={stats.boundary_pct !== null ? `${stats.boundary_pct}%` : "—"}
            small
            helpText="Share of balls faced hit for 4 or 6"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard
            label="Scoring Shot %"
            value={stats.scoring_shot_pct !== null ? `${stats.scoring_shot_pct}%` : "—"}
            small
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Dismissals" value={stats.dismissals} small />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="4s / 6s" value={`${stats.fours} / ${stats.sixes}`} small />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="1s / 2s / 3s" value={`${stats.singles} / ${stats.twos} / ${stats.threes}`} small />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Most Faced Length" value={stats.most_faced_length ?? "—"} small />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Most Faced Line" value={stats.most_faced_line ?? "—"} small />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Most Played Shot" value={stats.most_played_shot ?? "—"} small />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard label="Best Scoring Area" value={stats.most_frequent_area ?? "—"} small />
        </Grid>
      </Grid>
    </Box>
  );
}
