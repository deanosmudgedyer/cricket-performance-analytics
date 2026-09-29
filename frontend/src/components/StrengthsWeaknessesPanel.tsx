import { Box, Chip, Grid, Paper, Typography } from "@mui/material";
import { colors } from "../theme";
import { labelFor } from "../dimensions";
import type { StrengthWeaknessFinding, StrengthsWeaknesses } from "../api/client";

interface StrengthsWeaknessesPanelProps {
  data: StrengthsWeaknesses | null;
  loading: boolean;
}

const REASON_LABEL: Record<string, string> = {
  scoring_rate: "scoring rate",
  dismissal_concentration: "dismissal cluster",
};

function sentence(finding: StrengthWeaknessFinding, overallSr: number | null): string {
  const dim = labelFor(finding.dimension);
  const gap =
    overallSr !== null && finding.strike_rate !== null
      ? Math.round((finding.strike_rate - overallSr) * 10) / 10
      : null;

  if (finding.reasons.includes("dismissal_concentration") && !finding.reasons.includes("scoring_rate")) {
    return `${finding.dismissals} dismissal(s) from ${finding.balls_faced} balls faced at ${dim.toLowerCase()} "${finding.value}" - a noticeably higher rate than his overall dismissal rate.`;
  }

  const direction = finding.kind === "strength" ? "above" : "below";
  const gapText = gap !== null ? ` (${gap > 0 ? "+" : ""}${gap} vs his overall ${overallSr})` : "";
  let text = `Strike rate of ${finding.strike_rate ?? "—"} at ${dim.toLowerCase()} "${finding.value}" (${finding.balls_faced} balls) - ${Math.abs(gap ?? 0)} runs/100 balls ${direction} his overall rate${gapText}.`;
  if (finding.reasons.includes("dismissal_concentration")) {
    text += ` Also accounts for ${finding.dismissals} of his dismissals.`;
  }
  return text;
}

function FindingCard({ finding, overallSr, tone }: { finding: StrengthWeaknessFinding; overallSr: number | null; tone: string }) {
  return (
    <Paper
      elevation={0}
      sx={{ p: 2, borderLeft: `3px solid ${tone}`, bgcolor: colors.surfaceAlt, mb: 1.5 }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {labelFor(finding.dimension)}: {finding.value}
        </Typography>
        {finding.small_sample && (
          <Chip label={`${finding.balls_faced} balls - small sample`} size="small" variant="outlined" />
        )}
      </Box>
      <Typography variant="body2" sx={{ color: "text.primary", lineHeight: 1.6 }}>
        {sentence(finding, overallSr)}
      </Typography>
      <Box sx={{ display: "flex", gap: 0.5, mt: 1 }}>
        {finding.reasons.map((r) => (
          <Chip key={r} label={REASON_LABEL[r] ?? r} size="small" />
        ))}
      </Box>
    </Paper>
  );
}

/**
 * Renders the fuller strength/weakness scan (see
 * app/services/batting_strengths.py) as two columns of cards, always
 * carrying sample size - never a bare "he's weak against short balls"
 * without the balls-faced count right next to it. Every finding is a
 * comparison against his own overall figures for the current
 * selection, so this reads differently (correctly) depending on which
 * format tier/filters are active.
 */
export function StrengthsWeaknessesPanel({ data, loading }: StrengthsWeaknessesPanelProps) {
  if (loading) {
    return (
      <Typography variant="body2" color="text.secondary">
        Analysing…
      </Typography>
    );
  }

  if (!data || (data.strengths.length === 0 && data.weaknesses.length === 0)) {
    return (
      <Typography variant="body2" color="text.secondary">
        Not enough data in the current selection to identify clear strengths or weaknesses yet.
      </Typography>
    );
  }

  const overallSr = data.overall.strike_rate;

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 6 }}>
        <Typography variant="overline" sx={{ color: colors.turfGreen, letterSpacing: 1.5, display: "block", mb: 1 }}>
          Strengths
        </Typography>
        {data.strengths.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No clear strengths stand out yet in this selection.
          </Typography>
        ) : (
          data.strengths.map((f) => (
            <FindingCard key={`${f.dimension}-${f.value}`} finding={f} overallSr={overallSr} tone={colors.turfGreen} />
          ))
        )}
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <Typography variant="overline" sx={{ color: colors.clayRed, letterSpacing: 1.5, display: "block", mb: 1 }}>
          Weaknesses
        </Typography>
        {data.weaknesses.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No clear weaknesses stand out yet in this selection.
          </Typography>
        ) : (
          data.weaknesses.map((f) => (
            <FindingCard key={`${f.dimension}-${f.value}`} finding={f} overallSr={overallSr} tone={colors.clayRed} />
          ))
        )}
      </Grid>
    </Grid>
  );
}
