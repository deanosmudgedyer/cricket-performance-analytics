"""
Loads the "Batting" sheet of the Mayes workbook into the database.

Cricket-rules judgment calls made here (flagged explicitly rather than
silently assumed, per the same principle as load_bowling.py):

  - counts_as_ball_faced: 0 for Wide (the striker isn't credited with
    facing a wide), 1 for No Ball (a fair-height/width ball was still
    delivered to bat at - this is the standard scorecard convention,
    but it IS a convention, not a universal law; worth confirming
    against how Thomas's own scorer records it if strike rate ever
    looks off by a ball or two).
  - counts_for_batsman_runs: 0 for Leg Byes/Byes (not credited to the
    bat). A No Ball's recorded Result in this dataset is a single
    number - if a future delivery is BOTH a no-ball AND hit for a
    boundary, this sheet structure has no way to record the no-ball
    penalty and the batsman's runs as two separate components. Today's
    data doesn't contain that case, so it isn't handled - if it shows
    up later, this loader needs revisiting rather than guessing.
"""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from app.ingestion.common import load_sheet_with_synonyms, normalize_category, resolve_match_id, split_over_ball  # noqa: E402

SHEET_NAME = "Batting"

NON_BATSMAN_RUN_TYPES = {"Leg Byes", "Byes"}
NOT_FACED_TYPES = {"Wide"}

# See load_bowling.py's COLUMN_SYNONYMS comment - same idea: clean
# template spellings first, historical master-workbook quirks after
# ("Bolwer" is the typo that's been in the source file since the
# start; the template uses the corrected "Bowler").
COLUMN_SYNONYMS = {
    "match_date": ["Date", "date"],
    "competition": ["Competition"],
    "team": ["Team"],
    "opposition": ["Opposition", "Opposition "],
    "ground": ["Ground"],
    "innings_label": ["Innings"],
    "batting_position": ["Batting Position"],
    "over_raw": ["Over"],
    "bowler": ["Bowler", "Bolwer"],
    "line": ["Line"],
    "length": ["Length"],
    "shot": ["Shot"],
    "result": ["Result"],
    "type_of_run": ["Type of Run"],
    "area_scored": ["Area Scored"],
    "contact": ["Contact", "contact/miss/leave"],
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
                "team": normalize_category(row["team"]),
                "opposition": normalize_category(row["opposition"]),
                "ground": normalize_category(row["ground"]),
                "innings_label": normalize_category(row["innings_label"]),
                "batting_position": int(row["batting_position"]),
                "bowler": normalize_category(row["bowler"]),
                "over_ball": over_ball,
                "over_number": over_number,
                "ball_number": ball_number,
                "line": normalize_category(row["line"]),
                "length": normalize_category(row["length"]),
                "shot": normalize_category(row["shot"]),
                "runs_scored": 0 if is_wicket else int(result),
                "is_wicket": int(is_wicket),
                "run_type": None if is_wicket else type_of_run,
                "dismissal_type": type_of_run if is_wicket else None,
                "area_scored": normalize_category(row["area_scored"]),
                "contact": normalize_category(row["contact"]),
                "counts_as_ball_faced": 0 if (not is_wicket and type_of_run in NOT_FACED_TYPES) else 1,
                "counts_for_batsman_runs": 0 if (not is_wicket and type_of_run in NON_BATSMAN_RUN_TYPES) else 1,
            }
        )
    return cleaned


def insert_data(conn, rows: list[dict]) -> int:
    cur = conn.cursor()
    innings_ids: dict[tuple, int] = {}
    inserted = 0

    for row in rows:
        match_id = resolve_match_id(
            cur, row["match_date"], row["competition"], row["team"], row["opposition"], row["ground"]
        )
        innings_key = (match_id, row["innings_label"])
        if innings_key not in innings_ids:
            cur.execute(
                """
                INSERT INTO batting_innings (match_id, innings_label, batting_position)
                VALUES (?, ?, ?)
                ON CONFLICT (match_id, innings_label) DO NOTHING
                """,
                (*innings_key, row["batting_position"]),
            )
            innings_row = cur.execute(
                "SELECT id FROM batting_innings WHERE match_id = ? AND innings_label = ?",
                innings_key,
            ).fetchone()
            innings_ids[innings_key] = innings_row["id"]

        cur.execute(
            """
            INSERT INTO batting_deliveries (
                batting_innings_id, row_order, bowler, over_ball, over_number, ball_number,
                line, length, shot, runs_scored, is_wicket, run_type, dismissal_type,
                area_scored, contact, counts_as_ball_faced, counts_for_batsman_runs
            ) VALUES (
                :batting_innings_id, :row_order, :bowler, :over_ball, :over_number, :ball_number,
                :line, :length, :shot, :runs_scored, :is_wicket, :run_type, :dismissal_type,
                :area_scored, :contact, :counts_as_ball_faced, :counts_for_batsman_runs
            )
            """,
            {**row, "batting_innings_id": innings_ids[innings_key]},
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
        print(f"Inserted {count} batting deliveries.")


if __name__ == "__main__":
    main()
