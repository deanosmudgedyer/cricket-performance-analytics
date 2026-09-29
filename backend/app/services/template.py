"""
Builds the downloadable "add a new match" template - an .xlsx with
Bowling and Batting sheets whose headers match the CLEAN spellings in
app/ingestion/load_bowling.py's and load_batting.py's COLUMN_SYNONYMS
(the master workbook's historical quirks - "Opposition " with a
trailing space, the "Bolwer" typo - are accepted on upload too, but
there's no reason to perpetuate them in a brand-new file).

Two different kinds of dropdown, because "add a dropdown" means two
different things depending on the column:

  - STRICT: the column is a genuinely small, fixed vocabulary (Format,
    Batting Hand, Side of Wicket, Length, Line, Contact, Type of Run,
    Batting Position). Excel rejects anything else typed in -
    appropriate here because a typo in exactly this kind of column has
    actually happened in this project (see the Miss/miss and
    Guide/"Guide " issues the data-quality report has flagged; a
    one-off "Toss" typo in Line was the reason a dropdown was added
    for it too, and Format itself exists because a competition name
    alone couldn't be trusted to say what format it was).
  - SUGGESTION: the column's vocabulary is real but grows every time
    Thomas plays a new team, ground, or opposition (Ground, Opposition,
    Team, Competition, End, Area Scored, Shot). Locking these to
    today's known values would reject perfectly legitimate new data
    the moment he plays a new team or someone describes a shot that
    hasn't come up before - so these dropdowns list today's known
    values (read from the current database) purely as a convenience/
    autocomplete, but Excel is told not to block anything else typed
    in (showErrorMessage=False).

Both kinds are backed by named ranges on a hidden "Lists" sheet rather
than an inline comma-string (Excel's inline list validation silently
truncates past ~255 characters, which the longer suggestion lists -
Shot alone already has 20+ entries - would hit).
"""
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

from app.services.cricket_common import ALL_TIERS
from app.services.data_access import load_batting_deliveries, load_bowling_deliveries

_HEADER_FILL = PatternFill(start_color="1E2C25", end_color="1E2C25", fill_type="solid")
_HEADER_FONT = Font(color="EDEAE0", bold=True)

# Format comes before Competition, deliberately: Format (First Class /
# 50-Over / T20) is the primary classification a coach thinks in, and
# Competition is a specific tournament *within* that format, not the
# other way round. Format used to be guessed from the competition name
# via keyword matching, which broke the moment a real competition was
# sponsor-branded without an obvious keyword in it (e.g. "YesPlay
# Pro20 Cup" has no literal "t20" in it) - see cricket_common.py's
# ALL_TIERS comment for the full story.
BOWLING_HEADERS = [
    "Date", "Format", "Competition", "Team", "Opposition", "Ground", "End", "Innings",
    "Batsman", "Batting Hand", "Over", "Side of Wicket", "Line", "Length",
    "Result", "Type of Run", "Area Scored", "Shot", "Contact", "Wicket Explanation",
]
BATTING_HEADERS = [
    "Date", "Format", "Competition", "Team", "Opposition", "Ground", "Innings",
    "Batting Position", "Over", "Bowler", "Line", "Length", "Shot",
    "Result", "Type of Run", "Area Scored", "Contact",
]

# The Laws of Cricket recognise a fixed set of dismissal modes. "Type
# of Run" does double duty in this dataset (an extras/runs type
# normally, a dismissal mode when Result = "Wicket" - see the
# Instructions sheet), so its dropdown needs to offer both kinds of
# value in one list. Bowling and Batting record the extras types with
# different singular/plural spellings ("Leg Bye" vs "Leg Byes" - two
# separate sheets with their own established convention, not a typo),
# so each sheet gets its own version of this list.
_DISMISSAL_TYPES = [
    "Bowled", "Caught", "LBW", "Run Out", "Stumped", "Hit Wicket",
    "Obstructing the Field", "Retired Hurt", "Timed Out",
]
_BOWLING_TYPE_OF_RUN = ["Runs", "Leg Bye", "Bye", "Wide", "No Ball", *_DISMISSAL_TYPES]
_BATTING_TYPE_OF_RUN = ["Runs", "Leg Byes", "Byes", "Wide", "No Ball", *_DISMISSAL_TYPES]

_BATTING_POSITIONS = [str(n) for n in range(1, 12)]

# Columns whose real-world vocabulary is open-ended but worth
# suggesting from what's already in the data, built fresh from the
# database every time this template is generated.
_SUGGESTION_COLUMNS = ["Ground", "Opposition", "Team", "Competition", "End", "Area Scored", "Shot"]


def _current_suggestion_values() -> dict[str, list[str]]:
    """Distinct, already-seen values for each suggestion column, or an
    empty list if the database isn't ready yet (e.g. a fresh clone
    before the first ingestion run) - the dropdown for that column is
    then simply skipped rather than failing template generation."""
    try:
        bowling = load_bowling_deliveries()
        batting = load_batting_deliveries()
    except Exception:
        return {col: [] for col in _SUGGESTION_COLUMNS}

    def unique_sorted(*columns) -> list[str]:
        values: set[str] = set()
        for df, col in columns:
            if col in df.columns:
                values.update(df[col].dropna().unique().tolist())
        return sorted(values)

    return {
        "Ground": unique_sorted((bowling, "ground"), (batting, "ground")),
        "Opposition": unique_sorted((bowling, "opposition"), (batting, "opposition")),
        "Team": unique_sorted((bowling, "team"), (batting, "team")),
        "Competition": unique_sorted((bowling, "competition"), (batting, "competition")),
        "End": unique_sorted((bowling, "bowling_end")),  # Bowling-only column
        "Area Scored": unique_sorted((bowling, "area_scored"), (batting, "area_scored")),
        "Shot": unique_sorted((bowling, "shot"), (batting, "shot")),
    }


_INSTRUCTIONS = [
    ("One row per delivery.", ""),
    ("Date", "Same date for every row of one innings, e.g. 2026-09-13."),
    ("Format", "\"First Class\" (Test/3-Day/4-Day), \"50-Over\" (ODI/List A), or \"T20\" (T20I/T20) - "
                "pick the one that actually matches how this match was played. This is what puts the "
                "match under the right tab in the app; it is NOT worked out from the Competition name "
                "any more, because a sponsor-branded competition name (e.g. \"YesPlay Pro20 Cup\") can't "
                "be reliably guessed from its text."),
    ("Competition", "e.g. \"Test Match\", \"CSA Pro50 Shiled: Div 2\", \"YesPlay Pro20 Cup\" - just the "
                      "name of the specific tournament/competition within the Format you picked above. "
                      "Purely descriptive now; it plays no part in deciding the format tier."),
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
    ("Dropdowns", "Columns like Length, Line and Type of Run only accept values from a fixed "
                    "cricket vocabulary - Excel will reject anything else. Columns like Ground, "
                    "Opposition and Shot suggest values already used in your data, but you can type "
                    "something new too - those lists are expected to grow."),
    ("", ""),
    ("Once filled in:", "Upload this file from the Data Quality tab. It gets checked for obvious "
                          "issues, then merged into the master data - your existing matches are "
                          "never overwritten, this only adds to them."),
]


def _write_sheet(
    wb: Workbook,
    name: str,
    headers: list[str],
    dropdowns: dict[str, tuple[str, int, bool]],
) -> None:
    """`dropdowns` maps header -> (Lists-sheet column letter, value
    count, strict) for every dropdown this sheet should get. A header
    with a 0 count (an as-yet-empty suggestion list) is skipped."""
    ws = wb.create_sheet(name)
    for col_index, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_index, value=header)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        ws.column_dimensions[cell.column_letter].width = max(12, len(header) + 2)

    for header, (list_col_letter, count, strict) in dropdowns.items():
        if header not in headers or count == 0:
            continue
        col_index = headers.index(header) + 1
        col_letter = get_column_letter(col_index)
        dv = DataValidation(
            type="list",
            formula1=f"Lists!${list_col_letter}$1:${list_col_letter}${count}",
            allow_blank=True,
            showErrorMessage=strict,
            errorTitle="Invalid value" if strict else None,
            error=f"'{header}' is usually one of the listed values - check for a typo." if strict else None,
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

    suggestions = _current_suggestion_values()

    # Every dropdown's values live on this hidden sheet as a named
    # range instead of an inline comma-string, so a longer suggestion
    # list (Shot already has 20+ entries) never risks hitting Excel's
    # ~255-character limit on an inline list formula. Keyed by an
    # internal label, not the on-sheet header name, since Bowling and
    # Batting need two DIFFERENT "Type of Run" lists (different
    # singular/plural convention - see module docstring).
    list_definitions: list[tuple[str, list[str]]] = [
        ("Format", ALL_TIERS),
        ("Batting Hand", ["Right", "Left"]),
        ("Side of Wicket", ["Over", "Around"]),
        ("Length", ["Full", "Good", "Short", "Yorker", "Full Toss"]),
        ("Line", ["Outside Leg", "Leg Stump", "Middle Stump", "Off Stump", "Channel", "Wide"]),
        ("Contact", ["Contact", "Miss", "Edge", "Leave"]),
        ("Type of Run (Bowling)", _BOWLING_TYPE_OF_RUN),
        ("Type of Run (Batting)", _BATTING_TYPE_OF_RUN),
        ("Batting Position", _BATTING_POSITIONS),
        *[(col, suggestions[col]) for col in _SUGGESTION_COLUMNS],
    ]

    lists_ws = wb.create_sheet("Lists")
    list_column_letter: dict[str, str] = {}
    list_values: dict[str, list[str]] = {}
    for col_index, (key, values) in enumerate(list_definitions, start=1):
        list_column_letter[key] = get_column_letter(col_index)
        list_values[key] = values
        for row_index, value in enumerate(values, start=1):
            lists_ws.cell(row=row_index, column=col_index, value=value)
    lists_ws.sheet_state = "hidden"

    def spec(key: str, strict: bool) -> tuple[str, int, bool]:
        return (list_column_letter[key], len(list_values[key]), strict)

    suggestion_specs = {col: spec(col, strict=False) for col in _SUGGESTION_COLUMNS}

    bowling_dropdowns = {
        "Format": spec("Format", strict=True),
        "Batting Hand": spec("Batting Hand", strict=True),
        "Side of Wicket": spec("Side of Wicket", strict=True),
        "Length": spec("Length", strict=True),
        "Line": spec("Line", strict=True),
        "Contact": spec("Contact", strict=True),
        "Type of Run": spec("Type of Run (Bowling)", strict=True),
        **suggestion_specs,
    }
    batting_dropdowns = {
        "Format": spec("Format", strict=True),
        "Length": spec("Length", strict=True),
        "Line": spec("Line", strict=True),
        "Contact": spec("Contact", strict=True),
        "Type of Run": spec("Type of Run (Batting)", strict=True),
        "Batting Position": spec("Batting Position", strict=True),
        **suggestion_specs,
    }

    _write_sheet(wb, "Bowling", BOWLING_HEADERS, bowling_dropdowns)
    _write_sheet(wb, "Batting", BATTING_HEADERS, batting_dropdowns)
    # Sheets already come out in creation order: Instructions, Bowling, Batting, Lists.

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
