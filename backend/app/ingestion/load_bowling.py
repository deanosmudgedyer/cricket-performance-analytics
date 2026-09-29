"""
Loads the "Bowling" sheet of the Mayes workbook into the database.

Run via `python -m app.ingestion.load_spreadsheet` (that module
orchestrates both this and load_batting.py) - not meant to be run
standalone, though `main()` here works fine on its own for debugging.

What "counts against the bowler" (cricket rules, applied at ingestion
so every downstream stat is guaranteed consistent):
  - is_legal_delivery: 0 for Wide / No Ball (doesn't count toward
    balls bowled / overs).
  - counts_for_economy: 0 for Leg Bye / Bye (byes/leg byes run off the
    pad/body, not the bat - they count as extras against the TEAM, not
    the bowler's personal figures). Wide/No Ball penalty runs DO count
    against the bowler, so they stay counts_for_economy = 1.
  - is_wicket / dismissal_type: the source sheet reuses "Type of Run"
    to hold the dismissal type when Result == "Wicket" (e.g. "Caught").
    This loader splits that into a clean boolean flag plus a dedicated
    dismissal_type column so "what kind of run" and "what kind of
    dismissal" are never conflated by downstream code.
"""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from app.ingestion.common import (  # noqa: E402
    load_sheet_with_synonyms,
    normalize_category,
    normalize_side_of_wicket,
    resolve_match_id,
    split_over_ball,
)

SHEET_NAME = "Bowling"

# Run types that do NOT count against the bowler's runs conceded.
NON_BOWLER_RUN_TYPES = {"Leg Bye", "Bye"}
# Run types that are illegal deliveries (don't count as a legal ball).
ILLEGAL_DELIVERY_TYPES = {"Wide", "No Ball"}

# canonical field -> every header spelling accepted for it. The first
# entry per field is the "clean" spelling used in the downloadable
# template (see app/services/template.py); later entries are the
# master workbook's historical quirks (trailing space, etc.) - both
# resolve to the same canonical name, so neither file format breaks
# the other. See app/ingestion/common.py's load_sheet_with_synonyms.
COLUMN_SYNONYMS = {
    "match_date": ["Date", "date"],
    "competition": ["Competition"],
    "format_tier": ["Format"],
    "team": ["Team"],
    "opposition": ["Opposition", "Opposition "],
    "ground": ["Ground"],
    "bowling_end": ["End", "Bowling End"],
    "innings_label": ["Innings", "innings"],
    "batsman": ["Batsman", "Batsmen"],
    "batting_hand": ["Batting Hand", "Bat Hand"],
    "over_raw": ["Over"],
    "side_of_wicket": ["Side of Wicket"],
    "line": ["Line"],
    "length": ["Length"],
    "result": ["Result"],
    "type_of_run": ["Type of Run"],
    "area_scored": ["Area Scored"],
    "shot": ["Shot", "Shot Played"],
    "contact": ["Contact", "contact/miss/leave"],
    "wicket_explanation": ["Wicket Explanation", "explanation of wicket"],
}


def load_raw_dataframe(path: Path) -> pd.DataFrame:
    return load_sheet_with_synonyms(path, SHEET_NAME, COLUMN_SYNONYMS)


def clean_rows(df: pd.DataFrame) -> list[dict]:
    cleaned = []
    for row_order, (_, row) in enumerate(df.iterrows()):
        result = row["result"]
        is_wicket = str(result).strip() == "Wicket"
        type_of_run = normalize_category(row["type_of_run"])

        over_ball, over_number, ball_number = split_over_ball(float(row["over_raw"]))

        cleaned.append(
            {
                "row_order": row_order,
                "match_date": row["match_date"],
                "competition": normalize_category(row["competition"]),
                "format_tier": normalize_category(row["format_tier"]),
                "team": normalize_category(row["team"]),
                "opposition": normalize_category(row["opposition"]),
                "ground": normalize_category(row["ground"]),
                "innings_label": normalize_category(row["innings_label"]),
                "batsman": normalize_category(row["batsman"]),
                "batting_hand": normalize_category(row["batting_hand"]),
                "bowling_end": normalize_category(row["bowling_end"]),
                "side_of_wicket": normalize_side_of_wicket(row["side_of_wicket"]),
                "over_ball": over_ball,
                "over_number": over_number,
                "ball_number": ball_number,
                "line": normalize_category(row["line"]),
                "length": normalize_category(row["length"]),
                # Wicket deliveries in this dataset never carry a
                # runs value alongside the dismissal (no recorded
                # instance of e.g. a run-out with runs completed) -
                # see schema.sql's counts_for_batsman_runs comment for
                # the batting-side equivalent of this same limitation.
                "runs_off_bat": 0 if is_wicket else int(result),
                "is_wicket": int(is_wicket),
                "run_type": None if is_wicket else type_of_run,
                "dismissal_type": type_of_run if is_wicket else None,
                "wicket_explanation": normalize_category(row["wicket_explanation"]),
                "area_scored": normalize_category(row["area_scored"]),
                "shot": normalize_category(row["shot"]),
                "contact": normalize_category(row["contact"]),
                "is_legal_delivery": 0 if (not is_wicket and type_of_run in ILLEGAL_DELIVERY_TYPES) else 1,
                "counts_for_economy": 0 if (not is_wicket and type_of_run in NON_BOWLER_RUN_TYPES) else 1,
            }
        )
    return cleaned


def insert_data(conn, rows: list[dict]) -> int:
    cur = conn.cursor()
    innings_ids: dict[tuple, int] = {}
    inserted = 0

    for row in rows:
        match_id = resolve_match_id(
            cur, row["match_date"], row["competition"], row["format_tier"], row["team"], row["opposition"], row["ground"]
        )
        innings_key = (match_id, row["innings_label"])
        if innings_key not in innings_ids:
            cur.execute(
                """
                INSERT INTO bowling_innings (match_id, innings_label)
                VALUES (?, ?)
                ON CONFLICT (match_id, innings_label) DO NOTHING
                """,
                innings_key,
            )
            innings_row = cur.execute(
                "SELECT id FROM bowling_innings WHERE match_id = ? AND innings_label = ?",
                innings_key,
            ).fetchone()
            innings_ids[innings_key] = innings_row["id"]

        cur.execute(
            """
            INSERT INTO bowling_deliveries (
                bowling_innings_id, row_order, batsman, batting_hand, bowling_end,
                side_of_wicket, over_ball, over_number, ball_number, line, length,
                runs_off_bat, is_wicket, run_type, dismissal_type, wicket_explanation,
                area_scored, shot, contact, is_legal_delivery, counts_for_economy
            ) VALUES (
                :bowling_innings_id, :row_order, :batsman, :batting_hand, :bowling_end,
                :side_of_wicket, :over_ball, :over_number, :ball_number, :line, :length,
                :runs_off_bat, :is_wicket, :run_type, :dismissal_type, :wicket_explanation,
                :area_scored, :shot, :contact, :is_legal_delivery, :counts_for_economy
            )
            """,
            {**row, "bowling_innings_id": innings_ids[innings_key]},
        )
        inserted += 1

    return inserted


def main():
    from app.db.database import get_connection, init_schema, RAW_WORKBOOK

    init_schema()
    df = load_raw_dataframe(RAW_WORKBOOK)
    rows = clean_rows(df)
    with get_connection() as conn:
        count = insert_data(conn, rows)
        conn.commit()
        print(f"Inserted {count} bowling deliveries.")


if __name__ == "__main__":
    main()
