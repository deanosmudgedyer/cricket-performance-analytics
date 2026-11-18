"""
Turns raw bowling deliveries into the feature/target shape the
outcome model trains and predicts on.

FEATURE_COLUMNS is deliberately short and deliberately excludes a few
columns that look obviously relevant but aren't legitimate PRE-BALL
context:
  - bowling_end: values like "City End" / "Dundonald End" identify a
    specific GROUND, not a transferable tactical choice (unlike, say,
    "Over/Around the Wicket", which means the same thing everywhere).
    It wouldn't generalise to a new ground, and every new ground adds
    a category the model has never seen.
  - shot / contact / area_scored / dismissal_type / run_type: these
    describe what the BATSMAN DID or what HAPPENED on the delivery -
    they are the outcome, or caused by the outcome, not something
    known before the ball is bowled. Using them as features would be
    leakage dressed up as "accuracy" (e.g. area_scored is only
    non-null when a run was actually scored there).

over_number is kept as a plain number rather than converted to a
named phase (Powerplay/Middle/Death): that conversion is tier-
specific (see frontend/src/phasePresets.ts) and a tree-based model
can learn its own over-number thresholds per format_tier through
normal splits - duplicating the breakpoint logic here would be two
places that could drift apart for no modelling benefit.
"""
import pandas as pd

FEATURE_COLUMNS = ["length", "line", "side_of_wicket", "batting_hand", "format_tier", "over_number"]
CATEGORICAL_FEATURES = ["length", "line", "side_of_wicket", "batting_hand", "format_tier"]
NUMERIC_FEATURES = ["over_number"]

# Same buckets the rest of the app already reports (dot_ball_pct,
# boundary_pct - see cricket_stats.compute_bowling_stats) rather than
# inventing a parallel vocabulary. Order matters: it's the fixed
# column order of every probability array this module produces.
OUTCOME_CLASSES = ["Dot", "Single", "Other", "Boundary", "Wicket"]


def bucket_outcome(df: pd.DataFrame) -> pd.Series:
    """Maps each delivery's (runs_off_bat, is_wicket) to one of
    OUTCOME_CLASSES. 2s/3s/5s are pooled into "Other" - individually
    each is too rare in a dataset this size to model separately (2
    byes of "3" and one "5" don't support their own class), but as a
    group they're a real, meaningfully-different outcome from a dot,
    a single, or a boundary."""
    is_wicket = df["is_wicket"].astype(bool)
    runs = df["runs_off_bat"]

    outcome = pd.Series("Other", index=df.index, dtype="object")
    outcome[runs == 0] = "Dot"
    outcome[runs == 1] = "Single"
    outcome[runs.isin([4, 6])] = "Boundary"
    outcome[is_wicket] = "Wicket"
    return outcome


def outcome_runs_value(df: pd.DataFrame, outcome: pd.Series) -> dict[str, float]:
    """The mean ACTUAL runs scored within each bucket, e.g. "Boundary"
    isn't always worth exactly 4 or exactly 6 - this is what lets
    P(class) * runs_value(class), summed over classes, work out to a
    genuine expected-runs figure instead of an arbitrary constant per
    bucket. "Wicket" contributes 0 runs by convention (a wicket ball
    can concede a run before the dismissal in real cricket, but this
    dataset has no recorded instance of that - see schema.sql's
    counts_for_batsman_runs comment for the batting-side equivalent of
    this same limitation)."""
    runs = df["runs_off_bat"].where(~df["is_wicket"].astype(bool), 0)
    values = {}
    for cls in OUTCOME_CLASSES:
        mask = outcome == cls
        values[cls] = float(runs[mask].mean()) if mask.any() else 0.0
    values["Wicket"] = 0.0
    return values


def build_feature_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Legal deliveries only (is_legal_delivery == 1) - a Wide/No Ball
    isn't a "the batsman faced this ball and did X" event the model
    should learn from the same way a legal delivery is, same
    reasoning balls_bowled/economy already exclude them elsewhere in
    this app."""
    legal = df[df["is_legal_delivery"] == 1]
    features = legal[FEATURE_COLUMNS].copy()
    for col in CATEGORICAL_FEATURES:
        features[col] = features[col].astype("category")
    return features
