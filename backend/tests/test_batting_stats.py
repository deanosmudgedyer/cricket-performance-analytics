from app.services.batting_stats import compute_batting_stats, compute_innings_summaries
from tests.helpers import batting_df


def test_wides_excluded_but_no_balls_included_in_balls_faced():
    # Standard scorecard convention: the striker isn't credited with
    # facing a wide, but a no-ball was still a fair-height/width
    # delivery bowled at him, so it counts as a ball faced.
    rows = [dict(runs_scored=1) for _ in range(10)]
    rows.append(dict(run_type="Wide", counts_as_ball_faced=0, counts_for_batsman_runs=0, runs_scored=1))
    rows.append(dict(run_type="No Ball", counts_as_ball_faced=1, counts_for_batsman_runs=0, runs_scored=0))
    df = batting_df(rows)

    stats = compute_batting_stats(df)

    assert stats["balls_faced"] == 11


def test_leg_byes_and_byes_excluded_from_batsmans_runs():
    rows = [dict(runs_scored=4) for _ in range(3)]
    rows.append(dict(run_type="Leg Bye", counts_for_batsman_runs=0, runs_scored=4))
    df = batting_df(rows)

    stats = compute_batting_stats(df)

    assert stats["runs"] == 12
    assert stats["balls_faced"] == 4


def test_strike_rate_calculation():
    df = batting_df([dict(runs_scored=1) for _ in range(10)])

    stats = compute_batting_stats(df)

    assert stats["runs"] == 10
    assert stats["strike_rate"] == 100.0


def test_average_is_none_not_zero_with_no_dismissals():
    df = batting_df([dict(runs_scored=1) for _ in range(6)])

    stats = compute_batting_stats(df)

    assert stats["dismissals"] == 0
    assert stats["average"] is None


def test_empty_selection_does_not_crash():
    stats = compute_batting_stats(batting_df([]))

    assert stats["balls_faced"] == 0
    assert stats["strike_rate"] is None
    assert stats["small_sample"] is True


def test_innings_summary_highest_score_not_out_and_fifty():
    innings_1 = [dict(batting_innings_id=1, runs_scored=10) for _ in range(20)]
    innings_1.append(dict(batting_innings_id=1, runs_scored=0, is_wicket=1, run_type=None))  # out for 200

    innings_2 = [dict(batting_innings_id=2, runs_scored=1) for _ in range(30)]  # not out on 30

    df = batting_df(innings_1 + innings_2)

    summaries = compute_innings_summaries(df).set_index("batting_innings_id")

    assert summaries.loc[1, "runs"] == 200
    assert summaries.loc[1, "is_out"] is True or bool(summaries.loc[1, "is_out"]) is True
    assert bool(summaries.loc[1, "hundred"]) is True

    assert summaries.loc[2, "runs"] == 30
    assert bool(summaries.loc[2, "is_out"]) is False
    assert bool(summaries.loc[2, "fifty"]) is False
