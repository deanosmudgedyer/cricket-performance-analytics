"""
Trains the bowling outcome model from whatever's currently in the
database and saves it to app/ml/artifacts/bowling_outcome_model.joblib.

Run via (from the `backend` folder, venv activated):
    python -m app.ml.train_bowling_outcome_model

Deliberately a separate, explicit step rather than something the API
trains on first request: training is slow(er) and non-deterministic-
feeling compared to a request/response cycle, and baking the artifact
in ahead of time (same pattern as `python -m app.ingestion.
load_spreadsheet` already baking the SQLite database into the Docker
image - see the project's Dockerfile) means the deployed API only
ever does cheap inference, never training, and every deploy reflects
whatever's currently committed with no extra runtime cost.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from app.ml.outcome_model import OutcomeModel, train  # noqa: E402
from app.services.data_access import load_bowling_deliveries  # noqa: E402

ARTIFACT_PATH = Path(__file__).resolve().parent / "artifacts" / "bowling_outcome_model.joblib"


def main() -> OutcomeModel:
    df = load_bowling_deliveries()
    model = train(df)
    report = model.report

    print(f"Trained on {report.n_training_rows} legal deliveries ({report.n_wickets} wickets).")
    print(f"Baseline (blind guess at outcome frequency) log-loss: {report.baseline_log_loss:.4f}")
    print()
    print(f"{'Candidate':<20} {'Log-loss':>10} {'Brier':>10} {'Accuracy':>10}")
    for c in report.candidates:
        marker = " <- chosen" if c.name == report.chosen else ""
        print(f"{c.name:<20} {c.log_loss:>10.4f} {c.brier_score:>10.4f} {c.accuracy:>10.3f}{marker}")
    print()
    if min(c.log_loss for c in report.candidates) >= report.baseline_log_loss:
        print(
            "Note: no candidate beat the blind-guess baseline on out-of-fold log-loss. "
            "At this sample size that's a legitimate finding, not a bug - it means there "
            "isn't yet a learnable signal above the base rate for at least one outcome class "
            "(almost certainly Wicket, given only "
            f"{report.n_wickets} in the whole dataset)."
        )

    ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    model.save(ARTIFACT_PATH)
    print(f"\nSaved to {ARTIFACT_PATH}")
    return model


if __name__ == "__main__":
    main()
