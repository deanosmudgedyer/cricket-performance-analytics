from app.services.cricket_stats import compute_bowling_stats, compute_maidens
from tests.helpers import bowling_df


def test_no_ball_runs_count_against_economy_but_not_balls_bowled():
    # Regression test for a real bug: a spell of 32 legal-ball runs
    # plus one no-ball conceding 1 run was reporting 32 conceded
    # instead of 33, because economy runs were summed from the
    # legal-only slice instead of the full delivery set.
    rows = [dict(runs_off_bat=1) for _ in range(32)]
    rows.append(dict(run_type="No Ball", is_legal_delivery=0, counts_for_economy=1, runs_off_bat=1))
    df = bowling_df(rows)

    stats = compute_bowling_stats(df)

    assert stats["balls_bowled"] == 32  # the no-ball doesn't count as a legal ball
    assert stats["runs_conceded"] == 33  # but its run DOES count against the bowler


def test_leg_byes_and_byes_excluded_from_runs_conceded():
    rows = [dict(runs_off_bat=0) for _ in range(5)]
    rows.append(dict(run_type="Leg Bye", counts_for_economy=0, runs_off_bat=4))
    rows.append(dict(run_type="Bye", counts_for_economy=0, runs_off_bat=2))
    df = bowling_df(rows)

    stats = compute_bowling_stats(df)

    assert stats["balls_bowled"] == 7
    assert stats["runs_conceded"] == 0


def test_average_is_none_not_zero_with_no_wickets():
    df = bowling_df([dict(runs_off_bat=4) for _ in range(6)])

    stats = compute_bowling_stats(df)

    assert stats["wickets"] == 0
    assert stats["average"] is None


def test_average_and_economy_with_a_wicket():
    rows = [dict(runs_off_bat=0) for _ in range(5)]
    rows.append(dict(runs_off_bat=0, is_wicket=1, run_type=None))
    df = bowling_df(rows)

    stats = compute_bowling_stats(df)

    assert stats["wickets"] == 1
    assert stats["average"] == 0.0
    assert stats["economy"] == 0.0


def test_dot_ball_percentage():
    rows = [dict(runs_off_bat=0) for _ in range(3)] + [dict(runs_off_bat=4) for _ in range(1)]
    df = bowling_df(rows)

    stats = compute_bowling_stats(df)

    assert stats["dot_balls"] == 3
    assert stats["dot_ball_pct"] == 75.0


def test_empty_selection_does_not_crash():
    stats = compute_bowling_stats(bowling_df([]))

    assert stats["balls_bowled"] == 0
    assert stats["economy"] is None
    assert stats["small_sample"] is True


def test_maiden_over_with_all_dot_balls():
    rows = [dict(bowling_innings_id=1, over_number=1, ball_number=n, runs_off_bat=0) for n in range(1, 7)]
    df = bowling_df(rows)

    assert compute_maidens(df) == 1


def test_no_ball_in_an_over_disqualifies_the_maiden_even_at_zero_bat_runs():
    # A no-ball is replayed, so a complete over still has 6 legal
    # balls plus the no-ball on top. Its penalty run must disqualify
    # the maiden even though runs_off_bat is 0 on every legal ball.
    rows = [dict(bowling_innings_id=1, over_number=1, ball_number=n, runs_off_bat=0) for n in range(1, 7)]
    rows.append(
        dict(
            bowling_innings_id=1,
            over_number=1,
            run_type="No Ball",
            is_legal_delivery=0,
            counts_for_economy=1,
            runs_off_bat=1,
        )
    )
    df = bowling_df(rows)

    assert compute_maidens(df) == 0


def test_maidens_returns_none_for_an_incomplete_over_view():
    # Only 5 of the over's 6 legal balls are present (e.g. filtered by
    # length) - counting maidens here would silently be wrong.
    rows = [dict(bowling_innings_id=1, over_number=1, ball_number=n, runs_off_bat=0) for n in range(1, 6)]
    df = bowling_df(rows)

    assert compute_maidens(df) is None
