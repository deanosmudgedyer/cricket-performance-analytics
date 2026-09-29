import { Box, Paper, Typography } from "@mui/material";
import { colors } from "../theme";
import type { Insight } from "../api/client";

interface InsightsPanelProps {
  insights: Insight[];
  loading: boolean;
}

const toneColor: Record<Insight["tone"], string> = {
  good: colors.turfGreen,
  bad: colors.clayRed,
  neutral: colors.gold,
};

/**
 * Renders each insight as a quote-styled card with a left accent bar
 * colour-coded by tone. Deliberately looks like something a coach
 * might actually jot down, not a data table - these are meant to be
 * read, not scanned.
 */
export function InsightsPanel({ insights, loading }: InsightsPanelProps) {
  if (loading) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Analysing…
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {insights.map((insight, index) => (
        <Paper
          key={index}
          elevation={0}
          sx={{
            p: 2,
            borderLeft: `3px solid ${toneColor[insight.tone]}`,
            bgcolor: colors.surfaceAlt,
          }}
        >
          <Typography variant="body2" sx={{ color: "text.primary", lineHeight: 1.6 }}>
            {insight.text}
          </Typography>
        </Paper>
      ))}
    </Box>
  );
}
