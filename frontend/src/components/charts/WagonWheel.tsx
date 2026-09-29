import { useState } from "react";
import { Box, Paper, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { colors } from "../../theme";
// Loose on purpose: this chart is shared by bowling and batting
// breakdown rows, which only agree on "some field holds runs, some
// field holds balls, area_scored may be present" - see ballsField/
// runsField props below.
type BreakdownRow = Record<string, unknown> & { area_scored?: string | null };

interface WagonWheelProps {
  data: BreakdownRow[];
  loading: boolean;
  title?: string;
  /** Field names to plot - default to bowling's (runs conceded /
   * balls bowled); pass runs_scored/balls_faced-style keys for batting. */
  runsField?: string;
  ballsField?: string;
  runsLabel?: string;
  ballsLabel?: string;
}

type Metric = "runs" | "balls";

// Approximate compass positions for each scoring zone, for a
// right-handed batsman, viewed from behind the batsman looking down
// the pitch toward the bowler - so Straight points away/down toward
// the bowler, Point is square on the off side (left, as drawn here),
// and the wheel runs clockwise from there through the leg side.
// The gap between Third Man (315deg) and Fine Leg (45deg) is
// deliberate - that's the area directly behind the wicketkeeper,
// which isn't one of the dataset's named zones.
const AREA_ANGLES: Record<string, number> = {
  Straight: 180,
  Cover: 230,
  Point: 270,
  "Third Man": 315,
  "Fine Leg": 45,
  "Square Leg": 90,
  "Mid Wicket": 135,
};

const WEDGE_HALF_WIDTH = 17;
const CANVAS_SIZE = 420;
const CENTER = CANVAS_SIZE / 2;
const INNER_RADIUS = 22;
const OUTER_RADIUS = 130;
// Every label sits at exactly this same distance from the centre, so
// the ring of names/values reads as one consistent circle just
// outside the field boundary - not varying by word length or side.
const LABEL_RADIUS = OUTER_RADIUS + 30;

function polarPoint(radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.sin(rad),
    y: CENTER - radius * Math.cos(rad),
  };
}

function describeWedge(outerRadius: number, angleDeg: number): string {
  const start = angleDeg - WEDGE_HALF_WIDTH;
  const end = angleDeg + WEDGE_HALF_WIDTH;
  const innerStart = polarPoint(INNER_RADIUS, start);
  const innerEnd = polarPoint(INNER_RADIUS, end);
  const outerStart = polarPoint(outerRadius, start);
  const outerEnd = polarPoint(outerRadius, end);

  return [
    `M ${innerStart.x} ${innerStart.y}`,
    `L ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 0 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

interface HoverInfo {
  area: string;
  value: number;
  percentage: number;
  clientX: number;
  clientY: number;
}

/**
 * A wind-rose style wagon wheel: one wedge per scoring zone, length
 * proportional to runs conceded (or shot frequency), radiating from
 * the batsman's position. Genuine wagon wheels plot exact shot
 * trajectories - this dataset only records which named zone each
 * shot went to, so this is the honest equivalent: it shows the same
 * "where did the runs go" story without pretending to more precision
 * than the data actually has.
 */
export function WagonWheel({
  data,
  loading,
  title = "Wagon Wheel",
  runsField = "runs_conceded",
  ballsField = "balls_bowled",
  runsLabel = "runs conceded",
  ballsLabel = "shot frequency",
}: WagonWheelProps) {
  const [metric, setMetric] = useState<Metric>("runs");
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const fieldFor = (m: Metric) => (m === "runs" ? runsField : ballsField);

  const rows = data.filter(
    (row) => AREA_ANGLES[String(row.area_scored)] !== undefined && Number(row[ballsField]) > 0
  );
  const maxValue = Math.max(1, ...rows.map((row) => Number(row[fieldFor(metric)]) || 0));
  const totalValue = rows.reduce((sum, row) => sum + (Number(row[fieldFor(metric)]) || 0), 0);

  return (
    <Paper elevation={0} sx={{ p: 2.5, position: "relative" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.25 }}>
            {title}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Scoring zone, sized by {metric === "runs" ? runsLabel : ballsLabel}
          </Typography>
        </Box>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={metric}
          onChange={(_, value) => value && setMetric(value)}
        >
          <ToggleButton value="runs">Runs</ToggleButton>
          <ToggleButton value="balls">Frequency</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ mt: 1, display: "flex", justifyContent: "center" }}>
        {loading || rows.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 4, mb: 4 }}>
            {loading ? "Updating…" : "No scoring-zone data for current filters."}
          </Typography>
        ) : (
          <svg
            viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            style={{ maxWidth: "100%", height: "auto" }}
          >
            {/* Field boundary */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={OUTER_RADIUS}
              fill="none"
              stroke={colors.border}
              strokeDasharray="4 4"
            />
            {/* Pitch, for orientation */}
            <rect
              x={CENTER - 8}
              y={CENTER - 30}
              width={16}
              height={60}
              fill={colors.surfaceAlt}
              stroke={colors.border}
            />
            {/* Batsman position */}
            <circle cx={CENTER} cy={CENTER} r={4} fill={colors.chalk} />

            {rows.map((row) => {
              const area = String(row.area_scored);
              const angle = AREA_ANGLES[area];
              const value = Number(row[fieldFor(metric)]) || 0;
              const radius =
                INNER_RADIUS + (value / maxValue) * (OUTER_RADIUS - INNER_RADIUS);
              const labelPoint = polarPoint(LABEL_RADIUS, angle);
              const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0;

              return (
                <g
                  key={area}
                  onMouseEnter={(e) =>
                    setHover({ area, value, percentage, clientX: e.clientX, clientY: e.clientY })
                  }
                  onMouseMove={(e) =>
                    setHover({ area, value, percentage, clientX: e.clientX, clientY: e.clientY })
                  }
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: "pointer" }}
                >
                  <path
                    d={describeWedge(radius, angle)}
                    fill={colors.gold}
                    fillOpacity={0.55 + 0.45 * (value / maxValue)}
                    stroke={colors.gold}
                    strokeWidth={1}
                  />
                  <text
                    x={labelPoint.x}
                    y={labelPoint.y}
                    fill={colors.chalkMuted}
                    fontSize={11}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {area}
                  </text>
                  <text
                    x={labelPoint.x}
                    y={labelPoint.y + 14}
                    fill={colors.chalk}
                    fontSize={12}
                    fontWeight={600}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {value}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </Box>

      {hover && (
        <Box
          sx={{
            position: "fixed",
            left: hover.clientX + 14,
            top: hover.clientY + 14,
            zIndex: 1300,
            pointerEvents: "none",
            background: colors.surfaceAlt,
            border: `1px solid ${colors.border}`,
            borderRadius: 1,
            px: 1.5,
            py: 1,
          }}
        >
          <Typography variant="body2" sx={{ color: "text.primary", fontWeight: 600 }}>
            {hover.area}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {hover.value} {metric === "runs" ? "runs" : "balls"} (
            {hover.percentage.toFixed(0)}%)
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
