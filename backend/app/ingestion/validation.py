"""
Data-quality checks run against the raw workbook before ingestion.

This does NOT silently discard or "fix" suspicious rows - it reports
them, and ingestion proceeds with its own documented, explicit rules
(see load_bowling.py / load_batting.py) regardless of what this finds.
The point is visibility: every run of `load_spreadsheet.py` prints
this report, so a new data-quality issue introduced by a future
spreadsheet edit gets noticed immediately instead of silently
skewing a stat months later.

The one exception is the upload flow (app/ingestion/upload.py): an
uploaded file is user input, not an already-trusted master file, and a
handful of these checks catch problems that would otherwise crash
`clean_rows()` outright (a blank required field, an Over value that
isn't a number at all - typically a row shifted out of column
alignment). Those are marked `blocking=True` so the upload flow can
refuse to merge rather than attempt an insert it already knows will
fail; every other check stays advisory, exactly as it is for the
master file.
"""
from dataclasses import dataclass

import pandas as pd

from app.services.cricket_common import ALL_TIERS


@dataclass
class ValidationIssue:
    sheet: str
    severity: str   # "warning" | "info"
    message: str
    blocking: bool = False
    # Present only when this issue is a "pick the correct value"
    # problem - a spelling inconsistency or an off-vocabulary value in
    # an existing row, as opposed to something structural (a blank
    # field, mismatched ball numbering) that has no single obvious
    # fix. `column` + `variants` (the value(s) currently in the data
    # that are wrong or inconsistent) + `options` (values the caller
    # can offer as the correct replacement) let the Data Quality tab
    # render a picker and apply the fix directly, the same way the
    # upload flow lets a new category value be corrected inline.
    column: str | None = None
    variants: list[str] | None = None
    options: list[str] | None = None


# Known-valid categories per column, used only to flag genuinely NEW
# values worth a second look - never to reject them. The dataset is
# small and still growing, so new legitimate categories (a length
# type that hasn't come up yet, say) are expected, not errors.
_KNOWN_LENGTHS = {"Full", "Good", "Short", "Yorker", "Full Toss"}
_KNOWN_CONTACT = {"Contact", "Miss", "Edge", "Leave"}
_KNOWN_LINES = {"Off Stump", "Middle Stump", "Leg Stump", "Outside Leg", "Channel", "Wide"}
_KNOWN_BOWLER_TYPES = {
    "Right Arm Fast", "Left Arm Fast",
    "Right Arm Medium", "Left Arm Medium",
    "Right Arm Finger Spin", "Left Arm Finger Spin",
    "Right Arm Wrist Spin", "Left Arm Wrist Spin",
}


def _check_match_consistency(df: pd.DataFrame, sheet: str, opposition_col: str) -> list[ValidationIssue]:
    """A single (date, competition) pair should map to exactly one
    (team, opposition, ground, innings-ish label) combination - if it
    doesn't, some rows have drifted onto the wrong match (exactly the
    bug found and fixed in the Bowling sheet during Phase 1 review)."""
    issues = []
    grouped = df.groupby(["match_date", "competition"])[["team", opposition_col, "ground"]].nunique()
    inconsistent = grouped[(grouped["team"] > 1) | (grouped[opposition_col] > 1) | (grouped["ground"] > 1)]
    for (match_date, competition), _ in inconsistent.iterrows():
        issues.append(
            ValidationIssue(
                sheet,
                "warning",
                f"{match_date} / {competition}: rows disagree on team/opposition/ground - "
                f"looks like some rows belong to a different match.",
            )
        )
    return issues


def _check_category(df: pd.DataFrame, sheet: str, column: str, known: set[str]) -> list[ValidationIssue]:
    # One issue per unexpected value (not one bundling all of them) so
    # each can carry its own fix: "should this actually be one of the
    # known values?" - `options` offers the full known vocabulary,
    # since a value outside it is usually a typo of one of those, not
    # something to correct to another unexpected value.
    issues = []
    unexpected = sorted(set(df[column].dropna().unique()) - known)
    for value in unexpected:
        issues.append(
            ValidationIssue(
                sheet, "info", f"'{column}' contains a value outside the usual set: '{value}' "
                f"(not necessarily wrong - just flagging for a human to confirm).",
                column=column,
                variants=[value],
                options=sorted(known),
            )
        )
    return issues


def _check_case_variants(df: pd.DataFrame, sheet: str, column: str) -> list[ValidationIssue]:
    issues = []
    variants: dict[str, set[str]] = {}
    for value in df[column].dropna().unique():
        key = str(value).strip().lower()
        variants.setdefault(key, set()).add(value)
    for key, forms in variants.items():
        if len(forms) > 1:
            sorted_forms = sorted(forms)
            issues.append(
                ValidationIssue(
                    sheet, "warning",
                    f"'{column}' has {len(forms)} spellings of the same value: {sorted_forms} "
                    f"(ingestion normalises known cases like Miss/miss - check none of these slipped through).",
                    # The fix here is "pick which of these spellings is
                    # correct" - the other(s) get rewritten to match it,
                    # so variants and options are the same list.
                    column=column,
                    variants=sorted_forms,
                    options=sorted_forms,
                )
            )
    return issues


def _check_ball_numbering(df: pd.DataFrame, sheet: str) -> list[ValidationIssue]:
    """Non-numeric Over values happen for real on an uploaded file -
    e.g. a row shifted one column out of alignment lands a category
    string in the Over column - and previously crashed this whole
    check (and the request) with a raw pandas TypeError instead of a
    readable message. Coerced explicitly so a bad file gets a clear
    validation issue back, not a 500."""
    numeric_over = pd.to_numeric(df["over_raw"], errors="coerce")
    non_numeric_count = int(numeric_over.isna().sum() - df["over_raw"].isna().sum())

    issues = []
    if non_numeric_count:
        issues.append(
            ValidationIssue(
                sheet, "warning",
                f"{non_numeric_count} row(s) have a non-numeric Over value - check the columns haven't "
                f"shifted out of alignment (a common cause: a row with one fewer or one extra value than "
                f"the header row has columns).",
                blocking=True,
            )
        )

    valid_over = numeric_over.dropna()
    ball_fraction = ((valid_over % 1) * 10).round().astype(int)
    bad = valid_over[(ball_fraction < 1) | (ball_fraction > 6)]
    if len(bad):
        issues.append(
            ValidationIssue(sheet, "warning", f"{len(bad)} row(s) have an Over value outside x.1-x.6.")
        )
    return issues


def _check_nulls(df: pd.DataFrame, sheet: str, required_columns: list[str]) -> list[ValidationIssue]:
    """Every column checked here is NOT NULL in the database schema
    (or, like `result`, gets `int()`'d during cleaning) - a blank
    value doesn't just look wrong, it crashes ingestion or violates a
    database constraint. Always blocking for that reason."""
    issues = []
    for col in required_columns:
        missing = df[col].isna().sum()
        if missing:
            issues.append(ValidationIssue(sheet, "warning", f"'{col}' is blank on {missing} row(s).", blocking=True))
    return issues


def _check_format_tier_values(df: pd.DataFrame, sheet: str) -> list[ValidationIssue]:
    """Format is a required, explicit column (see template.py's strict
    dropdown), not guessed from the competition name - but the master
    workbook itself has no Excel-enforced dropdown, so a hand-typed
    value could still be something other than one of the three known
    tiers. That's blocking, not advisory: a fourth value would create
    an invisible bucket (no tab anywhere shows anything outside First
    Class / 50-Over / T20) - the exact bug that motivated making
    Format explicit in the first place."""
    invalid = sorted(set(df["format_tier"].dropna().unique()) - set(ALL_TIERS))
    if invalid:
        return [
            ValidationIssue(
                sheet, "warning",
                f"'format_tier' has value(s) that aren't one of {ALL_TIERS}: {invalid} - these "
                f"would be invisible in the app (no tab shows anything outside those three).",
                blocking=True,
            )
        ]
    return []


def _check_result_values(df: pd.DataFrame, sheet: str) -> list[ValidationIssue]:
    """`result` becomes `int(result)` during cleaning for every row
    that isn't a dismissal - a stray non-numeric value (a typo like
    "four" instead of "4") crashes ingestion. Checked separately from
    _check_nulls since this is about the wrong TYPE of value, not a
    missing one."""
    non_null = df["result"].dropna()
    is_wicket = non_null.astype(str).str.strip().str.lower() == "wicket"
    numeric = pd.to_numeric(non_null[~is_wicket], errors="coerce")
    bad_count = int(numeric.isna().sum())
    if bad_count:
        return [
            ValidationIssue(
                sheet, "warning",
                f"'result' has {bad_count} row(s) that are neither a number nor \"Wicket\".",
                blocking=True,
            )
        ]
    return []


# A Wide or No Ball doesn't count as a legal delivery (see
# load_bowling.py's ILLEGAL_DELIVERY_TYPES), so the very next ball
# legitimately re-bowls at the same over.ball number - duplicated here
# rather than imported because this runs against the RAW,
# not-yet-cleaned dataframe (type_of_run as one column), not
# clean_rows()'s split is_legal_delivery flag.
_RE_BOWL_TYPES = {"wide", "no ball"}


def _check_duplicate_deliveries(df: pd.DataFrame, sheet: str) -> list[ValidationIssue]:
    """Same match/end/over/batsman combination appearing more than
    once usually ISN'T a real duplicate - it's a Wide/No Ball followed
    by its own re-bowl, both legitimately sharing one over.ball number
    (confirmed against real cases in this data: every one so far was
    exactly this). So a group only gets flagged when it can't be
    explained that way: every row but the last one in the group (in
    original sheet order) would need to itself be a Wide/No Ball for
    this to be a legitimate re-bowl chain, not a true duplicate."""
    key_columns = ["match_date", "competition", "bowling_end", "over_raw", "batsman"]
    flagged_rows = 0
    for _, group in df.groupby(key_columns, sort=False):
        if len(group) < 2:
            continue
        ordered = group.sort_index()
        re_bowls = ordered["type_of_run"].iloc[:-1].astype(str).str.strip().str.lower()
        if not re_bowls.isin(_RE_BOWL_TYPES).all():
            flagged_rows += len(ordered)
    if flagged_rows:
        return [
            ValidationIssue(
                sheet, "info",
                f"{flagged_rows} row(s) share the same match/end/over/batsman and AREN'T explained "
                f"by a Wide/No Ball re-bowl - check these aren't genuine duplicates.",
            )
        ]
    return []


def _check_unassigned_bowler_types(df: pd.DataFrame) -> list[ValidationIssue]:
    """Flags batting rows with no Bowler Type yet. Not blocking - the
    column is nullable (see schema.sql's comment on it) precisely
    because real match data already existed before this field did -
    but worth surfacing so a newly-uploaded bowler doesn't sit
    unclassified indefinitely. Lists distinct bowler NAMES rather than
    a row count, since that's what the Manage Data tab's "Assign
    Bowler Types" tool needs you to act on - fixing one bowler's type
    fixes every row for them at once."""
    if "bowler_type" not in df.columns:
        return []
    unassigned = df[df["bowler_type"].isna()]
    bowlers = sorted(unassigned["bowler"].dropna().unique())
    if not bowlers:
        return []
    return [
        ValidationIssue(
            "Batting", "info",
            f"{len(bowlers)} bowler(s) have no Bowler Type yet: {bowlers} - use the 'Assign Bowler "
            f"Types' tool on the Manage Data tab.",
        )
    ]


def validate_bowling(df: pd.DataFrame) -> list[ValidationIssue]:
    issues = []
    issues += _check_match_consistency(df, "Bowling", "opposition")
    issues += _check_format_tier_values(df, "Bowling")
    issues += _check_category(df, "Bowling", "length", _KNOWN_LENGTHS)
    issues += _check_category(df, "Bowling", "line", _KNOWN_LINES)
    issues += _check_case_variants(df, "Bowling", "contact")
    issues += _check_case_variants(df, "Bowling", "shot")
    issues += _check_ball_numbering(df, "Bowling")
    # Every column here is NOT NULL in the database schema (see
    # app/db/schema.sql's bowling_deliveries/matches tables) or gets
    # int()'d during cleaning (over_raw) - this list is deliberately
    # kept in lockstep with that schema, not just the columns that
    # happened to cause a crash so far.
    issues += _check_nulls(
        df, "Bowling",
        [
            "match_date", "competition", "format_tier", "team", "opposition", "ground",
            "batsman", "batting_hand", "bowling_end", "side_of_wicket",
            "over_raw", "line", "length", "result", "shot", "contact",
        ],
    )
    issues += _check_result_values(df, "Bowling")
    issues += _check_duplicate_deliveries(df, "Bowling")
    return issues


def validate_batting(df: pd.DataFrame) -> list[ValidationIssue]:
    issues = []
    issues += _check_match_consistency(df, "Batting", "opposition")
    issues += _check_format_tier_values(df, "Batting")
    issues += _check_category(df, "Batting", "length", _KNOWN_LENGTHS)
    issues += _check_category(df, "Batting", "line", _KNOWN_LINES)
    issues += _check_category(df, "Batting", "bowler_type", _KNOWN_BOWLER_TYPES)
    issues += _check_unassigned_bowler_types(df)
    issues += _check_case_variants(df, "Batting", "contact")
    issues += _check_case_variants(df, "Batting", "shot")
    issues += _check_ball_numbering(df, "Batting")
    # Same principle as Bowling's list above: every column here is
    # NOT NULL in batting_deliveries/batting_innings/matches, or gets
    # int()'d during cleaning (over_raw, batting_position).
    issues += _check_nulls(
        df, "Batting",
        [
            "match_date", "competition", "format_tier", "team", "opposition", "ground",
            "bowler", "batting_position", "over_raw", "line", "length",
            "result", "shot", "contact",
        ],
    )
    issues += _check_result_values(df, "Batting")
    return issues


def print_report(issues: list[ValidationIssue]) -> None:
    if not issues:
        print("Data validation: no issues found.")
        return
    print(f"Data validation: {len(issues)} item(s) to review")
    for issue in issues:
        print(f"  [{issue.severity.upper():7}] {issue.sheet}: {issue.message}")
