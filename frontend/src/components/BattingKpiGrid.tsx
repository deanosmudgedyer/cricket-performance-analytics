import { Box, Grid, Typography } from "@mui/material";
import { KpiCard, type KpiTone } from "./KpiCard";
import type { BattingStats } from "../types/cricket";

interface BattingKpiGridProps {
  stats: BattingStats | null;
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

export function BattingKpiGrid({ stats, loading }: BattingKpiGridProps) {
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
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 4, md: 3 }}>
          <KpiCard label="Balls Faced" value={stats.balls_faced} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3 }}>
          <KpiCard label="Runs" value={stats.runs} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3 }}>
          <KpiCard
            label="Strike Rate"
            value={stats.strike_rate ?? "—"}
            tone={strikeRateTone(stats.strike_rate)}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3 }}>
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
        <Grid size={{ xs: 6, sm: 4, md: 3 }}>
          <KpiCard label="Dismissals" value={stats.dismissals} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3 }}>
          <KpiCard
            label="Dot Ball %"
            value={stats.dot_ball_pct !== null ? `${stats.dot_ball_pct}%` : "—"}
            tone={dotBallTone(stats.dot_ball_pct)}
            helpText="Share of balls faced with no run scored"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3 }}>
          <KpiCard
            label="Boundary %"
            value={stats.boundary_pct !== null ? `${stats.boundary_pct}%` : "—"}
            helpText="Share of balls faced hit for 4 or 6"
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3 }}>
          <KpiCard label="4s / 6s" value={`${stats.fours} / ${stats.sixes}`} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3 }}>
          <KpiCard
            label="Scoring Shot %"
            value={stats.scoring_shot_pct !== null ? `${stats.scoring_shot_pct}%` : "—"}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3 }}>
          <KpiCard label="1s / 2s / 3s" value={`${stats.singles} / ${stats.twos} / ${stats.threes}`} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3 }}>
          <KpiCard label="Most Faced Length" value={stats.most_faced_length ?? "—"} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3 }}>
          <KpiCard label="Most Faced Line" value={stats.most_faced_line ?? "—"} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3 }}>
          <KpiCard label="Most Played Shot" value={stats.most_played_shot ?? "—"} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 3 }}>
          <KpiCard label="Best Scoring Area" value={stats.most_frequent_area ?? "—"} />
        </Grid>
      </Grid>
    </Box>
  );
}
