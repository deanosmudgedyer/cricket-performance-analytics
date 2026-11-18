from app.ml.features import OUTCOME_CLASSES, build_feature_frame, bucket_outcome, outcome_runs_value
from tests.helpers import bowling_df


def test_bucket_outcome_classifies_dots_singles_boundaries_other_and_wickets():
    rows = [
        dict(runs_off_bat=0),
        dict(runs_off_bat=1),
        dict(runs_off_bat=2),
        dict(runs_off_bat=3),
        dict(runs_off_bat=5),
        dict(runs_off_bat=4),
        dict(runs_off_bat=6),
        dict(runs_off_bat=0, is_wicket=1, run_type=None),
    ]
    df = bowling_df(rows)

    outcome = bucket_outcome(df)

    assert list(outcome) == ["Dot", "Single", "Other", "Other", "Other", "Boundary", "Boundary", "Wicket"]


def test_bucket_outcome_prefers_wicket_even_when_runs_off_bat_is_zero():
    # A wicket row's runs_off_bat is always 0 in this dataset (see
    # schema.sql's counts_for_batsman_runs comment) - this must not
    # be classified as a Dot just because the run count matches.
    df = bowling_df([dict(runs_off_bat=0, is_wicket=1, run_type=None)])

    assert list(bucket_outcome(df)) == ["Wicket"]


def test_outcome_runs_value_is_the_mean_actual_runs_per_bucket():
    rows = [dict(runs_off_bat=4), dict(runs_off_bat=6)]
    df = bowling_df(rows)
    outcome = bucket_outcome(df)

    values = outcome_runs_value(df, outcome)

    assert values["Boundary"] == 5.0  # mean of 4 and 6
    assert values["Wicket"] == 0.0
    assert set(values.keys()) == set(OUTCOME_CLASSES)


def test_outcome_runs_value_is_zero_for_a_bucket_with_no_examples():
    df = bowling_df([dict(runs_off_bat=0)])
    outcome = bucket_outcome(df)

    values = outcome_runs_value(df, outcome)

    assert values["Boundary"] == 0.0  # never occurred in this df - not NaN, not a crash


def test_build_feature_frame_drops_illegal_deliveries():
    rows = [dict(runs_off_bat=1), dict(runs_off_bat=0, is_legal_delivery=0, run_type="Wide")]
    df = bowling_df(rows)

    features = build_feature_frame(df)

    assert len(features) == 1


def test_build_feature_frame_has_no_outcome_columns():
    # Regression guard against leakage: nothing describing what
    # HAPPENED on the ball (runs, wicket, shot, area) should ever end
    # up in the feature frame the model trains/predicts on.
    df = bowling_df([dict(runs_off_bat=4)])

    features = build_feature_frame(df)

    for leaky_column in ("runs_off_bat", "is_wicket", "shot", "area_scored", "run_type"):
        assert leaky_column not in features.columns
