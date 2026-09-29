import { Box, Paper, Tooltip, Typography } from "@mui/material";
import { colors } from "../theme";

export type KpiTone = "good" | "bad" | "neutral";

interface KpiCardProps {
  label: string;
  value: string | number;
  tone?: KpiTone;
  helpText?: string;
}

const toneColor: Record<KpiTone, string> = {
  good: colors.turfGreen,
  bad: colors.clayRed,
  neutral: colors.gold,
};

/**
 * Styled like a scoreboard segment: small muted label on top, a big
 * condensed number underneath, with a thin accent line whose colour
 * signals whether the number is good or bad news for the bowler -
 * a coach should be able to read the mood of the dashboard at a
 * glance, not just the digits.
 */
export function KpiCard({ label, value, tone = "neutral", helpText }: KpiCardProps) {
  const card = (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        borderBottom: `3px solid ${toneColor[tone]}`,
        minWidth: 150,
        height: "100%",
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: "text.secondary",
          textTransform: "uppercase",
          letterSpacing: 1,
          fontWeight: 500,
        }}
      >
        {label}
      </Typography>
      <Typography
        variant="h4"
        sx={{ fontWeight: 600, color: "text.primary", lineHeight: 1.1 }}
      >
        {value}
      </Typography>
    </Paper>
  );

  return helpText ? (
    <Tooltip title={helpText} arrow placement="top">
      <Box>{card}</Box>
    </Tooltip>
  ) : (
    card
  );
}
