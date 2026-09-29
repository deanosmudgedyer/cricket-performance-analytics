"""Small DataFrame builders shared by the test modules.

Each builder only sets the columns the function under test actually
reads, matching the "already-cleaned delivery" shape the real
ingestion pipeline produces (see app/ingestion/load_bowling.py and
load_batting.py) - not the full database schema.
"""
import pandas as pd


def bowling_delivery(
    *,
    over_number=1,
    ball_number=1,
    is_legal_delivery=1,
    counts_for_economy=1,
    runs_off_bat=0,
    is_wicket=0,
    run_type="Runs",
    length="Good",
    area_scored=None,
    bowling_innings_id=1,
):
    return {
        "bowling_innings_id": bowling_innings_id,
        "over_number": over_number,
        "ball_number": ball_number,
        "is_legal_delivery": is_legal_delivery,
        "counts_for_economy": counts_for_economy,
        "runs_off_bat": runs_off_bat,
        "is_wicket": is_wicket,
        "run_type": run_type,
        "length": length,
        "area_scored": area_scored,
    }


BOWLING_COLUMNS = list(bowling_delivery().keys())


def bowling_df(rows):
    if not rows:
        return pd.DataFrame(columns=BOWLING_COLUMNS)
    return pd.DataFrame([bowling_delivery(**row) for row in rows])


def batting_delivery(
    *,
    over_number=1,
    ball_number=1,
    counts_as_ball_faced=1,
    counts_for_batsman_runs=1,
    runs_scored=0,
    is_wicket=0,
    run_type="Runs",
    length="Good",
    line="Off Stump",
    shot="Defend",
    area_scored=None,
    batting_innings_id=1,
):
    return {
        "batting_innings_id": batting_innings_id,
        "over_number": over_number,
        "ball_number": ball_number,
        "counts_as_ball_faced": counts_as_ball_faced,
        "counts_for_batsman_runs": counts_for_batsman_runs,
        "runs_scored": runs_scored,
        "is_wicket": is_wicket,
        "run_type": run_type,
        "length": length,
        "line": line,
        "shot": shot,
        "area_scored": area_scored,
    }


BATTING_COLUMNS = list(batting_delivery().keys())


def batting_df(rows):
    if not rows:
        return pd.DataFrame(columns=BATTING_COLUMNS)
    return pd.DataFrame([batting_delivery(**row) for row in rows])
