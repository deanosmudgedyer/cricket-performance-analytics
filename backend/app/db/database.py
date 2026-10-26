"""
Database connection helper.

SQLite needs no separate install or server - it's built into Python's
standard library. This module just centralises the file path and
connection logic so every other script/module imports from one place.
"""
import sqlite3
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
DB_PATH = BACKEND_DIR / "cricket_analytics.db"
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

# The one workbook both ingestion pipelines (bowling + batting) read
# from - see app/ingestion/load_spreadsheet.py.
RAW_WORKBOOK = BACKEND_DIR / "data" / "raw" / "Mayes_Bowling_Batting.xlsx"


def get_connection() -> sqlite3.Connection:
    """Return a connection with foreign keys enforced and rows as dicts."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


def _migrate_legacy_matches_table(conn: sqlite3.Connection) -> None:
    """
    One-time cleanup whenever the `matches` table is in an outdated
    shape - either the pre-M1 version (a single free-text
    `description` column) or a later version missing a column added
    since (e.g. `format_tier`, added when format-tier classification
    was introduced). Unlike the other legacy tables (bowlers/innings/
    deliveries - dropped unconditionally in schema.sql, since those
    names aren't reused), `matches` is also the CURRENT table's name,
    so this only drops it - and every table that references it via a
    foreign key - when it's genuinely outdated. `_CURRENT_MATCHES_COLUMN`
    is whatever column schema.sql most recently added to `matches`;
    bump it here whenever that table's shape changes again.
    """
    _CURRENT_MATCHES_COLUMN = "format_tier"

    columns = {row["name"] for row in conn.execute("PRAGMA table_info(matches)")}
    if not columns or _CURRENT_MATCHES_COLUMN in columns:
        return  # table doesn't exist yet, or already the current shape
    conn.executescript(
        """
        DROP TABLE IF EXISTS deliveries;
        DROP TABLE IF EXISTS innings;
        DROP TABLE IF EXISTS bowling_deliveries;
        DROP TABLE IF EXISTS bowling_innings;
        DROP TABLE IF EXISTS batting_deliveries;
        DROP TABLE IF EXISTS batting_innings;
        DROP TABLE IF EXISTS matches;
        DROP TABLE IF EXISTS bowlers;
        """
    )


def _migrate_legacy_batting_deliveries_table(conn: sqlite3.Connection) -> None:
    """Same idea as _migrate_legacy_matches_table, scoped to
    batting_deliveries: `CREATE TABLE IF NOT EXISTS` is a no-op against
    an already-existing table, so adding `bowler_type` to schema.sql
    alone wouldn't add it to a database file created before that
    column existed. Nothing else has a foreign key pointing AT
    batting_deliveries, so dropping just this one table is enough -
    unlike `matches`, there's no cascade to worry about."""
    _CURRENT_BATTING_DELIVERIES_COLUMN = "bowler_type"

    columns = {row["name"] for row in conn.execute("PRAGMA table_info(batting_deliveries)")}
    if not columns or _CURRENT_BATTING_DELIVERIES_COLUMN in columns:
        return  # table doesn't exist yet, or already the current shape
    conn.execute("DROP TABLE IF EXISTS batting_deliveries")


def init_schema() -> None:
    """Create all tables if they don't already exist (safe to re-run)."""
    with get_connection() as conn:
        _migrate_legacy_matches_table(conn)
        _migrate_legacy_batting_deliveries_table(conn)
        conn.executescript(SCHEMA_PATH.read_text())


if __name__ == "__main__":
    init_schema()
    print(f"Database ready at: {DB_PATH}")
