"""
Helpers shared by the bowling and batting ingestion pipelines: parsing
the "Over" column, normalising category text, and resolving a
(date, competition, team, opposition, ground) row into a shared
`matches` record. Kept separate from both load_bowling.py and
load_batting.py so neither discipline's loader has to duplicate this
logic (and so a bug fix here fixes both at once).
"""
import math
from datetime import date

import pandas as pd

from app.db.database import get_connection
from app.services.format_classification import classify_format

# Values that render identically once trimmed/case-folded but appear
# as distinct strings in the source spreadsheet (e.g. "Miss" vs "miss",
# "Guide" vs "Guide "). Ingestion normalises every free-text category
# column through `normalize_category` so these never silently
# fragment a groupby downstream.
_SIDE_OF_WICKET_DISPLAY = {
    "over": "Over the Wicket",
    "around": "Around the Wicket",
}


def normalize_category(value) -> str | None:
    """Trim whitespace and fix known case inconsistencies. Returns
    None for missing values so callers can decide how to handle them
    (rather than silently turning NaN into the string 'nan').

    Also treats a literal "N/A" (however capitalised) as missing, not
    a real category: the spec is explicit that in the Area Scored
    column "N/A generally means no runs were scored" - i.e. it's the
    source spreadsheet's own way of writing "blank" for that row, most
    cells just leave it truly blank (read as NaN already) but at least
    one row spells it out as text. Treating both the same way means
    "did this ball have a recorded scoring area" isn't accidentally
    answered differently depending on how a blank was written."""
    if pd.isna(value):
        return None
    text = str(value).strip()
    if not text or text.lower() in {"n/a", "na"}:
        return None
    # Only normalise casing for the couple of known offenders (Miss)
    # rather than blanket-lowercasing everything - most categories
    # (e.g. "Leg Stump", "Cover Drive") are legitimately mixed-case
    # and blanket-normalising would just create a different bug.
    if text.lower() == "miss":
        return "Miss"
    return text


def normalize_side_of_wicket(value) -> str:
    """"Over" / "Around" (as recorded) -> "Over the Wicket" / "Around
    the Wicket" (the canonical form used throughout the app)."""
    text = normalize_category(value)
    if text is None:
        return "Unknown"
    return _SIDE_OF_WICKET_DISPLAY.get(text.lower(), text)


def split_over_ball(raw_value: float) -> tuple[str, int, int]:
    """1.4 -> ('1.4', 1, 4). Guards against float rounding artefacts."""
    over_number = int(math.floor(raw_value + 1e-9))
    ball_number = int(round((raw_value - over_number) * 10))
    display = f"{over_number}.{ball_number}"
    return display, over_number, ball_number


def resolve_match_id(cur, row_date: date, competition: str, team: str, opposition: str, ground: str) -> int:
    """Insert the match if it's new, and return its id either way.
    Matches are identified by the full (date, competition, team,
    opposition, ground) tuple - see schema.sql for why."""
    # pandas gives us a Timestamp (has both .date() and a full-datetime
    # .isoformat()) - normalise to just the date portion either way.
    if hasattr(row_date, "date"):
        row_date = row_date.date()
    date_str = row_date.isoformat() if hasattr(row_date, "isoformat") else str(row_date)
    cur.execute(
        """
        INSERT INTO matches (date, competition, format_tier, team, opposition, ground)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (date, competition, team, opposition, ground) DO NOTHING
        """,
        (date_str, competition, classify_format(competition), team, opposition, ground),
    )
    row = cur.execute(
        """
        SELECT id FROM matches
        WHERE date = ? AND competition = ? AND team = ? AND opposition = ? AND ground = ?
        """,
        (date_str, competition, team, opposition, ground),
    ).fetchone()
    return row["id"]


def load_sheet_with_synonyms(path, sheet_name: str, synonyms: dict[str, list[str]]) -> pd.DataFrame:
    """
    Reads one sheet and renames its columns to canonical names, but -
    unlike a plain `df.rename(columns=...)` keyed on one exact header
    spelling - matches each canonical field against a LIST of accepted
    header spellings (case/whitespace-insensitive). This is what lets
    the master workbook's original messy headers ("Opposition " with a
    trailing space, "Bolwer" for the typo that's been there since the
    first version) and a freshly-downloaded template's clean headers
    ("Opposition", "Bowler") both load through the same code path -
    the upload feature needs this, since it can't assume a user's
    filled-in template matches the master file's historical quirks
    exactly.

    `synonyms` is {canonical_name: [accepted header spelling, ...]}.
    Raises ValueError listing which canonical fields have NO matching
    header present, rather than silently proceeding with missing data.
    """
    df = pd.read_excel(path, sheet_name=sheet_name)
    df.columns = [str(c).strip() for c in df.columns]
    lower_to_actual = {c.lower(): c for c in df.columns}

    rename = {}
    missing = []
    for canonical, spellings in synonyms.items():
        match = next((lower_to_actual[s.lower()] for s in spellings if s.lower() in lower_to_actual), None)
        if match is None:
            missing.append(f"{canonical} (tried: {', '.join(spellings)})")
        else:
            rename[match] = canonical

    if missing:
        raise ValueError(f"Missing expected column(s) in '{sheet_name}' sheet: {'; '.join(missing)}")

    return df.rename(columns=rename)


def wipe_existing_data(conn) -> None:
    """
    Ingestion is re-run from scratch each time (there's no incremental-
    append story yet, and the dataset is small enough that a full
    reload is instant). Deletes in FK-dependency order.

    Uses individual cursor.execute() calls, NOT conn.executescript() -
    this matters more than it looks. executescript() silently issues
    an implicit COMMIT before running (see the sqlite3 docs), which
    means these deletes would land permanently on disk immediately,
    outside the transaction the caller's `with get_connection() as
    conn:` block expects to roll back on failure. That gap is exactly
    what let a single bad row (during the "upload a new match" flow -
    see app/ingestion/upload.py) wipe the database and then crash
    before the re-insert finished, leaving it empty rather than rolled
    back to the last good state. Plain execute() calls stay inside the
    normal transaction, so a failure anywhere in the insert that
    follows correctly undoes the wipe too.
    """
    cur = conn.cursor()
    cur.execute("DELETE FROM bowling_deliveries")
    cur.execute("DELETE FROM bowling_innings")
    cur.execute("DELETE FROM batting_deliveries")
    cur.execute("DELETE FROM batting_innings")
    cur.execute("DELETE FROM matches")
