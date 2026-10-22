"""
FastAPI application - the bridge between the stats engines and the
web frontend.

Run with (from the `backend` folder, venv activated):
    uvicorn app.main:app --reload --port 8040

(8040, not FastAPI's usual 8000 - see vite.config.ts's proxy comment
for why. Keep this in sync with that file's target if either changes.)

Then open http://127.0.0.1:8040/docs - FastAPI auto-generates an
interactive page listing every endpoint. Note: the filter/breakdown
query parameters below are read generically from the request (see
_filters_from_request) rather than declared one-by-one, so /docs won't
list them individually - see the ALLOWED_*_COLUMNS constants for the
full set. That trade-off is deliberate: the spec calls for ~20-25
filterable dimensions per discipline, and hand-declaring each one
twice (bowling AND batting) would mean every new filterable column
needs a matching code change in N places forever, exactly what
app/services/filters.py's generic design is meant to avoid.

Bowling and batting each get a fully symmetric set of endpoints under
/api/bowling/* and /api/batting/*. There is no single-bowler-only API
anymore (the old flat /api/stats etc. from before batting existed) -
this is a rename, not a functionality loss: the frontend was updated
in the same change to call the new paths, and every stat those old
endpoints returned is still available (now with real wickets/average/
strike rate, which didn't exist in the data before).
"""
import dataclasses
import json
import math
import os
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.db.database import RAW_WORKBOOK
from app.ingestion import load_batting as load_batting_ingestion
from app.ingestion import load_bowling as load_bowling_ingestion
from app.ingestion.corrections import apply_data_quality_fix
from app.ingestion.upload import process_upload
from app.ingestion.validation import validate_batting, validate_bowling
from app.services.template import build_template
from app.services.batting_insights import generate_batting_insights
from app.services.batting_stats import (
    batting_by_group,
    compute_batting_stats,
    compute_innings_summaries,
    innings_summary_by,
)
from app.services.batting_strengths import analyze_strengths_and_weaknesses
from app.services.cricket_common import bucket_by_over, phase_gap_note, MIN_BALLS_FOR_INSIGHT
from app.services.cricket_stats import compute_bowling_stats, compute_maidens, economy_by_group
from app.services.data_access import load_batting_deliveries, load_bowling_deliveries
from app.services.filters import DeliveryFilters, apply_filters
from app.services.insights import generate_insights as generate_bowling_insights

app = FastAPI(title="Cricket Performance Analytics API")

# Set on the public deployment (not for local/personal use) so a
# stranger with the link can explore every dashboard but can't upload
# a match or rewrite the master workbook's data - see the two write
# endpoints below, both of which check this before touching anything.
# A single env var rather than a per-endpoint flag, so there's exactly
# one place that decides "is this the public demo or Thomas's own copy".
READ_ONLY = os.environ.get("READ_ONLY", "").strip().lower() in {"1", "true", "yes"}

# Allows the React dev server (running on a different port) to call this API
# directly from the browser -- most /api traffic actually goes through Vite's
# own proxy (vite.config.ts) so never hits CORS at all, but this covers anyone
# hitting the backend directly (e.g. the /docs page). 5176 is this project's
# frontend port (moved off Vite's 5173 default to avoid clashing with another
# project on the same dev machine); 5173 kept too during the switch.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5176", "http://127.0.0.1:5176", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Every column here is both filterable (as a repeated query param,
# e.g. ?length=Good&length=Full) and usable as a `group_by` value for
# the breakdown endpoint. Adding a new analysable dimension later is
# one entry here, not a new endpoint or a new frontend type.
#
# match_id is included so a match-report view can scope any of the
# existing stats/breakdown/deliveries endpoints to one match
# (?match_id=53) for free, rather than needing dedicated per-match
# endpoints - it's numeric though, so _filters_from_request coerces it
# (see NUMERIC_COLUMNS below) and the frontend sidebar deliberately
# doesn't render it as a dropdown (see dimensions.ts) - a match is
# picked via the dedicated match list, not a free-text filter.
BOWLING_DIMENSION_COLUMNS = [
    "match_id", "match_date", "format_tier", "competition", "team", "opposition", "ground", "innings_label",
    "batsman", "batting_hand", "bowling_end", "side_of_wicket",
    "line", "length", "run_type", "dismissal_type", "area_scored",
    "shot", "contact",
]
BATTING_DIMENSION_COLUMNS = [
    "match_id", "match_date", "format_tier", "competition", "team", "opposition", "ground", "innings_label",
    "batting_position", "bowler", "line", "length", "shot", "run_type", "dismissal_type",
    "area_scored", "contact",
]
# Columns whose equals-filter values need int coercion (query params
# always arrive as strings, but these DataFrame columns are int64).
NUMERIC_COLUMNS = {"match_id", "batting_position"}
# Columns that ARE filterable/groupable but shouldn't be offered as a
# free-text dropdown in filter-options - match_id (picked via the
# dedicated match list, not a value list of bare ids) and match_date
# (picked via date_from/date_to - see DeliveryFilters - or the
# dedicated match list, not a checkbox list of every date a career
# spans). batting_position is numeric too but IS meant to appear as a
# normal dropdown/combination dimension, hence NUMERIC_COLUMNS being a
# separate set from this one.
HIDDEN_FROM_OPTIONS = {"match_id", "match_date"}

# The innings-summary endpoints (maidens, not-outs/50s/100s) can only
# ever be filtered by columns that select whole innings, never ones
# that slice individual balls within one - see their docstrings. This
# is the safe subset of BOWLING_DIMENSION_COLUMNS / BATTING_DIMENSION_
# COLUMNS shared by both disciplines.
INNINGS_SAFE_COLUMNS = [
    "match_id", "match_date", "format_tier", "competition", "team", "opposition", "ground", "innings_label",
]
# Batting-only extension of the above: batting_position is also
# constant within one innings, but bowling has no equivalent column.
BATTING_INNINGS_SAFE_COLUMNS = INNINGS_SAFE_COLUMNS + ["batting_position"]


def _sanitize_nan(record: dict) -> dict:
    """
    pandas sometimes silently converts a Python None into a float NaN
    when it sits in an otherwise string-typed DataFrame column (e.g.
    most_frequent_area being None for a group with no scoring shots).
    NaN isn't valid JSON, so this converts it back to a proper null
    before the response is sent.
    """
    return {
        key: (None if isinstance(value, float) and math.isnan(value) else value)
        for key, value in record.items()
    }


def _filters_from_request(request: Request, allowed_columns: list[str]) -> DeliveryFilters:
    equals = {}
    for column in allowed_columns:
        values = request.query_params.getlist(column)
        if not values:
            continue
        # match_id (and any future numeric dimension) needs int
        # coercion: the DataFrame column is int64, but query params
        # always arrive as strings, so "53" would never match 53.
        equals[column] = [int(v) for v in values] if column in NUMERIC_COLUMNS else values

    over_min = request.query_params.get("over_min")
    over_max = request.query_params.get("over_max")
    specific_overs = [int(o) for o in request.query_params.getlist("over")]

    return DeliveryFilters(
        equals=equals,
        over_min=int(over_min) if over_min is not None else None,
        over_max=int(over_max) if over_max is not None else None,
        specific_overs=specific_overs or None,
        date_from=request.query_params.get("date_from"),
        date_to=request.query_params.get("date_to"),
    )


def _dimension_options(df, columns: list[str]) -> dict:
    options = {}
    for column in columns:
        if column in df.columns and column not in HIDDEN_FROM_OPTIONS:
            options[column] = sorted(df[column].dropna().unique().tolist())
    return options


@app.get("/api/health")
def health():
    """Quick check that the API is running. Also tells the frontend
    whether this is the read-only public demo, so it can hide the
    upload/fix controls rather than show them only to have the
    backend reject every attempt."""
    return {"status": "ok", "read_only": READ_ONLY}


@app.get("/api/data-quality")
def data_quality_report():
    """
    Surfaces the same validation.py checks that run at ingestion time
    (see app/ingestion/validation.py) - previously console-only output
    from `python -m app.ingestion.load_spreadsheet`, now checkable from
    inside the app itself without a terminal. Re-reads the raw workbook
    fresh on every call (it's small and this endpoint isn't hot-path),
    so it always reflects the current file on disk, not whatever was
    last ingested.

    Also flags when the database is "stale" - the raw sheet's row
    count doesn't match what's actually in bowling_deliveries/
    batting_deliveries - which means someone edited the spreadsheet
    since the last `load_spreadsheet.py` run and every stat in the app
    is currently showing the OLD data, silently. This is the one check
    that can't be run at ingestion time (ingestion IS what makes it
    true again), so it belongs here.
    """
    bowling_raw = load_bowling_ingestion.load_raw_dataframe(RAW_WORKBOOK)
    batting_raw = load_batting_ingestion.load_raw_dataframe(RAW_WORKBOOK)

    issues = validate_bowling(bowling_raw) + validate_batting(batting_raw)

    db_bowling_rows = len(load_bowling_deliveries())
    db_batting_rows = len(load_batting_deliveries())

    return {
        "issues": [dataclasses.asdict(issue) for issue in issues],
        "bowling": {
            "raw_rows": len(bowling_raw),
            "db_rows": db_bowling_rows,
            "stale": len(bowling_raw) != db_bowling_rows,
        },
        "batting": {
            "raw_rows": len(batting_raw),
            "db_rows": db_batting_rows,
            "stale": len(batting_raw) != db_batting_rows,
        },
    }


class DataQualityFixRequest(BaseModel):
    sheet: str
    column: str
    from_values: list[str]
    to_value: str


@app.post("/api/data-quality/fix")
def fix_data_quality_issue(fix: DataQualityFixRequest):
    """
    Applies a validation issue's suggested fix directly to the master
    workbook (see app/ingestion/corrections.py) - e.g. rewriting every
    'miss' to 'Miss', or a one-off 'Toss' in the Line column to
    whichever real line it should have been. Rebuilds the database
    from the corrected file before returning, so the Data Quality tab
    can simply re-fetch its report afterwards.
    """
    if READ_ONLY:
        raise HTTPException(status_code=403, detail="This is a read-only public demo - data fixes are disabled.")
    changed = apply_data_quality_fix(fix.sheet, fix.column, fix.from_values, fix.to_value)
    return {"rows_changed": changed}


@app.get("/api/template")
def download_template():
    """The blank 'add a new match' workbook - see
    app/services/template.py for what's in it."""
    content = build_template()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="Mayes Bowling - New Match Template.xlsx"'},
    )


@app.post("/api/upload-match")
async def upload_match(
    file: UploadFile = File(...),
    force: bool = False,
    confirm_new_categories: bool = False,
    corrections: str = "[]",
):
    """
    Takes a filled-in template (see /api/template), validates it, and
    merges it into the master workbook + database - see
    app/ingestion/upload.py for the full flow. Two independent
    confirmations can gate a merge, each leaving the data untouched
    until the caller confirms:
      - status="duplicate" if the (date, competition, team, opposition,
        ground) tuple looks like it's already in the data; resubmit
        with force=true to add it anyway (e.g. a genuine second match
        against the same opposition, on the same ground, that happens
        to share a date with a rain-delayed rescheduling).
      - status="new_categories" if a "suggestion column" value (Ground,
        Opposition, Team, Competition, End, Area Scored, Shot) isn't in
        the existing data yet - could be a new match detail, could be a
        typo of an existing one. Each flagged value carries the
        column's existing values, so the caller can offer "keep it as
        new" or "replace it with one of these" per value, one at a
        time. `corrections` (a JSON-encoded list of
        {sheet, column, from, to}) rewrites the "replace" ones before
        re-validating; resubmit with confirm_new_categories=true once
        every flagged value has been resolved one way or the other.
    """
    if READ_ONLY:
        raise HTTPException(status_code=403, detail="This is a read-only public demo - uploads are disabled.")
    file_bytes = await file.read()
    result = process_upload(
        file_bytes,
        force=force,
        confirm_new_categories=confirm_new_categories,
        corrections=json.loads(corrections),
    )
    return dataclasses.asdict(result)


# ---------------------------------------------------------------- Bowling


@app.get("/api/bowling/filter-options")
def bowling_filter_options():
    """Every distinct value available for each bowling filter/slicer,
    so the frontend can populate dropdowns without hardcoding anything."""
    df = load_bowling_deliveries()
    options = _dimension_options(df, BOWLING_DIMENSION_COLUMNS)
    options["over_min"] = int(df["over_number"].min())
    options["over_max"] = int(df["over_number"].max())
    options["overs_bowled"] = sorted(df["over_number"].unique().tolist())
    return options


@app.get("/api/bowling/matches")
def bowling_matches(request: Request):
    """One row per match Thomas has bowled in - powers a match selector.
    Accepts the same filters as everything else (in practice, mainly
    format_tier - narrowing a match list to the same format tier the
    rest of a format-scoped view is locked to)."""
    df = load_bowling_deliveries()
    filtered = apply_filters(df, _filters_from_request(request, BOWLING_DIMENSION_COLUMNS))
    matches = filtered[
        ["match_id", "match_date", "competition", "format_tier", "team", "opposition", "ground"]
    ].drop_duplicates()
    return matches.sort_values("match_date").to_dict(orient="records")


@app.get("/api/bowling/innings-summary")
def bowling_innings_summary(request: Request):
    """
    One row per bowling innings Thomas has bowled, with match context
    plus maidens - the one bowling stat that can ONLY be computed over
    a whole, unfiltered innings (see cricket_stats.compute_maidens).
    Only accepts match-level filters (format_tier, competition,
    opposition, ...) - never a per-ball dimension like length or
    line, which would slice individual balls out of an innings and
    make "was this over a maiden" meaningless. Powers the Matches tab
    and the format-tier landing page.
    """
    df = load_bowling_deliveries()
    df = apply_filters(df, _filters_from_request(request, INNINGS_SAFE_COLUMNS))
    rows = []
    for innings_id, innings_df in df.groupby("bowling_innings_id"):
        stats = compute_bowling_stats(innings_df)
        first = innings_df.iloc[0]
        rows.append(
            {
                "bowling_innings_id": int(innings_id),
                "match_id": int(first["match_id"]),
                "match_date": first["match_date"],
                "competition": first["competition"],
                "opposition": first["opposition"],
                "ground": first["ground"],
                "innings_label": first["innings_label"],
                "maidens": compute_maidens(innings_df),
                **{k: v for k, v in stats.items() if not k.endswith("_distribution")},
            }
        )
    rows.sort(key=lambda r: r["match_date"])
    return [_sanitize_nan(r) for r in rows]


@app.get("/api/bowling/stats")
def bowling_stats(request: Request):
    """Applies whatever filters are passed in and returns every core
    bowling stat (economy, average, strike rate, dot ball %, etc)."""
    df = load_bowling_deliveries()
    filtered = apply_filters(df, _filters_from_request(request, BOWLING_DIMENSION_COLUMNS))
    return compute_bowling_stats(filtered)


@app.get("/api/bowling/breakdown")
def bowling_breakdown(request: Request, group_by: list[str] = Query(["length"])):
    """Same filters as /api/bowling/stats, broken down by one or more
    chosen dimensions - group_by=length gives one row per length;
    repeating it (group_by=length&group_by=batting_hand) gives one row
    per length+hand COMBINATION, e.g. "Good length to left-handers".
    This one endpoint is the combination engine - a combination is
    just a breakdown with more than one dimension."""
    invalid = [column for column in group_by if column not in BOWLING_DIMENSION_COLUMNS]
    if invalid:
        return {"error": f"group_by value(s) {invalid} not in {sorted(BOWLING_DIMENSION_COLUMNS)}"}

    df = load_bowling_deliveries()
    filtered = apply_filters(df, _filters_from_request(request, BOWLING_DIMENSION_COLUMNS))
    breakdown = economy_by_group(filtered, group_by)
    return [_sanitize_nan(record) for record in breakdown.to_dict(orient="records")]


@app.get("/api/bowling/insights")
def bowling_insights(request: Request):
    """Coach-style written insights - each only fires if there's
    enough data behind it (see app/services/insights.py)."""
    df = load_bowling_deliveries()
    filtered = apply_filters(df, _filters_from_request(request, BOWLING_DIMENSION_COLUMNS))
    return generate_bowling_insights(filtered)


@app.get("/api/bowling/deliveries")
def bowling_deliveries(request: Request):
    """Raw, ball-by-ball delivery rows - powers the interactive
    ball-by-ball table."""
    df = load_bowling_deliveries()
    filtered = apply_filters(df, _filters_from_request(request, BOWLING_DIMENSION_COLUMNS))
    filtered = filtered.sort_values(["match_date", "over_number", "ball_number", "row_order"])

    columns = [
        "match_date", "competition", "opposition", "ground", "innings_label",
        "over_ball", "over_number", "ball_number", "batsman", "batting_hand",
        "bowling_end", "side_of_wicket", "line", "length", "runs_off_bat",
        "is_wicket", "run_type", "dismissal_type", "area_scored", "shot", "contact",
    ]
    records = filtered[columns].to_dict(orient="records")
    return [_sanitize_nan(record) for record in records]


@app.get("/api/bowling/wickets")
def bowling_wickets(request: Request):
    """
    Every wicket-taking delivery, in full detail - the raw material
    for wicket-pattern analysis. Deliberately just a filtered,
    sorted list rather than a "pattern finder": with as few as 2
    wickets on record, any automated pattern claim would be
    statistical noise dressed up as insight. A coach reading the list
    itself, with dismissal type/length/line/shot alongside each one,
    is the honest version of "wicket recipe" analysis at this sample
    size - see generate_insights() for the one pattern call this app
    DOES make, and only once there are enough wickets to say it.
    """
    df = load_bowling_deliveries()
    filtered = apply_filters(df, _filters_from_request(request, BOWLING_DIMENSION_COLUMNS))
    wickets = filtered[filtered["is_wicket"] == 1].sort_values(["match_date", "over_number", "ball_number"])

    columns = [
        "match_date", "competition", "opposition", "ground", "innings_label",
        "over_ball", "batsman", "batting_hand", "bowling_end", "side_of_wicket",
        "line", "length", "dismissal_type", "wicket_explanation", "shot", "contact",
    ]
    records = wickets[columns].to_dict(orient="records")
    return [_sanitize_nan(record) for record in records]


@app.get("/api/bowling/by-over")
def bowling_by_over(request: Request):
    """One row of stats per over actually bowled, in over order -
    powers the trend charts. Overs are NOT necessarily consecutive:
    spells are scattered through an innings, and gaps between them are
    meaningful (a spell break), not a bug."""
    df = load_bowling_deliveries()
    filtered = apply_filters(df, _filters_from_request(request, BOWLING_DIMENSION_COLUMNS))

    breakdown = economy_by_group(filtered, "over_number").sort_values("over_number")
    breakdown["cumulative_runs"] = breakdown["runs_conceded"].cumsum()
    breakdown["cumulative_balls"] = breakdown["balls_bowled"].cumsum()
    breakdown["cumulative_economy"] = (
        breakdown["cumulative_runs"] / (breakdown["cumulative_balls"] / 6)
    ).round(2)

    return [_sanitize_nan(record) for record in breakdown.to_dict(orient="records")]


@app.get("/api/bowling/phase-breakdown")
def bowling_phase_breakdown(request: Request, breakpoint: list[int] = Query([])):
    """
    Spell/phase analysis: buckets the innings-absolute over number into
    phases at the given breakpoints (e.g. breakpoint=6&breakpoint=15
    over a 20-over innings -> 1-6, 7-15, 16-20) and returns full
    bowling stats per phase, plus an optional cautious note comparing
    the first and last phase's economy - only when both clear a
    sample floor and the gap is meaningful (see cricket_common.
    phase_gap_note). No format-specific terminology (Powerplay/Death)
    is applied here - that's a frontend labelling choice per format
    tier, since a First-Class innings has no such structure.
    """
    df = load_bowling_deliveries()
    filtered = apply_filters(df, _filters_from_request(request, BOWLING_DIMENSION_COLUMNS))
    phases = bucket_by_over(filtered, breakpoint, compute_bowling_stats)
    phases = [_sanitize_nan(p) for p in phases]

    note = None
    gap = phase_gap_note(phases, "economy", "balls_bowled", MIN_BALLS_FOR_INSIGHT, 1.0)
    if gap:
        first, last, delta = gap
        direction = "higher" if delta > 0 else "lower"
        note = (
            f"Economy in overs {last['over_range']} ({last['economy']}) appears {direction} than overs "
            f"{first['over_range']} ({first['economy']}) - {first['balls_bowled']} vs {last['balls_bowled']} balls. "
            "An early signal from limited data, not a confirmed trend."
        )

    return {"phases": phases, "note": note}


# ---------------------------------------------------------------- Batting


@app.get("/api/batting/filter-options")
def batting_filter_options():
    df = load_batting_deliveries()
    options = _dimension_options(df, BATTING_DIMENSION_COLUMNS)
    options["over_min"] = int(df["over_number"].min())
    options["over_max"] = int(df["over_number"].max())
    options["overs_faced"] = sorted(df["over_number"].unique().tolist())
    return options


@app.get("/api/batting/matches")
def batting_matches(request: Request):
    df = load_batting_deliveries()
    filtered = apply_filters(df, _filters_from_request(request, BATTING_DIMENSION_COLUMNS))
    matches = filtered[
        ["match_id", "match_date", "competition", "format_tier", "team", "opposition", "ground"]
    ].drop_duplicates()
    return matches.sort_values("match_date").to_dict(orient="records")


@app.get("/api/batting/innings-summary")
def batting_innings_summary(request: Request):
    """
    One row per innings Thomas has batted, plus to-date milestones
    (highest score, 50s, 100s, not outs) derived from those rows. Like
    bowling's innings-summary, this only accepts match-level filters
    (format_tier, competition, ...): "was this innings a not out" and
    "what was the highest score" only mean anything over a whole
    innings (see batting_stats.compute_innings_summaries) - filtering
    by a per-ball dimension would undercount runs and wrongly mark
    innings as not out. format_tier filtering in particular matters
    here more than almost anywhere else in the app: a "highest score"
    blending a Test 5 and a T20 50 is exactly the kind of
    format-blended stat that misleads rather than informs.
    """
    df = load_batting_deliveries()
    df = apply_filters(df, _filters_from_request(request, BATTING_INNINGS_SAFE_COLUMNS))
    summaries = compute_innings_summaries(df)

    rows = []
    for _, summary in summaries.iterrows():
        innings_df = df[df["batting_innings_id"] == summary["batting_innings_id"]]
        first = innings_df.iloc[0]
        rows.append(
            {
                "batting_innings_id": int(summary["batting_innings_id"]),
                "match_id": int(first["match_id"]),
                "match_date": first["match_date"],
                "competition": first["competition"],
                "opposition": first["opposition"],
                "ground": first["ground"],
                "innings_label": first["innings_label"],
                "batting_position": int(first["batting_position"]),
                "runs": int(summary["runs"]),
                "balls_faced": int(summary["balls_faced"]),
                "is_out": bool(summary["is_out"]),
                "fifty": bool(summary["fifty"]),
                "hundred": bool(summary["hundred"]),
            }
        )
    rows.sort(key=lambda r: r["match_date"])

    career = {
        "innings_played": len(rows),
        "highest_score": max((r["runs"] for r in rows), default=None),
        "not_outs": sum(1 for r in rows if not r["is_out"]),
        "fifties": sum(1 for r in rows if r["fifty"]),
        "hundreds": sum(1 for r in rows if r["hundred"]),
    }
    return {"innings": rows, "career": career}


@app.get("/api/batting/innings-breakdown")
def batting_innings_breakdown(request: Request, by: str = "ground"):
    """
    One row per distinct value of an innings-safe dimension (ground,
    opposition, batting_position, ...) with genuine innings-level
    figures - Innings played, Highest Score, Not Outs, 50s/100s -
    which /api/batting/breakdown (ball-level) cannot give correctly
    for the same reason /api/batting/innings-summary can't take
    per-ball filters. This is what "Batting by Position" / "Batting by
    Ground" mean in the spec: not a ball-count, an innings-count.
    """
    if by not in BATTING_INNINGS_SAFE_COLUMNS:
        return {"error": f"'by' must be one of {sorted(BATTING_INNINGS_SAFE_COLUMNS)}"}

    df = load_batting_deliveries()
    filtered = apply_filters(df, _filters_from_request(request, BATTING_INNINGS_SAFE_COLUMNS))
    breakdown = innings_summary_by(filtered, by)
    return [_sanitize_nan(record) for record in breakdown.to_dict(orient="records")]


@app.get("/api/batting/stats")
def batting_stats(request: Request):
    df = load_batting_deliveries()
    filtered = apply_filters(df, _filters_from_request(request, BATTING_DIMENSION_COLUMNS))
    return compute_batting_stats(filtered)


@app.get("/api/batting/breakdown")
def batting_breakdown(request: Request, group_by: list[str] = Query(["length"])):
    """Same combination-engine behaviour as bowling_breakdown - see
    its docstring."""
    invalid = [column for column in group_by if column not in BATTING_DIMENSION_COLUMNS]
    if invalid:
        return {"error": f"group_by value(s) {invalid} not in {sorted(BATTING_DIMENSION_COLUMNS)}"}

    df = load_batting_deliveries()
    filtered = apply_filters(df, _filters_from_request(request, BATTING_DIMENSION_COLUMNS))
    breakdown = batting_by_group(filtered, group_by)
    return [_sanitize_nan(record) for record in breakdown.to_dict(orient="records")]


@app.get("/api/batting/insights")
def batting_insights(request: Request):
    df = load_batting_deliveries()
    filtered = apply_filters(df, _filters_from_request(request, BATTING_DIMENSION_COLUMNS))
    return generate_batting_insights(filtered)


@app.get("/api/batting/strengths-weaknesses")
def batting_strengths_weaknesses(request: Request):
    """The fuller strength/weakness report - every dimension scanned,
    both directions, always with sample size. See
    app/services/batting_strengths.py."""
    df = load_batting_deliveries()
    filtered = apply_filters(df, _filters_from_request(request, BATTING_DIMENSION_COLUMNS))
    result = analyze_strengths_and_weaknesses(filtered)
    return {
        "overall": _sanitize_nan(result["overall"]),
        "strengths": [_sanitize_nan(f) for f in result["strengths"]],
        "weaknesses": [_sanitize_nan(f) for f in result["weaknesses"]],
    }


@app.get("/api/batting/deliveries")
def batting_deliveries(request: Request):
    df = load_batting_deliveries()
    filtered = apply_filters(df, _filters_from_request(request, BATTING_DIMENSION_COLUMNS))
    filtered = filtered.sort_values(["match_date", "over_number", "ball_number", "row_order"])

    columns = [
        "match_date", "competition", "opposition", "ground", "innings_label", "batting_position",
        "over_ball", "over_number", "ball_number", "bowler", "line", "length", "shot",
        "runs_scored", "is_wicket", "run_type", "dismissal_type", "area_scored", "contact",
    ]
    records = filtered[columns].to_dict(orient="records")
    return [_sanitize_nan(record) for record in records]


@app.get("/api/batting/dismissals")
def batting_dismissals(request: Request):
    """Every delivery that dismissed Thomas, in full detail - the
    batting counterpart to /api/bowling/wickets, same reasoning."""
    df = load_batting_deliveries()
    filtered = apply_filters(df, _filters_from_request(request, BATTING_DIMENSION_COLUMNS))
    dismissals = filtered[filtered["is_wicket"] == 1].sort_values(["match_date", "over_number", "ball_number"])

    columns = [
        "match_date", "competition", "opposition", "ground", "innings_label", "batting_position",
        "over_ball", "bowler", "line", "length", "shot", "dismissal_type", "area_scored", "contact",
    ]
    records = dismissals[columns].to_dict(orient="records")
    return [_sanitize_nan(record) for record in records]


@app.get("/api/batting/by-over")
def batting_by_over(request: Request):
    df = load_batting_deliveries()
    filtered = apply_filters(df, _filters_from_request(request, BATTING_DIMENSION_COLUMNS))

    breakdown = batting_by_group(filtered, "over_number").sort_values("over_number")
    breakdown["cumulative_runs"] = breakdown["runs"].cumsum()
    breakdown["cumulative_balls"] = breakdown["balls_faced"].cumsum()
    breakdown["cumulative_strike_rate"] = (
        breakdown["cumulative_runs"] * 100 / breakdown["cumulative_balls"]
    ).round(2)

    return [_sanitize_nan(record) for record in breakdown.to_dict(orient="records")]


@app.get("/api/batting/phase-breakdown")
def batting_phase_breakdown(request: Request, breakpoint: list[int] = Query([])):
    """Innings-progression analysis - same bucketing as
    bowling_phase_breakdown, compared on strike rate instead of
    economy (a rising strike rate late in an innings is the batting
    equivalent signal worth a cautious note)."""
    df = load_batting_deliveries()
    filtered = apply_filters(df, _filters_from_request(request, BATTING_DIMENSION_COLUMNS))
    phases = bucket_by_over(filtered, breakpoint, compute_batting_stats)
    phases = [_sanitize_nan(p) for p in phases]

    note = None
    gap = phase_gap_note(phases, "strike_rate", "balls_faced", MIN_BALLS_FOR_INSIGHT, 20.0)
    if gap:
        first, last, delta = gap
        direction = "higher" if delta > 0 else "lower"
        note = (
            f"Strike rate in overs {last['over_range']} ({last['strike_rate']}) appears {direction} than overs "
            f"{first['over_range']} ({first['strike_rate']}) - {first['balls_faced']} vs {last['balls_faced']} balls. "
            "An early signal from limited data, not a confirmed trend."
        )

    return {"phases": phases, "note": note}


# --- Serve the built frontend (optional) ---
# If frontend/dist exists (i.e. you've run `npm run build`), FastAPI
# serves it directly at "/", so the whole app - API and UI - lives at
# one address. This is what makes a single Cloudflare Tunnel work:
# there's only one port to point it at. Placed at the very end of the
# file, after every @app.get(...) route above, so those routes always
# win - Starlette checks routes in the order they were registered,
# and this catch-all mount is registered last.
_FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=_FRONTEND_DIST, html=True), name="frontend")
