"""
Loads the Mayes workbook (Bowling + Batting sheets) into the database.

Run from the `backend` folder with:
    python -m app.ingestion.load_spreadsheet

What it does:
1. Wipes and recreates the schema (this is a full reload every time,
   not an incremental append - see app/ingestion/common.py).
2. Reads both the Bowling and Batting sheets.
3. Runs data-quality validation on each and prints a report (see
   app/ingestion/validation.py) - this does not block ingestion, it's
   visibility so a new issue gets noticed rather than silently
   skewing a stat.
4. Delegates the actual cleaning/inserting to load_bowling.py and
   load_batting.py, which apply the cricket-scoring rules for each
   discipline (see the module docstrings there).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from app.db.database import get_connection, init_schema, RAW_WORKBOOK  # noqa: E402
from app.ingestion import load_batting, load_bowling, validation  # noqa: E402
from app.ingestion.common import wipe_existing_data  # noqa: E402


def main():
    init_schema()

    bowling_df = load_bowling.load_raw_dataframe(RAW_WORKBOOK)
    batting_df = load_batting.load_raw_dataframe(RAW_WORKBOOK)

    issues = validation.validate_bowling(bowling_df) + validation.validate_batting(batting_df)
    validation.print_report(issues)
    print()

    bowling_rows = load_bowling.clean_rows(bowling_df)
    batting_rows = load_batting.clean_rows(batting_df)

    with get_connection() as conn:
        wipe_existing_data(conn)
        bowling_count = load_bowling.insert_data(conn, bowling_rows)
        batting_count = load_batting.insert_data(conn, batting_rows)
        conn.commit()

    print(f"Inserted {bowling_count} bowling deliveries.")
    print(f"Inserted {batting_count} batting deliveries.")


if __name__ == "__main__":
    main()
