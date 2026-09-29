"""
Small helpers shared by bowling_stats.py and batting_stats.py, plus
the sample-size thresholds used platform-wide to gate any claim that
could otherwise mislead from a handful of deliveries.

Centralising the thresholds here (rather than duplicating per-module
copies, as the original bowling-only insights.py did) means "how much
data is enough to say something" is one tunable decision, applied
consistently to bowling and batting alike.
"""

# Below this many balls, a group's rate stats (economy, strike rate,
# dot %, etc.) are still returned - the numbers aren't hidden - but
# any UI or insight built on them should render a visible "small
# sample" warning rather than presenting the number with confidence.
SMALL_SAMPLE_BALLS = 12          # two overs
# Below this many dismissals, average/dismissal-rate claims are
# especially unstable - cricket averages need even more than 12 balls
# worth of wickets to mean anything, since wickets are rare events.
SMALL_SAMPLE_WICKETS = 3
# Rankings/insights (e.g. "best length") shouldn't be drawn from
# groups smaller than this at all.
MIN_BALLS_FOR_INSIGHT = 6


def format_overs(legal_balls: int) -> str:
    """23 legal balls -> '3.5' (3 overs, 5 balls), matching scorecards."""
    return f"{legal_balls // 6}.{legal_balls % 6}"


def safe_round(value, digits: int = 2):
    return None if value is None else round(value, digits)


def safe_ratio(numerator: float, denominator: float, digits: int = 2):
    """None (not 0 or an exception) when the denominator is 0 - "no
    data" and "a rate of zero" are different things and should never
    be conflated (e.g. an average of 0.00 reads as "concedes nothing
    per wicket", not "no wickets yet")."""
    if not denominator:
        return None
    return safe_round(numerator / denominator, digits)


def bucket_by_over(df, breakpoints: list[int], compute_stats_fn) -> list[dict]:
    """
    Splits `df` into phases by innings-absolute over number and
    returns full stats for each - shared by bowling's spell analysis
    and batting's innings-progression analysis, since "bucket balls by
    over range, then compute the same stats as everywhere else" isn't
    a bowling or batting concept, it's a phase concept.

    `breakpoints` are the LAST over of every phase except the final
    one, e.g. [6, 15] over a 20-over innings makes phases 1-6, 7-15,
    16-20 - deliberately not hardcoded to Powerplay/Death terminology
    here, since a 4-day innings has no such structure (that framing
    belongs at the API/frontend layer, which knows the format tier;
    this function only knows over numbers). Phases with zero balls
    (e.g. a breakpoint past the innings' actual length) are omitted
    rather than shown as an empty row.
    """
    if df.empty:
        return []

    max_over = int(df["over_number"].max())
    edges = sorted({bp for bp in breakpoints if 0 < bp < max_over})
    starts = [1] + [edge + 1 for edge in edges]
    ends = edges + [max_over]

    phases = []
    for start, end in zip(starts, ends):
        phase_df = df[(df["over_number"] >= start) & (df["over_number"] <= end)]
        stats = compute_stats_fn(phase_df)
        # balls_bowled (bowling) or balls_faced (batting) - whichever
        # this stats function produced - decides whether to include
        # an empty phase.
        ball_count = stats.get("balls_bowled", stats.get("balls_faced", 0))
        if ball_count == 0:
            continue
        phases.append({"over_start": start, "over_end": end, "over_range": f"{start}-{end}", **stats})
    return phases


def phase_gap_note(
    phases: list[dict], rate_key: str, count_key: str, min_balls: int, gap_threshold: float
) -> tuple[dict, dict, float] | None:
    """
    Compares the first and last phase with enough balls to trust, on
    one rate metric. Returns None (no note) unless both phases clear
    the sample floor AND the gap between them clears a meaningful
    threshold - a small wobble between two thin samples isn't a trend.

    Deliberately returns the raw (first, last, gap) rather than a
    finished sentence: callers phrase it ("appears to decline", never
    "declines" or "fatigues" - see this project's insight-wording rule
    of describing an observed pattern without asserting its cause).
    """
    eligible = [p for p in phases if p.get(count_key, 0) >= min_balls and p.get(rate_key) is not None]
    if len(eligible) < 2:
        return None
    first, last = eligible[0], eligible[-1]
    gap = last[rate_key] - first[rate_key]
    if abs(gap) < gap_threshold:
        return None
    return first, last, gap
