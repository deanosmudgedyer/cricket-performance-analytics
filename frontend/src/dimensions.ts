/**
 * Mirrors the backend's BOWLING_DIMENSION_COLUMNS / BATTING_DIMENSION_
 * COLUMNS (app/main.py) - the ordered list of columns each discipline
 * lets you filter and group by. Kept as one array per discipline
 * (rather than re-deriving it from whatever keys happen to come back
 * in filter-options) so the sidebar's field order is deliberate and
 * stable regardless of what's present in the current dataset.
 */
export const BOWLING_DIMENSIONS = [
  "competition", "team", "opposition", "ground", "innings_label",
  "batsman", "batting_hand", "bowling_end", "side_of_wicket",
  "line", "length", "run_type", "dismissal_type", "area_scored",
  "shot", "contact",
];

export const BATTING_DIMENSIONS = [
  "competition", "team", "opposition", "ground", "innings_label", "batting_position",
  "bowler", "line", "length", "shot", "run_type", "dismissal_type",
  "area_scored", "contact",
];

const LABEL_OVERRIDES: Record<string, string> = {
  innings_label: "Innings",
  side_of_wicket: "Side of Wicket",
  dismissal_type: "Dismissal Type",
  run_type: "Run Type",
  area_scored: "Area Scored",
  bowling_end: "Bowling End",
  batting_hand: "Batting Hand",
};

const LOWERCASE_WORDS = new Set(["of", "the"]);

export function labelFor(column: string): string {
  if (LABEL_OVERRIDES[column]) return LABEL_OVERRIDES[column];
  return column
    .split("_")
    .map((word, index) =>
      index > 0 && LOWERCASE_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}
