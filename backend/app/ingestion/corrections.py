"""
Applies a "pick the correct value" fix directly to the master
workbook - the write-side counterpart to the read-only checks in
validation.py (which deliberately never fixes anything itself; see its
module docstring). Used by the Data Quality tab, so a spelling
inconsistency or off-vocabulary value already sitting in the trusted
master file can be corrected in place, the same way the upload flow
lets a new category value be corrected before it's ever merged in
(see app/ingestion/upload.py's corrections handling).
"""
from openpyxl import load_workbook

from app.db.database import RAW_WORKBOOK
from app.ingestion import load_batting, load_bowling
from app.ingestion.common import reingest_master_workbook

_LOADER_BY_SHEET = {"Bowling": load_bowling, "Batting": load_batting}


def _invert_synonyms(synonyms: dict[str, list[str]]) -> dict[str, str]:
    return {spelling.lower(): canonical for canonical, spellings in synonyms.items() for spelling in spellings}


def apply_data_quality_fix(sheet: str, column: str, from_values: list[str], to_value: str) -> int:
    """Rewrites every cell in `sheet`'s `column` that currently holds
    one of `from_values` to `to_value` instead, saves the workbook,
    and rebuilds the database from it. Returns how many cells changed
    (0 if the sheet/column don't exist or nothing matched - the caller
    can treat that as "nothing to do" rather than an error)."""
    loader_module = _LOADER_BY_SHEET[sheet]
    inverted = _invert_synonyms(loader_module.COLUMN_SYNONYMS)

    wb = load_workbook(RAW_WORKBOOK)
    ws = wb[sheet]
    headers = [str(cell.value).strip() if cell.value is not None else "" for cell in ws[1]]
    canonical_per_column = [inverted.get(h.lower()) for h in headers]

    col_index = next((i for i, c in enumerate(canonical_per_column, start=1) if c == column), None)
    if col_index is None:
        return 0

    from_set = set(from_values)
    changed = 0
    for row in range(2, ws.max_row + 1):
        cell = ws.cell(row=row, column=col_index)
        if cell.value in from_set:
            cell.value = to_value
            changed += 1

    if changed:
        wb.save(RAW_WORKBOOK)
        reingest_master_workbook()

    return changed
