"""
Builds the downloadable "add a new match" template - an .xlsx with
Bowling and Batting sheets whose headers match the CLEAN spellings in
app/ingestion/load_bowling.py's and load_batting.py's COLUMN_SYNONYMS
(the master workbook's historical quirks - "Opposition " with a
trailing space, the "Bolwer" typo - are accepted on upload too, but
there's no reason to perpetuate them in a brand-new file).

Dropdowns (Excel data validation) are added only for the handful of
truly fixed-vocabulary columns that have actually caused real typo
bugs in this project (Batting Hand, Side of Wicket, Length, Contact -
see the Miss/miss and Guide/"Guide " issues the data-quality report
has flagged). Open-ended columns (Line, Shot, Area Scored, Ground,
Opposition, ...) are left as free text - a fixed dropdown for a
vocabulary that grows every time Thomas plays a new team or ground
would be actively wrong, not just unhelpful.
"""
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

_HEADER_FILL = PatternFill(start_color="1E2C25", end_color="1E2C25", fill_type="solid")
_HEADER_FONT = Font(color="EDEAE0", bold=True)

BOWLING_HEADERS = [
    "Date", "Competition", "Team", "Opposition", "Ground", "End", "Innings",
    "Batsman", "Batting Hand", "Over", "Side of Wicket", "Line", "Length",
    "Result", "Type of Run", "Area Scored", "Shot", "Contact", "Wicket Explanation",
]
BATTING_HEADERS = [
    "Date", "Competition", "Team", "Opposition", "Ground", "Innings",
    "Batting Position", "Over", "Bowler", "Line", "Length", "Shot",
    "Result", "Type of Run", "Area Scored", "Contact",
]

# column header -> allowed values, for a strict dropdown (Excel will
# reject anything else typed into that column).
STRICT_DROPDOWNS = {
    "Batting Hand": ["Right", "Left"],
    "Side of Wicket": ["Over", "Around"],
    "Length": ["Full", "Good", "Short", "Yorker"],
    "Contact": ["Contact", "Miss", "Edge", "Leave"],
}

_INSTRUCTIONS = [
    ("One row per delivery.", ""),
    ("Date", "Same date for every row of one innings, e.g. 2026-09-13."),
    ("Competition", "e.g. \"Test Match\", \"CSA Pro50 Shiled: Div 2\" - used to work out the format "
                      "tier (First Class / 50-Over / T20) automatically. Include \"Test\"/\"Day\" for "
                      "First Class, \"50\"/\"ODI\"/\"List A\" for 50-Over, or \"T20\" for T20."),
    ("Innings", "\"1st Innings\" / \"2nd Innings\" for multi-innings formats, or just the format "
                 "name (e.g. \"List A\") for one-innings formats - there's nothing to number."),
    ("Over", "Decimal over.ball, e.g. 1.4 for the 4th ball of the 1st over."),
    ("Result", "Runs off the delivery (0, 1, 2, 3, 4, 6, ...), or the word \"Wicket\"."),
    ("Type of Run", "\"Runs\" / \"Leg Bye\" / \"Bye\" / \"Wide\" / \"No Ball\" normally. If Result is "
                      "\"Wicket\", put the mode of dismissal here instead (e.g. \"Caught\", \"Bowled\", "
                      "\"LBW\") - this column does double duty, same as the master data."),
    ("Area Scored", "Where the runs went, or leave blank if no runs were scored off the bat."),
    ("Wicket Explanation (Bowling only)", "Extra detail for a wicket, e.g. \"Caught at Deep Cover\". "
                                            "Leave blank otherwise."),
    ("", ""),
    ("Once filled in:", "Upload this file from the Data Quality tab. It gets checked for obvious "
                          "issues, then merged into the master data - your existing matches are "
                          "never overwritten, this only adds to them."),
]


def _write_sheet(wb: Workbook, name: str, headers: list[str]) -> None:
    ws = wb.create_sheet(name)
    for col_index, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_index, value=header)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        ws.column_dimensions[cell.column_letter].width = max(12, len(header) + 2)

    for header, values in STRICT_DROPDOWNS.items():
        if header not in headers:
            continue
        col_index = headers.index(header) + 1
        col_letter = ws.cell(row=1, column=col_index).column_letter
        dv = DataValidation(
            type="list",
            formula1=f'"{",".join(values)}"',
            allow_blank=True,
            showErrorMessage=True,
            errorTitle="Invalid value",
            error=f"Must be one of: {', '.join(values)}",
        )
        # Applied generously (100 rows) rather than trying to guess
        # how many deliveries this match will have.
        dv.add(f"{col_letter}2:{col_letter}101")
        ws.add_data_validation(dv)


def build_template() -> bytes:
    wb = Workbook()
    wb.remove(wb.active)  # drop the default blank sheet

    instructions = wb.create_sheet("Instructions")
    instructions.column_dimensions["A"].width = 30
    instructions.column_dimensions["B"].width = 90
    for row_index, (title, body) in enumerate(_INSTRUCTIONS, start=1):
        title_cell = instructions.cell(row=row_index, column=1, value=title)
        title_cell.font = Font(bold=True)
        instructions.cell(row=row_index, column=2, value=body).alignment = Alignment(wrap_text=True)

    _write_sheet(wb, "Bowling", BOWLING_HEADERS)
    _write_sheet(wb, "Batting", BATTING_HEADERS)
    # Sheets already come out in creation order: Instructions, Bowling, Batting.

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
