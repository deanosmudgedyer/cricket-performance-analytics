"""
Handles an uploaded "add a match" template (see app/services/
template.py for what the user filled in): parses it, validates the
new rows, checks for a likely duplicate against the master workbook,
and - unless it's a duplicate the caller hasn't confirmed - appends it
to the master workbook and re-runs the full ingestion pipeline.

The master workbook stays the one source of truth throughout: this
never writes to the database directly. An upload that isn't confirmed
past a duplicate warning changes nothing on disk.
"""
import dataclasses
from dataclasses import dataclass, field
from io import BytesIO

import pandas as pd
from openpyxl import load_workbook

from app.db.database import RAW_WORKBOOK, get_connection, init_schema
from app.ingestion import load_batting, load_bowling
from app.ingestion.common import wipe_existing_data
from app.ingestion.validation import validate_batting, validate_bowling

_MATCH_KEY_COLUMNS = ["match_date", "competition", "team", "opposition", "ground"]


@dataclass
class UploadResult:
    status: str  # "success" | "duplicate" | "empty" | "error"
    message: str
    bowling_rows_added: int = 0
    batting_rows_added: int = 0
    issues: list[dict] = field(default_factory=list)
    duplicate_matches: list[dict] = field(default_factory=list)


def _match_key(row: pd.Series) -> tuple:
    date_val = row["match_date"]
    date_str = date_val.date().isoformat() if hasattr(date_val, "date") else str(date_val)
    return (date_str, row["competition"], row["team"], row["opposition"], row["ground"])


def _read_uploaded_sheet(file_bytes: bytes, loader_module) -> tuple[pd.DataFrame | None, str | None]:
    """
    Returns (dataframe, None) on success, (None, None) when the sheet
    genuinely has no data (fine - a match might only have bowling or
    only batting rows), or (None, error_message) when the sheet exists
    but is missing an expected column - a real problem to surface, not
    silently treat as "no data for this discipline".
    """
    try:
        df = loader_module.load_raw_dataframe(BytesIO(file_bytes))
    except ValueError as exc:
        return None, str(exc)
    except Exception as exc:  # sheet missing entirely, wrong file type, etc.
        return None, f"Couldn't read the '{loader_module.SHEET_NAME}' sheet: {exc}"

    df = df.dropna(how="all")
    if df.empty:
        return None, None
    return df, None


def _existing_match_keys() -> set[tuple]:
    """Every (date, competition, team, opposition, ground) already in
    the master workbook, from both sheets - used to flag a likely
    duplicate upload before it's merged in."""
    keys = set()
    for loader_module in (load_bowling, load_batting):
        try:
            df = loader_module.load_raw_dataframe(RAW_WORKBOOK)
        except Exception:
            continue
        for _, row in df[_MATCH_KEY_COLUMNS].drop_duplicates().iterrows():
            keys.add(_match_key(row))
    return keys


def _invert_synonyms(synonyms: dict[str, list[str]]) -> dict[str, str]:
    """lowercased header spelling -> canonical field name."""
    return {spelling.lower(): canonical for canonical, spellings in synonyms.items() for spelling in spellings}


def _append_rows(wb, sheet_name: str, new_df: pd.DataFrame, synonyms: dict[str, list[str]]) -> int:
    """
    Appends new_df's rows to `sheet_name` in an already-open workbook,
    using that SHEET'S OWN existing header row (not new_df's canonical
    column names) - so the master file's historical header spellings
    stay exactly as they are rather than being silently rewritten to
    whatever the template happens to use.
    """
    ws = wb[sheet_name]
    headers = [str(cell.value).strip() if cell.value is not None else "" for cell in ws[1]]
    inverted = _invert_synonyms(synonyms)
    canonical_per_column = [inverted.get(h.lower()) for h in headers]

    next_row = ws.max_row + 1
    added = 0
    for _, row in new_df.iterrows():
        for col_index, canonical in enumerate(canonical_per_column, start=1):
            if canonical is None or canonical not in new_df.columns:
                continue
            value = row[canonical]
            if pd.notna(value):
                ws.cell(row=next_row, column=col_index, value=value)
        next_row += 1
        added += 1
    return added


def process_upload(file_bytes: bytes, force: bool = False) -> UploadResult:
    bowling_new, bowling_error = _read_uploaded_sheet(file_bytes, load_bowling)
    batting_new, batting_error = _read_uploaded_sheet(file_bytes, load_batting)

    if bowling_error or batting_error:
        message = " ".join(msg for msg in (bowling_error, batting_error) if msg)
        return UploadResult(status="error", message=message)

    if bowling_new is None and batting_new is None:
        return UploadResult(status="empty", message="No bowling or batting rows found in the uploaded file.")

    raw_issues = []
    if bowling_new is not None:
        raw_issues += validate_bowling(bowling_new)
    if batting_new is not None:
        raw_issues += validate_batting(batting_new)
    issues = [dataclasses.asdict(issue) for issue in raw_issues]

    blocking = [issue for issue in raw_issues if issue.blocking]
    if blocking:
        return UploadResult(
            status="error",
            message="This file has problems that would corrupt the data if merged in - fix these and "
            "re-upload; nothing has been changed.",
            issues=issues,
        )

    new_keys: set[tuple] = set()
    for df in (bowling_new, batting_new):
        if df is None:
            continue
        for _, row in df[_MATCH_KEY_COLUMNS].drop_duplicates().iterrows():
            new_keys.add(_match_key(row))

    duplicates = new_keys & _existing_match_keys()
    if duplicates and not force:
        return UploadResult(
            status="duplicate",
            message="A match with this date/competition/team/opposition/ground is already in the data.",
            duplicate_matches=[
                {"date": d[0], "competition": d[1], "team": d[2], "opposition": d[3], "ground": d[4]}
                for d in duplicates
            ],
            issues=issues,
        )

    wb = load_workbook(RAW_WORKBOOK)
    bowling_added = _append_rows(wb, "Bowling", bowling_new, load_bowling.COLUMN_SYNONYMS) if bowling_new is not None else 0
    batting_added = _append_rows(wb, "Batting", batting_new, load_batting.COLUMN_SYNONYMS) if batting_new is not None else 0
    wb.save(RAW_WORKBOOK)

    init_schema()
    all_bowling = load_bowling.load_raw_dataframe(RAW_WORKBOOK)
    all_batting = load_batting.load_raw_dataframe(RAW_WORKBOOK)
    bowling_rows = load_bowling.clean_rows(all_bowling)
    batting_rows = load_batting.clean_rows(all_batting)
    with get_connection() as conn:
        wipe_existing_data(conn)
        load_bowling.insert_data(conn, bowling_rows)
        load_batting.insert_data(conn, batting_rows)
        conn.commit()

    return UploadResult(
        status="success",
        message=f"Added {bowling_added} bowling row(s) and {batting_added} batting row(s).",
        bowling_rows_added=bowling_added,
        batting_rows_added=batting_added,
        issues=issues,
    )
