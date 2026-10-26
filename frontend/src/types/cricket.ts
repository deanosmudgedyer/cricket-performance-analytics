/**
 * These mirror the backend's response shapes (see
 * backend/app/services/*.py and app/main.py). Keeping them in one
 * file means every component agrees on what a "stat" or a "filter
 * option" looks like - if the backend shape changes, this is the one
 * place to update, and TypeScript will flag every place that breaks.
 */

export interface BowlingStats {
  balls_bowled: number;
  overs: string;
  runs_conceded: number;
  economy: number | null;
  runs_per_ball: number | null;
  wickets: number;
  average: number | null;
  bowling_strike_rate: number | null;
  wickets_per_over: number | null;
  dot_balls: number;
  dot_ball_pct: number | null;
  singles: number;
  twos: number;
  threes: number;
  fours: number;
  sixes: number;
  boundaries: number;
  boundary_pct: number | null;
  scoring_balls: number;
  scoring_shot_pct: number | null;
  wides: number;
  no_balls: number;
  length_distribution: Record<string, number>;
  most_frequent_length: string | null;
  area_distribution: Record<string, number>;
  most_frequent_area: string | null;
  small_sample: boolean;
  wickets_small_sample: boolean;
}

export interface BattingStats {
  balls_faced: number;
  runs: number;
  strike_rate: number | null;
  dismissals: number;
  average: number | null;
  dot_balls: number;
  dot_ball_pct: number | null;
  singles: number;
  twos: number;
  threes: number;
  fours: number;
  sixes: number;
  boundaries: number;
  boundary_pct: number | null;
  scoring_balls: number;
  scoring_shot_pct: number | null;
  length_distribution: Record<string, number>;
  most_faced_length: string | null;
  line_distribution: Record<string, number>;
  most_faced_line: string | null;
  area_distribution: Record<string, number>;
  most_frequent_area: string | null;
  shot_distribution: Record<string, number>;
  most_played_shot: string | null;
  small_sample: boolean;
  dismissals_small_sample: boolean;
}

// A breakdown row carries the full stats shape AND whatever column it
// was grouped by (e.g. { length: "Good", ...BowlingStats }) - the
// index signature covers the group-by column without a bespoke type
// per dimension.
export type BowlingBreakdownRow = BowlingStats & { [column: string]: unknown };
export type BattingBreakdownRow = BattingStats & { [column: string]: unknown };

// Intersected with an index signature (rather than `extends`) so
// these can be passed directly to the generic chart components below,
// which accept Record<string, unknown>[] - see EconomyBarChart/
// OverTrendChart's comments for why they're generic over field names.
export type BowlingOverRow = BowlingStats & {
  over_number: number;
  cumulative_runs: number;
  cumulative_balls: number;
  cumulative_economy: number;
  [column: string]: unknown;
};

export type BattingOverRow = BattingStats & {
  over_number: number;
  cumulative_runs: number;
  cumulative_balls: number;
  cumulative_strike_rate: number;
  [column: string]: unknown;
};

export interface BowlingDelivery {
  match_date: string;
  competition: string;
  opposition: string;
  ground: string;
  innings_label: string;
  over_ball: string;
  over_number: number;
  ball_number: number;
  batsman: string;
  batting_hand: string;
  bowling_end: string;
  side_of_wicket: string;
  line: string;
  length: string;
  runs_off_bat: number;
  is_wicket: number;
  run_type: string | null;
  dismissal_type: string | null;
  wicket_explanation: string | null;
  area_scored: string | null;
  shot: string;
  contact: string;
}

export interface BattingDelivery {
  match_date: string;
  competition: string;
  opposition: string;
  ground: string;
  innings_label: string;
  batting_position: number;
  over_ball: string;
  over_number: number;
  ball_number: number;
  bowler: string;
  bowler_type: string | null;
  line: string;
  length: string;
  shot: string;
  runs_scored: number;
  is_wicket: number;
  run_type: string | null;
  dismissal_type: string | null;
  area_scored: string | null;
  contact: string;
}

export interface MatchSummary {
  match_id: number;
  match_date: string;
  competition: string;
  team: string;
  opposition: string;
  ground: string;
}

// Every filter/breakdown dimension resolves to a plain string array
// of distinct values, plus the over range - one shape for both
// disciplines rather than a bespoke interface per column.
export interface FilterOptions {
  [dimension: string]: string[] | number[] | number;
}

export interface DeliveryFilters {
  equals: Record<string, string[]>;
  over_min?: number;
  over_max?: number;
  over?: number[];
  /** ISO date strings ("2026-05-23") - a range selection, not a
   * pick-from-a-list one, same reasoning as over_min/over_max. */
  date_from?: string;
  date_to?: string;
}

export const EMPTY_FILTERS: DeliveryFilters = { equals: {} };
