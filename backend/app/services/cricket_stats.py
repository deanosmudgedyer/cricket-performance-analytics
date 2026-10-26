"""
Core bowling statistics engine.

Every function here takes a DataFrame of deliveries (already filtered,
if needed, by app.services.filters) and returns numbers a bowling
coach would recognise. Nothing here touches the database or an API -
that separation means these formulas can be unit tested in isolation,
and reused unchanged whether they're called from a script, an API
endpoint, or eventually a batch report generator.

Wickets are now real (see app/ingestion/load_bowling.py), so average
and strike rate are calculable - both return None (not "N/A" or 0)
when there are no wickets in the current selection, since "no data"
and "a rate of zero" are different claims (see cricket_common.safe_ratio).
"""
import pandas as pd

from app.services.cricket_common import (
    SMALL_SAMPLE_BALLS,
    SMALL_SAMPLE_WICKETS,
    format_overs,
    safe_ratio,
    safe_round,
)


def compute_bowling_stats(df: pd.DataFrame) -> dict:
    legal = df[df["is_legal_delivery"] == 1]
    balls_bowled = len(legal)

    if balls_bowled == 0:
        return _empty_stats()

    # Runs that count against the bowler: everything except leg byes/
    # byes (those are extras against the fielding TEAM, not the
    # bowler - see app/ingestion/load_bowling.py). Deliberately summed
    # from the full `df`, not `legal`: a wide or no-ball's run(s) DO
    # count against the bowler even though the delivery itself doesn't
    # count as a legal ball toward the over. Pre-filtering to `legal`
    # here used to silently drop every no-ball/wide run from the
    # economy total - e.g. a 32-run spell with one no-ball was
    # reporting 32 instead of the correct 33.
    economy_runs = int(df.loc[df["counts_for_economy"] == 1, "runs_off_bat"].sum())
    economy = safe_ratio(economy_runs, balls_bowled / 6)
    runs_per_ball = safe_ratio(economy_runs, balls_bowled, 3)

    wickets = int(legal["is_wicket"].sum())
    average = safe_ratio(economy_runs, wickets)
    bowling_strike_rate = safe_ratio(balls_bowled, wickets)
    wickets_per_over = safe_ratio(wickets, balls_bowled / 6)

    # Dot ball = literally zero runs scored off the delivery (the
    # standard pressure-building metric coaches track ball-by-ball).
    # A wicket ball with no runs is also a dot ball by this definition
    # - it's still zero runs conceded off that delivery.
    dot_balls = int((legal["runs_off_bat"] == 0).sum())
    dot_ball_pct = round(dot_balls / balls_bowled * 100, 1)

    # Shot-outcome breakdown (1s/2s/3s/4s/6s) deliberately EXCLUDES leg
    # byes/byes/wickets: those runs came off the pad/body (or no runs
    # at all), not the bat, so counting them as "the batsman hit a
    # four" would misattribute the shot and pollute area/length
    # "most attacked" insights later.
    shots = legal[(legal["run_type"] == "Runs") & (legal["is_wicket"] == 0)]
    singles = int((shots["runs_off_bat"] == 1).sum())
    twos = int((shots["runs_off_bat"] == 2).sum())
    threes = int((shots["runs_off_bat"] == 3).sum())
    fours = int((shots["runs_off_bat"] == 4).sum())
    sixes = int((shots["runs_off_bat"] == 6).sum())
    boundaries = fours + sixes
    scoring_balls = int((shots["runs_off_bat"] > 0).sum())

    # Wides/no-balls are illegal deliveries, so counted from the full
    # (unfiltered-to-legal) set rather than `legal`.
    wides = int((df["run_type"] == "Wide").sum())
    no_balls = int((df["run_type"] == "No Ball").sum())

    length_counts = legal["length"].value_counts()
    area_counts = shots.loc[shots["area_scored"].notna(), "area_scored"].value_counts()

    return {
        "balls_bowled": balls_bowled,
        "overs": format_overs(balls_bowled),
        "runs_conceded": economy_runs,
        "economy": economy,
        "runs_per_ball": runs_per_ball,
        "wickets": wickets,
        "average": average,
        "bowling_strike_rate": bowling_strike_rate,
        "wickets_per_over": wickets_per_over,
        "dot_balls": dot_balls,
        "dot_ball_pct": dot_ball_pct,
        "singles": singles,
        "twos": twos,
        "threes": threes,
        "fours": fours,
        "sixes": sixes,
        "boundaries": boundaries,
        "boundary_pct": round(boundaries / balls_bowled * 100, 1),
        "scoring_balls": scoring_balls,
        "scoring_shot_pct": round(scoring_balls / balls_bowled * 100, 1),
        "wides": wides,
        "no_balls": no_balls,
        "length_distribution": length_counts.to_dict(),
        "most_frequent_length": length_counts.idxmax() if not length_counts.empty else None,
        "area_distribution": area_counts.to_dict(),
        "most_frequent_area": area_counts.idxmax() if not area_counts.empty else None,
        # Sample-size flags: not a judgment on the number itself, just
        # a signal to any UI/insight consuming this that the sample is
        # thin enough to warrant a visible caveat.
        "small_sample": balls_bowled < SMALL_SAMPLE_BALLS,
        "wickets_small_sample": wickets < SMALL_SAMPLE_WICKETS,
    }


def _empty_stats() -> dict:
    """Returned when a filter combination matches zero deliveries, so
    the dashboard can show '0 balls bowled' instead of crashing on a
    division by zero."""
    return {
        "balls_bowled": 0,
        "overs": "0.0",
        "runs_conceded": 0,
        "economy": None,
        "runs_per_ball": None,
        "wickets": 0,
        "average": None,
        "bowling_strike_rate": None,
        "wickets_per_over": None,
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
        "wides": 0,
        "no_balls": 0,
        "length_distribution": {},
        "most_frequent_length": None,
        "area_distribution": {},
        "most_frequent_area": None,
        "small_sample": True,
        "wickets_small_sample": True,
    }


def economy_by_group(df: pd.DataFrame, group_columns: str | list[str]) -> pd.DataFrame:
    """
    Full stats broken down by one or more columns - one row per
    distinct combination. A single column (e.g. 'length') is what
    powers insights like "Good length balls produce an economy of
    only 2.1"; multiple columns (e.g. ['length', 'batting_hand']) is
    the combination engine - "Good length to left-handers", "Full +
    Around the Wicket + Left-hand", etc. Same function either way:
    a combination is just a groupby with more columns in it, not a
    different kind of analysis.

    Note: pandas' groupby silently drops rows where any group column
    is null (e.g. area_scored is empty for every dot ball). If a
    filter selection happens to contain ONLY such rows - every ball a
    dot ball with no scoring area recorded, for example - there are
    zero groups to report. That's a valid, meaningful result ("nothing
    to break down here"), not an error, so this returns an empty table
    with the right columns rather than crashing.
    """
    columns = [group_columns] if isinstance(group_columns, str) else list(group_columns)

    rows = []
    for key, group in df.groupby(columns):
        key_values = key if isinstance(key, tuple) else (key,)
        stats = compute_bowling_stats(group)
        rows.append({**dict(zip(columns, key_values)), **stats})

    if not rows:
        empty_columns = columns + list(_empty_stats().keys())
        return pd.DataFrame(columns=empty_columns)

    return pd.DataFrame(rows).sort_values("balls_bowled", ascending=False)


def compute_maidens(df: pd.DataFrame) -> int | None:
    """
    Maidens (an over with zero runs conceded off the bat, no wides/
    no-balls) can ONLY be counted reliably when every ball of every
    over in `df` is present - a maiden is a property of a whole over,
    not of individual deliveries. Most filters (batsman, line, length,
    contact, shot...) remove some balls of an over while keeping
    others, which would silently produce a wrong count.

    Returns None (rather than a misleading number) unless `df` looks
    like a complete-overs view: every (innings, over_number) group in
    it has exactly 6 legal deliveries and no illegal ones missing.
    Callers should only pass whole-innings or whole-match views here -
    e.g. an unfiltered innings, or filtered only by innings/bowling-end/
    over-range (filters that keep every ball of any over they include).
    """
    if df.empty:
        return 0

    grouped = df.groupby(["bowling_innings_id", "over_number"])
    maidens = 0
    for _, over_df in grouped:
        legal = over_df[over_df["is_legal_delivery"] == 1]
        if len(legal) != 6:
            return None  # not a complete-overs view - can't trust any count
        # Summed from the whole over (over_df), not just `legal`: a
        # wide or no-ball's penalty run disqualifies a maiden just as
        # much as a boundary would, and must be counted here the same
        # way compute_bowling_stats' economy_runs counts it.
        runs = int(over_df.loc[over_df["counts_for_economy"] == 1, "runs_off_bat"].sum())
        if runs == 0:
            maidens += 1
    return maidens


def compute_bowling_milestones(df: pd.DataFrame) -> dict:
    """
    Matches / innings / maidens / five-wicket-haul / ten-wicket-match
    tallies - every one of these is a fact about a whole innings or a
    whole match, never about an arbitrary set of balls (same reasoning
    as compute_maidens, which this reuses per innings). Callers must
    pass the same innings-safe-filtered view used for the innings-
    summary endpoint - a "Good length only" filter would make "did
    this innings have 5 wickets" meaningless.

    A ten-wicket match is counted across however many innings Thomas
    bowled in that match (one for a limited-overs match, up to two for
    a First Class one) - there's no special-casing by format, it's
    just "sum the wickets from this match's innings and check >= 10".
    """
    empty = {"matches": 0, "innings": 0, "maidens": 0, "five_wicket_hauls": 0, "ten_wicket_matches": 0}
    if df.empty:
        return empty

    per_innings = []
    for _, innings_df in df.groupby("bowling_innings_id"):
        wickets = int(innings_df["is_wicket"].sum())
        maidens = compute_maidens(innings_df)
        per_innings.append({"match_id": int(innings_df["match_id"].iloc[0]), "wickets": wickets, "maidens": maidens})

    match_wickets: dict[int, int] = {}
    for p in per_innings:
        match_wickets[p["match_id"]] = match_wickets.get(p["match_id"], 0) + p["wickets"]

    return {
        "matches": int(df["match_id"].nunique()),
        "innings": len(per_innings),
        # Innings whose maiden count couldn't be trusted (see
        # compute_maidens) simply don't contribute to the total, rather
        # than invalidating the whole career figure over one incomplete
        # over somewhere.
        "maidens": sum(p["maidens"] for p in per_innings if p["maidens"] is not None),
        "five_wicket_hauls": sum(1 for p in per_innings if p["wickets"] >= 5),
        "ten_wicket_matches": sum(1 for w in match_wickets.values() if w >= 10),
    }
