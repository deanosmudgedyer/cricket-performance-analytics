import { Box, Paper, Tooltip, Typography } from "@mui/material";
import type { ExpectedOutcome } from "../api/client";
import type { BowlingStats } from "../types/cricket";
import { colors } from "../theme";

interface ExpectedOutcomePanelProps {
  actual: BowlingStats | null;
  expected: ExpectedOutcome | null;
  loading: boolean;
}

interface Row {
  label: string;
  actual: string;
  expected: string;
}

/**
 * Actual (observed) vs. model-smoothed expected, side by side, for
 * whatever's currently filtered - see app/ml/outcome_model.py's
 * module docstring for exactly what "expected" means here (a steadier
 * read of this bowler's OWN pattern, not a league-wide baseline;
 * there's only one bowler in this dataset). Most informative on a
 * small selection, where the actual figure alone is mostly noise -
 * the panel says so directly via the small_sample flag rather than
 * leaving it to be inferred from the ball count.
 */
export function ExpectedOutcomePanel({ actual, expected, loading }: ExpectedOutcomePanelProps) {
  if (loading || !expected) {
    return (
      <Paper elevation={0} sx={{ p: 2.5 }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {loading ? "Updating…" : "No data for current filters."}
        </Typography>
      </Paper>
    );
  }

  if (!expected.available) {
    return (
      <Paper elevation={0} sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Model-Smoothed Expected Outcome
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {expected.note}
        </Typography>
      </Paper>
    );
  }

  if (expected.balls === 0 || !actual || actual.balls_bowled === 0) {
    return (
      <Paper elevation={0} sx={{ p: 2.5 }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          No deliveries match the current filters.
        </Typography>
      </Paper>
    );
  }

  const rows: Row[] = [
    {
      label: "Economy",
      actual: actual.economy !== null ? actual.economy.toFixed(2) : "—",
      expected: expected.expected_economy !== undefined ? expected.expected_economy.toFixed(2) : "—",
    },
    {
      label: "Dot Ball %",
      actual: actual.dot_ball_pct !== null ? `${actual.dot_ball_pct}%` : "—",
      expected: expected.expected_dot_pct !== undefined ? `${expected.expected_dot_pct}%` : "—",
    },
    {
      label: "Boundary %",
      actual: actual.boundary_pct !== null ? `${actual.boundary_pct}%` : "—",
      expected: expected.expected_boundary_pct !== undefined ? `${expected.expected_boundary_pct}%` : "—",
    },
    {
      label: "Wicket %",
      actual:
        actual.balls_bowled > 0 ? `${((actual.wickets / actual.balls_bowled) * 100).toFixed(1)}%` : "—",
      expected: expected.expected_wicket_pct !== undefined ? `${expected.expected_wicket_pct}%` : "—",
    },
  ];

  return (
    <Paper elevation={0} sx={{ p: 2.5 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap", mb: 0.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Model-Smoothed Expected Outcome
        </Typography>
        {expected.model_name && (
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            ({expected.model_name}, {expected.balls} balls scored)
          </Typography>
        )}
      </Box>
      <Tooltip title={expected.note} arrow placement="top">
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", display: "block", mb: 2, cursor: "help", textDecoration: "underline dotted" }}
        >
          What does "expected" mean here?
        </Typography>
      </Tooltip>

      {expected.small_sample && (
        <Typography variant="caption" sx={{ color: colors.gold, display: "block", mb: 1.5 }}>
          Small sample - the actual figure alone is noisy here; the model's estimate draws on the whole
          dataset's pattern for this context instead.
        </Typography>
      )}

      <Box sx={{ display: "grid", gridTemplateColumns: "1fr repeat(2, auto)", gap: 1, rowGap: 1.5 }}>
        <Typography variant="caption" sx={{ color: "text.secondary" }} />
        <Typography variant="caption" sx={{ color: "text.secondary", textAlign: "right" }}>
          Actual
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary", textAlign: "right" }}>
          Expected
        </Typography>
        {rows.map((row) => (
          <Box key={row.label} sx={{ display: "contents" }}>
            <Typography variant="body2">{row.label}</Typography>
            <Typography variant="body2" sx={{ textAlign: "right", fontWeight: 600 }}>
              {row.actual}
            </Typography>
            <Typography variant="body2" sx={{ textAlign: "right", fontWeight: 600, color: colors.gold }}>
              {row.expected}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
