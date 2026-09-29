"""
Generates coach-style written insights from bowling data.

Deliberately rules-based rather than "pick whatever number sounds
impressive": every insight has an explicit, documented trigger
condition, and - critically - a minimum sample size before it's
allowed to fire. Early on in this project we noticed the raw data has
some very small groups (2 Yorkers, only 24 balls from the City End),
and a coach would rightly distrust a claim like "Yorkers are the most
expensive length" built on 2 deliveries. These guards exist so the
dashboard never makes a claim it can't back up.
"""
import pandas as pd

from app.services.cricket_stats import compute_bowling_stats, economy_by_group

# Tunable thresholds - centralised here so they're easy to adjust as
# more data comes in, without hunting through the logic below.
MIN_BALLS_FOR_GROUP_INSIGHT = 6          # one full over - don't judge on less
MIN_SCORING_SHOTS_FOR_AREA_INSIGHT = 5
ECONOMY_DIFFERENCE_THRESHOLD = 1.5       # runs/over gap worth remarking on
RARE_USAGE_THRESHOLD_PCT = 8
RARE_USAGE_MIN_TOTAL_BALLS = 30
DOT_BALL_PRESSURE_THRESHOLD = 65
BOUNDARY_RISK_THRESHOLD = 15
AREA_CONCENTRATION_THRESHOLD_PCT = 40


def generate_insights(df: pd.DataFrame) -> list[dict]:
    overall = compute_bowling_stats(df)
    insights: list[dict] = []

    if overall["balls_bowled"] == 0:
        return [
            {
                "text": "No deliveries match the current filters.",
                "tone": "neutral",
                "category": "meta",
            }
        ]

    _add_length_effectiveness_insight(df, insights)
    _add_rare_length_insight(df, overall, insights)
    _add_end_comparison_insight(df, insights)
    _add_area_concentration_insight(overall, insights)
    _add_pressure_insight(overall, insights)
    _add_boundary_risk_insight(overall, insights)
    _add_wicket_pattern_insight(df, overall, insights)

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


def _add_length_effectiveness_insight(df: pd.DataFrame, insights: list[dict]) -> None:
    breakdown = economy_by_group(df, "length")
    eligible = breakdown[breakdown["balls_bowled"] >= MIN_BALLS_FOR_GROUP_INSIGHT]
    if len(eligible) < 2:
        return

    cheapest = eligible.loc[eligible["economy"].idxmin()]
    priciest = eligible.loc[eligible["economy"].idxmax()]
    gap = priciest["economy"] - cheapest["economy"]

    if gap >= ECONOMY_DIFFERENCE_THRESHOLD:
        insights.append(
            {
                "text": (
                    f"{cheapest['length']} length is the most miserly option, "
                    f"conceding just {cheapest['economy']} an over - compared to "
                    f"{priciest['economy']} for {priciest['length']}."
                ),
                "tone": "good",
                "category": "length",
            }
        )


def _add_rare_length_insight(df: pd.DataFrame, overall: dict, insights: list[dict]) -> None:
    if overall["balls_bowled"] < RARE_USAGE_MIN_TOTAL_BALLS:
        return

    breakdown = economy_by_group(df, "length")
    for _, row in breakdown.iterrows():
        pct = row["balls_bowled"] / overall["balls_bowled"] * 100
        if pct < RARE_USAGE_THRESHOLD_PCT:
            insights.append(
                {
                    "text": (
                        f"{row['length']} has only been bowled {pct:.0f}% of the time "
                        f"({row['balls_bowled']} balls) - a rarely used option worth "
                        f"considering more, or confirming it's a deliberate tactic."
                    ),
                    "tone": "neutral",
                    "category": "length",
                }
            )


def _add_end_comparison_insight(df: pd.DataFrame, insights: list[dict]) -> None:
    breakdown = economy_by_group(df, "bowling_end")
    eligible = breakdown[breakdown["balls_bowled"] >= MIN_BALLS_FOR_GROUP_INSIGHT]
    if len(eligible) != 2:
        return

    row_a, row_b = eligible.iloc[0], eligible.iloc[1]
    gap = abs(row_a["economy"] - row_b["economy"])
    if gap < ECONOMY_DIFFERENCE_THRESHOLD:
        return

    better, worse = (row_a, row_b) if row_a["economy"] < row_b["economy"] else (row_b, row_a)
    insights.append(
        {
            "text": (
                f"Considerably more effective from the {better['bowling_end']} "
                f"(economy {better['economy']}) than the {worse['bowling_end']} "
                f"(economy {worse['economy']})."
            ),
            "tone": "neutral",
            "category": "end",
        }
    )


def _add_area_concentration_insight(overall: dict, insights: list[dict]) -> None:
    if overall["scoring_balls"] < MIN_SCORING_SHOTS_FOR_AREA_INSIGHT:
        return
    if not overall["area_distribution"]:
        return

    top_area, top_count = max(overall["area_distribution"].items(), key=lambda item: item[1])
    pct = top_count / overall["scoring_balls"] * 100

    if pct >= AREA_CONCENTRATION_THRESHOLD_PCT:
        insights.append(
            {
                "text": (
                    f"{pct:.0f}% of scoring shots have gone through {top_area} - "
                    f"a clear scoring pattern to plan a field for."
                ),
                "tone": "bad",
                "category": "area",
            }
        )


def _add_pressure_insight(overall: dict, insights: list[dict]) -> None:
    if overall["balls_bowled"] < MIN_BALLS_FOR_GROUP_INSIGHT:
        return
    if overall["dot_ball_pct"] is not None and overall["dot_ball_pct"] >= DOT_BALL_PRESSURE_THRESHOLD:
        insights.append(
            {
                "text": (
                    f"Dot ball percentage of {overall['dot_ball_pct']}% shows sustained "
                    f"pressure being built on the batsman."
                ),
                "tone": "good",
                "category": "pressure",
            }
        )


def _add_wicket_pattern_insight(df: pd.DataFrame, overall: dict, insights: list[dict]) -> None:
    """
    The one "wicket recipe" claim this app is willing to make: only
    when every wicket so far shares the same length AND dismissal
    type, and even then, the sample size is stated explicitly in the
    sentence itself - never implied. With 2-3 wickets on record this
    will keep firing as "small sample" for a while yet; that's the
    point, not a bug to fix.
    """
    wickets = df[df["is_wicket"] == 1]
    if len(wickets) < 2:
        return

    lengths = wickets["length"].nunique()
    dismissal_types = wickets["dismissal_type"].nunique()
    if lengths != 1 and dismissal_types != 1:
        return  # no shared thread across the wickets - nothing honest to say yet

    parts = []
    if lengths == 1:
        parts.append(f"{wickets.iloc[0]['length']} length")
    if dismissal_types == 1:
        parts.append(str(wickets.iloc[0]["dismissal_type"]))

    sample_note = " - very small sample, treat as an early signal only" if len(wickets) < 5 else ""
    insights.append(
        {
            "text": (
                f"Every wicket so far ({len(wickets)} in total) has come via "
                f"{' + '.join(parts)}{sample_note}."
            ),
            "tone": "good",
            "category": "wicket",
        }
    )


def _add_boundary_risk_insight(overall: dict, insights: list[dict]) -> None:
    if overall["balls_bowled"] < MIN_BALLS_FOR_GROUP_INSIGHT:
        return
    if overall["boundary_pct"] is not None and overall["boundary_pct"] >= BOUNDARY_RISK_THRESHOLD:
        insights.append(
            {
                "text": (
                    f"Boundary percentage of {overall['boundary_pct']}% is on the high "
                    f"side - {overall['boundaries']} boundaries conceded from "
                    f"{overall['balls_bowled']} balls."
                ),
                "tone": "bad",
                "category": "risk",
            }
        )
