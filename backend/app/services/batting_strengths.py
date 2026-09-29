"""
Batting strength/weakness analysis.

Scans multiple dimensions (length, line, shot, area, contact,
opposition, ground, batting position, bowler) for genuine outliers
against Thomas's own overall figures - rather than hand-picking a
fixed narrative the way insights.py's rule set does, this is the
fuller, browsable report: every dimension, both directions, always
with its raw sample size attached.

Every finding is a comparison against `overall`, gated by a minimum
gap - not just "his best length", but "his best length, and it's
genuinely well clear of how he bats on average" - so a small sample
landing a few points off the mean by chance doesn't get reported as a
"strength" or "weakness" it isn't. See cricket_common.py for why
MIN_BALLS_FOR_INSIGHT/SMALL_SAMPLE_BALLS are shared constants rather
than a separate tuned copy here.
"""
import pandas as pd

from app.services.batting_stats import batting_by_group, compute_batting_stats
from app.services.cricket_common import MIN_BALLS_FOR_INSIGHT, SMALL_SAMPLE_BALLS

DIMENSIONS = [
    "length", "line", "shot", "area_scored", "contact",
    "opposition", "ground", "batting_position", "bowler",
]

# A strike-rate finding only surfaces if it clears the overall rate by
# at least this many runs/100 balls - otherwise it's noise from a
# small sample landing slightly off the mean, not a real pattern.
STRIKE_RATE_GAP = 15.0
# A dismissal-rate finding only surfaces if a group's per-ball
# dismissal rate is at least this many times the overall rate.
DISMISSAL_RATE_MULTIPLE = 1.5


def _finding(dimension: str, row: pd.Series, kind: str, reason: str) -> dict:
    balls = int(row["balls_faced"])
    value = row[dimension]
    # batting_position (and any future numeric dimension) comes back
    # as a numpy scalar from groupby - FastAPI's encoder can't
    # serialise that directly, so unwrap to a native Python type.
    if hasattr(value, "item"):
        value = value.item()
    return {
        "dimension": dimension,
        "value": value,
        "kind": kind,           # "strength" | "weakness"
        "reasons": [reason],    # "scoring_rate" | "dismissal_concentration"
        "balls_faced": balls,
        "runs": int(row["runs"]),
        "strike_rate": row["strike_rate"],
        "average": row["average"],
        "dismissals": int(row["dismissals"]),
        "dot_ball_pct": row["dot_ball_pct"],
        "boundary_pct": row["boundary_pct"],
        "small_sample": balls < SMALL_SAMPLE_BALLS,
    }


def _merge_duplicate_findings(findings: list[dict]) -> list[dict]:
    """The same (dimension, value) can independently qualify as a
    finding for more than one reason (e.g. a ground that's both his
    lowest strike rate AND where dismissals cluster) - merged into one
    row with both reasons rather than shown as two near-identical rows."""
    merged: dict[tuple, dict] = {}
    for finding in findings:
        key = (finding["dimension"], finding["value"])
        if key in merged:
            merged[key]["reasons"].extend(finding["reasons"])
        else:
            merged[key] = finding
    return list(merged.values())


def analyze_strengths_and_weaknesses(df: pd.DataFrame) -> dict:
    overall = compute_batting_stats(df)

    if overall["balls_faced"] == 0:
        return {"overall": overall, "strengths": [], "weaknesses": []}

    overall_sr = overall["strike_rate"] or 0.0
    overall_dismissal_rate = (
        overall["dismissals"] / overall["balls_faced"] if overall["balls_faced"] else 0.0
    )

    strengths: list[dict] = []
    weaknesses: list[dict] = []

    for dimension in DIMENSIONS:
        breakdown = batting_by_group(df, dimension)
        eligible = breakdown[breakdown["balls_faced"] >= MIN_BALLS_FOR_INSIGHT]
        if eligible.empty:
            continue

        sr_eligible = eligible[eligible["strike_rate"].notna()]
        if not sr_eligible.empty:
            best = sr_eligible.loc[sr_eligible["strike_rate"].idxmax()]
            if best["strike_rate"] - overall_sr >= STRIKE_RATE_GAP:
                strengths.append(_finding(dimension, best, "strength", "scoring_rate"))

            worst = sr_eligible.loc[sr_eligible["strike_rate"].idxmin()]
            if overall_sr - worst["strike_rate"] >= STRIKE_RATE_GAP:
                weaknesses.append(_finding(dimension, worst, "weakness", "scoring_rate"))

        dismissed = eligible[eligible["dismissals"] > 0]
        if not dismissed.empty:
            top_dismissal = dismissed.loc[dismissed["dismissals"].idxmax()]
            dismissal_rate = top_dismissal["dismissals"] / top_dismissal["balls_faced"]
            if dismissal_rate >= overall_dismissal_rate * DISMISSAL_RATE_MULTIPLE:
                weaknesses.append(_finding(dimension, top_dismissal, "weakness", "dismissal_concentration"))

    strengths = _merge_duplicate_findings(strengths)
    weaknesses = _merge_duplicate_findings(weaknesses)

    # Largest, most trustworthy samples first - not the most dramatic
    # numbers first, which would surface small-sample noise on top.
    strengths.sort(key=lambda f: f["balls_faced"], reverse=True)
    weaknesses.sort(key=lambda f: f["balls_faced"], reverse=True)

    return {"overall": overall, "strengths": strengths, "weaknesses": weaknesses}
