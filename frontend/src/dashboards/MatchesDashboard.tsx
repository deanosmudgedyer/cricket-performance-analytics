import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Box, Chip, Grid, Paper, Typography } from "@mui/material";
import { KpiCard } from "../components/KpiCard";
import { EconomyBarChart } from "../components/charts/EconomyBarChart";
import {
  bowlingApi,
  battingApi,
  type BattingCareerSummary,
  type BowlingInningsSummary,
} from "../api/client";
import { battingFigure, bowlingFigure } from "../scorecardFormat";
import type {
  BattingBreakdownRow,
  BowlingBreakdownRow,
  DeliveryFilters,
  MatchSummary,
} from "../types/cricket";
import { colors } from "../theme";

interface MatchRow {
  matchId: number;
  date: string;
  competition: string;
  team: string;
  opposition: string;
  ground: string;
  // A First Class match has two innings a side, so a match can
  // genuinely have more than one bowling (and batting) innings to
  // show - never assume there's at most one of each.
  bowling: BowlingInningsSummary[];
  batting: ReturnType<typeof pickBattingInnings>;
}

function pickBattingInnings(all: BattingCareerSummary["innings"], matchId: number) {
  return all.filter((row) => row.match_id === matchId);
}

function pickBowlingInnings(all: BowlingInningsSummary[], matchId: number) {
  return all.filter((row) => row.match_id === matchId);
}

const matchFilter = (matchId: number): DeliveryFilters => ({ equals: { match_id: [String(matchId)] } });

interface MatchesDashboardProps {
  /** Scopes the match list and career milestones to one format tier -
   * see BowlingDashboard.tsx's identical prop for the contract. Not
   * needed on the per-match detail calls below: a match_id already
   * identifies one specific match, tier or not. */
  lockedFilters?: DeliveryFilters;
}

/**
 * Combines the bowling and batting datasets around a shared entity
 * neither dashboard shows on its own: the match. Every stat here
 * comes from the same generic stats/breakdown endpoints the Bowling
 * and Batting tabs use, just pre-filtered to one match_id - a match
 * report isn't a new analytical engine, it's a different lens on the
 * one that already exists.
 */
export function MatchesDashboard({ lockedFilters }: MatchesDashboardProps) {
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [bowlingSummary, setBowlingSummary] = useState<BowlingInningsSummary[]>([]);
  const [battingSummary, setBattingSummary] = useState<BattingCareerSummary | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      bowlingApi.matches(lockedFilters),
      battingApi.matches(lockedFilters),
      bowlingApi.inningsSummary(lockedFilters),
      battingApi.inningsSummary(lockedFilters),
    ])
      .then(([bowlingMatches, battingMatches, bowlingInnings, battingInnings]) => {
        const byId = new Map<number, MatchSummary>();
        [...bowlingMatches, ...battingMatches].forEach((m) => byId.set(m.match_id, m));
        const merged = Array.from(byId.values()).sort((a, b) => a.match_date.localeCompare(b.match_date));
        setMatches(merged);
        setBowlingSummary(bowlingInnings);
        setBattingSummary(battingInnings);
        if (merged.length > 0) setSelectedMatchId(merged[merged.length - 1].match_id);
      })
      .catch(() => setError("Couldn't reach the backend. Make sure `uvicorn app.main:app --reload` is running."));
  }, []);

  const rows: MatchRow[] = useMemo(() => {
    if (!matches) return [];
    return matches.map((m) => ({
      matchId: m.match_id,
      date: m.match_date,
      competition: m.competition,
      team: m.team,
      opposition: m.opposition,
      ground: m.ground,
      bowling: pickBowlingInnings(bowlingSummary, m.match_id),
      batting: pickBattingInnings(battingSummary?.innings ?? [], m.match_id),
    }));
  }, [matches, bowlingSummary, battingSummary]);

  const selected = rows.find((r) => r.matchId === selectedMatchId);

  return (
    <Box sx={{ flexGrow: 1, p: 4 }}>
      <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2 }}>
        Match Reports
      </Typography>
      <Typography variant="h3" sx={{ fontWeight: 600, mb: 3 }}>
        Mayes — Matches
      </Typography>

      {error && (
        <Typography variant="body2" sx={{ color: colors.clayRed, mb: 2 }}>
          {error}
        </Typography>
      )}

      {battingSummary && (
        <>
          <SectionLabel>Career Milestones (Batting)</SectionLabel>
          <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <KpiCard label="Innings" value={battingSummary.career.innings_played} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <KpiCard label="Highest Score" value={battingSummary.career.highest_score ?? "—"} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <KpiCard label="Not Outs" value={battingSummary.career.not_outs} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <KpiCard label="50s" value={battingSummary.career.fifties} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
              <KpiCard label="100s" value={battingSummary.career.hundreds} />
            </Grid>
          </Grid>
        </>
      )}

      {(bowlingSummary.length > 0 || (battingSummary?.innings.length ?? 0) > 0) && (
        <>
          <SectionLabel>Season Trend</SectionLabel>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
            Progression across matches by actual date, not an assumed season structure - see each
            bar's tooltip for the match it represents.
          </Typography>
          <Grid container spacing={2} sx={{ mb: 4 }}>
            {bowlingSummary.length > 0 && (
              <Grid size={{ xs: 12, md: 6 }}>
                <EconomyBarChart
                  title="Bowling Economy Over Time"
                  helpText="One bar per innings bowled, in date order"
                  data={bowlingSummary.map((b) => ({ ...b, trend_label: `${b.match_date} (${b.innings_label})` }))}
                  groupKey="trend_label"
                  loading={false}
                />
              </Grid>
            )}
            {battingSummary && battingSummary.innings.length > 0 && (
              <Grid size={{ xs: 12, md: 6 }}>
                <EconomyBarChart
                  title="Batting Strike Rate Over Time"
                  helpText="One bar per innings batted, in date order"
                  data={battingSummary.innings.map((i) => ({
                    ...i,
                    strike_rate: i.balls_faced ? Math.round((i.runs * 10000) / i.balls_faced) / 100 : 0,
                    trend_label: `${i.match_date} (${i.innings_label})`,
                  }))}
                  groupKey="trend_label"
                  loading={false}
                  valueKey="strike_rate"
                  valueLabel="Strike Rate"
                  countKey="balls_faced"
                  countLabel="balls"
                />
              </Grid>
            )}
          </Grid>
        </>
      )}

      <SectionLabel>All Matches</SectionLabel>
      {!matches ? (
        <Typography variant="body2" color="text.secondary">
          Loading…
        </Typography>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 4 }}>
          {rows.map((row) => (
            <Paper
              key={row.matchId}
              elevation={0}
              onClick={() => setSelectedMatchId(row.matchId)}
              sx={{
                p: 2,
                cursor: "pointer",
                border:
                  row.matchId === selectedMatchId
                    ? `1px solid ${colors.gold}`
                    : `1px solid ${colors.border}`,
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 1.5,
              }}
            >
              <Typography variant="body2" sx={{ color: "text.secondary", minWidth: 100 }}>
                {row.date}
              </Typography>
              <Chip size="small" label={row.competition} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {row.team} vs {row.opposition}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {row.ground}
              </Typography>
              <Box sx={{ flexGrow: 1 }} />
              {row.batting.length > 0 && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Batted: ${row.batting.map(battingFigure).join(" & ")}`}
                />
              )}
              {row.bowling.length > 0 && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Bowled: ${row.bowling.map(bowlingFigure).join(" & ")}`}
                />
              )}
            </Paper>
          ))}
        </Box>
      )}

      {selected && <MatchDetail row={selected} />}
    </Box>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Typography variant="overline" sx={{ color: "primary.main", letterSpacing: 2, display: "block", mb: 2 }}>
      {children}
    </Typography>
  );
}

function MatchDetail({ row }: { row: MatchRow }) {
  const [bowlingByLength, setBowlingByLength] = useState<BowlingBreakdownRow[]>([]);
  const [battingByLength, setBattingByLength] = useState<BattingBreakdownRow[]>([]);
  const [inningsCompare, setInningsCompare] = useState<{
    bowling: BowlingBreakdownRow[];
    batting: BattingBreakdownRow[];
  }>({ bowling: [], batting: [] });

  useEffect(() => {
    const filters = matchFilter(row.matchId);
    Promise.all([
      row.bowling.length > 0 ? bowlingApi.breakdown("length", filters) : Promise.resolve([]),
      row.batting.length > 0 ? battingApi.breakdown("length", filters) : Promise.resolve([]),
      bowlingApi.breakdown("innings_label", filters),
      battingApi.breakdown("innings_label", filters),
    ]).then(([bLen, batLen, bInn, batInn]) => {
      setBowlingByLength(bLen);
      setBattingByLength(batLen);
      setInningsCompare({ bowling: bInn, batting: batInn });
    });
  }, [row.matchId, row.bowling.length, row.batting.length]);

  const showBowlingInningsCompare = inningsCompare.bowling.length > 1;
  const showBattingInningsCompare = inningsCompare.batting.length > 1;

  return (
    <Box>
      <SectionLabel>
        Match Report — {row.team} vs {row.opposition}, {row.ground} ({row.date})
      </SectionLabel>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {row.bowling.map((innings) => (
          <Grid size={{ xs: 12, md: 6 }} key={innings.bowling_innings_id}>
            <Paper elevation={0} sx={{ p: 2.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
                Bowling — {innings.innings_label}
              </Typography>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 6, sm: 4 }}><KpiCard label="Overs" value={innings.overs} /></Grid>
                <Grid size={{ xs: 6, sm: 4 }}><KpiCard label="Runs" value={innings.runs_conceded} /></Grid>
                <Grid size={{ xs: 6, sm: 4 }}><KpiCard label="Wickets" value={innings.wickets} /></Grid>
                <Grid size={{ xs: 6, sm: 4 }}><KpiCard label="Economy" value={innings.economy ?? "—"} /></Grid>
                <Grid size={{ xs: 6, sm: 4 }}><KpiCard label="Maidens" value={innings.maidens ?? "N/A"} /></Grid>
                <Grid size={{ xs: 6, sm: 4 }}><KpiCard label="Dot %" value={`${innings.dot_ball_pct ?? "—"}%`} /></Grid>
              </Grid>
            </Paper>
          </Grid>
        ))}
        {row.batting.map((innings) => (
          <Grid size={{ xs: 12, md: 6 }} key={innings.batting_innings_id}>
            <Paper elevation={0} sx={{ p: 2.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
                Batting — {innings.innings_label} (No. {innings.batting_position})
              </Typography>
              <Grid container spacing={1.5}>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <KpiCard label="Runs" value={`${innings.runs}${innings.is_out ? "" : "*"}`} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}><KpiCard label="Balls" value={innings.balls_faced} /></Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <KpiCard
                    label="Strike Rate"
                    value={innings.balls_faced ? Math.round((innings.runs / innings.balls_faced) * 10000) / 100 : "—"}
                  />
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {(showBowlingInningsCompare || showBattingInningsCompare) && (
        <>
          <SectionLabel>Innings Comparison</SectionLabel>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {showBowlingInningsCompare && (
              <Grid size={{ xs: 12, md: 6 }}>
                <EconomyBarChart
                  title="Bowling Economy by Innings"
                  helpText="1st vs 2nd innings, this match"
                  data={inningsCompare.bowling}
                  groupKey="innings_label"
                  loading={false}
                />
              </Grid>
            )}
            {showBattingInningsCompare && (
              <Grid size={{ xs: 12, md: 6 }}>
                <EconomyBarChart
                  title="Batting Strike Rate by Innings"
                  helpText="1st vs 2nd innings, this match"
                  data={inningsCompare.batting}
                  groupKey="innings_label"
                  loading={false}
                  valueKey="strike_rate"
                  valueLabel="Strike Rate"
                  countKey="balls_faced"
                  countLabel="balls"
                />
              </Grid>
            )}
          </Grid>
        </>
      )}

      <SectionLabel>Length Breakdown</SectionLabel>
      <Grid container spacing={2}>
        {row.bowling.length > 0 && (
          <Grid size={{ xs: 12, md: 6 }}>
            <EconomyBarChart
              title="Bowling Economy by Length"
              helpText="This match only"
              data={bowlingByLength}
              groupKey="length"
              loading={false}
            />
          </Grid>
        )}
        {row.batting.length > 0 && (
          <Grid size={{ xs: 12, md: 6 }}>
            <EconomyBarChart
              title="Batting Strike Rate by Length"
              helpText="This match only"
              data={battingByLength}
              groupKey="length"
              loading={false}
              valueKey="strike_rate"
              valueLabel="Strike Rate"
              countKey="balls_faced"
              countLabel="balls"
            />
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
