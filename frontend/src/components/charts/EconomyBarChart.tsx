import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Paper, Typography, Box } from "@mui/material";
import { colors } from "../../theme";

interface RateBarChartProps {
  title: string;
  helpText: string;
  data: Record<string, unknown>[];
  groupKey: string;
  loading: boolean;
  /** Which field on each row holds the rate to plot (default: bowling's "economy"). */
  valueKey?: string;
  valueLabel?: string;
  /** Which field holds the sample size, shown in the tooltip. */
  countKey?: string;
  countLabel?: string;
}

/**
 * Shows a rate (economy, strike rate, average, ...) per group (e.g.
 * per length, per end) as bars - the chart that directly answers "which
 * X costs the fewest runs / scores the fastest?". Generic over which
 * field it plots so the same component serves bowling's economy and
 * batting's strike rate without a near-duplicate copy of this file.
 */
export function EconomyBarChart({
  title,
  helpText,
  data,
  groupKey,
  loading,
  valueKey = "economy",
  valueLabel = "Economy",
  countKey = "balls_bowled",
  countLabel = "balls",
}: RateBarChartProps) {
  // Defensive: an unexpected non-array response (e.g. a backend error
  // payload) should blank the chart, not crash the whole dashboard.
  const chartData = (Array.isArray(data) ? data : [])
    .filter((row) => Number(row[countKey] ?? 0) > 0)
    .map((row) => ({
      name: String(row[groupKey]),
      value: Number(row[valueKey]) || 0,
      count: Number(row[countKey]) || 0,
    }));

  return (
    <Paper elevation={0} sx={{ p: 2.5, height: "100%" }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.25 }}>
        {title}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {helpText}
      </Typography>

      <Box sx={{ height: 260, mt: 2 }}>
        {loading || chartData.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 4 }}>
            {loading ? "Updating…" : "No data for current filters."}
          </Typography>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis
                dataKey="name"
                stroke={colors.chalkMuted}
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                stroke={colors.chalkMuted}
                fontSize={12}
                tickLine={false}
                label={{
                  value: valueLabel,
                  angle: -90,
                  position: "insideLeft",
                  fill: colors.chalkMuted,
                  fontSize: 12,
                }}
              />
              <Tooltip
                contentStyle={{
                  background: colors.surfaceAlt,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 4,
                }}
                labelStyle={{ color: colors.chalk }}
                formatter={(value, _name, entry) => [
                  `${value} (${entry.payload.count} ${countLabel})`,
                  valueLabel,
                ]}
              />
              <Bar dataKey="value" fill={colors.gold} radius={[3, 3, 0, 0]}>
                <LabelList
                  dataKey="value"
                  position="top"
                  fill={colors.chalk}
                  fontSize={12}
                  formatter={(value: unknown) => {
                    const num = Number(value);
                    return Number.isInteger(num) ? num : num.toFixed(2);
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Paper>
  );
}
