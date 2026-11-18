"""
Trains, compares, and wraps the per-delivery outcome model: given the
pre-ball context (length, line, side of wicket, batting hand, format
tier, over number), predict a probability over OUTCOME_CLASSES
(Dot/Single/Other/Boundary/Wicket), and derive an expected-runs figure
and a wicket probability from that distribution.

What this model is - and, as importantly, what it ISN'T:

This dataset has exactly one bowler (Thomas) in it. There is no "the
rest of the league" population to learn a baseline from, so this
can't honestly be sold as "expected runs vs. what a typical bowler
would concede" the way a real multi-bowler tracking dataset would
support. What it CAN honestly do: use everything else in the dataset
to give a steadier, less noisy estimate for a specific context than
the raw average alone - genuinely useful for a length/line
combination with only 3-4 balls bowled, where the raw average is
mostly noise (see CombinationTable's small-sample flagging, which
this is built to complement, not replace).

At n=297 legal deliveries and 5 wickets total, don't expect strong
wicket-probability signal - a model this size mostly confirms whether
there's ANY learnable pattern at all above the base rate, which is
itself a legitimate thing to report (see train_bowling_outcome_model.py's
printed comparison).
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, log_loss
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBClassifier

from app.ml.features import (
    CATEGORICAL_FEATURES,
    OUTCOME_CLASSES,
    build_feature_frame,
    bucket_outcome,
    outcome_runs_value,
)

# 3 folds, not the more usual 5 or 10: with only 5 wickets in the
# whole dataset, a 5-fold split already asks for roughly one wicket
# per fold just to keep every fold's class distribution sane - 3
# folds (~99 rows each) leaves more room per fold and is the more
# honest choice at this sample size, not a shortcut.
_CV_FOLDS = 3
_RANDOM_STATE = 42


def _preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        [("categorical", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES)],
        remainder="passthrough",
    )


def _candidate_pipelines() -> dict[str, Pipeline]:
    """Two candidates, not one: the brief explicitly expects XGBoost,
    but at this sample size a heavily-regularised linear model is a
    completely legitimate competitor, and which one actually
    generalises better is an empirical question this function answers
    rather than assumes - see train_bowling_outcome_model.py for the
    comparison this produces."""
    return {
        "logistic_regression": Pipeline(
            [
                ("prep", _preprocessor()),
                (
                    "model",
                    LogisticRegression(max_iter=2000, class_weight="balanced", random_state=_RANDOM_STATE),
                ),
            ]
        ),
        "xgboost": Pipeline(
            [
                ("prep", _preprocessor()),
                (
                    "model",
                    XGBClassifier(
                        n_estimators=80,
                        max_depth=3,
                        learning_rate=0.1,
                        subsample=0.8,
                        colsample_bytree=0.8,
                        objective="multi:softprob",
                        eval_metric="mlogloss",
                        random_state=_RANDOM_STATE,
                    ),
                ),
            ]
        ),
    }


def _encode_outcome(df: pd.DataFrame) -> np.ndarray:
    """Integer codes 0..len(OUTCOME_CLASSES)-1, fixed to
    OUTCOME_CLASSES' order rather than whatever order pandas/sklearn
    would otherwise infer (alphabetical, or first-seen). XGBoost 2+
    requires integer class labels outright (a ValueError, not a
    warning, if you hand it strings) - encoding this way means every
    model's own .classes_ already comes out as [0, 1, ..., 4] in
    exactly OUTCOME_CLASSES order, so there's no separate "figure out
    which column is which class" step anywhere else in this module."""
    return pd.Categorical(bucket_outcome(df), categories=OUTCOME_CLASSES).codes


def _multiclass_brier(y_true: np.ndarray, y_proba: np.ndarray, n_classes: int) -> float:
    """sklearn's brier_score_loss is binary-only - this is its
    standard multiclass generalisation: mean squared error between
    one-hot(y_true) and the predicted probability vector, averaged
    over samples (lower is better, 0 is a perfect forecast)."""
    one_hot = np.eye(n_classes)[y_true]
    return float(np.mean(np.sum((one_hot - y_proba) ** 2, axis=1)))


@dataclass
class CandidateResult:
    name: str
    log_loss: float
    brier_score: float
    accuracy: float


@dataclass
class TrainingReport:
    candidates: list[CandidateResult]
    baseline_log_loss: float
    chosen: str
    n_training_rows: int
    n_wickets: int
    trained_at: float = field(default_factory=time.time)


class OutcomeModel:
    def __init__(self, pipeline: Pipeline, runs_value: dict[str, float], report: TrainingReport):
        self.pipeline = pipeline
        self.runs_value = runs_value
        self.report = report

    def predict_proba(self, feature_df: pd.DataFrame) -> np.ndarray:
        """Columns in OUTCOME_CLASSES order - guaranteed, not just
        hoped for, because the model was trained on y encoded as
        pd.Categorical(..., categories=OUTCOME_CLASSES).codes (see
        _encode_outcome below), so sklearn/XGBoost's own class order
        (sorted integer codes 0..4) already IS that order."""
        return self.pipeline.predict_proba(feature_df)

    def expected_runs_per_ball(self, feature_df: pd.DataFrame) -> np.ndarray:
        proba = self.predict_proba(feature_df)
        weights = np.array([self.runs_value[c] for c in OUTCOME_CLASSES])
        return proba @ weights

    def wicket_probability(self, feature_df: pd.DataFrame) -> np.ndarray:
        return self.predict_proba(feature_df)[:, OUTCOME_CLASSES.index("Wicket")]

    def save(self, path) -> None:
        joblib.dump(self, path)

    @classmethod
    def load(cls, path) -> "OutcomeModel":
        return joblib.load(path)


def train(df: pd.DataFrame) -> OutcomeModel:
    """Cross-validates both candidates, prints nothing (that's
    train_bowling_outcome_model.py's job as the CLI entry point),
    picks whichever has the lower out-of-fold log-loss, then refits
    that one on the FULL dataset - cross-validation is for honestly
    comparing/evaluating candidates, the deployed model itself should
    still learn from every row available."""
    X = build_feature_frame(df)
    rows = df.loc[X.index]
    y = _encode_outcome(rows)
    n_classes = len(OUTCOME_CLASSES)
    class_labels = list(range(n_classes))

    cv = StratifiedKFold(n_splits=_CV_FOLDS, shuffle=True, random_state=_RANDOM_STATE)
    candidates = _candidate_pipelines()
    results: list[CandidateResult] = []
    fitted: dict[str, Pipeline] = {}

    for name, pipeline in candidates.items():
        oof_proba = cross_val_predict(pipeline, X, y, cv=cv, method="predict_proba")
        pipeline.fit(X, y)  # the fit that ends up in `fitted` if this candidate wins - not wasted work
        results.append(
            CandidateResult(
                name=name,
                log_loss=log_loss(y, oof_proba, labels=class_labels),
                brier_score=_multiclass_brier(y, oof_proba, n_classes),
                accuracy=accuracy_score(y, oof_proba.argmax(axis=1)),
            )
        )
        fitted[name] = pipeline

    baseline = DummyClassifier(strategy="prior", random_state=_RANDOM_STATE)
    baseline_oof = cross_val_predict(baseline, X, y, cv=cv, method="predict_proba")
    baseline_log_loss = log_loss(y, baseline_oof, labels=class_labels)

    chosen_name = min(results, key=lambda r: r.log_loss).name
    report = TrainingReport(
        candidates=results,
        baseline_log_loss=baseline_log_loss,
        chosen=chosen_name,
        n_training_rows=len(X),
        n_wickets=int((y == OUTCOME_CLASSES.index("Wicket")).sum()),
    )

    runs_value = outcome_runs_value(rows, bucket_outcome(rows))
    return OutcomeModel(fitted[chosen_name], runs_value, report)
