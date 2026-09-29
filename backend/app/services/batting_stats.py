"""
Core batting statistics engine - the batting counterpart to
cricket_stats.py (bowling). Same design: pure functions over an
already-filtered DataFrame of deliveries, no DB/API concerns, so the
formulas are testable and reusable from a script, an endpoint, or a
report generator.

Cricket-rules judgment calls (see app/ingestion/load_batting.py for
where these flags are actually derived):
  - Balls Faced counts every delivery where counts_as_ball_faced = 1
    (excludes Wides, includes No Balls - standard scorecard convention).
  - Runs (batsman's own) counts only counts_for_batsman_runs = 1
    deliveries (excludes Leg Byes/Byes - those are extras, not his runs).
  - Dismissals/average use is_wicket, which is real in this dataset
    (unlike the original bowling-only MVP, wickets are no longer a gap).

Innings-level facts - Not Outs, Highest Score, 50s/100s - are
deliberately NOT computed here: they require aggregating to one row
per innings (sum runs, check whether a wicket occurred at all), which
only makes sense over a complete-innings view, the same reasoning as
compute_maidens() in cricket_stats.py. See compute_innings_summaries().
"""
import pandas as pd

from app.services.cricket_common import SMALL_SAMPLE_BALLS, SMALL_SAMPLE_WICKETS, safe_ratio


def compute_batting_stats(df: pd.DataFrame) -> dict:
    faced = df[df["counts_as_ball_faced"] == 1]
    balls_faced = len(faced)

    if balls_faced == 0:
        return _empty_stats()

    batsman_runs = int(faced.loc[faced["counts_for_batsman_runs"] == 1, "runs_scored"].sum())
    strike_rate = safe_ratio(batsman_runs * 100, balls_faced)

    dismissals = int(faced["is_wicket"].sum())
    average = safe_ratio(batsman_runs, dismissals)

    dot_balls = int((faced["runs_scored"] == 0).sum())
    dot_ball_pct = round(dot_balls / balls_faced * 100, 1)

    # Excludes leg byes/byes/wickets - only shots off the bat that
    # actually scored, same reasoning as the bowling engine's `shots`.
    scoring = faced[(faced["run_type"] == "Runs") & (faced["is_wicket"] == 0)]
    singles = int((scoring["runs_scored"] == 1).sum())
    twos = int((scoring["runs_scored"] == 2).sum())
    threes = int((scoring["runs_scored"] == 3).sum())
    fours = int((scoring["runs_scored"] == 4).sum())
    sixes = int((scoring["runs_scored"] == 6).sum())
    boundaries = fours + sixes
    scoring_balls = int((scoring["runs_scored"] > 0).sum())

    length_counts = faced["length"].value_counts()
    line_counts = faced["line"].value_counts()
    area_counts = scoring.loc[scoring["area_scored"].notna(), "area_scored"].value_counts()
    shot_counts = faced["shot"].value_counts()

    return {
        "balls_faced": balls_faced,
        "runs": batsman_runs,
        "strike_rate": strike_rate,
        "dismissals": dismissals,
        "average": average,
        "dot_balls": dot_balls,
        "dot_ball_pct": dot_ball_pct,
        "singles": singles,
        "twos": twos,
        "threes": threes,
        "fours": fours,
        "sixes": sixes,
        "boundaries": boundaries,
        "boundary_pct": round(boundaries / balls_faced * 100, 1),
        "scoring_balls": scoring_balls,
        "scoring_shot_pct": round(scoring_balls / balls_faced * 100, 1),
        "length_distribution": length_counts.to_dict(),
        "most_faced_length": length_counts.idxmax() if not length_counts.empty else None,
        "line_distribution": line_counts.to_dict(),
        "most_faced_line": line_counts.idxmax() if not line_counts.empty else None,
        "area_distribution": area_counts.to_dict(),
        "most_frequent_area": area_counts.idxmax() if not area_counts.empty else None,
        "shot_distribution": shot_counts.to_dict(),
        "most_played_shot": shot_counts.idxmax() if not shot_counts.empty else None,
        "small_sample": balls_faced < SMALL_SAMPLE_BALLS,
        "dismissals_small_sample": dismissals < SMALL_SAMPLE_WICKETS,
    }


def _empty_stats() -> dict:
    return {
        "balls_faced": 0,
        "runs": 0,
        "strike_rate": None,
        "dismissals": 0,
        "average": None,
        "dot_balls": 0,
        "dot_ball_pct": None,
        "singles": 0,
        "twos": 0,
        "threes": 0,
        "fours": 0,
        "sixes": 0,
        "boundaries": 0,
        "boundary_pct": None,
        "scoring_balls": 0,
        "scoring_shot_pct": None,
        "length_distribution": {},
        "most_faced_length": None,
        "line_distribution": {},
        "most_faced_line": None,
        "area_distribution": {},
        "most_frequent_area": None,
        "shot_distribution": {},
        "most_played_shot": None,
        "small_sample": True,
        "dismissals_small_sample": True,
    }


def batting_by_group(df: pd.DataFrame, group_columns: str | list[str]) -> pd.DataFrame:
    """Same shape as cricket_stats.economy_by_group (including the
    multi-column combination support), for batting."""
    columns = [group_columns] if isinstance(group_columns, str) else list(group_columns)

    rows = []
    for key, group in df.groupby(columns):
        key_values = key if isinstance(key, tuple) else (key,)
        stats = compute_batting_stats(group)
        rows.append({**dict(zip(columns, key_values)), **stats})

    if not rows:
        empty_columns = columns + list(_empty_stats().keys())
        return pd.DataFrame(columns=empty_columns)

    return pd.DataFrame(rows).sort_values("balls_faced", ascending=False)


def compute_innings_summaries(df: pd.DataFrame) -> pd.DataFrame:
    """
    One row per innings: runs scored, balls faced, whether he was
    dismissed (-> not out if not), and whether that innings reached
    50/100. Needs the full, unfiltered innings (same complete-view
    caveat as compute_maidens) - a filtered slice (e.g. "Good length
    only") would undercount runs and wrongly mark innings as not out.
    Powers Highest Score / 50s / 100s / Not Outs, which only mean
    anything at the innings level, never the single-delivery level.
    """
    if df.empty:
        return pd.DataFrame(columns=["batting_innings_id", "runs", "balls_faced", "is_out", "fifty", "hundred"])

    rows = []
    for innings_id, innings_df in df.groupby("batting_innings_id"):
        stats = compute_batting_stats(innings_df)
        runs = stats["runs"]
        rows.append(
            {
                "batting_innings_id": innings_id,
                "runs": runs,
                "balls_faced": stats["balls_faced"],
                "is_out": stats["dismissals"] > 0,
                "fifty": 50 <= runs < 100,
                "hundred": runs >= 100,
            }
        )
    return pd.DataFrame(rows)


def innings_summary_by(df: pd.DataFrame, dimension: str) -> pd.DataFrame:
    """
    One row per distinct value of `dimension` (e.g. one row per
    ground, or per batting position), aggregated from WHOLE innings -
    not balls. This is what makes Innings/Highest Score/Not Outs/50s
    correct per group, which a ball-level groupby (batting_by_group)
    fundamentally can't give you: it has no concept of "an innings",
    so it can't say how many innings were played at a ground or what
    the highest score there was, only how many balls were bowled at it.

    `dimension` must be constant within a single innings (ground,
    opposition, batting_position, competition, ...) - never a per-ball
    column like length or line, which would make "which value does
    this innings belong to" ambiguous. Callers should restrict this to
    the same innings-safe column set the innings-summary endpoints use.
    """
    empty = pd.DataFrame(
        columns=[
            dimension, "innings", "runs", "balls_faced", "average", "strike_rate",
            "highest_score", "not_outs", "fifties", "hundreds", "dismissals",
        ]
    )

    summaries = compute_innings_summaries(df)
    if summaries.empty:
        return empty

    # The dimension's value is constant across every ball of one
    # innings, so .first() picks it up correctly - this is exactly
    # the assumption callers must guarantee by only passing innings-
    # safe dimensions in.
    dim_per_innings = df.groupby("batting_innings_id")[dimension].first()
    summaries = summaries.join(dim_per_innings, on="batting_innings_id")

    rows = []
    for value, group in summaries.groupby(dimension):
        runs = int(group["runs"].sum())
        balls = int(group["balls_faced"].sum())
        dismissals = int(group["is_out"].sum())
        rows.append(
            {
                dimension: value,
                "innings": len(group),
                "runs": runs,
                "balls_faced": balls,
                "average": round(runs / dismissals, 2) if dismissals else None,
                "strike_rate": round(runs * 100 / balls, 2) if balls else None,
                "highest_score": int(group["runs"].max()),
                "not_outs": int((~group["is_out"]).sum()),
                "fifties": int(group["fifty"].sum()),
                "hundreds": int(group["hundred"].sum()),
                "dismissals": dismissals,
            }
        )
    if not rows:
        return empty
    return pd.DataFrame(rows).sort_values("innings", ascending=False)
