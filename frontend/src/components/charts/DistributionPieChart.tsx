import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Box, Paper, Typography } from "@mui/material";
import { colors } from "../../theme";

interface DistributionPieChartProps {
  title: string;
  helpText: string;
  data: Record<string, number>;
  loading: boolean;
}

// A restrained palette pulled from the scoreboard theme rather than
// recharts' default rainbow - keeps every chart feeling like the same
// product.
const SLICE_COLORS = [
  colors.gold,
  colors.turfGreen,
  colors.clayRed,
  "#7E9CD8",
  "#B98FCB",
  "#D9A05B",
  "#6FB3A8",
];

export function DistributionPieChart({
  title,
  helpText,
  data,
  loading,
}: DistributionPieChartProps) {
  const chartData = Object.entries(data)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const total = chartData.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <Paper elevation={0} sx={{ p: 2.5, height: "100%" }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.25 }}>
        {title}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {helpText}
      </Typography>

      <Box sx={{ height: 260, mt: 1 }}>
        {loading || chartData.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 4 }}>
            {loading ? "Updating…" : "No scoring shots for current filters."}
          </Typography>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={45}
                outerRadius={80}
                paddingAngle={2}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={entry.name}
                    fill={SLICE_COLORS[index % SLICE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: colors.surfaceAlt,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 4,
                }}
                formatter={(value, name) => [
                  `${value} (${((Number(value) / total) * 100).toFixed(0)}%)`,
                  name,
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: colors.chalkMuted }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Paper>
  );
}
