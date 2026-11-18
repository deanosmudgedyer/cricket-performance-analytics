"""
Plumbing tests, not accuracy tests: on a dataset this size (the real
one has 297 legal deliveries, 5 wickets - see outcome_model.py's
module docstring), asserting a specific accuracy or log-loss number
would be asserting noise. What's worth guaranteeing is that training
runs end-to-end, the saved artifact round-trips through disk, and
every prediction comes back as a shape- and range-valid probability
distribution - the contract the rest of the app (and the API
endpoint built on top of it) depends on.
"""
import numpy as np

from app.ml.features import OUTCOME_CLASSES, build_feature_frame
from app.ml.outcome_model import OutcomeModel, train
from tests.helpers import bowling_df


def _training_rows():
    # StratifiedKFold(n_splits=3) needs at least 3 examples of every
    # class, so the synthetic set below gives each class exactly 3-5
    # - the minimum that lets the whole train() pipeline run without
    # a fold-balance error, not a claim about what's realistic.
    rows = []
    rows += [dict(runs_off_bat=0, length="Good") for _ in range(6)]
    rows += [dict(runs_off_bat=1, length="Full") for _ in range(6)]
    rows += [dict(runs_off_bat=2, length="Short") for _ in range(3)]
    rows += [dict(runs_off_bat=4, length="Full Toss") for _ in range(4)]
    rows += [dict(runs_off_bat=6, length="Yorker") for _ in range(2)]
    rows += [dict(runs_off_bat=0, is_wicket=1, run_type=None, length="Good") for _ in range(3)]
    return rows


def test_train_runs_end_to_end_and_predict_proba_is_a_valid_distribution():
    df = bowling_df(_training_rows())

    model = train(df)
    features = build_feature_frame(df)
    proba = model.predict_proba(features)

    assert proba.shape == (len(features), len(OUTCOME_CLASSES))
    assert np.all(proba >= 0) and np.all(proba <= 1)
    np.testing.assert_allclose(proba.sum(axis=1), 1.0, atol=1e-5)


def test_expected_runs_per_ball_is_non_negative_and_wicket_probability_is_a_probability():
    df = bowling_df(_training_rows())
    model = train(df)
    features = build_feature_frame(df)

    expected_runs = model.expected_runs_per_ball(features)
    wicket_prob = model.wicket_probability(features)

    assert np.all(expected_runs >= 0)
    assert np.all((wicket_prob >= 0) & (wicket_prob <= 1))


def test_training_report_records_which_candidate_was_chosen_and_the_baseline():
    df = bowling_df(_training_rows())

    model = train(df)

    assert model.report.chosen in {c.name for c in model.report.candidates}
    assert model.report.n_training_rows == len(build_feature_frame(df))
    assert model.report.n_wickets == 3
    assert model.report.baseline_log_loss > 0


def test_model_round_trips_through_disk(tmp_path):
    df = bowling_df(_training_rows())
    model = train(df)
    path = tmp_path / "model.joblib"

    model.save(path)
    loaded = OutcomeModel.load(path)

    features = build_feature_frame(df)
    np.testing.assert_allclose(loaded.predict_proba(features), model.predict_proba(features))
    assert loaded.runs_value == model.runs_value
