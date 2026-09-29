import { useEffect, useState } from "react";
import { Box, Button, Grid, Paper, Typography } from "@mui/material";
import { KpiCard } from "../components/KpiCard";
import { bowlingApi, battingApi, type BattingCareerSummary } from "../api/client";
import { FORMAT_TIERS } from "../formatTiers";
import type { BowlingStats, BattingStats, DeliveryFilters, MatchSummary } from "../types/cricket";
import { colors } from "../theme";

interface TierSummary {
  key: string;
  label: string;
  description: string;
  matchCount: number;
  bowling: BowlingStats | null;
  batting: BattingStats | null;
  career: BattingCareerSummary["career"] | null;
}

const tierFilter = (tierKey: string): DeliveryFilters => ({ equals: { format_tier: [tierKey] } });

interface HomeDashboardProps {
  onSelectTier: (tierKey: string) => void;
}

/**
 * The landing page: one column per format tier, each with the small
 * set of basics a coach would check first - never the full charts/
 * wagon-wheel/trend detail, and critically, never blended across
 * tiers. Blending Test and T20 numbers together is exactly the
 * mistake this page exists to avoid (a combined strike rate or
 * economy is a number that describes neither format correctly) - see
 * app/services/format_classification.py for where tiers come from.
 * Deep-dive analysis (all the filters/breakdowns/comparisons) lives
 * one level down, inside a chosen tier.
 */
export function HomeDashboard({ onSelectTier }: HomeDashboardProps) {
  const [summaries, setSummaries] = useState<TierSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all(
      FORMAT_TIERS.map(async (tier) => {
        const filters = tierFilter(tier.key);
        const [bowling, batting, career, bowlingMatches, battingMatches] = await Promise.all([
          bowlingApi.stats(filters),
          battingApi.stats(filters),
          battingApi.inningsSummary(filters),
          bowlingApi.matches(filters),
          battingApi.matches(filters),
        ]);
        const matchIds = new Set<number>([
          ...bowlingMatches.map((m: MatchSummary) => m.match_id),
          ...battingMatches.map((m: MatchSummary) => m.match_id),
        ]);
        return {
          key: tier.key,
          label: tier.label,
          description: tier.description,
          matchCount: matchIds.size,
          bowling: bowling.balls_bowled > 0 ? bowling : null,
          batting: batting.balls_faced > 0 ? batting : null,
          career: career.career.innings_played > 0 ? career.career : null,
        } satisfies TierSummary;
      })
    )
      .then(setSummaries)
      .catch(() => setError("Couldn't reach the backend. Make sure `uvicorn app.main:app --reload` is running."));
  }, []);

  return (
    <Box sx={{ flexGrow: 1, p: 4 }}>
      <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2 }}>
        Cricket Performance Analytics
      </Typography>
      <Typography variant="h3" sx={{ fontWeight: 600, mb: 1 }}>
        Thomas Mayes — Overview
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 3, maxWidth: 700 }}>
        Bowling and batting shown separately by format - First Class, 50-Over and T20 are never blended
        together here, since the stats that matter (strike rate, economy) mean different things in each.
        Pick a format below to filter, break down, and compare within it.
      </Typography>

      {error && (
        <Typography variant="body2" sx={{ color: colors.clayRed, mb: 2 }}>
          {error}
        </Typography>
      )}

      {!summaries ? (
        <Typography variant="body2" color="text.secondary">
          Loading…
        </Typography>
      ) : (
        <Grid container spacing={3}>
          {summaries.map((tier) => (
            <Grid size={{ xs: 12, md: 4 }} key={tier.key}>
              <Paper elevation={0} sx={{ p: 3, height: "100%", display: "flex", flexDirection: "column" }}>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.25 }}>
                  {tier.label}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 2 }}>
                  {tier.description}
                </Typography>
                <Typography variant="body2" sx={{ color: colors.gold, fontWeight: 600, mb: 2 }}>
                  {tier.matchCount} match{tier.matchCount === 1 ? "" : "es"}
                </Typography>

                {!tier.bowling && !tier.batting ? (
                  <Typography variant="body2" sx={{ color: "text.secondary", flexGrow: 1 }}>
                    No data yet for this format.
                  </Typography>
                ) : (
                  <Box sx={{ flexGrow: 1 }}>
                    {tier.bowling && (
                      <>
                        <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: 1.5 }}>
                          Bowling
                        </Typography>
                        <Grid container spacing={1} sx={{ mb: 2 }}>
                          <Grid size={6}><KpiCard label="Overs" value={tier.bowling.overs} /></Grid>
                          <Grid size={6}><KpiCard label="Wickets" value={tier.bowling.wickets} /></Grid>
                          <Grid size={6}><KpiCard label="Economy" value={tier.bowling.economy ?? "—"} /></Grid>
                          <Grid size={6}><KpiCard label="Average" value={tier.bowling.average ?? "N/A"} /></Grid>
                        </Grid>
                      </>
                    )}
                    {tier.batting && (
                      <>
                        <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: 1.5 }}>
                          Batting
                        </Typography>
                        <Grid container spacing={1}>
                          <Grid size={6}>
                            <KpiCard label="Innings" value={tier.career?.innings_played ?? "—"} />
                          </Grid>
                          <Grid size={6}><KpiCard label="Runs" value={tier.batting.runs} /></Grid>
                          <Grid size={6}><KpiCard label="Average" value={tier.batting.average ?? "N/A"} /></Grid>
                          <Grid size={6}>
                            <KpiCard label="Strike Rate" value={tier.batting.strike_rate ?? "—"} />
                          </Grid>
                        </Grid>
                      </>
                    )}
                  </Box>
                )}

                <Button
                  variant="outlined"
                  sx={{ mt: 3, alignSelf: "flex-start", borderColor: colors.gold, color: colors.gold }}
                  onClick={() => onSelectTier(tier.key)}
                  disabled={!tier.bowling && !tier.batting}
                >
                  Deep dive →
                </Button>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
