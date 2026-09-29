"""
Generates coach-style written insights from batting data - the
batting counterpart to insights.py (bowling). Same discipline: every
insight has an explicit trigger condition and a minimum sample size
before it's allowed to fire, using the thresholds centralised in
cricket_common.py so "how much data is enough" is one decision shared
across both disciplines rather than two independently-tuned copies.
"""
from app.services.batting_stats import batting_by_group, compute_batting_stats
from app.services.cricket_common import MIN_BALLS_FOR_INSIGHT

MIN_SCORING_SHOTS_FOR_AREA_INSIGHT = 5
STRIKE_RATE_DIFFERENCE_THRESHOLD = 20   # runs/100 balls gap worth remarking on
DOT_BALL_PRESSURE_THRESHOLD = 55        # batsman under pressure, not building it
AREA_CONCENTRATION_THRESHOLD_PCT = 40


def generate_batting_insights(df) -> list[dict]:
    overall = compute_batting_stats(df)
    insights: list[dict] = []

    if overall["balls_faced"] == 0:
        return [{"text": "No deliveries match the current filters.", "tone": "neutral", "category": "meta"}]

    _add_length_insight(df, insights)
    _add_dismissal_length_insight(df, insights)
    _add_area_concentration_insight(overall, insights)
    _add_pressure_insight(overall, insights)

    if not insights:
        insights.append(
            {
                "text": "Not enough deliveries in this selection to draw a reliable "
                "insight yet - try widening the filters.",
                "tone": "neutral",
                "category": "meta",
            }
        )
    return insights


def _add_length_insight(df, insights: list[dict]) -> None:
    breakdown = batting_by_group(df, "length")
    eligible = breakdown[breakdown["balls_faced"] >= MIN_BALLS_FOR_INSIGHT]
    scored = eligible[eligible["strike_rate"].notna()]
    if len(scored) < 2:
        return

    best = scored.loc[scored["strike_rate"].idxmax()]
    worst = scored.loc[scored["strike_rate"].idxmin()]
    gap = best["strike_rate"] - worst["strike_rate"]

    if gap >= STRIKE_RATE_DIFFERENCE_THRESHOLD:
        insights.append(
            {
                "text": (
                    f"Scores fastest against {best['length']} length deliveries "
                    f"(strike rate {best['strike_rate']}, {int(best['balls_faced'])} balls) - "
                    f"compared to {worst['strike_rate']} against {worst['length']}."
                ),
                "tone": "good",
                "category": "length",
            }
        )


def _add_dismissal_length_insight(df, insights: list[dict]) -> None:
    breakdown = batting_by_group(df, "length")
    eligible = breakdown[breakdown["balls_faced"] >= MIN_BALLS_FOR_INSIGHT]
    with_wickets = eligible[eligible["dismissals"] > 0]
    if with_wickets.empty:
        return

    top = with_wickets.loc[with_wickets["dismissals"].idxmax()]
    total_dismissals = int(eligible["dismissals"].sum())
    if total_dismissals == 0:
        return

    small_sample_note = " - small sample, treat as an early signal only" if top["dismissals"] < 3 else ""
    insights.append(
        {
            "text": (
                f"{int(top['dismissals'])} of {total_dismissals} dismissal(s) so far have come against "
                f"{top['length']} length ({int(top['balls_faced'])} balls faced there){small_sample_note}."
            ),
            "tone": "bad",
            "category": "wicket",
        }
    )


def _add_area_concentration_insight(overall: dict, insights: list[dict]) -> None:
    if overall["scoring_balls"] < MIN_SCORING_SHOTS_FOR_AREA_INSIGHT or not overall["area_distribution"]:
        return

    top_area, top_count = max(overall["area_distribution"].items(), key=lambda item: item[1])
    pct = top_count / overall["scoring_balls"] * 100

    if pct >= AREA_CONCENTRATION_THRESHOLD_PCT:
        insights.append(
            {
                "text": f"{pct:.0f}% of scoring shots have gone through {top_area} - a clear scoring strength.",
                "tone": "good",
                "category": "area",
            }
        )


def _add_pressure_insight(overall: dict, insights: list[dict]) -> None:
    if overall["balls_faced"] < MIN_BALLS_FOR_INSIGHT:
        return
    if overall["dot_ball_pct"] is not None and overall["dot_ball_pct"] >= DOT_BALL_PRESSURE_THRESHOLD:
        insights.append(
            {
                "text": (
                    f"Dot ball percentage of {overall['dot_ball_pct']}% suggests the bowling is "
                    f"building pressure in this selection."
                ),
                "tone": "bad",
                "category": "pressure",
            }
        )
