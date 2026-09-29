import type { BattingInningsRow, BowlingInningsSummary } from "./api/client";

/**
 * Scorecard-style figures - "50*(36)" for batting (runs, not-out
 * asterisk, balls faced in brackets), "2-33 (8.3)" for bowling
 * (wickets-runs, overs in brackets) - the shorthand a coach would
 * actually write down. Shared by the Home page's "most recent game"
 * panel and the Matches list, so one game's figures read the same way
 * everywhere in the app rather than each screen inventing its own format.
 */
export function battingFigure(row: BattingInningsRow): string {
  return `${row.runs}${row.is_out ? "" : "*"} (${row.balls_faced})`;
}

export function bowlingFigure(row: BowlingInningsSummary): string {
  return `${row.wickets}-${row.runs_conceded} (${row.overs})`;
}
