import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Box, Paper, Typography } from "@mui/material";
import { colors } from "../../theme";

interface OverTrendChartProps {
  data: Record<string, unknown>[];
  loading: boolean;
  title?: string;
  helpText?: string;
  /** Field names to plot - default to bowling's economy trend; pass
   * strike_rate/cumulative_strike_rate for batting. */
  rateKey?: string;
  cumulativeRateKey?: string;
  rateLabel?: string;
  cumulativeLabel?: string;
}

/**
 * Plots a per-over rate (economy, strike rate, ...) plus its running
 * (cumulative) value across the whole selection. The gaps you'll
 * sometimes see between points on the x-axis are real: the innings
 * wasn't continuous for this player at every over (a bowling spell
 * break, or overs where Thomas wasn't on strike) - that's a genuine
 * gap, not missing data.
 */
export function OverTrendChart({
  data,
  loading,
  title = "Economy Trend by Over",
  helpText = "Per-over economy vs. the running average across the selection - gaps mark spell breaks",
  rateKey = "economy",
  cumulativeRateKey = "cumulative_economy",
  rateLabel = "Over Economy",
  cumulativeLabel = "Running Economy",
}: OverTrendChartProps) {
  const chartData = data.map((row) => ({
    over: Number(row["over_number"]),
    rate: Number(row[rateKey]) || 0,
    cumulativeRate: Number(row[cumulativeRateKey]) || 0,
  }));

  return (
    <Paper elevation={0} sx={{ p: 2.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.25 }}>
        {title}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {helpText}
      </Typography>

      <Box sx={{ height: 280, mt: 2 }}>
        {loading || chartData.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 4 }}>
            {loading ? "Updating…" : "No data for current filters."}
          </Typography>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis
                dataKey="over"
                stroke={colors.chalkMuted}
                fontSize={12}
                tickLine={false}
                label={{
                  value: "Over",
                  position: "insideBottom",
                  offset: -2,
                  fill: colors.chalkMuted,
                  fontSize: 12,
                }}
              />
              <YAxis stroke={colors.chalkMuted} fontSize={12} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: colors.surfaceAlt,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 4,
                }}
                labelFormatter={(over) => `Over ${over}`}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: colors.chalkMuted }} />
              <Line
                type="monotone"
                dataKey="rate"
                name={rateLabel}
                stroke={colors.gold}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="cumulativeRate"
                name={cumulativeLabel}
                stroke={colors.turfGreen}
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Paper>
  );
}
