import { Box, Paper, Tooltip, Typography } from "@mui/material";
import { colors } from "../theme";

export type KpiTone = "good" | "bad" | "neutral";

interface KpiCardProps {
  label: string;
  value: string | number;
  tone?: KpiTone;
  helpText?: string;
  /** Renders a smaller card for secondary/detail stats that shouldn't
   * compete with the main scoreboard figures for visual weight. */
  small?: boolean;
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
export function KpiCard({ label, value, tone = "neutral", helpText, small = false }: KpiCardProps) {
  const card = (
    <Paper
      elevation={0}
      sx={{
        p: small ? 1.5 : 2.5,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        borderBottom: `${small ? 2 : 3}px solid ${toneColor[tone]}`,
        minWidth: small ? 120 : 150,
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
          fontSize: small ? "0.65rem" : undefined,
        }}
      >
        {label}
      </Typography>
      <Typography
        variant={small ? "h6" : "h4"}
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
